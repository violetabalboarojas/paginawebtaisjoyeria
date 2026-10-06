from django.contrib.auth.models import AbstractUser, UserManager
from django.db import models
from django.utils import timezone

# Catálogo de permisos del sistema: (código, módulo, descripción)
PERMISSION_CATALOG = [
    ("dashboard.view", "Dashboard", "Ver dashboard y alertas"),
    ("investors.view", "Bonistas", "Ver bonistas"),
    ("investors.edit", "Bonistas", "Crear y editar bonistas"),
    ("clients.view", "Clientes", "Ver clientes"),
    ("clients.edit", "Clientes", "Crear y editar clientes"),
    ("operations.view", "Operaciones", "Ver operaciones y cronogramas"),
    ("operations.create", "Operaciones", "Registrar operaciones"),
    ("operations.edit", "Operaciones", "Modificar condiciones económicas y reestructurar"),
    ("operations.status", "Operaciones", "Cambiar estado manualmente"),
    ("operations.all", "Operaciones", "Ver la cartera completa (no solo la asignada)"),
    ("payments.view", "Pagos", "Ver pagos"),
    ("payments.create", "Pagos", "Registrar pagos"),
    ("payments.void", "Pagos", "Anular pagos"),
    ("penalties.view", "Penalidades", "Ver penalidades"),
    ("penalties.manage", "Penalidades", "Condonar o ajustar penalidades"),
    ("guarantees.edit", "Garantías", "Registrar y editar garantías hipotecarias"),
    ("trusts.view", "Fideicomisos", "Ver fideicomisos"),
    ("trusts.edit", "Fideicomisos", "Registrar y editar fideicomisos"),
    ("documents.view", "Documentos", "Ver y descargar documentos"),
    ("documents.upload", "Documentos", "Cargar documentos"),
    ("documents.void", "Documentos", "Anular documentos"),
    ("reports.view", "Reportes", "Ver reportes y estados de cuenta"),
    ("reports.export", "Reportes", "Exportar a Excel y PDF"),
    ("audit.view", "Auditoría", "Ver bitácora de auditoría"),
    ("settings.manage", "Configuración", "Configurar empresa y parámetros"),
    ("users.manage", "Configuración", "Administrar usuarios, roles y permisos"),
]

ALL_CODES = [c for c, _, _ in PERMISSION_CATALOG]
_VIEW = ["dashboard.view", "investors.view", "clients.view", "operations.view", "payments.view",
         "penalties.view", "trusts.view", "documents.view", "reports.view"]

DEFAULT_ROLES = {
    "ADMINISTRADOR": ("Acceso total al sistema", ALL_CODES),
    "GERENCIA": ("Supervisión de cartera, reportes y auditoría", [
        c for c in ALL_CODES if c not in ("settings.manage", "users.manage")]),
    "FINANZAS": ("Operaciones, pagos y penalidades", _VIEW + [
        "investors.edit", "clients.edit", "operations.create", "operations.edit", "operations.all",
        "payments.create", "payments.void", "penalties.manage", "guarantees.edit", "trusts.edit",
        "documents.upload", "reports.export"]),
    "COBRANZAS": ("Seguimiento de cobranza y registro de pagos", _VIEW + [
        "operations.all", "payments.create", "documents.upload", "reports.export"]),
    "ASESOR": ("Clientes y operaciones asignadas", [
        "dashboard.view", "clients.view", "clients.edit", "operations.view", "operations.create",
        "payments.view", "penalties.view", "trusts.view", "guarantees.edit", "documents.view",
        "documents.upload", "reports.view"]),
    "CONSULTA": ("Solo lectura", _VIEW + ["operations.all"]),
}


class Permission(models.Model):
    code = models.CharField("Código", max_length=50, unique=True)
    module = models.CharField("Módulo", max_length=40)
    description = models.CharField("Descripción", max_length=150)

    class Meta:
        db_table = "permissions"
        ordering = ["module", "code"]

    def __str__(self):
        return self.code


class Role(models.Model):
    name = models.CharField("Nombre", max_length=40, unique=True)
    description = models.CharField("Descripción", max_length=200, blank=True)
    permissions = models.ManyToManyField(Permission, blank=True, related_name="roles", db_table="role_permissions")
    is_system = models.BooleanField(default=False, help_text="Rol base del sistema; no se puede eliminar.")

    class Meta:
        db_table = "roles"
        ordering = ["name"]

    def __str__(self):
        return self.name


class User(AbstractUser):
    email = models.EmailField("Correo electrónico", unique=True)
    role = models.ForeignKey(Role, null=True, blank=True, on_delete=models.PROTECT, related_name="users", verbose_name="Rol")
    phone = models.CharField("Teléfono", max_length=30, blank=True)
    failed_attempts = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    must_change_password = models.BooleanField("Debe cambiar contraseña", default=False)

    objects = UserManager()

    class Meta:
        db_table = "users"
        ordering = ["first_name", "last_name"]

    def __str__(self):
        return self.get_full_name() or self.username

    @property
    def perm_codes(self):
        if not hasattr(self, "_perm_codes"):
            if not self.is_active:
                self._perm_codes = frozenset()
            elif self.is_superuser:
                self._perm_codes = frozenset(ALL_CODES)
            elif self.role_id:
                self._perm_codes = frozenset(self.role.permissions.values_list("code", flat=True))
            else:
                self._perm_codes = frozenset()
        return self._perm_codes

    def can(self, code):
        return code in self.perm_codes

    @property
    def is_locked(self):
        return bool(self.locked_until and self.locked_until > timezone.now())
