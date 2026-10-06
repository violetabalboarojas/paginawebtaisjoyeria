from django.contrib.auth.signals import user_logged_in, user_logged_out, user_login_failed
from django.dispatch import receiver

from audit.services import log


@receiver(user_logged_in)
def on_login(sender, request, user, **kwargs):
    log("LOGIN", "Acceso", user, user=user)


@receiver(user_logged_out)
def on_logout(sender, request, user, **kwargs):
    if user:
        log("LOGOUT", "Acceso", user, user=user)


@receiver(user_login_failed)
def on_failed(sender, credentials, request=None, **kwargs):
    attempted = str(credentials.get("username", ""))[:150]
    log("LOGIN_FAILED", "Acceso", record_label=attempted, username=f"(intento) {attempted}"[:150])
