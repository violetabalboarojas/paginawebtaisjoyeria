"""Indicadores del dashboard, series mensuales y alertas."""

import datetime
from collections import defaultdict
from decimal import Decimal

from django.db.models import Prefetch
from django.urls import reverse

from ..models import (
    Document, InstStatus, Operation, OpStatus, Payment, PaymentAllocation, PaymentSchedule,
    SystemSettings,
)
from .engine import ZERO, add_months
from .portfolio import ltv, operation_summary, today

CLOSED = (OpStatus.CANCELADA, OpStatus.REESTRUCTURADA)


def _with_rows(ops):
    ops = ops.prefetch_related(
        Prefetch("schedule", queryset=PaymentSchedule.objects.order_by("number"), to_attr="_all_rows"),
        "penalties", "payments",
    )
    for op in ops:
        op._rows = [r for r in op._all_rows if r.version == op.schedule_version]
        yield op


def kpis(ops, as_of=None, cfg=None):
    as_of = as_of or today()
    cfg = cfg or SystemSettings.load()
    k = defaultdict(lambda: ZERO)
    counts = defaultdict(int)
    upcoming = 0
    for op in _with_rows(ops):
        s = operation_summary(op, as_of, rows=op._rows)
        if not op.restructured_from_id:
            k["placed"] += op.principal
        closed_manual = op.closed_manually
        k["capital_pending"] += s["capital_pending"]
        k["capital_recovered"] += s["capital_paid"]
        k["interest_generated"] += (s["interest_paid"] if closed_manual else s["interest_accrued"] - s["interest_waived"])
        k["interest_paid"] += s["interest_paid"]
        k["interest_pending"] += s["interest_pending"]
        k["penalty_generated"] += s["penalty_generated"] - s["penalty_waived"]
        k["penalty_paid"] += s["penalty_paid"]
        k["penalty_pending"] += s["penalty_pending"]
        k["total_due"] += s["total_due"]
        k["overdue"] += s["overdue_amount"]
        counts[op.status] += 1
        counts["inst_paid"] = counts.get("inst_paid", 0) + sum(1 for r in op._rows if r.status == InstStatus.PAGADO)
        if op.status not in CLOSED:
            counts["active"] += 1
            upcoming += sum(1 for r in op._rows if r.status != InstStatus.PAGADO
                            and as_of <= r.due_date <= as_of + datetime.timedelta(days=cfg.alert_days))
            counts["inst_overdue"] = counts.get("inst_overdue", 0) + sum(1 for r in op._rows if r.status == InstStatus.VENCIDO)
            counts["inst_pending"] = counts.get("inst_pending", 0) + sum(
                1 for r in op._rows if r.status in (InstStatus.PENDIENTE, InstStatus.PAGO_PARCIAL))
            if op.days_late > 0:
                k["capital_late"] += s["capital_pending"]
    k["morosidad"] = (k["capital_late"] / k["capital_pending"] * 100).quantize(Decimal("0.01")) if k["capital_pending"] else ZERO
    return dict(k), dict(counts), upcoming


def _month_key(d):
    return (d.year, d.month)


def monthly_series(ops, as_of=None, back=12, forward=6):
    as_of = as_of or today()
    first = add_months(as_of.replace(day=1), -(back - 1), 1)
    months = [add_months(first, i, 1) for i in range(back + forward)]
    past = months[:back]
    keys = [_month_key(m) for m in months]
    idx = {k: i for i, k in enumerate(keys)}
    n = len(months)
    z = lambda: [ZERO] * n  # noqa: E731
    placed, int_gen, int_paid, cap_paid, pen_gen, pen_paid, inflow, outflow, projected = z(), z(), z(), z(), z(), z(), z(), z(), z()

    ops = list(_with_rows(ops))
    op_ids = [o.id for o in ops]
    for op in ops:
        if not op.restructured_from_id and _month_key(op.disbursement_date) in idx:
            i = idx[_month_key(op.disbursement_date)]
            placed[i] += op.principal
            outflow[i] += op.principal
        for r in op._rows:
            key = _month_key(r.due_date)
            if key in idx:
                int_gen[idx[key]] += r.interest
                if r.due_date > as_of and op.status not in CLOSED:
                    projected[idx[key]] += max(ZERO, r.balance)
        for p in op.penalties.all():
            key = _month_key(p.applies_from)
            if key in idx:
                pen_gen[idx[key]] += p.calculated_amount - p.waived_amount

    allocs = (PaymentAllocation.objects.filter(payment__operation_id__in=op_ids, payment__status=Payment.VALID)
              .values_list("payment__payment_date", "component", "amount"))
    for d, comp, amt in allocs:
        key = _month_key(d)
        if key not in idx:
            continue
        i = idx[key]
        if comp == "INTEREST":
            int_paid[i] += amt
        elif comp == "CAPITAL":
            cap_paid[i] += amt
        elif comp == "PENALTY":
            pen_paid[i] += amt
        if comp != "INT_WAIVED":
            inflow[i] += amt

    # Morosidad al cierre de cada mes: capital de operaciones con cuotas vencidas impagas / capital vigente
    alloc_rows = defaultdict(list)
    for inst_id, d, comp, amt in (PaymentAllocation.objects.filter(payment__operation_id__in=op_ids, payment__status=Payment.VALID)
                                  .values_list("installment_id", "payment__payment_date", "component", "amount")):
        alloc_rows[inst_id].append((d, comp, amt))
    mora = []
    for m in past:
        month_end = min(add_months(m, 1, 1) - datetime.timedelta(days=1), as_of)
        total = late = ZERO
        for op in ops:
            if op.status == OpStatus.REESTRUCTURADA or op.disbursement_date > month_end:
                continue
            cap_paid_to = ZERO
            is_late = False
            for r in op._rows:
                ev = [e for e in alloc_rows.get(r.id, []) if e[0] <= month_end]
                cap_paid_to += sum((a for d, c, a in ev if c == "CAPITAL"), ZERO)
                if r.due_date < month_end:
                    owed = r.capital + r.interest - sum((a for d, c, a in ev if c in ("CAPITAL", "INTEREST", "INT_WAIVED")), ZERO)
                    if owed > 0:
                        is_late = True
            outstanding = max(ZERO, op.principal - cap_paid_to)
            total += outstanding
            if is_late:
                late += outstanding
        mora.append(float((late / total * 100).quantize(Decimal("0.01"))) if total else 0.0)

    f = lambda arr, upto=back: [float(x) for x in arr[:upto]]  # noqa: E731
    labels = [m.strftime("%b %Y").capitalize() for m in months]
    net = [float(inflow[i] - outflow[i]) for i in range(back)]
    return {
        "labels": labels[:back],
        "labels_all": labels,
        "placed": f(placed),
        "interest_generated": f(int_gen),
        "interest_paid": f(int_paid),
        "recovered": f(cap_paid),
        "morosidad": mora,
        "penalty_generated": f(pen_gen),
        "penalty_paid": f(pen_paid),
        "cash_in": f(inflow, n),
        "cash_out": f(outflow, n),
        "cash_net": net + [float(projected[i]) for i in range(back, n)],
        "cash_projected": [0.0] * back + [float(projected[i]) for i in range(back, n)],
        "back": back,
    }


# ------------------------------------------------------------------------------------- alertas
def compute_alerts(ops, as_of=None, cfg=None):
    as_of = as_of or today()
    cfg = cfg or SystemSettings.load()
    alerts = []
    active = ops.exclude(status__in=CLOSED).select_related("client")

    def add(level, kind, message, op=None, date=None, url=None):
        alerts.append({"level": level, "kind": kind, "message": message, "op": op, "date": date,
                       "url": url or (reverse("core:operation_detail", args=[op.pk]) if op else "")})

    horizon = as_of + datetime.timedelta(days=cfg.alert_days)
    rows = (PaymentSchedule.objects.filter(operation__in=active).exclude(status=InstStatus.PAGADO)
            .select_related("operation", "operation__client").order_by("due_date"))
    for r in rows:
        if r.version != r.operation.schedule_version:
            continue
        if r.status == InstStatus.VENCIDO:
            add("red", "Pago vencido", f"Cuota {r.number} de {r.operation.code} ({r.operation.client}) con {r.days_late} días de atraso",
                r.operation, r.due_date)
        elif as_of <= r.due_date <= horizon:
            add("yellow", "Pago próximo a vencer", f"Cuota {r.number} de {r.operation.code} ({r.operation.client}) vence el {r.due_date:%d/%m/%Y}",
                r.operation, r.due_date)

    mat_horizon = as_of + datetime.timedelta(days=cfg.maturity_alert_days)
    required = cfg.required_document_list
    doc_types = defaultdict(set)
    for op_id, t in Document.objects.filter(operation__in=active, is_void=False).values_list("operation_id", "doc_type"):
        doc_types[op_id].add(t)
    labels = dict(Document._meta.get_field("doc_type").choices)
    for op in active.prefetch_related("mortgages__property", "trusts", "holdings__investor"):
        for h in op.holdings.all():
            if h.investor.doc_type == "SD":
                add("yellow", "Documentación pendiente", f"{op.code}: el bonista {h.investor} no tiene DNI/RUC registrado", op,
                    url=reverse("core:investor_detail", args=[h.investor_id]))
        if op.maturity_date < as_of:
            add("red", "Operación vencida", f"{op.code} ({op.client}) venció el {op.maturity_date:%d/%m/%Y}", op, op.maturity_date)
        elif op.maturity_date <= mat_horizon:
            add("yellow", "Operación próxima a vencer", f"{op.code} ({op.client}) vence el {op.maturity_date:%d/%m/%Y}", op, op.maturity_date)
        missing = [labels.get(t, t) for t in required if t not in doc_types[op.id]]
        if missing:
            add("yellow", "Documentación pendiente", f"{op.code}: falta {', '.join(missing)}", op)
        mortgages = list(op.mortgages.all())
        if not mortgages:
            add("red", "Garantía pendiente de inscripción", f"{op.code} no tiene garantía hipotecaria registrada", op)
        for m in mortgages:
            if m.inscription_status in ("PENDIENTE", "EN_TRAMITE", "OBSERVADA"):
                add("red" if m.inscription_status == "OBSERVADA" else "yellow", "Garantía pendiente de inscripción",
                    f"{op.code}: hipoteca sobre partida {m.property.registry_number} {m.get_inscription_status_display().lower()}", op)
            limit = add_months(m.property.appraisal_date, cfg.appraisal_validity_months)
            if limit < as_of:
                add("yellow", "Tasación vencida", f"{op.code}: tasación de la partida {m.property.registry_number} del "
                    f"{m.property.appraisal_date:%d/%m/%Y} venció el {limit:%d/%m/%Y}", op, limit)
        trusts = list(op.trusts.all())
        if not trusts:
            add("yellow", "Fideicomiso pendiente", f"{op.code} no está vinculada a un fideicomiso", op)
        for t in trusts:
            if t.status in ("EN_CONSTITUCION", "PENDIENTE_INSCRIPCION"):
                add("yellow", "Fideicomiso pendiente", f"{op.code}: fideicomiso {t.code} {t.get_status_display().lower()}", op,
                    url=reverse("core:trust_detail", args=[t.pk]))
        if mortgages:
            l = ltv(op, cfg)
            if l["exceeds"]:
                add("red", "LTV sobre el límite", f"{op.code}: LTV {l['ltv']}% supera el límite de {cfg.max_ltv}%", op)
    order = {"red": 0, "yellow": 1}
    alerts.sort(key=lambda a: (order[a["level"]], a["date"] or datetime.date.max))
    return alerts
