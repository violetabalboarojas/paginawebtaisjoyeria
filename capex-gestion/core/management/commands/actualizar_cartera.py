from django.core.management.base import BaseCommand

from core.services.portfolio import refresh_portfolio


class Command(BaseCommand):
    help = "Recalcula penalidades, estados y saldos de toda la cartera (programar a diario, p. ej. 00:05)."

    def handle(self, *args, **o):
        n = refresh_portfolio(force=True)
        self.stdout.write(self.style.SUCCESS(f"{n} operaciones recalculadas."))
