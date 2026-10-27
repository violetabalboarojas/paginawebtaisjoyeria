from django.core.paginator import Paginator
from django.db.models import Q
from django.shortcuts import render

from accounts.permissions import require

from .models import AuditLog
from .services import log


@require("audit.view")
def audit_list(request):
    qs = AuditLog.objects.all()
    g = request.GET
    if g.get("usuario"):
        qs = qs.filter(username__icontains=g["usuario"])
    if g.get("accion"):
        qs = qs.filter(action=g["accion"])
    if g.get("modulo"):
        qs = qs.filter(module=g["modulo"])
    if g.get("desde"):
        qs = qs.filter(created_at__date__gte=g["desde"])
    if g.get("hasta"):
        qs = qs.filter(created_at__date__lte=g["hasta"])
    if g.get("q"):
        q = g["q"]
        qs = qs.filter(Q(record_label__icontains=q) | Q(detail__icontains=q) | Q(record_id=q))
    if g.get("formato") == "xlsx" and request.user.can("reports.export"):
        from core.services.exports import audit_xlsx
        log("EXPORT", "Auditoría", record_label="Bitácora", detail=g.urlencode())
        return audit_xlsx(qs[:20000])
    modules = AuditLog.objects.values_list("module", flat=True).distinct().order_by("module")
    page = Paginator(qs, 50).get_page(g.get("page"))
    return render(request, "audit/list.html", {"page": page, "actions": AuditLog.ACTIONS, "modules": modules})
