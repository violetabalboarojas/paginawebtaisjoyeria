from datetime import timedelta

from django.conf import settings
from django.contrib.auth.backends import ModelBackend
from django.db.models import Q
from django.utils import timezone

from .models import User


class AccountLocked(Exception):
    pass


class EmailOrUsernameBackend(ModelBackend):
    """Acepta usuario o correo. Bloquea la cuenta tras N intentos fallidos."""

    def authenticate(self, request, username=None, password=None, **kwargs):
        if not username or not password:
            return None
        user = User.objects.filter(Q(username__iexact=username) | Q(email__iexact=username)).first()
        if user is None:
            User().set_password(password)  # iguala el tiempo de respuesta
            return None
        if user.is_locked:
            raise AccountLocked()
        if user.check_password(password) and self.user_can_authenticate(user):
            if user.failed_attempts or user.locked_until:
                user.failed_attempts = 0
                user.locked_until = None
                user.save(update_fields=["failed_attempts", "locked_until"])
            return user
        user.failed_attempts += 1
        fields = ["failed_attempts"]
        if user.failed_attempts >= settings.LOGIN_MAX_ATTEMPTS:
            user.locked_until = timezone.now() + timedelta(minutes=settings.LOGIN_LOCK_MINUTES)
            user.failed_attempts = 0
            fields.append("locked_until")
        user.save(update_fields=fields)
        return None
