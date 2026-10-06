from django.core.exceptions import PermissionDenied
from django.shortcuts import render

from accounts.permissions import require
from audit.services import log

from ..forms import ReportFilterForm
from ..services import exports
from ..services.reports import build
from ..services.portfolio import refresh_portfolio
from .common import scoped_clients, scoped_operations


@require("reports.view")
def reports(request):
    form = ReportFilterForm(request.GET or None, clients=scoped_clients(request.user))
    report = None
    if form.is_bound and form.is_valid():
        refresh_portfolio()
        f = form.cleaned_data
        report = build(f["report"], scoped_operations(request.user), f)
        parts = []
        for key in ("start", "end", "client", "investor", "status", "currency", "advisor"):
            v = f.get(key)
            if v:
                parts.append(f"{form.fields[key].label}: {v.strftime('%d/%m/%Y') if hasattr(v, 'strftime') else v}")
        filters_text = " · ".join(parts) or "Sin filtros"
        fmt = request.GET.get("formato")
        if fmt in ("xlsx", "pdf"):
            if not request.user.can("reports.export"):
                raise PermissionDenied
            log("EXPORT", "Reportes", record_label=report.title, detail=f"{fmt} · {filters_text}")
            return exports.report_xlsx(report, filters_text) if fmt == "xlsx" else exports.report_pdf(report, filters_text)
    return render(request, "core/reports.html", {"form": form, "report": report})
