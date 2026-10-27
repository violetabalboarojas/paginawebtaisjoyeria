"""Importación con un libro sintético (datos ficticios) que replica la estructura del cronograma de bonos."""
import datetime as dt
import shutil
import tempfile
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.urls import reverse
from openpyxl import Workbook

from accounts.models import User
from core.models import BondHolding, ImportBatch, Investor, Operation, Payment, Trust
from core.services.engine import add_months, unit_interest
from core.services.importer import build_preview, parse_workbook

MEDIA = tempfile.mkdtemp()
START = dt.date(2026, 1, 22)
TEA = Decimal("0.409")


def make_book(path):
    wb = Workbook()
    ws = wb.active
    ws.title = "Cronograma"
    for col, (title, amount, units, status_col) in zip(("B", "J"), (("SERIE A", 90000, 9, "H"), ("SERIE B", 50000, 5, "P"))):
        c = ws[f"{col}6"].column
        ws.cell(6, c, "Patrimonio en Fideicomiso FONDO DEMO D.Leg N°861, no inscrito en la SMV")
        ws.cell(7, c, f"BONOS TITULIZADOS - PRIMERA EMISIÓN - {title}")
        for i, (label, val) in enumerate([("Monto Emisión: ", amount), ("Valor Nominal: ", 10000), ("Cant. Bonos:", units),
                                          ("Moneda:", "Dólares"), ("Plazo:", 12), ("TNM:", 0.029), ("TEA:", 0.409)]):
            ws.cell(9 + i, c, label)
            ws.cell(9 + i, c + 1, val)
        for i, h in enumerate(["Periodo", "Fecha", "Principal", "Amortización", "Interés", "Cuota", "Estado"]):
            ws.cell(17, c + i, h)
        ws.cell(18, c, 0)
        ws.cell(18, c + 1, START)
        ws.cell(18, c + 2, amount)
        for k in range(1, 13):
            r = 18 + k
            ws.cell(r, c, k)
            prev = f"{ws.cell(r - 1, c + 1).coordinate}"
            ws.cell(r, c + 1, f"=+EDATE({prev},1)")  # sin valor guardado: lo evalúa el importador
            ws.cell(r, c + 3, amount if k == 12 else 0)
            ws.cell(r, c + 6, "Pagado" if k <= 3 else None)
        ws.cell(31, c, "TOTALES")
    imc = wb.create_sheet("IMC")
    imc["B12"], imc["C12"] = "Fecha de corte ", dt.datetime(2026, 9, 30)
    imc["D4"], imc["E4"], imc["F4"] = "Tasa maxima ", 1.1413, 0.9984
    for i, h in enumerate(["Emisión ", "Inversionista", "%", "Amortización", "Interés", "IMC", "Total", "Retención IR", "Pago Neto"]):
        imc.cell(20, 2 + i, h)
    for i, (serie, name, pct) in enumerate([("Serie A", "Bonista Demo Uno", 7 / 9), ("Serie A", "Bonista Demo Dos", 2 / 9),
                                            ("Serie B", "Bonista Demo Tres", 1)]):
        imc.cell(21 + i, 2, serie)
        imc.cell(21 + i, 3, name)
        imc.cell(21 + i, 4, pct)
        imc.cell(21 + i, 9, f"=4.99%*(F{21 + i}+G{21 + i})")
    wb.save(path)


@override_settings(MEDIA_ROOT=MEDIA, PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class ImporterTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("inicializar", correo="admin@capex.local", clave="Capex-Admin-2026", verbosity=0)
        cls.path = f"{MEDIA}/demo.xlsx"
        make_book(cls.path)

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA, ignore_errors=True)

    def test_parse_and_preview(self):
        parsed = parse_workbook(self.path)
        self.assertEqual(parsed["trust_name"], "Patrimonio en Fideicomiso FONDO DEMO")
        self.assertEqual(len(parsed["schedules"][0]["blocks"]), 2)
        self.assertEqual(parsed["imc"]["max_rate_usd"], "99.8400")
        self.assertEqual(parsed["imc"]["withholding"], "4.99")
        pv = build_preview(parsed, as_of=dt.date(2026, 6, 1))
        a = pv["series"][0]
        self.assertEqual(a["units"], 9)
        self.assertEqual(a["rows"][0]["due"], "2026-02-22")  # EDATE evaluado
        i = (1 + TEA) ** (Decimal(31) / Decimal(360)) - 1
        self.assertEqual(Decimal(a["rows"][0]["interest"]), unit_interest(Decimal(90000), i, 9))
        states = [r["state"] for r in a["rows"]]
        self.assertEqual(states[:3], ["PAGADO"] * 3)
        self.assertEqual(states[3], "VENCIDO")  # 22/04 impaga al 01/06
        self.assertGreater(Decimal(a["rows"][3]["penalty"]), 0)
        self.assertEqual(len(a["holders"]), 2)
        self.assertTrue(any(x["level"] == "review" for x in pv["issues"]))

    def test_import_flow_and_dedupe(self):
        c = self.client
        c.force_login(User.objects.get(username="admin"))
        with open(self.path, "rb") as f:
            r = c.post(reverse("core:import_list"), {"file": SimpleUploadedFile("demo.xlsx", f.read())})
        batch = ImportBatch.objects.get()
        self.assertRedirects(r, reverse("core:import_preview", args=[batch.pk]))
        self.assertEqual(c.get(r["Location"]).status_code, 200)
        self.assertFalse(Operation.objects.exists())  # la vista previa no escribe nada
        r = c.post(r["Location"], {"action": "confirm", "client_mode": "new", "client_name": "Cliente Demo S.A.C.",
                                   "client_doc": "20999999991", "client_doc_type": "RUC", "update_rates": "1"})
        batch.refresh_from_db()
        self.assertEqual(batch.status, "CONFIRMED")
        self.assertEqual(Operation.objects.filter(source="IMPORT").count(), 2)
        a = Operation.objects.get(series__icontains="SERIE A")
        self.assertEqual(a.units, 9)
        self.assertEqual(a.penalty_type, "IMC")
        self.assertEqual(a.current_schedule().count(), 12)
        self.assertEqual(Payment.objects.filter(operation=a, concept="IMPORTADO").count(), 3)
        self.assertEqual(BondHolding.objects.filter(operation=a).count(), 2)
        self.assertEqual(Investor.objects.filter(doc_type="SD").count(), 3)
        self.assertTrue(Trust.objects.filter(code="FID-FONDO-DEMO", operations=a).exists())
        self.assertIn(a.status, ("VENCIDA", "EN_MORA"))
        self.assertGreater(a.days_late, 0)
        for tab in ("cronograma", "bonistas", "penalidades"):
            self.assertEqual(c.get(a.get_absolute_url() + f"?tab={tab}").status_code, 200)
        self.assertEqual(c.get(reverse("core:client_detail", args=[a.client_id])).status_code, 200)
        self.assertEqual(c.get(reverse("core:investor_detail", args=[a.investor_id])).status_code, 200)
        self.assertEqual(c.get(reverse("core:dashboard") + "?moneda=USD").status_code, 200)
        # segunda importación del mismo archivo: no duplica
        with open(self.path, "rb") as f:
            r = c.post(reverse("core:import_list"), {"file": SimpleUploadedFile("demo.xlsx", f.read())})
        r = c.post(r["Location"], {"action": "confirm"})
        self.assertEqual(Operation.objects.filter(source="IMPORT").count(), 2)
        self.assertEqual(ImportBatch.objects.latest("id").status, "CONFIRMED")

    def test_terms_locked_for_imported(self):
        self.test_import_flow_and_dedupe()
        a = Operation.objects.filter(source="IMPORT").first()
        r = self.client.get(reverse("core:operation_edit_terms", args=[a.pk]))
        self.assertEqual(r.status_code, 302)
        self.assertEqual(add_months(dt.date(2026, 1, 31), 1), dt.date(2026, 2, 28))
