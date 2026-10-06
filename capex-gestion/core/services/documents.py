import os

from django.conf import settings
from django.utils import timezone

from audit.services import log

from ..models import Document
from .portfolio import BusinessError

ALLOWED_EXTENSIONS = {"pdf", "jpg", "jpeg", "png", "webp", "doc", "docx", "xls", "xlsx", "txt"}


def validate_upload(f):
    ext = os.path.splitext(f.name)[1].lower().lstrip(".")
    if ext not in ALLOWED_EXTENSIONS:
        raise BusinessError(f"Formato .{ext} no permitido. Use: {', '.join(sorted(ALLOWED_EXTENSIONS))}.")
    if f.size > settings.DOCUMENT_MAX_MB * 1024 * 1024:
        raise BusinessError(f"El archivo supera el máximo de {settings.DOCUMENT_MAX_MB} MB.")


def store_document(f, doc_type, user, title="", **links):
    validate_upload(f)
    doc = Document(doc_type=doc_type, title=title, original_name=os.path.basename(f.name)[:255], size=f.size,
                   uploaded_by=user, uploaded_at=timezone.now(), **links)
    doc.file.save(f.name, f, save=False)
    doc.save()
    target = links.get("operation") or links.get("client") or links.get("investor") or links.get("trust")
    log("UPLOAD", "Documentos", doc, None,
        {"tipo": doc.doc_type, "archivo": doc.original_name, "vinculado_a": str(target) if target else ""})
    return doc


def void_document(doc, user, reason):
    if doc.is_void:
        raise BusinessError("El documento ya está anulado.")
    if not reason.strip():
        raise BusinessError("Indique el motivo.")
    doc.is_void = True
    doc.void_reason = reason[:250]
    doc.save(update_fields=["is_void", "void_reason"])
    log("VOID", "Documentos", doc, {"is_void": False}, {"is_void": True}, detail=reason)
