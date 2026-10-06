from django.contrib import messages
from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.db.models import Q
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse

from accounts.permissions import require
from audit.models import AuditLog
from audit.services import log, log_changes, snapshot

from ..forms import (
    OPERATION_GROUPS, MortgageForm, OperationForm, OperationInfoForm, PropertyForm, ReasonForm, RestructureForm, TermsEditForm,
)
from ..models import CURRENCIES, FinancialProfile, Investor, Mortgage, Operation, OpStatus
from ..services.engine import Terms, TermsError, build_schedule, regular_installment
from ..services.portfolio import (
    BusinessError, close_operation, create_operation, ltv, operation_summary, refresh_operation, reopen_operation,
    restructure_operation, today, update_operation_terms,
)
from ..services import exports
from .common import check_operation_access, paginate, scoped_clients, scoped_operations

PROFILE_FIELDS = ["rate_type", "rate_value", "interest_method", "day_base", "day_count", "capitalizations_per_year",
                  "periodicity", "amortization", "penalty_type", "penalty_value", "penalty_base", "penalty_grace_days"]


def _preview(instance):
    t = Terms.from_obj(instance)
    rows = build_schedule(t)
    return {"rows": rows, "formulas": t.formula_lines(rows[0].days), "installment": regular_installment(rows, t),
            "maturity": rows[-1].due_date, "total_interest": sum(r.interest for r in rows),
            "total_capital": sum(r.capital for r in rows), "currency": instance.currency}


def _profiles_json():
    return {str(p.pk): {f: str(getattr(p, f)) for f in PROFILE_FIELDS} for p in FinancialProfile.objects.filter(is_active=True)}


@require("operations.view")
def operation_list(request):
    qs = scoped_operations(request.user).select_related("client", "investor", "advisor")
    q = request.GET.get("q", "").strip()
    if q:
        qs = qs.filter(Q(code__icontains=q) | Q(client__full_name__icontains=q) | Q(client__doc_number__icontains=q) |
                       Q(investor__first_name__icontains=q) | Q(investor__last_name__icontains=q))
    status = request.GET.get("estado")
    if status:
        qs = qs.filter(status=status)
    if request.GET.get("moneda"):
        qs = qs.filter(currency=request.GET["moneda"])
    if request.GET.get("bonista"):
        qs = qs.filter(investor_id=request.GET["bonista"])
    return render(request, "core/operation_list.html", {
        "page": paginate(request, qs), "q": q, "statuses": OpStatus.choices, "status": status,
        "currencies": CURRENCIES, "investors": Investor.objects.all() if request.user.can("investors.view") else []})


@require("operations.create")
def operation_create(request):
    clients = scoped_clients(request.user).exclude(status="INACTIVO")
    initial = {}
    if request.GET.get("cliente"):
        initial["client"] = request.GET["cliente"]
    if request.GET.get("bonista"):
        initial["investor"] = request.GET["bonista"]
    form = OperationForm(request.POST or None, user=request.user, clients=clients, initial=initial)
    preview = None
    if request.method == "POST" and form.is_valid():
        op = form.save(commit=False)
        if not request.user.can("operations.all"):
            op.advisor = request.user
        try:
            preview = _preview(op)
        except TermsError as e:
            form.add_error(None, str(e))
        if preview and request.POST.get("action") == "confirm":
            try:
                create_operation(op, request.user)
            except BusinessError as e:
                form.add_error(None, str(e))
            else:
                messages.success(request, f"Operación {op.code} registrada con {op.installments_count} cuotas.")
                return redirect(op)
    return render(request, "core/operation_form.html", {
        "form": form, "preview": preview, "title": "Nueva operación", "profiles": _profiles_json(),
        "confirm_label": "Confirmar y registrar operación", "groups": OPERATION_GROUPS})


def _get_op(request, pk):
    op = get_object_or_404(Operation.objects.select_related("client", "investor", "advisor", "restructured_from"), pk=pk)
    check_operation_access(request.user, op)
    return op


@require("operations.view")
def operation_detail(request, pk):
    op = _get_op(request, pk)
    if op.refreshed_on != today() and not op.closed_manually:
        refresh_operation(op)
    rows = list(op.current_schedule())
    summary = operation_summary(op, rows=rows)
    terms = Terms.from_obj(op)
    ctx = {
        "op": op, "rows": rows, "s": summary, "ltv": ltv(op),
        "formulas": terms.formula_lines(rows[0].days if rows else None),
        "mortgages": op.mortgages.select_related("property"),
        "trusts": op.trusts.all(),
        "payments": op.payments.select_related("registered_by").order_by("-payment_date", "-id"),
        "penalties": op.penalties.select_related("installment"),
        "docs": op.documents.filter(is_void=False).select_related("uploaded_by"),
        "restructurings": op.restructurings.all(),
        "has_payments": op.has_payments(),
        "logs": AuditLog.objects.filter(module__in=["Operaciones", "Pagos", "Penalidades"],
                                        record_label__icontains=op.code)[:15] if request.user.can("audit.view") else [],
        "tab": request.GET.get("tab", "resumen"),
    }
    return render(request, "core/operation_detail.html", ctx)


@require("operations.view")
def operation_edit_info(request, pk):
    op = _get_op(request, pk)
    if not (request.user.can("operations.edit") or request.user.can("operations.create")):
        raise PermissionDenied
    before = snapshot(op)
    form = OperationInfoForm(request.POST or None, instance=op)
    if request.method == "POST" and form.is_valid():
        form.save()
        log_changes("Operaciones", op, before)
        messages.success(request, "Datos actualizados.")
        return redirect(op)
    return render(request, "core/form_page.html", {"form": form, "title": f"Editar datos de {op.code}", "back": op.get_absolute_url()})


@require("operations.edit")
def operation_edit_terms(request, pk):
    op = _get_op(request, pk)
    if op.has_payments() or op.penalties.exists():
        messages.error(request, "La operación ya tiene pagos o penalidades: sus condiciones históricas no se modifican. Use Reestructurar.")
        return redirect(op)
    before = snapshot(op)
    form = TermsEditForm(request.POST or None, instance=op)
    preview = None
    if request.method == "POST" and form.is_valid():
        obj = form.save(commit=False)
        try:
            preview = _preview(obj)
        except TermsError as e:
            form.add_error(None, str(e))
        if preview and request.POST.get("action") == "confirm":
            try:
                update_operation_terms(obj, before, request.user, form.cleaned_data["reason"])
            except BusinessError as e:
                form.add_error(None, str(e))
            else:
                messages.success(request, "Condiciones actualizadas. Se generó una nueva versión del cronograma y se conservó la anterior.")
                return redirect(obj)
    return render(request, "core/operation_form.html", {
        "form": form, "preview": preview, "title": f"Modificar condiciones de {op.code}", "op": op,
        "confirm_label": "Confirmar cambio de condiciones", "profiles": {}, "groups": OPERATION_GROUPS})


@require("operations.edit")
def operation_restructure(request, pk):
    op = _get_op(request, pk)
    if op.is_closed:
        messages.error(request, "La operación ya está cerrada.")
        return redirect(op)
    s = operation_summary(op)
    new = Operation(principal=s["capital_pending"])
    initial = {f: getattr(op, f) for f in RestructureForm.Meta.fields if f not in ("disbursement_date", "start_date")}
    initial.update({"disbursement_date": today(), "start_date": today(), "advisor": op.advisor_id})
    form = RestructureForm(request.POST or None, instance=new, initial=initial)
    preview = None
    if request.method == "POST" and form.is_valid():
        new = form.save(commit=False)
        principal = s["capital_pending"]
        if form.cleaned_data.get("capitalize_arrears"):
            principal += s["interest_pending"] + s["penalty_pending"]
        new.principal = principal
        new.investor, new.client = op.investor, op.client
        try:
            preview = _preview(new)
        except TermsError as e:
            form.add_error(None, str(e))
        if preview and request.POST.get("action") == "confirm":
            try:
                with transaction.atomic():
                    created = restructure_operation(op, new, request.user, form.cleaned_data["reason"],
                                                    form.cleaned_data.get("capitalize_arrears"))
            except BusinessError as e:
                form.add_error(None, str(e))
            else:
                messages.success(request, f"{op.code} quedó REESTRUCTURADA. Nueva operación: {created.code}.")
                return redirect(created)
    return render(request, "core/operation_form.html", {
        "form": form, "preview": preview, "title": f"Reestructurar {op.code}", "op": op, "summary": s,
        "confirm_label": "Confirmar reestructuración", "profiles": {}, "groups": OPERATION_GROUPS})


@require("operations.status")
def operation_close(request, pk):
    op = _get_op(request, pk)
    form = ReasonForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        close_operation(op, request.user, form.cleaned_data["reason"])
        messages.success(request, f"{op.code} marcada como CANCELADA.")
        return redirect(op)
    return render(request, "core/confirm_page.html", {
        "form": form, "title": f"Cerrar {op.code} manualmente",
        "text": "Use esta opción solo para cierres excepcionales (ejecución de garantía, castigo, acuerdo). "
                "Los pagos y penalidades se conservan. Queda registrado en auditoría.",
        "back": op.get_absolute_url(), "button": "Marcar como cancelada", "danger": True})


@require("operations.status")
def operation_reopen(request, pk):
    op = _get_op(request, pk)
    form = ReasonForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        try:
            reopen_operation(op, request.user, form.cleaned_data["reason"])
        except BusinessError as e:
            messages.error(request, str(e))
        else:
            messages.success(request, f"{op.code} reabierta.")
        return redirect(op)
    return render(request, "core/confirm_page.html", {
        "form": form, "title": f"Reabrir {op.code}", "text": "El estado se recalculará con el cronograma y los pagos.",
        "back": op.get_absolute_url(), "button": "Reabrir operación"})


# ------------------------------------------------------------------------------- garantía
@require("guarantees.edit")
def guarantee_form(request, pk, mortgage_id=None):
    op = _get_op(request, pk)
    mortgage = get_object_or_404(Mortgage, pk=mortgage_id, operation=op) if mortgage_id else None
    prop = mortgage.property if mortgage else None
    before_p = snapshot(prop) if prop else None
    before_m = snapshot(mortgage) if mortgage else None
    pform = PropertyForm(request.POST or None, instance=prop, prefix="p")
    mform = MortgageForm(request.POST or None, instance=mortgage, prefix="m",
                         initial=None if mortgage else {"secured_amount": op.principal})
    if request.method == "POST" and pform.is_valid() and mform.is_valid():
        with transaction.atomic():
            p = pform.save(commit=False)
            m = mform.save(commit=False)
            if prop:
                p.save()
                log_changes("Garantías", p, before_p)
                m.save()
                log_changes("Garantías", m, before_m)
            else:
                p.created_by = request.user
                p.save()
                m.operation, m.property, m.created_by = op, p, request.user
                m.save()
                log("CREATE", "Garantías", m, None, {**snapshot(p), **snapshot(m)}, detail=op.code)
        l = ltv(op)
        if l["exceeds"]:
            messages.warning(request, f"Atención: el LTV ({l['ltv']}%) supera el límite configurado de {l['limit']}%.")
        messages.success(request, "Garantía guardada.")
        return redirect(f"{op.get_absolute_url()}?tab=garantia")
    return render(request, "core/guarantee_form.html", {"op": op, "pform": pform, "mform": mform, "mortgage": mortgage})


# ------------------------------------------------------------------------------- estado de cuenta
@require("reports.view")
def statement(request, pk):
    op = _get_op(request, pk)
    if not op.closed_manually:
        refresh_operation(op)
    rows = list(op.current_schedule())
    ctx = {
        "op": op, "rows": rows, "s": operation_summary(op, rows=rows), "ltv": ltv(op),
        "mortgages": op.mortgages.select_related("property"),
        "payments": op.payments.order_by("payment_date", "id"),
        "penalties": op.penalties.select_related("installment"), "as_of": today(),
    }
    fmt = request.GET.get("formato")
    if fmt in ("pdf", "xlsx"):
        if not request.user.can("reports.export"):
            raise PermissionDenied
        log("EXPORT", "Estado de cuenta", op, detail=f"Formato {fmt}")
        return exports.statement_pdf(ctx) if fmt == "pdf" else exports.statement_xlsx(ctx)
    return render(request, "core/statement.html", ctx)


@require("operations.view")
def api_operation(request, pk):
    """Datos mínimos para el formulario de pagos."""
    from ..services.portfolio import payoff_amount
    import datetime
    op = _get_op(request, pk)
    try:
        d = datetime.date.fromisoformat(request.GET.get("fecha", ""))
    except ValueError:
        d = today()
    p = payoff_amount(op, d)
    rows = [r for r in op.current_schedule() if r.status != "PAGADO"][:3]
    return JsonResponse({
        "code": op.code, "client": str(op.client), "currency": op.currency, "status": op.get_status_display(),
        "payoff": {k: str(v) for k, v in p.items()}, "date": d.isoformat(),
        "next": [{"n": r.number, "due": r.due_date.isoformat(), "balance": str(r.balance)} for r in rows],
        "url": reverse("core:operation_detail", args=[op.pk]),
    })
