from .models import SystemSettings

SECTIONS = {
    "": "dashboard", "alertas": "alerts", "inversionistas": "investors", "clientes": "clients", "operaciones": "operations",
    "pagos": "payments", "penalidades": "penalties", "fideicomisos": "trusts", "documentos": "documents",
    "reportes": "reports", "configuracion": "settings", "auditoria": "audit", "cuenta": "users", "buscar": "search",
}


def app_context(request):
    ctx = {"company": None, "nav": SECTIONS.get(request.path.strip("/").split("/")[0], "")}
    if request.path.startswith("/cuenta/roles"):
        ctx["nav"] = "roles"
    try:
        ctx["company"] = SystemSettings.load()
    except Exception:  # base aún sin migrar
        pass
    return ctx
