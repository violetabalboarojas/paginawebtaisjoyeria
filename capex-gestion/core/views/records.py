"""Fideicomisos, documentos y configuración."""

from django.contrib import messages
from django.core.exceptions import PermissionDenied
from django.db.models import Q
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse

from accounts.permissions import require
from audit.services import log, log_changes, snapshot

from ..forms import DocumentForm, FinancialProfileForm, ReasonForm, SettingsForm, TrustForm
from ..models import DOCUMENT_TYPES, Client, Document, FinancialProfile, Investor, Operation, SystemSettings, Trust
from ..services.documents import store_document, void_document
from ..services.portfolio import BusinessError
from .common import check_client_access, check_operation_access, paginate, scoped_operations


# ------------------------------------------------------------------------------- fideicomisos
@require("trusts.view")
def trust_list(request):
    qs = Trust.objects.prefetch_related("operations")
    q = request.GET.get("q", "").strip()
    if q:
        qs = qs.filter(Q(code__icontains=q) | Q(fiduciary_entity__icontains=q) | Q(settlor__icontains=q) | Q(beneficiary__icontains=q))
    if request.GET.get("estado"):
        qs = qs.filter(status=request.GET["estado"])
    return render(request, "core/trust_list.html", {"page": paginate(request, qs), "q": q, "statuses": Trust.STATUS})


@require("trusts.view")
def trust_detail(request, pk):
    t = get_object_or_404(Trust, pk=pk)
    ops = scoped_operations(request.user, t.operations.select_related("client", "investor"))
    return render(request, "core/trust_detail.html", {"t": t, "ops": ops, "docs": t.documents.filter(is_void=False)})


@require("trusts.edit")
def trust_form(request, pk=None):
    t = get_object_or_404(Trust, pk=pk) if pk else None
    before = snapshot(t) if t else None
    before_ops = sorted(t.operations.values_list("code", flat=True)) if t else []
    initial = {}
    if not t and request.GET.get("operacion"):
        initial["operations"] = [request.GET["operacion"]]
    form = TrustForm(request.POST or None, instance=t, initial=initial)
    if request.method == "POST" and form.is_valid():
        obj = form.save(commit=False)
        if not t:
            obj.created_by = request.user
        obj.save()
        form.save_m2m()
        after_ops = sorted(obj.operations.values_list("code", flat=True))
        if t:
            log_changes("Fideicomisos", obj, before)
            if before_ops != after_ops:
                log("UPDATE", "Fideicomisos", obj, {"operaciones": before_ops}, {"operaciones": after_ops})
        else:
            log("CREATE", "Fideicomisos", obj, None, {**snapshot(obj), "operaciones": after_ops})
        messages.success(request, "Fideicomiso guardado.")
        return redirect(obj)
    return render(request, "core/form_page.html", {
        "form": form, "title": f"Editar fideicomiso {t.code}" if t else "Nuevo fideicomiso",
        "back": t.get_absolute_url() if t else reverse("core:trust_list")})


# ------------------------------------------------------------------------------- documentos
def _target(request):
    """Resuelve a qué registro se adjunta el documento y valida el acceso."""
    user = request.user
    g = request.GET
    if g.get("operacion"):
        op = get_object_or_404(Operation, pk=g["operacion"])
        check_operation_access(user, op)
        return {"operation": op, "client": op.client}, op.get_absolute_url() + "?tab=documentos", str(op)
    if g.get("cliente"):
        c = get_object_or_404(Client, pk=g["cliente"])
        check_client_access(user, c)
        return {"client": c}, c.get_absolute_url(), str(c)
    if g.get("inversionista"):
        if not user.can("investors.view"):
            raise PermissionDenied
        i = get_object_or_404(Investor, pk=g["inversionista"])
        return {"investor": i}, i.get_absolute_url(), str(i)
    if g.get("fideicomiso"):
        if not user.can("trusts.view"):
            raise PermissionDenied
        t = get_object_or_404(Trust, pk=g["fideicomiso"])
        return {"trust": t}, t.get_absolute_url(), str(t)
    raise Http404


@require("documents.upload")
def document_upload(request):
    links, back, label = _target(request)
    form = DocumentForm(request.POST or None, request.FILES or None)
    if request.method == "POST" and form.is_valid():
        try:
            store_document(form.cleaned_data["file"], form.cleaned_data["doc_type"], request.user,
                           title=form.cleaned_data["title"], **links)
        except BusinessError as e:
            form.add_error("file", str(e))
        else:
            messages.success(request, "Documento cargado al expediente.")
            return redirect(back)
    return render(request, "core/form_page.html", {"form": form, "title": f"Cargar documento · {label}", "back": back,
                                                   "multipart": True, "submit": "Cargar documento"})


def _doc_access(user, doc):
    if not user.can("documents.view"):
        raise PermissionDenied
    if doc.operation_id:
        check_operation_access(user, doc.operation)
    elif doc.client_id:
        check_client_access(user, doc.client)
    elif doc.investor_id and not user.can("investors.view"):
        raise PermissionDenied
    elif doc.trust_id and not user.can("trusts.view"):
        raise PermissionDenied


@require("documents.view")
def document_download(request, pk):
    doc = get_object_or_404(Document, pk=pk)
    _doc_access(request.user, doc)
    log("DOWNLOAD", "Documentos", doc)
    return FileResponse(doc.file.open("rb"), as_attachment=request.GET.get("ver") != "1", filename=doc.original_name)


@require("documents.void")
def document_void(request, pk):
    doc = get_object_or_404(Document, pk=pk)
    _doc_access(request.user, doc)
    form = ReasonForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        try:
            void_document(doc, request.user, form.cleaned_data["reason"])
        except BusinessError as e:
            messages.error(request, str(e))
        else:
            messages.success(request, "Documento anulado. El archivo se conserva para auditoría.")
        return redirect("core:document_list")
    return render(request, "core/confirm_page.html", {
        "form": form, "title": f"Anular documento {doc.original_name}",
        "text": "El archivo no se borra: deja de mostrarse en el expediente y la acción queda en auditoría.",
        "back": reverse("core:document_list"), "button": "Anular documento", "danger": True})


@require("documents.view")
def document_list(request):
    user = request.user
    visible_ops = scoped_operations(user)
    qs = Document.objects.select_related("operation", "client", "investor", "trust", "uploaded_by")
    if not user.can("operations.all"):
        qs = qs.filter(Q(operation__in=visible_ops) | Q(client__advisor=user))
    if not user.can("investors.view"):
        qs = qs.filter(investor__isnull=True)
    if request.GET.get("anulados") != "1":
        qs = qs.filter(is_void=False)
    if request.GET.get("tipo"):
        qs = qs.filter(doc_type=request.GET["tipo"])
    q = request.GET.get("q", "").strip()
    if q:
        qs = qs.filter(Q(original_name__icontains=q) | Q(title__icontains=q) | Q(operation__code__icontains=q) |
                       Q(client__full_name__icontains=q) | Q(trust__code__icontains=q))
    return render(request, "core/document_list.html", {"page": paginate(request, qs), "q": q, "types": DOCUMENT_TYPES})


# ------------------------------------------------------------------------------- configuración
@require("settings.manage")
def settings_view(request):
    cfg = SystemSettings.load()
    before = snapshot(cfg)
    form = SettingsForm(request.POST or None, request.FILES or None, instance=cfg)
    if request.method == "POST" and form.is_valid():
        logo = request.FILES.get("logo")
        if logo and not logo.name.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
            form.add_error("logo", "Use PNG, JPG o WEBP.")
        else:
            form.save()
            log_changes("Configuración", cfg, before)
            messages.success(request, "Configuración guardada. Los cambios no alteran condiciones de operaciones ya registradas.")
            return redirect("core:settings")
    return render(request, "core/settings.html", {"form": form, "profiles": FinancialProfile.objects.all()})


@require("settings.manage")
def profile_form(request, pk=None):
    prof = get_object_or_404(FinancialProfile, pk=pk) if pk else None
    before = snapshot(prof) if prof else None
    form = FinancialProfileForm(request.POST or None, instance=prof)
    if request.method == "POST" and form.is_valid():
        obj = form.save()
        if prof:
            log_changes("Configuración", obj, before, detail="Perfil de condiciones")
        else:
            log("CREATE", "Configuración", obj, None, snapshot(obj), detail="Perfil de condiciones")
        messages.success(request, "Perfil guardado. Solo se aplicará a operaciones nuevas.")
        return redirect("core:settings")
    return render(request, "core/form_page.html", {"form": form, "title": f"Perfil: {prof}" if prof else "Nuevo perfil de condiciones",
                                                   "back": reverse("core:settings")})


def logo(request):
    cfg = SystemSettings.load()
    if not cfg.logo:
        raise Http404
    return FileResponse(cfg.logo.open("rb"))
