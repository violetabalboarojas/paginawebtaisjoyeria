import os
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError

from accounts.apps import sync_permissions
from accounts.models import Role, User
from core.models import FinancialProfile, SystemSettings

PROFILES = [
    dict(name="Titulización bullet · TNM ACT/360",
         description="Intereses mensuales, capital al vencimiento, base ACT/360 (estructura del contrato de fideicomiso de titulización). "
                     "Defina la tasa moratoria vigente antes de usar.",
         rate_type="TNM", rate_value=Decimal("2.9"), interest_method="SIMPLE", day_base=360, day_count="ACTUAL",
         periodicity="MONTHLY", amortization="BULLET", penalty_type="MORATORY", penalty_value=Decimal("0"),
         penalty_base="INSTALLMENT", penalty_grace_days=0),
    dict(name="Ejemplo · cuota francesa TEA",
         description="Perfil de ejemplo: ajuste tasa y penalidad a sus condiciones reales.",
         rate_type="TEA", rate_value=Decimal("18"), interest_method="COMPOUND", day_base=360, day_count="PERIOD",
         periodicity="MONTHLY", amortization="FRENCH", penalty_type="DAILY_PERCENT", penalty_value=Decimal("0.1"),
         penalty_base="INSTALLMENT", penalty_grace_days=3),
]


class Command(BaseCommand):
    help = "Crea roles, permisos, configuración base, perfiles de condiciones y el usuario administrador."

    def add_arguments(self, parser):
        parser.add_argument("--usuario", default=os.environ.get("ADMIN_USERNAME", "admin"))
        parser.add_argument("--correo", default=os.environ.get("ADMIN_EMAIL"))
        parser.add_argument("--clave", default=os.environ.get("ADMIN_PASSWORD"))

    def handle(self, *args, **o):
        sync_permissions(sender=None)
        SystemSettings.load()
        for p in PROFILES:
            FinancialProfile.objects.get_or_create(name=p["name"], defaults=p)
        if User.objects.filter(role__name="ADMINISTRADOR").exists():
            self.stdout.write("Ya existe un administrador; no se crea otro.")
            return
        if not o["correo"] or not o["clave"]:
            raise CommandError("Indique --correo y --clave (o ADMIN_EMAIL y ADMIN_PASSWORD) para crear el administrador.")
        user = User(username=o["usuario"], email=o["correo"], first_name="Administrador",
                    role=Role.objects.get(name="ADMINISTRADOR"), is_staff=True)
        from django.contrib.auth.password_validation import validate_password
        validate_password(o["clave"], user)
        user.set_password(o["clave"])
        user.save()
        self.stdout.write(self.style.SUCCESS(f"Administrador '{user.username}' creado."))
