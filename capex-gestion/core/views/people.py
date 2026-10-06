from django.contrib import messages
from django.core.exceptions import PermissionDenied
from django.db.models import Count, Q, Sum
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse

from accounts.permissions import require
from audit.services import log_changes, snapshot

from ..forms import ClientForm, InvestorForm
from ..models import Client, Investor, OpStatus
from ..services.analytics import CLOSED
from ..services.portfolio import create_client, create_investor
from .common import check_client_access, paginate, scoped_clients, scoped_operations


# ------------------------------------------------------------------------------- bonistas
@require("investors.view")
def investor_list(request):
    qs = Investor.objects.annotate(
        n_ops=Count("operations", distinct=True),
        n_active=Count("operations", filter=~Q(operations__status__in=CLOSED), distinct=True),
    )
    q = request.GET.get("q", "").strip()
    if q:
        qs = qs.filter(Q(first_name__icontains=q) | Q(last_name__icontains=q) | Q(doc_number__icontains=q) | Q(code__icontains=q))
    if request.GET.get("estado"):
        qs = qs.filter(status=request.GET["estado"])
    return render(request, "core/investor_list.html", {"page": paginate(request, qs), "q": q})


@require("investors.view")
def investor_detail(request, pk):
    inv = get_object_or_404(Investor, pk=pk)
    ops = inv.operations.select_related("client").order_by("-start_date")
    totals = {}
    for cur in ("PEN", "USD"):
        sub = ops.filter(currency=cur)
        if sub.exists():
            totals[cur] = {
                "placed": sub.filter(restructured_from__isnull=True).aggregate(s=Sum("principal"))["s"] or 0,
                "pending": sub.exclude(status__in=CLOSED).aggregate(s=Sum("capital_pending"))["s"] or 0,
            }
    docs = inv.documents.filter(is_void=False)
    return render(request, "core/investor_detail.html", {"inv": inv, "ops": ops, "totals": totals, "docs": docs})


@require("investors.edit")
def investor_form(request, pk=None):
    inv = get_object_or_404(Investor, pk=pk) if pk else None
    before = snapshot(inv) if inv else None
    form = InvestorForm(request.POST or None, instance=inv)
    if request.method == "POST" and form.is_valid():
        obj = form.save(commit=False)
        if inv:
            obj.save()
            log_changes("Bonistas", obj, before)
            messages.success(request, "Bonista actualizado.")
        else:
            create_investor(obj, request.user)
            messages.success(request, f"Bonista {obj.code} registrado.")
        return redirect(obj)
    return render(request, "core/form_page.html", {
        "form": form, "title": f"Editar {inv}" if inv else "Nuevo bonista",
        "back": inv.get_absolute_url() if inv else reverse("core:investor_list"), "section": "investors"})


# ------------------------------------------------------------------------------- clientes
@require("clients.view")
def client_list(request):
    qs = scoped_clients(request.user).select_related("advisor").annotate(
        n_ops=Count("operations", distinct=True),
        n_late=Count("operations", filter=Q(operations__status__in=[OpStatus.VENCIDA, OpStatus.EN_MORA]), distinct=True),
    )
    q = request.GET.get("q", "").strip()
    if q:
        qs = qs.filter(Q(full_name__icontains=q) | Q(doc_number__icontains=q) | Q(code__icontains=q) | Q(phone__icontains=q))
    if request.GET.get("estado"):
        qs = qs.filter(status=request.GET["estado"])
    return render(request, "core/client_list.html", {"page": paginate(request, qs), "q": q})


@require("clients.view")
def client_detail(request, pk):
    client = get_object_or_404(Client, pk=pk)
    check_client_access(request.user, client)
    ops = scoped_operations(request.user, client.operations.select_related("investor")).order_by("-start_date")
    docs = client.documents.filter(is_void=False)
    payments = client.payments.select_related("operation")[:20] if request.user.can("payments.view") else []
    return render(request, "core/client_detail.html", {"c": client, "ops": ops, "docs": docs, "payments": payments})


@require("clients.edit")
def client_form(request, pk=None):
    client = get_object_or_404(Client, pk=pk) if pk else None
    if client:
        check_client_access(request.user, client)
    before = snapshot(client) if client else None
    form = ClientForm(request.POST or None, instance=client, user=request.user)
    if request.method == "POST" and form.is_valid():
        obj = form.save(commit=False)
        if not request.user.can("operations.all") and obj.advisor_id not in (None, request.user.id):
            raise PermissionDenied
        if client:
            obj.save()
            log_changes("Clientes", obj, before)
            messages.success(request, "Cliente actualizado.")
        else:
            create_client(obj, request.user)
            messages.success(request, f"Cliente {obj.code} registrado.")
        return redirect(obj)
    return render(request, "core/form_page.html", {
        "form": form, "title": f"Editar {client}" if client else "Nuevo cliente / prestatario",
        "back": client.get_absolute_url() if client else reverse("core:client_list"), "section": "clients"})
