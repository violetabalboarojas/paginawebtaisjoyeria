"""Constructores de reportes. Cada uno devuelve columnas, filas y totales por moneda."""

import datetime
from collections import defaultdict
from decimal import Decimal

from ..models import CURRENCY_SYMBOL, Payment, PaymentAllocation, Penalty
from .analytics import CLOSED, _with_rows
from .engine import ZERO, accrued_interest, add_months
from .portfolio import operation_summary, today

M = "money"
D = "date"
T = "text"
I = "int"
P = "pct"


class Report:
    def __init__(self, title, columns, rows, notes=""):
        self.title = title
        self.columns = columns  # [(key, label, type)]
        self.rows = rows
        self.notes = notes
        self.totals = defaultdict(lambda: defaultdict(lambda: ZERO))
        for r in rows:
            cur = r.get("currency", "")
            for key, _, typ in columns:
                if typ == M and r.get(key) is not None:
                    self.totals[cur][key] += Decimal(r[key])
        self.totals = {c: dict(v) for c, v in self.totals.items()}

    @property
    def money_keys(self):
        return [k for k, _, t in self.columns if t == M]


def filter_ops(ops, f):
    if f.get("client"):
        ops = ops.filter(client=f["client"])
    if f.get("investor"):
        ops = ops.filter(investor=f["investor"])
    if f.get("status"):
        ops = ops.filter(status=f["status"])
    if f.get("currency"):
        ops = ops.filter(currency=f["currency"])
    if f.get("advisor"):
        ops = ops.filter(advisor=f["advisor"])
    return ops.select_related("client", "investor", "advisor")


def _period(f):
    end = f.get("end") or today()
    start = f.get("start") or end.replace(month=1, day=1)
    return start, end


def _op_base(op):
    return {"code": op.code, "client": str(op.client), "investor": str(op.investor), "currency": op.currency,
            "advisor": str(op.advisor or ""), "status": op.get_status_display()}


OP_COLS = [("code", "Operación", T), ("client", "Cliente", T), ("investor", "Inversionista", T), ("currency", "Moneda", T)]


def build(kind, ops, f):
    start, end = _period(f)
    ops = filter_ops(ops, f)
    return BUILDERS[kind](ops, start, end)


def capital_colocado(ops, start, end):
    rows = [{**_op_base(o), "date": o.disbursement_date, "principal": o.principal, "term": o.term_months,
             "rate": f"{o.rate_type} {o.rate_value.normalize():f}%"}
            for o in ops.filter(disbursement_date__range=(start, end), restructured_from__isnull=True).order_by("disbursement_date")]
    return Report("Capital colocado", OP_COLS + [("date", "Desembolso", D), ("principal", "Capital", M), ("term", "Plazo (m)", I),
                                                 ("rate", "Tasa", T), ("advisor", "Asesor", T), ("status", "Estado", T)], rows,
                  "Excluye operaciones nacidas de una reestructuración (no hubo nuevo desembolso).")


def _alloc_report(ops, start, end, component, title):
    qs = (PaymentAllocation.objects.filter(payment__operation__in=ops, payment__status=Payment.VALID, component=component,
                                           payment__payment_date__range=(start, end))
          .select_related("payment", "payment__operation", "payment__operation__client", "payment__operation__investor", "installment")
          .order_by("payment__payment_date", "payment_id"))
    rows = [{**_op_base(a.payment.operation), "payment": a.payment.code, "date": a.payment.payment_date,
             "n": a.installment.number, "amount": a.amount} for a in qs]
    return Report(title, OP_COLS + [("payment", "Pago", T), ("date", "Fecha", D), ("n", "Cuota", I), ("amount", "Monto", M)], rows)


def capital_recuperado(ops, start, end):
    return _alloc_report(ops, start, end, "CAPITAL", "Capital recuperado")


def intereses_cobrados(ops, start, end):
    return _alloc_report(ops, start, end, "INTEREST", "Intereses cobrados")


def intereses_generados(ops, start, end):
    rows = []
    before = start - datetime.timedelta(days=1)
    for op in _with_rows(ops):
        a = accrued_interest(op._rows, min(end, today()) if op.status not in CLOSED else end) - accrued_interest(op._rows, before)
        if op.closed_manually:
            continue
        if a > 0:
            rows.append({**_op_base(op), "interest": a, "status": op.get_status_display()})
    return Report("Intereses generados (devengados en el periodo)", OP_COLS + [("interest", "Interés devengado", M), ("status", "Estado", T)], rows,
                  "Devengo lineal por días dentro de cada periodo de cuota. No incluye operaciones cerradas manualmente.")


def penalidades(ops, start, end):
    qs = (Penalty.objects.filter(operation__in=ops, applies_from__lte=end).select_related("operation", "operation__client",
                                                                                        "operation__investor", "installment"))
    rows = [{**_op_base(p.operation), "n": p.installment.number, "type": p.get_penalty_type_display(), "from": p.applies_from,
             "days": p.days_late, "calc": p.calculated_amount, "waived": p.waived_amount, "paid": p.paid_amount,
             "pending": p.pending_amount, "pstatus": p.get_status_display()} for p in qs]
    return Report("Penalidades", OP_COLS + [("n", "Cuota", I), ("type", "Tipo", T), ("from", "Desde", D), ("days", "Días atraso", I),
                                            ("calc", "Calculada", M), ("waived", "Condonada", M), ("paid", "Pagada", M),
                                            ("pending", "Pendiente", M), ("pstatus", "Estado", T)], rows)


def _portfolio_rows(ops):
    rows = []
    for op in _with_rows(ops):
        s = operation_summary(op, rows=op._rows)
        rows.append({**_op_base(op), "start": op.start_date, "maturity": op.maturity_date, "principal": op.principal,
                     "capital_pending": s["capital_pending"], "interest_pending": s["interest_pending"],
                     "penalty_pending": s["penalty_pending"], "overdue": s["overdue_amount"], "total_due": s["total_due"],
                     "days_late": op.days_late})
    return rows


PORT_COLS = OP_COLS + [("start", "Inicio", D), ("maturity", "Vencimiento", D), ("principal", "Capital", M),
                       ("capital_pending", "Capital pend.", M), ("interest_pending", "Interés pend.", M),
                       ("penalty_pending", "Penalidad pend.", M), ("overdue", "Vencido", M), ("total_due", "Total por cobrar", M),
                       ("days_late", "Días atraso", I), ("status", "Estado", T)]


def vigentes(ops, start, end):
    return Report("Operaciones vigentes", PORT_COLS, _portfolio_rows(ops.exclude(status__in=CLOSED)))


def vencidas(ops, start, end):
    return Report("Operaciones vencidas y en mora", PORT_COLS, _portfolio_rows(ops.filter(status__in=["VENCIDA", "EN_MORA"])))


def morosidad(ops, start, end):
    rows = _portfolio_rows(ops.exclude(status__in=CLOSED))
    by_cur = defaultdict(lambda: [ZERO, ZERO])
    for r in rows:
        by_cur[r["currency"]][0] += r["capital_pending"]
        if r["days_late"] > 0:
            by_cur[r["currency"]][1] += r["capital_pending"]
    notes = " · ".join(f"{c}: morosidad {(v[1] / v[0] * 100 if v[0] else 0):.2f}% "
                       f"({CURRENCY_SYMBOL[c]} {v[1]:,.2f} de {CURRENCY_SYMBOL[c]} {v[0]:,.2f})" for c, v in by_cur.items())
    late = [r for r in rows if r["days_late"] > 0]
    late.sort(key=lambda r: -r["days_late"])
    return Report("Morosidad", PORT_COLS, late,
                  "Morosidad = capital pendiente de operaciones con cuotas vencidas impagas / capital pendiente total. " + notes)


def pagos(ops, start, end):
    qs = (Payment.objects.filter(operation__in=ops, payment_date__range=(start, end))
          .select_related("operation", "operation__client", "operation__investor", "registered_by").order_by("payment_date", "id"))
    rows = []
    for p in qs:
        valid = p.status == Payment.VALID
        rows.append({**_op_base(p.operation), "payment": p.code, "date": p.payment_date, "concept": p.get_concept_display(),
                     "amount": p.amount if valid else ZERO, "capital": p.capital if valid else ZERO,
                     "interest": p.interest if valid else ZERO, "penalty": p.penalty if valid else ZERO,
                     "method": p.get_method_display(), "ref": p.bank_reference, "pstatus": p.get_status_display(),
                     "by": str(p.registered_by)})
    return Report("Pagos", OP_COLS + [("payment", "Pago", T), ("date", "Fecha", D), ("concept", "Concepto", T), ("amount", "Monto", M),
                                      ("capital", "Capital", M), ("interest", "Interés", M), ("penalty", "Penalidad", M),
                                      ("method", "Medio", T), ("ref", "N° operación", T), ("pstatus", "Estado", T), ("by", "Registró", T)],
                  rows, "Los pagos anulados se listan con monto 0 para mantener la trazabilidad.")


def flujo_mensual(ops, start, end):
    months = []
    m = start.replace(day=1)
    while m <= end:
        months.append(m)
        m = add_months(m, 1, 1)
    data = {(cur, mm): defaultdict(lambda: ZERO) for cur in ("PEN", "USD") for mm in months}
    key = lambda d: d.replace(day=1)  # noqa: E731
    for op in ops.filter(disbursement_date__range=(start, end), restructured_from__isnull=True):
        data[(op.currency, key(op.disbursement_date))]["out"] += op.principal
    for d, cur, comp, amt in (PaymentAllocation.objects.filter(payment__operation__in=ops, payment__status=Payment.VALID,
                                                               payment__payment_date__range=(start, end))
                              .exclude(component="INT_WAIVED")
                              .values_list("payment__payment_date", "payment__currency", "component", "amount")):
        data[(cur, key(d))][comp] += amt
    t = today()
    for op in _with_rows(ops.exclude(status__in=CLOSED)):
        for r in op._rows:
            if r.due_date > t and start <= r.due_date <= end:
                data[(op.currency, key(r.due_date))]["projected"] += r.balance
    rows = []
    for (cur, mm), v in sorted(data.items(), key=lambda kv: (kv[0][1], kv[0][0])):
        if not any(v.values()):
            continue
        cash_in = v["CAPITAL"] + v["INTEREST"] + v["PENALTY"]
        rows.append({"month": mm.strftime("%m/%Y"), "currency": cur, "out": v["out"], "capital": v["CAPITAL"],
                     "interest": v["INTEREST"], "penalty": v["PENALTY"], "cash_in": cash_in, "net": cash_in - v["out"],
                     "projected": v["projected"]})
    return Report("Flujo mensual", [("month", "Mes", T), ("currency", "Moneda", T), ("out", "Desembolsos", M), ("capital", "Cobro capital", M),
                                    ("interest", "Cobro interés", M), ("penalty", "Cobro penalidad", M), ("cash_in", "Ingresos", M),
                                    ("net", "Flujo neto", M), ("projected", "Cobranza proyectada", M)], rows,
                  "Cobranza proyectada: saldo de cuotas futuras según cronograma vigente.")


def rentabilidad(ops, start, end):
    agg = defaultdict(lambda: defaultdict(lambda: ZERO))
    names = {}
    for op in ops:
        k = (op.investor_id, op.currency)
        names[k] = str(op.investor)
        agg[k]["n"] += 1
        if not op.restructured_from_id:
            agg[k]["placed"] += op.principal
        if op.status not in CLOSED:
            agg[k]["pending"] += op.capital_pending
    for (inv, cur, comp, amt) in (PaymentAllocation.objects.filter(payment__operation__in=ops, payment__status=Payment.VALID,
                                                                   payment__payment_date__range=(start, end))
                                  .values_list("payment__operation__investor_id", "payment__currency", "component", "amount")):
        agg[(inv, cur)][comp] += amt
    days = max(1, (end - start).days + 1)
    rows = []
    for (inv, cur), v in agg.items():
        income = v["INTEREST"] + v["PENALTY"]
        base = v["placed"] or Decimal(1)
        yld = income / base * 100
        rows.append({"investor": names[(inv, cur)], "currency": cur, "n": int(v["n"]), "placed": v["placed"],
                     "pending": v["pending"], "capital": v["CAPITAL"], "interest": v["INTEREST"], "penalty": v["PENALTY"],
                     "income": income, "yield": yld.quantize(Decimal("0.01")),
                     "annual": (yld * Decimal(365) / Decimal(days)).quantize(Decimal("0.01"))})
    rows.sort(key=lambda r: -r["income"])
    return Report("Rentabilidad por inversionista",
                  [("investor", "Inversionista", T), ("currency", "Moneda", T), ("n", "Operaciones", I), ("placed", "Capital colocado", M),
                   ("pending", "Capital pendiente", M), ("capital", "Capital recuperado", M), ("interest", "Intereses cobrados", M),
                   ("penalty", "Penalidades cobradas", M), ("income", "Ingreso total", M), ("yield", "Rendimiento periodo", P),
                   ("annual", "Rendimiento anualizado", P)], rows,
                  "Rendimiento = (intereses + penalidades cobrados en el periodo) / capital colocado. Anualizado = rendimiento × 365 / días del periodo.")


BUILDERS = {
    "capital_colocado": capital_colocado, "capital_recuperado": capital_recuperado, "intereses_generados": intereses_generados,
    "intereses_cobrados": intereses_cobrados, "penalidades": penalidades, "morosidad": morosidad, "vigentes": vigentes,
    "vencidas": vencidas, "pagos": pagos, "flujo_mensual": flujo_mensual, "rentabilidad": rentabilidad,
}
