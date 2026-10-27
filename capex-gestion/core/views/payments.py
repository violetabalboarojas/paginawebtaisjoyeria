from django.contrib import messages
from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.db.models import Q
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_POST

from accounts.permissions import require

from ..forms import PaymentForm, PenaltyWaiveForm, ReasonForm
from ..models import CURRENCIES, Payment, PaymentAllocation, Penalty
from ..services.portfolio import BusinessError, register_payment, void_payment, waive_penalty
from ..services.documents import validate_upload
from .common import check_operation_access, paginate, scoped_operations


@require("payments.view")
def payment_list(request):
    qs = Payment.objects.filter(operation__in=scoped_operations(request.user)).select_related("operation", "client", "registered_by")
    q = request.GET.get("q", "").strip()
    if q:
        qs = qs.filter(Q(code__icontains=q) | Q(operation__code__icontains=q) | Q(client__full_name__icontains=q) |
                       Q(bank_reference__icontains=q) | Q(client__doc_number__icontains=q))
    if request.GET.get("estado"):
        qs = qs.filter(status=request.GET["estado"])
    if request.GET.get("moneda"):
        qs = qs.filter(currency=request.GET["moneda"])
    if request.GET.get("desde"):
        qs = qs.filter(payment_date__gte=request.GET["desde"])
    if request.GET.get("hasta"):
        qs = qs.filter(payment_date__lte=request.GET["hasta"])
    return render(request, "core/payment_list.html", {"page": paginate(request, qs), "q": q, "currencies": CURRENCIES})


@require("payments.create")
def payment_create(request):
    ops = scoped_operations(request.user)
    initial = {}
    op_id = request.GET.get("operacion")
    if op_id:
        op = ops.filter(pk=op_id).first()
        if op:
            initial = {"operation": op.pk, "currency": op.currency}
    form = PaymentForm(request.POST or None, request.FILES or None, operations=ops, initial=initial)
    if request.method == "POST" and form.is_valid():
        payment = form.save(commit=False)
        check_operation_access(request.user, payment.operation)
        receipt = form.cleaned_data.get("receipt")
        try:
            if receipt:
                validate_upload(receipt)
            register_payment(payment, request.user, document_file=receipt)
        except BusinessError as e:
            form.add_error(None, str(e))
        else:
            messages.success(request, f"Pago {payment.code} registrado por {payment.amount} {payment.currency}. "
                                      "Se actualizaron cronograma, intereses, penalidades y saldos.")
            return redirect(payment.operation)
    return render(request, "core/payment_form.html", {"form": form})


@require_POST
@require("payments.create")
def payment_simulate(request):
    """Ejecuta la imputación dentro de una transacción que se revierte: no guarda nada."""
    form = PaymentForm(request.POST, operations=scoped_operations(request.user))
    if not form.is_valid():
        return JsonResponse({"ok": False, "errors": {k: [str(e) for e in v] for k, v in form.errors.items()}}, status=400)
    payment = form.save(commit=False)
    result = {"ok": True}
    try:
        with transaction.atomic():
            register_payment(payment, request.user)
            allocs = PaymentAllocation.objects.filter(payment=payment).select_related("installment").order_by("installment__number", "id")
            result["allocations"] = [{"n": a.installment.number, "due": a.installment.due_date.strftime("%d/%m/%Y"),
                                      "component": a.get_component_display(), "amount": str(a.amount)} for a in allocs]
            op = payment.operation
            op.refresh_from_db()
            result["after"] = {"status": op.get_status_display(), "capital_pending": str(op.capital_pending)}
            result["penalties"] = [{"n": p.installment.number, "formula": p.formula, "amount": str(p.calculated_amount)}
                                   for p in op.penalties.select_related("installment") if p.formula]
            transaction.set_rollback(True)
    except BusinessError as e:
        return JsonResponse({"ok": False, "errors": {"__all__": [str(e)]}}, status=400)
    return JsonResponse(result)


@require("payments.view")
def payment_detail(request, pk):
    p = get_object_or_404(Payment.objects.select_related("operation", "client", "registered_by", "voided_by"), pk=pk)
    check_operation_access(request.user, p.operation)
    allocs = p.allocations.select_related("installment").order_by("installment__number", "id")
    return render(request, "core/payment_detail.html", {"p": p, "allocs": allocs, "docs": p.documents.all()})


@require("payments.void")
def payment_void(request, pk):
    p = get_object_or_404(Payment, pk=pk)
    check_operation_access(request.user, p.operation)
    form = ReasonForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        try:
            void_payment(p, request.user, form.cleaned_data["reason"])
        except BusinessError as e:
            messages.error(request, str(e))
        else:
            messages.success(request, f"Pago {p.code} anulado. El registro original se conserva para auditoría.")
        return redirect(p.operation)
    return render(request, "core/confirm_page.html", {
        "form": form, "title": f"Anular pago {p.code}",
        "text": f"Monto {p.amount} {p.currency} del {p.payment_date:%d/%m/%Y}. El pago no se elimina: queda marcado como ANULADO "
                "y se recalculan cronograma, penalidades y saldos.",
        "back": p.operation.get_absolute_url(), "button": "Anular pago", "danger": True})


@require("penalties.view")
def penalty_list(request):
    qs = Penalty.objects.filter(operation__in=scoped_operations(request.user)).select_related("operation", "operation__client", "installment")
    if request.GET.get("estado"):
        qs = qs.filter(status=request.GET["estado"])
    else:
        qs = qs.exclude(status="SIN_EFECTO")
    q = request.GET.get("q", "").strip()
    if q:
        qs = qs.filter(Q(operation__code__icontains=q) | Q(operation__client__full_name__icontains=q))
    return render(request, "core/penalty_list.html", {"page": paginate(request, qs), "q": q})


@require("penalties.manage")
def penalty_waive(request, pk):
    pen = get_object_or_404(Penalty.objects.select_related("operation"), pk=pk)
    check_operation_access(request.user, pen.operation)
    if pen.operation.is_closed:
        raise PermissionDenied
    form = PenaltyWaiveForm(request.POST or None, initial={"amount": pen.waived_amount})
    if request.method == "POST" and form.is_valid():
        try:
            waive_penalty(pen, form.cleaned_data["amount"], request.user, form.cleaned_data["reason"])
        except BusinessError as e:
            form.add_error(None, str(e))
        else:
            messages.success(request, "Condonación registrada en auditoría.")
            return redirect(f"{pen.operation.get_absolute_url()}?tab=penalidades")
    return render(request, "core/confirm_page.html", {
        "form": form, "title": f"Condonar penalidad · {pen.operation.code} cuota {pen.installment.number}",
        "text": f"Penalidad calculada {pen.calculated_amount}, pagada {pen.paid_amount}, condonada {pen.waived_amount}. "
                "La penalidad original no se borra; se registra el monto condonado.",
        "back": pen.operation.get_absolute_url(), "button": "Registrar condonación"})
