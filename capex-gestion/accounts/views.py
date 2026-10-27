from collections import OrderedDict

from django.contrib import messages
from django.contrib.auth import views as auth_views
from django.contrib.auth import update_session_auth_hash
from django.contrib.sessions.models import Session
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse_lazy
from django.utils import timezone
from django.views.decorators.http import require_POST

from audit.services import log, log_changes, snapshot

from .forms import AdminPasswordForm, LoginForm, RoleForm, UserCreateForm, UserEditForm
from .models import Permission, Role, User
from .permissions import require


class LoginView(auth_views.LoginView):
    template_name = "accounts/login.html"
    authentication_form = LoginForm
    redirect_authenticated_user = True


@require_POST
def logout_view(request):
    return auth_views.LogoutView.as_view()(request)


class PasswordResetView(auth_views.PasswordResetView):
    template_name = "accounts/password_reset.html"
    email_template_name = "accounts/password_reset_email.txt"
    subject_template_name = "accounts/password_reset_subject.txt"
    success_url = reverse_lazy("accounts:password_reset_done")


class PasswordResetDoneView(auth_views.PasswordResetDoneView):
    template_name = "accounts/password_reset_done.html"


class PasswordResetConfirmView(auth_views.PasswordResetConfirmView):
    template_name = "accounts/password_reset_confirm.html"
    success_url = reverse_lazy("accounts:password_reset_complete")

    def form_valid(self, form):
        resp = super().form_valid(form)
        user = form.user
        user.failed_attempts, user.locked_until, user.must_change_password = 0, None, False
        user.save(update_fields=["failed_attempts", "locked_until", "must_change_password"])
        log("PASSWORD", "Usuarios", user, user=user, detail="Restablecimiento por correo")
        return resp


class PasswordResetCompleteView(auth_views.PasswordResetCompleteView):
    template_name = "accounts/password_reset_complete.html"


class PasswordChangeView(auth_views.PasswordChangeView):
    template_name = "accounts/password_change.html"
    success_url = reverse_lazy("core:dashboard")

    def form_valid(self, form):
        resp = super().form_valid(form)
        user = self.request.user
        if user.must_change_password:
            user.must_change_password = False
            user.save(update_fields=["must_change_password"])
        log("PASSWORD", "Usuarios", user, detail="Cambio de contraseña por el usuario")
        messages.success(self.request, "Contraseña actualizada.")
        return resp


# ------------------------------------------------------------------------------ usuarios
def _active_sessions():
    """Cuenta sesiones vigentes por usuario (control de sesiones)."""
    counts = {}
    for s in Session.objects.filter(expire_date__gt=timezone.now()):
        uid = s.get_decoded().get("_auth_user_id")
        if uid:
            counts[int(uid)] = counts.get(int(uid), 0) + 1
    return counts


@require("users.manage")
def user_list(request):
    users = User.objects.select_related("role").order_by("-is_active", "first_name")
    return render(request, "accounts/user_list.html", {"users": users, "sessions": _active_sessions()})


@require("users.manage")
def user_form(request, pk=None):
    obj = get_object_or_404(User, pk=pk) if pk else None
    before = snapshot(obj) if obj else None
    form = (UserEditForm if obj else UserCreateForm)(request.POST or None, instance=obj)
    if request.method == "POST" and form.is_valid():
        if obj and obj == request.user and not form.cleaned_data["is_active"]:
            form.add_error("is_active", "No puede desactivar su propio usuario.")
        else:
            user = form.save()
            if obj:
                log_changes("Usuarios", user, before)
            else:
                log("CREATE", "Usuarios", user, None, snapshot(user))
            messages.success(request, "Usuario guardado.")
            return redirect("accounts:user_list")
    return render(request, "accounts/user_form.html", {"form": form, "obj": obj})


@require("users.manage")
def user_password(request, pk):
    obj = get_object_or_404(User, pk=pk)
    form = AdminPasswordForm(obj, request.POST or None)
    if request.method == "POST" and form.is_valid():
        obj.set_password(form.cleaned_data["password1"])
        obj.must_change_password = True
        obj.failed_attempts, obj.locked_until = 0, None
        obj.save()
        if obj == request.user:
            update_session_auth_hash(request, obj)
        log("PASSWORD", "Usuarios", obj, detail="Contraseña temporal asignada por administrador")
        messages.success(request, f"Contraseña temporal asignada a {obj}. Deberá cambiarla al ingresar.")
        return redirect("accounts:user_list")
    return render(request, "accounts/user_form.html", {"form": form, "obj": obj, "password": True})


@require_POST
@require("users.manage")
def user_kill_sessions(request, pk):
    obj = get_object_or_404(User, pk=pk)
    n = 0
    for s in Session.objects.filter(expire_date__gt=timezone.now()):
        if s.get_decoded().get("_auth_user_id") == str(obj.pk):
            s.delete()
            n += 1
    log("LOGOUT", "Usuarios", obj, detail=f"Cierre forzado de {n} sesión(es) por administrador")
    messages.success(request, f"Se cerraron {n} sesión(es) de {obj}.")
    return redirect("accounts:user_list")


# ------------------------------------------------------------------------------ roles y permisos
@require("users.manage")
def roles(request):
    roles = list(Role.objects.prefetch_related("permissions"))
    perms = list(Permission.objects.all())
    if request.method == "POST":
        for role in roles:
            if role.name == "ADMINISTRADOR":
                continue
            wanted = {int(x) for x in request.POST.getlist(f"role_{role.pk}")}
            current = {p.pk for p in role.permissions.all()}
            if wanted != current:
                role.permissions.set(wanted)
                codes = lambda ids: sorted(p.code for p in perms if p.pk in ids)  # noqa: E731
                log("PERMISSION", "Roles", role, {"permisos": codes(current)}, {"permisos": codes(wanted)})
        messages.success(request, "Permisos actualizados. Aplican en la siguiente página que abra cada usuario.")
        return redirect("accounts:roles")
    grouped = OrderedDict()
    for p in perms:
        grouped.setdefault(p.module, []).append(p)
    matrix = {r.pk: {p.pk for p in r.permissions.all()} for r in roles}
    form = RoleForm()
    return render(request, "accounts/roles.html", {"roles": roles, "grouped": grouped, "matrix": matrix, "form": form})


@require_POST
@require("users.manage")
def role_create(request):
    form = RoleForm(request.POST)
    if form.is_valid():
        role = form.save()
        log("CREATE", "Roles", role, None, snapshot(role))
        messages.success(request, f"Rol {role} creado. Asigne sus permisos en la matriz.")
    else:
        messages.error(request, "; ".join(e for errs in form.errors.values() for e in errs))
    return redirect("accounts:roles")
