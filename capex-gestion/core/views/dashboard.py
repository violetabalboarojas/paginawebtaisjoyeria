import datetime

from django.db.models import Q
from django.shortcuts import render

from accounts.permissions import require

from ..models import CURRENCIES, Client, Investor, InstStatus, Operation, PaymentSchedule, Property, SystemSettings, Trust
from ..services.analytics import CLOSED, compute_alerts, kpis, monthly_series
from ..services.portfolio import refresh_portfolio, today
from .common import scoped_clients, scoped_operations


@require("dashboard.view")
def dashboard(request):
    cfg = SystemSettings.load()
    refresh_portfolio()  # una vez al día como máximo
    currency = request.GET.get("moneda") or cfg.default_currency
    if currency not in dict(CURRENCIES):
        currency = cfg.default_currency
    ops = scoped_operations(request.user).filter(currency=currency)
    k, counts, upcoming = kpis(ops, cfg=cfg)
    series = monthly_series(ops)
    alerts = compute_alerts(scoped_operations(request.user), cfg=cfg)
    as_of = today()
    horizon = as_of + datetime.timedelta(days=max(cfg.alert_days, 15))
    next_rows = [r for r in PaymentSchedule.objects.filter(
        operation__in=ops.exclude(status__in=CLOSED), due_date__lte=horizon).exclude(status=InstStatus.PAGADO)
        .select_related("operation", "operation__client").order_by("due_date")[:40]
        if r.version == r.operation.schedule_version][:12]
    currencies_in_use = set(scoped_operations(request.user).values_list("currency", flat=True))
    return render(request, "core/dashboard.html", {
        "k": k, "counts": counts, "upcoming": upcoming, "series": series, "alerts": alerts[:12],
        "alerts_total": len(alerts), "alerts_red": sum(1 for a in alerts if a["level"] == "red"),
        "currency": currency, "currencies": CURRENCIES, "currencies_in_use": currencies_in_use,
        "next_rows": next_rows, "as_of": as_of, "cfg": cfg,
    })


@require("dashboard.view")
def alerts(request):
    items = compute_alerts(scoped_operations(request.user))
    kind = request.GET.get("tipo")
    kinds = sorted({a["kind"] for a in items})
    if kind:
        items = [a for a in items if a["kind"] == kind]
    return render(request, "core/alerts.html", {"alerts": items, "kinds": kinds, "kind": kind})


def search(request):
    q = (request.GET.get("q") or "").strip()
    user = request.user
    results = {"investors": [], "clients": [], "operations": [], "properties": [], "trusts": []}
    if len(q) >= 2:
        if user.can("investors.view"):
            results["investors"] = Investor.objects.filter(
                Q(first_name__icontains=q) | Q(last_name__icontains=q) | Q(doc_number__icontains=q) |
                Q(phone__icontains=q) | Q(whatsapp__icontains=q) | Q(code__icontains=q) | Q(email__icontains=q))[:20]
        if user.can("clients.view"):
            results["clients"] = scoped_clients(user).filter(
                Q(full_name__icontains=q) | Q(doc_number__icontains=q) | Q(phone__icontains=q) |
                Q(whatsapp__icontains=q) | Q(code__icontains=q) | Q(email__icontains=q))[:20]
        if user.can("operations.view"):
            ops = scoped_operations(user).select_related("client", "investor")
            results["operations"] = ops.filter(
                Q(code__icontains=q) | Q(client__full_name__icontains=q) | Q(client__doc_number__icontains=q) |
                Q(investor__first_name__icontains=q) | Q(investor__last_name__icontains=q) |
                Q(investor__doc_number__icontains=q) | Q(client__phone__icontains=q) |
                Q(mortgages__property__registry_number__icontains=q)).distinct()[:30]
            visible = scoped_operations(user)
            results["properties"] = (Property.objects.filter(
                Q(registry_number__icontains=q) | Q(owner_name__icontains=q) | Q(owner_doc__icontains=q) | Q(address__icontains=q))
                .filter(mortgages__operation__in=visible).prefetch_related("mortgages__operation").distinct()[:20])
        if user.can("trusts.view"):
            results["trusts"] = Trust.objects.filter(
                Q(code__icontains=q) | Q(fiduciary_entity__icontains=q) | Q(settlor__icontains=q) | Q(beneficiary__icontains=q))[:20]
    total = sum(len(v) for v in results.values())
    return render(request, "core/search.html", {"q": q, "r": results, "total": total})
