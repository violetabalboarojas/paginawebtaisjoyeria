from django.conf import settings
from django.shortcuts import redirect
from django.urls import reverse

PUBLIC_PREFIXES = ("/cuenta/ingresar", "/cuenta/recuperar", "/cuenta/restablecer", "/static/", "/logo")


class LoginRequiredMiddleware:
    """Todo el sistema exige sesión iniciada, salvo login y recuperación de contraseña."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path
        if not path.startswith(PUBLIC_PREFIXES):
            if not request.user.is_authenticated:
                return redirect(f"{reverse(settings.LOGIN_URL)}?next={path}")
            change_url = reverse("accounts:password_change")
            if request.user.must_change_password and path not in (change_url, reverse("accounts:logout")):
                return redirect(change_url)
        return self.get_response(request)
