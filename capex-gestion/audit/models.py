from django.conf import settings
from django.db import models


class AuditLog(models.Model):
    """Bitácora inmutable. No se edita ni se elimina."""

    ACTIONS = [
        ("CREATE", "Creación"),
        ("UPDATE", "Edición"),
        ("VOID", "Anulación"),
        ("PAYMENT", "Registro de pago"),
        ("RATE_CHANGE", "Modificación de tasa"),
        ("MATURITY_CHANGE", "Cambio de vencimiento"),
        ("CAPITAL_CHANGE", "Cambio de capital"),
        ("PENALTY_CHANGE", "Cambio de penalidad"),
        ("STATUS_CHANGE", "Cambio de estado"),
        ("LOGIN", "Inicio de sesión"),
        ("LOGIN_FAILED", "Intento de acceso fallido"),
        ("LOGOUT", "Cierre de sesión"),
        ("PASSWORD", "Cambio de contraseña"),
        ("UPLOAD", "Carga de documento"),
        ("DOWNLOAD", "Descarga de documento"),
        ("EXPORT", "Exportación"),
        ("PERMISSION", "Cambio de permisos"),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    username = models.CharField("Usuario", max_length=150, blank=True)
    created_at = models.DateTimeField("Fecha y hora", auto_now_add=True, db_index=True)
    action = models.CharField("Acción", max_length=20, choices=ACTIONS, db_index=True)
    module = models.CharField("Módulo", max_length=40, db_index=True)
    record_id = models.CharField("ID del registro", max_length=40, blank=True, db_index=True)
    record_label = models.CharField("Registro afectado", max_length=200, blank=True)
    old_value = models.JSONField("Valor anterior", null=True, blank=True)
    new_value = models.JSONField("Valor nuevo", null=True, blank=True)
    ip_address = models.GenericIPAddressField("IP", null=True, blank=True)
    detail = models.TextField("Detalle", blank=True)

    class Meta:
        db_table = "audit_logs"
        ordering = ["-created_at", "-id"]
        verbose_name = "registro de auditoría"

    def save(self, *args, **kwargs):
        if self.pk:
            raise PermissionError("Los registros de auditoría no se pueden modificar.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionError("Los registros de auditoría no se pueden eliminar.")

    def __str__(self):
        return f"{self.created_at:%Y-%m-%d %H:%M} {self.username} {self.action} {self.module} {self.record_label}"
