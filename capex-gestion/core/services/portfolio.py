"""
Servicios de cartera: alta de operaciones, cronogramas, pagos, anulaciones,
penalidades, estados y resúmenes. Toda escritura financiera pasa por aquí y queda auditada.
"""

import datetime
from collections import defaultdict
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models import Max
from django.utils import timezone

from audit.services import log, snapshot

from ..models import (
    ECONOMIC_FIELDS, Client, Investor, Mortgage, Operation, OpStatus, InstStatus, Payment,
    PaymentAllocation, PaymentSchedule, Penalty, SystemSettings,
)
from .engine import ZERO, Terms, TermsError, accrued_interest, allocate, build_schedule, compute_penalty, money, regular_installment


class BusinessError(Exception):
    pass


def today():
    return timezone.localdate()


# ------------------------------------------------------------------------ códigos
def next_code(model, prefix, width=5):
    last = model.objects.filter(code__startswith=prefix).aggregate(m=Max("code"))["m"]
    n = int(last[len(prefix):]) + 1 if last else 1
    return f"{prefix}{n:0{width}d}"


def save_with_code(instance, prefix, width=5):
    for _ in range(5):
        instance.code = next_code(type(instance), prefix, width)
        try:
            with transaction.atomic():
                instance.save()
            return instance
        except IntegrityError:
            continue
    raise BusinessError("No se pudo generar un código único; intente de nuevo.")


def create_investor(investor, user):
    investor.created_by = user
    save_with_code(investor, "INV-")
    log("CREATE", "Inversionistas", investor, None, snapshot(investor))
    return investor


def create_client(client, user):
    client.created_by = user
    save_with_code(client, "CLI-")
    log("CREATE", "Clientes", client, None, snapshot(client))
    return client


# ------------------------------------------------------------------------ operaciones
def _write_schedule(op, rows, version):
    PaymentSchedule.objects.bulk_create([
        PaymentSchedule(
            operation=op, version=version, number=r.number, period_start=r.period_start, due_date=r.due_date,
            days=r.days, period_rate=r.period_rate.quantize(Decimal("1e-10")), opening_balance=r.opening_balance,
            capital=r.capital, interest=r.interest, capitalized_interest=r.capitalized_interest,
            closing_balance=r.closing_balance,
        ) for r in rows
    ])


def _apply_terms(op):
    t = Terms.from_obj(op)
    try:
        rows = build_schedule(t)
    except TermsError as e:
        raise BusinessError(str(e))
    op.maturity_date = rows[-1].due_date
    op.installments_count = len(rows)
    op.installment_amount = regular_installment(rows, t)
    return rows


@transaction.atomic
def create_operation(op, user):
    if op.investor.status != "ACTIVO":
        raise BusinessError("El inversionista no está activo.")
    if op.client.status == "INACTIVO":
        raise BusinessError("El cliente está inactivo.")
    rows = _apply_terms(op)
    op.created_by = user
    op.schedule_version = 1
    year = today().year
    prefix = f"{SystemSettings.load().operation_prefix}-{year}-"
    save_with_code(op, prefix)
    _write_schedule(op, rows, 1)
    log("CREATE", "Operaciones", op, None, snapshot(op), detail=f"Cronograma generado: {len(rows)} cuotas.")
    refresh_operation(op)
    return op


ACTION_BY_FIELD = {
    "rate_value": "RATE_CHANGE", "rate_type": "RATE_CHANGE", "interest_method": "RATE_CHANGE",
    "day_base": "RATE_CHANGE", "day_count": "RATE_CHANGE", "capitalizations_per_year": "RATE_CHANGE",
    "term_months": "MATURITY_CHANGE", "start_date": "MATURITY_CHANGE", "payment_day": "MATURITY_CHANGE",
    "periodicity": "MATURITY_CHANGE", "principal": "CAPITAL_CHANGE",
    "penalty_type": "PENALTY_CHANGE", "penalty_value": "PENALTY_CHANGE", "penalty_base": "PENALTY_CHANGE",
    "penalty_grace_days": "PENALTY_CHANGE",
}


@transaction.atomic
def update_operation_terms(op, before, user, reason):
    """Solo permitido sin pagos válidos. Crea una nueva versión del cronograma y conserva la anterior."""
    if Payment.objects.filter(operation=op, status=Payment.VALID).exists():
        raise BusinessError("La operación tiene pagos registrados: sus condiciones históricas no se modifican. Use REESTRUCTURAR.")
    if op.penalties.exists():
        raise BusinessError("La operación ya tiene penalidades generadas. Use REESTRUCTURAR.")
    changed = [f for f in ECONOMIC_FIELDS if before.get(f) != snapshot(op, [f]).get(f)]
    rows = _apply_terms(op)
    if changed:
        op.schedule_version += 1
    op.save()
    if changed:
        _write_schedule(op, rows, op.schedule_version)
    after = snapshot(op)
    actions = defaultdict(list)
    for f in changed:
        actions[ACTION_BY_FIELD.get(f, "UPDATE")].append(f)
    other = [k for k in after if k not in ECONOMIC_FIELDS and before.get(k) != after.get(k)
             and k not in ("updated_at", "maturity_date", "installment_amount", "installments_count", "schedule_version")]
    if other:
        actions["UPDATE"].extend(other)
    for action, fields in actions.items():
        extra = [f for f in ("maturity_date", "installment_amount") if before.get(f) != after.get(f)]
        keys = fields + extra
        log(action, "Operaciones", op, {k: before.get(k) for k in keys}, {k: after.get(k) for k in keys}, detail=reason)
    refresh_operation(op)
    return op


@transaction.atomic
def restructure_operation(old, new, user, reason, capitalize_arrears=False):
    """Cierra la operación original como REESTRUCTURADA y crea una nueva con el saldo pendiente."""
    s = operation_summary(old)
    principal = s["capital_pending"]
    if capitalize_arrears:
        principal += s["interest_pending"] + s["penalty_pending"]
    if principal <= 0:
        raise BusinessError("La operación no tiene saldo pendiente que reestructurar.")
    new.principal = money(principal)
    new.investor = old.investor
    new.client = old.client
    new.restructured_from = old
    create_operation(new, user)
    for m in old.mortgages.all():
        Mortgage.objects.create(operation=new, property=m.property, secured_amount=m.secured_amount, rank=m.rank,
                                inscription_status=m.inscription_status, registry_seat=m.registry_seat,
                                notes=f"Trasladada desde {old.code}", created_by=user)
    for trust in old.trusts.all():
        trust.operations.add(new)
    prev = old.status
    old.status = OpStatus.REESTRUCTURADA
    old.closed_manually = True
    old.close_reason = f"Reestructurada en {new.code}. {reason}"
    old.save(update_fields=["status", "closed_manually", "close_reason", "updated_at"])
    log("STATUS_CHANGE", "Operaciones", old, {"status": prev}, {"status": old.status, "nueva_operacion": new.code}, detail=reason)
    return new


@transaction.atomic
def close_operation(op, user, reason):
    prev = op.status
    op.status = OpStatus.CANCELADA
    op.closed_manually = True
    op.close_reason = reason
    op.save(update_fields=["status", "closed_manually", "close_reason", "updated_at"])
    log("STATUS_CHANGE", "Operaciones", op, {"status": prev}, {"status": op.status}, detail=f"Cierre manual: {reason}")


@transaction.atomic
def reopen_operation(op, user, reason):
    if op.status == OpStatus.REESTRUCTURADA:
        raise BusinessError("Una operación reestructurada no se reabre; gestione la nueva operación.")
    prev = op.status
    op.closed_manually = False
    op.close_reason = ""
    op.save(update_fields=["closed_manually", "close_reason", "updated_at"])
    refresh_operation(op)
    log("STATUS_CHANGE", "Operaciones", op, {"status": prev}, {"status": op.status}, detail=f"Reapertura: {reason}")


# ------------------------------------------------------------------------ recálculo
def _allocs_by_row(rows):
    data = defaultdict(list)
    qs = (PaymentAllocation.objects.filter(installment__in=rows, payment__status=Payment.VALID)
          .select_related("payment"))
    for a in qs:
        data[a.installment_id].append((a.payment.payment_date, a.component, a.amount))
    return data


def _penalty_for(op, row, events, as_of):
    pen = getattr(row, "_pen", None)
    params = (pen.penalty_type, pen.value, pen.base, pen.grace_days, pen.day_base) if pen else (
        op.penalty_type, op.penalty_value, op.penalty_base, op.penalty_grace_days, op.day_base)
    base_events = [(d, "INTEREST" if c == "INT_WAIVED" else c, amt) for (d, c, amt) in events if c != "PENALTY"]
    return params, compute_penalty(*params, row.due_date, {"CAPITAL": row.capital, "INTEREST": row.interest}, base_events, as_of)


def refresh_operation(op, as_of=None, cfg=None):
    """Recalcula cuotas, penalidades, estado y caché de la operación desde los pagos válidos."""
    as_of = as_of or today()
    cfg = cfg or SystemSettings.load()
    rows = list(op.current_schedule())
    pens = {p.installment_id: p for p in Penalty.objects.filter(installment__in=rows)}
    allocs = _allocs_by_row(rows)
    changed_rows = []
    max_late = 0
    next_due = None
    all_paid = True
    capital_paid = ZERO
    for row in rows:
        row._pen = pens.get(row.id)
        ev = allocs.get(row.id, [])
        pc = sum((a for d, c, a in ev if c == "CAPITAL"), ZERO)
        pi = sum((a for d, c, a in ev if c == "INTEREST"), ZERO)
        pp = sum((a for d, c, a in ev if c == "PENALTY"), ZERO)
        wi = sum((a for d, c, a in ev if c == "INT_WAIVED"), ZERO)
        capital_paid += pc
        params, res = _penalty_for(op, row, ev, as_of)
        pen = row._pen
        if res.amount > 0 and pen is None and not op.closed_manually:
            pen = Penalty.objects.create(
                operation=op, installment=row, penalty_type=params[0], value=params[1], base=params[2],
                grace_days=params[3], day_base=params[4], applies_from=res.applies_from, days_late=res.days_late,
                calculated_amount=res.amount, paid_amount=pp, formula=res.formula, last_calculated=as_of,
            )
            log("CREATE", "Penalidades", pen, None, {"cuota": row.number, "monto": str(res.amount), "formula": res.formula},
                detail="Penalidad generada automáticamente por atraso.", user=None)
        elif pen is not None:
            amount = res.amount if not op.closed_manually else pen.calculated_amount
            amount = max(amount, ZERO)
            status = "VIGENTE"
            if amount == 0 and pp == 0:
                status = "SIN_EFECTO"
            elif pen.waived_amount >= amount and pp == 0:
                status = "CONDONADA"
            elif amount - pen.waived_amount - pp <= 0:
                status = "PAGADA"
            formula = res.formula or ("Sin penalidad: según los pagos registrados, la cuota se pagó dentro del plazo."
                                      if amount == 0 else pen.formula)
            if (pen.calculated_amount, pen.paid_amount, pen.days_late, pen.status, pen.formula) != (amount, pp, res.days_late, status, formula):
                if pen.calculated_amount != amount and status == "SIN_EFECTO":
                    log("PENALTY_CHANGE", "Penalidades", pen, {"calculated_amount": str(pen.calculated_amount)},
                        {"calculated_amount": str(amount), "status": status},
                        detail="Recalculada por pago registrado con fecha anterior al atraso.", user=None)
                pen.calculated_amount, pen.paid_amount, pen.days_late, pen.status = amount, pp, res.days_late, status
                pen.formula = formula
                pen.last_calculated = as_of
                pen.save(update_fields=["calculated_amount", "paid_amount", "days_late", "status", "formula", "last_calculated"])
        penalty_net = (pen.calculated_amount - pen.waived_amount) if pen else ZERO

        pending = (row.capital - pc) + (row.interest - pi - wi) + (penalty_net - pp)
        last_date = max((d for d, c, a in ev), default=None)
        if pending <= 0:
            status = InstStatus.PAGADO
            settled = _settled_date(row, ev)
            late = max(0, (settled - row.due_date).days) if settled else 0
        elif row.due_date < as_of:
            status = InstStatus.VENCIDO
            late = (as_of - row.due_date).days
        elif pc + pi + pp > 0:
            status = InstStatus.PAGO_PARCIAL
            late = 0
        else:
            status = InstStatus.PENDIENTE
            late = 0
        if status != InstStatus.PAGADO:
            all_paid = False
            next_due = next_due or row.due_date
            if status == InstStatus.VENCIDO:
                max_late = max(max_late, late)
        new = (pc, pi, wi, pp, penalty_net, last_date, late, status)
        old = (row.paid_capital, row.paid_interest, row.waived_interest, row.paid_penalty, row.penalty_amount,
               row.payment_date, row.days_late, row.status)
        if new != old:
            (row.paid_capital, row.paid_interest, row.waived_interest, row.paid_penalty, row.penalty_amount,
             row.payment_date, row.days_late, row.status) = new
            changed_rows.append(row)
    if changed_rows:
        PaymentSchedule.objects.bulk_update(changed_rows, [
            "paid_capital", "paid_interest", "waived_interest", "paid_penalty", "penalty_amount",
            "payment_date", "days_late", "status"])

    principal_total = op.principal + sum((r.capitalized_interest for r in rows if r.due_date <= as_of), ZERO)
    op.capital_pending = max(ZERO, principal_total - capital_paid)
    op.days_late = max_late
    op.next_due_date = next_due
    op.refreshed_on = as_of
    new_status = _derive_status(op, all_paid, max_late, next_due, as_of, cfg)
    fields = ["capital_pending", "days_late", "next_due_date", "refreshed_on"]
    if new_status != op.status:
        prev = op.status
        op.status = new_status
        fields.append("status")
        log("STATUS_CHANGE", "Operaciones", op, {"status": prev}, {"status": new_status},
            detail="Cambio automático por recálculo de cartera.")
    Operation.objects.filter(pk=op.pk).update(**{f: getattr(op, f) for f in fields})
    return op


def _settled_date(row, events):
    need = row.capital + row.interest
    acc = ZERO
    for d, c, a in sorted(events):
        if c in ("CAPITAL", "INTEREST", "INT_WAIVED"):
            acc += a
            if acc >= need:
                return d
    return max((d for d, c, a in events), default=None)


def _derive_status(op, all_paid, late, next_due, as_of, cfg):
    if op.closed_manually:
        return op.status
    if all_paid:
        return OpStatus.CANCELADA
    if op.start_date > as_of:
        return OpStatus.ACTIVA
    if late > cfg.mora_days:
        return OpStatus.EN_MORA
    if late > 0 or as_of > op.maturity_date:
        return OpStatus.VENCIDA
    if next_due and (next_due - as_of).days <= cfg.alert_days:
        return OpStatus.POR_VENCER
    return OpStatus.AL_DIA


def refresh_portfolio(as_of=None, force=False):
    cfg = SystemSettings.load()
    as_of = as_of or today()
    if not force and cfg.last_refresh == as_of:
        return 0
    n = 0
    for op in Operation.objects.exclude(closed_manually=True):
        refresh_operation(op, as_of, cfg)
        n += 1
    SystemSettings.objects.filter(pk=cfg.pk).update(last_refresh=as_of)
    return n


# ------------------------------------------------------------------------ pagos
def _buckets(op, pay_date, cfg):
    rows = list(op.current_schedule())
    allocs = _allocs_by_row(rows)
    pens = {p.installment_id: p for p in Penalty.objects.filter(installment__in=rows)}
    buckets = []
    for row in rows:
        row._pen = pens.get(row.id)
        ev = allocs.get(row.id, [])
        paid = defaultdict(lambda: ZERO)
        for d, c, a in ev:
            paid[c] += a
        _, res = _penalty_for(op, row, ev, pay_date)
        waived = row._pen.waived_amount if row._pen else ZERO
        buckets.append((row.number, "CAPITAL", row.capital - paid["CAPITAL"], row))
        buckets.append((row.number, "INTEREST", row.interest - paid["INTEREST"] - paid["INT_WAIVED"], row))
        buckets.append((row.number, "PENALTY", max(ZERO, res.amount - waived - paid["PENALTY"]), row))
    return buckets


def payoff_amount(op, pay_date=None):
    """Saldo para cancelar en una fecha: capital + interés devengado + penalidades, menos lo pagado."""
    pay_date = pay_date or today()
    cfg = SystemSettings.load()
    rows = list(op.current_schedule())
    buckets = _buckets(op, pay_date, cfg)
    capital = sum((b[2] for b in buckets if b[1] == "CAPITAL"), ZERO)
    penalty = sum((b[2] for b in buckets if b[1] == "PENALTY"), ZERO)
    accrued = accrued_interest(rows, pay_date)
    paid_int = sum((r.paid_interest + r.waived_interest for r in rows), ZERO)
    interest = max(ZERO, accrued - paid_int)
    scheduled_pending = sum((b[2] for b in buckets if b[1] == "INTEREST"), ZERO)
    return {
        "capital": money(capital), "interest": money(interest), "penalty": money(penalty),
        "total": money(capital + interest + penalty),
        "interest_discount": money(max(ZERO, scheduled_pending - interest)),
    }


@transaction.atomic
def register_payment(payment, user, document_file=None):
    op = Operation.objects.select_for_update().get(pk=payment.operation_id)
    if op.is_closed:
        raise BusinessError(f"La operación {op.code} está {op.get_status_display().lower()}; no admite pagos.")
    if payment.currency != op.currency:
        raise BusinessError(f"La operación está en {op.currency}; registre el pago en esa moneda.")
    if payment.payment_date > today():
        raise BusinessError("La fecha de pago no puede ser futura.")
    if payment.payment_date < op.disbursement_date:
        raise BusinessError("La fecha de pago es anterior al desembolso.")
    cfg = SystemSettings.load()
    order = cfg.allocation_order.split(",")
    buckets = _buckets(op, payment.payment_date, cfg)
    row_by_num = {b[0]: b[3] for b in buckets}
    allocations = []

    if payment.concept == "CANCELACION":
        p = payoff_amount(op, payment.payment_date)
        if payment.amount != p["total"]:
            raise BusinessError(f"El saldo de cancelación al {payment.payment_date:%d/%m/%Y} es {p['total']}. Registre ese monto exacto.")
        for comp, limit in (("PENALTY", p["penalty"]), ("INTEREST", p["interest"]), ("CAPITAL", p["capital"])):
            got, _ = allocate(limit, [(b[0], b[1], b[2]) for b in buckets if b[1] == comp], order)
            allocations += got
        int_paid = defaultdict(lambda: ZERO)
        for num, comp, amt in allocations:
            if comp == "INTEREST":
                int_paid[num] += amt
        for b in buckets:
            if b[1] == "INTEREST":
                rest = b[2] - int_paid[b[0]]
                if rest > 0:
                    allocations.append((b[0], "INT_WAIVED", rest))
        payment.capital, payment.interest, payment.penalty = p["capital"], p["interest"], p["penalty"]
    else:
        split = {"CAPITAL": payment.capital or ZERO, "INTEREST": payment.interest or ZERO, "PENALTY": payment.penalty or ZERO}
        if any(split.values()):
            if sum(split.values()) != payment.amount:
                raise BusinessError("La suma de capital, interés y penalidad debe ser igual al monto del pago.")
            for comp in ("PENALTY", "INTEREST", "CAPITAL"):
                if split[comp] <= 0:
                    continue
                got, left = allocate(split[comp], [(b[0], b[1], b[2]) for b in buckets if b[1] == comp], order)
                if left > 0:
                    pend = sum((b[2] for b in buckets if b[1] == comp), ZERO)
                    raise BusinessError(f"El monto indicado para {dict(PaymentAllocation.COMPONENTS)[comp].lower()} "
                                        f"supera lo pendiente ({pend}).")
                allocations += got
        else:
            allocations, left = allocate(payment.amount, [(b[0], b[1], b[2]) for b in buckets], order)
            if left > 0:
                total = sum((b[2] for b in buckets), ZERO)
                raise BusinessError(f"El pago excede la deuda total programada de la operación ({total}). "
                                    "Para cancelar anticipadamente use el concepto 'Cancelación total'.")
            sums = defaultdict(lambda: ZERO)
            for _, comp, amt in allocations:
                sums[comp] += amt
            payment.capital, payment.interest, payment.penalty = sums["CAPITAL"], sums["INTEREST"], sums["PENALTY"]

    if not allocations:
        raise BusinessError("La operación no tiene montos pendientes para aplicar este pago.")
    payment.client = op.client
    payment.registered_by = user
    save_with_code(payment, f"PAG-{payment.payment_date.year}-")
    PaymentAllocation.objects.bulk_create([
        PaymentAllocation(payment=payment, installment=row_by_num[num], component=comp, amount=amt)
        for num, comp, amt in allocations if amt > 0
    ])
    detail = "; ".join(f"cuota {n} {dict(PaymentAllocation.COMPONENTS)[c].split(' (')[0].lower()} {a}" for n, c, a in allocations)
    log("PAYMENT", "Pagos", payment, None, snapshot(payment), detail=f"{op.code}: {detail}")
    if document_file is not None:
        from .documents import store_document
        store_document(document_file, "COMPROBANTE", user, title=f"Comprobante {payment.code}",
                       operation=op, client=op.client, payment=payment)
    refresh_operation(op)
    return payment


@transaction.atomic
def void_payment(payment, user, reason):
    if payment.is_void:
        raise BusinessError("El pago ya está anulado.")
    if not reason.strip():
        raise BusinessError("Indique el motivo de la anulación.")
    before = snapshot(payment)
    payment.status = Payment.VOID
    payment.voided_by = user
    payment.voided_at = timezone.now()
    payment.void_reason = reason
    payment.save(update_fields=["status", "voided_by", "voided_at", "void_reason"])
    log("VOID", "Pagos", payment, {"status": before["status"]}, {"status": payment.status}, detail=reason)
    refresh_operation(payment.operation)
    return payment


@transaction.atomic
def waive_penalty(penalty, amount, user, reason):
    amount = money(amount)
    if amount < 0 or amount > penalty.calculated_amount - penalty.paid_amount:
        raise BusinessError("El monto a condonar no puede superar la penalidad pendiente.")
    if not reason.strip():
        raise BusinessError("Indique el motivo.")
    before = {"waived_amount": str(penalty.waived_amount), "status": penalty.status}
    penalty.waived_amount = amount
    penalty.notes = (penalty.notes + "\n" if penalty.notes else "") + f"{timezone.localdate():%d/%m/%Y} {user}: condonación {amount}. {reason}"
    penalty.save(update_fields=["waived_amount", "notes"])
    refresh_operation(penalty.operation)
    penalty.refresh_from_db()
    log("PENALTY_CHANGE", "Penalidades", penalty, before, {"waived_amount": str(penalty.waived_amount), "status": penalty.status}, detail=reason)
    return penalty


# ------------------------------------------------------------------------ resúmenes
def ltv(op, cfg=None):
    cfg = cfg or SystemSettings.load()
    commercial = realization = ZERO
    for m in op.mortgages.select_related("property"):
        if m.inscription_status == "LEVANTADA":
            continue
        p = m.property
        factor = Decimal(1)
        if p.value_currency != op.currency:
            factor = (Decimal(1) / cfg.exchange_rate) if p.value_currency == "PEN" else cfg.exchange_rate
        commercial += p.commercial_value * factor
        realization += p.realization_value * factor
    def ratio(num, den):
        return (num / den * 100).quantize(Decimal("0.01")) if den > 0 else None
    return {
        "guarantee_value": money(commercial), "realization_value": money(realization),
        "ltv": ratio(op.principal, commercial), "ltv_current": ratio(op.capital_pending, commercial),
        "ltv_realization": ratio(op.principal, realization), "limit": cfg.max_ltv,
        "exceeds": bool(commercial and ratio(op.principal, commercial) > cfg.max_ltv),
        "missing": commercial == 0,
    }


def operation_summary(op, as_of=None, rows=None, cfg=None):
    as_of = as_of or today()
    rows = rows if rows is not None else list(op.current_schedule())
    interest_total = sum((r.interest + r.capitalized_interest for r in rows), ZERO)
    interest_accrued = accrued_interest(rows, as_of)
    interest_paid = sum((r.paid_interest for r in rows), ZERO)
    interest_waived = sum((r.waived_interest for r in rows), ZERO)
    capital_paid = sum((r.paid_capital for r in rows), ZERO)
    pens = list(op.penalties.all())
    pen_gen = sum((p.calculated_amount for p in pens), ZERO)
    pen_waived = sum((p.waived_amount for p in pens), ZERO)
    pen_paid = sum((p.paid_amount for p in pens), ZERO)
    closed = op.status == OpStatus.REESTRUCTURADA or (op.closed_manually and op.status == OpStatus.CANCELADA)
    capital_pending = ZERO if closed else op.capital_pending
    interest_pending = ZERO if closed else max(ZERO, interest_accrued - interest_paid - interest_waived)
    if op.status == OpStatus.CANCELADA and not op.closed_manually:
        interest_pending = ZERO
    pen_pending = ZERO if closed else max(ZERO, pen_gen - pen_waived - pen_paid)
    overdue = sum((r.balance for r in rows if r.status == InstStatus.VENCIDO), ZERO)
    total_paid = sum((p.amount for p in op.payments.all() if p.status == Payment.VALID), ZERO)
    return {
        "principal": op.principal, "capital_paid": capital_paid, "capital_pending": capital_pending,
        "interest_total": interest_total, "interest_accrued": interest_accrued, "interest_paid": interest_paid,
        "interest_waived": interest_waived, "interest_pending": interest_pending,
        "interest_future": max(ZERO, interest_total - interest_accrued),
        "penalty_generated": pen_gen, "penalty_waived": pen_waived, "penalty_paid": pen_paid, "penalty_pending": pen_pending,
        "total_paid": total_paid, "total_due": capital_pending + interest_pending + pen_pending,
        "overdue_amount": overdue if not closed else ZERO,
        "days_elapsed": max(0, (min(as_of, op.maturity_date) - op.start_date).days),
        "days_late": op.days_late, "as_of": as_of,
    }
