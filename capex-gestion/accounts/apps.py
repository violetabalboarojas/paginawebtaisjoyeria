from django.apps import AppConfig
from django.db.models.signals import post_migrate


def sync_permissions(sender, **kwargs):
    from .models import DEFAULT_ROLES, PERMISSION_CATALOG, Permission, Role

    for code, module, description in PERMISSION_CATALOG:
        Permission.objects.update_or_create(code=code, defaults={"module": module, "description": description})
    Permission.objects.exclude(code__in=[c for c, _, _ in PERMISSION_CATALOG]).delete()
    for name, (description, codes) in DEFAULT_ROLES.items():
        role, created = Role.objects.get_or_create(name=name, defaults={"description": description, "is_system": True})
        if created:
            role.permissions.set(Permission.objects.filter(code__in=codes))
    admin = Role.objects.filter(name="ADMINISTRADOR").first()
    if admin:  # el administrador siempre conserva todos los permisos
        admin.permissions.set(Permission.objects.all())


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "accounts"
    verbose_name = "Usuarios y accesos"

    def ready(self):
        post_migrate.connect(sync_permissions, sender=self)
        from . import signals  # noqa: F401
