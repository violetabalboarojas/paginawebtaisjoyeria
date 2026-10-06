import os

from django.contrib import messages
from django.shortcuts import get_object_or_404, redirect, render

from accounts.permissions import require
from audit.services import log

from ..models import Client, ImportBatch, Investor, Operation
from ..services.importer import build_preview, confirm_import, file_hash, parse_workbook
from ..services.portfolio import BusinessError, create_client

MAX_MB = 10


@require("imports.run")
def import_list(request):
    if request.method == "POST":
        f = request.FILES.get("file")
        if not f:
            messages.error(request, "Seleccione un archivo Excel.")
        elif os.path.splitext(f.name)[1].lower() not in (".xlsx", ".xlsm"):
            messages.error(request, "El archivo debe ser Excel (.xlsx o .xlsm).")
        elif f.size > MAX_MB * 1024 * 1024:
            messages.error(request, f"El archivo supera {MAX_MB} MB.")
        else:
            digest = file_hash(f)
            previous = ImportBatch.objects.filter(sha256=digest, status="CONFIRMED").first()
            batch = ImportBatch(original_name=os.path.basename(f.name)[:255], sha256=digest, uploaded_by=request.user)
            batch.file.save(f.name, f, save=False)
            try:
                batch.parsed = parse_workbook(batch.file.path)
            except Exception as e:  # noqa: BLE001  (archivo dañado o con otra estructura)
                messages.error(request, f"No se pudo leer el archivo: {e}. Verifique que tenga la estructura del cronograma.")
                batch.file.delete(save=False)
                return redirect("core:import_list")
            batch.save()
            log("UPLOAD", "Importación", batch, detail=f"{batch.original_name} · {len(batch.parsed.get('schedules', []))} hoja(s) de cronograma")
            if previous:
                messages.warning(request, f"Este mismo archivo ya se importó el {previous.confirmed_at:%d/%m/%Y %H:%M} "
                                          f"(lote {previous.pk}). Las series existentes no se duplicarán.")
            return redirect("core:import_preview", pk=batch.pk)
    batches = ImportBatch.objects.select_related("uploaded_by", "confirmed_by")[:50]
    return render(request, "core/import_list.html", {"batches": batches, "max_mb": MAX_MB})


@require("imports.run")
def import_preview(request, pk):
    batch = get_object_or_404(ImportBatch, pk=pk)
    sheet = request.POST.get("sheet") or request.GET.get("hoja") or batch.result.get("sheet") or batch.parsed.get("recommended_sheet")
    preview = build_preview(batch.parsed, sheet)
    if request.method == "POST" and batch.status == "PREVIEW":
        if request.POST.get("action") == "discard":
            batch.status = "DISCARDED"
            batch.save(update_fields=["status"])
            log("VOID", "Importación", batch, detail="Importación descartada en la revisión")
            messages.info(request, "Importación descartada. No se registró ningún dato.")
            return redirect("core:import_list")
        try:
            client = _resolve_client(request)
            fallback = {}
            for s in preview["series"]:
                if not s["holders"] and not s.get("existing_id"):
                    inv_id = request.POST.get(f"investor_{s['label']}")
                    fallback[s["label"]] = Investor.objects.filter(pk=inv_id).first() if inv_id else None
            result = confirm_import(batch, request.user, sheet, client, fallback, update_rates=request.POST.get("update_rates") == "1")
        except BusinessError as e:
            messages.error(request, str(e))
        else:
            parts = []
            if result["created"]:
                parts.append(f"operaciones creadas: {', '.join(result['created'])}")
            if result["updated"]:
                parts.append(f"operaciones actualizadas: {', '.join(result['updated'])}")
            parts.append(f"{result['payments']} pago(s) registrados")
            messages.success(request, "Importación completada: " + "; ".join(parts) + ".")
            return redirect("core:import_preview", pk=batch.pk)
    ops = Operation.objects.filter(code__in=(batch.result or {}).get("created", []) + (batch.result or {}).get("updated", []))
    return render(request, "core/import_preview.html", {
        "batch": batch, "p": preview, "clients": Client.objects.exclude(status="INACTIVO").order_by("full_name"),
        "investors": Investor.objects.filter(status="ACTIVO"), "result_ops": ops,
        "errors": [i for i in preview["issues"] if i["level"] == "error"],
        "review": [i for i in preview["issues"] if i["level"] in ("review", "warning")],
        "infos": [i for i in preview["issues"] if i["level"] == "info"],
    })


def _resolve_client(request):
    if request.POST.get("client_mode") == "new":
        name = (request.POST.get("client_name") or "").strip()
        doc = (request.POST.get("client_doc") or "").strip()
        doc_type = request.POST.get("client_doc_type") or "RUC"
        if not name or not doc:
            raise BusinessError("Indique nombre y número de documento del nuevo cliente.")
        existing = Client.objects.filter(doc_number=doc).first()
        if existing:
            return existing
        return create_client(Client(full_name=name, doc_type=doc_type, doc_number=doc,
                                    notes="Registrado durante la importación de un cronograma Excel."), request.user)
    cid = request.POST.get("client_id")
    return Client.objects.filter(pk=cid).first() if cid else None
