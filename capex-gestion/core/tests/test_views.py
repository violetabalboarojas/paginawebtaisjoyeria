import datetime
import shutil
import tempfile
from decimal import Decimal

from django.core.management import call_command
from django.test import TestCase, override_settings
from django.urls import reverse

from accounts.models import User
from audit.models import AuditLog
from core.models import Operation, OpStatus, Payment, Penalty, PaymentSchedule
from core.services.portfolio import today

MEDIA = tempfile.mkdtemp()
PWD = "Demo-Capex-2026"


@override_settings(MEDIA_ROOT=MEDIA, PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class ViewTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("inicializar", correo="admin@capex.local", clave="Capex-Admin-2026", verbosity=0)
        call_command("cargar_demo", clave=PWD, verbosity=0)

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA, ignore_errors=True)

    def login(self, username):
        self.client.force_login(User.objects.get(username=username))

    def test_login_required_and_login_flow(self):
        r = self.client.get(reverse("core:dashboard"))
        self.assertRedirects(r, f"{reverse('accounts:login')}?next=/", fetch_redirect_response=False)
        r = self.client.post(reverse("accounts:login"), {"username": "finanzas@demo.capex.local", "password": PWD})
        self.assertEqual(r.status_code, 302)
        self.assertTrue(AuditLog.objects.filter(action="LOGIN", username="finanzas").exists())
        r = self.client.post(reverse("accounts:logout"))
        self.assertEqual(r.status_code, 302)

    def test_lockout_after_failed_attempts(self):
        for _ in range(5):
            self.client.post(reverse("accounts:login"), {"username": "consulta", "password": "incorrecta"})
        r = self.client.post(reverse("accounts:login"), {"username": "consulta", "password": PWD})
        self.assertContains(r, "bloqueada temporalmente")
        self.assertTrue(User.objects.get(username="consulta").is_locked)

    def test_password_is_hashed(self):
        u = User.objects.get(username="admin")
        self.assertNotIn("Capex-Admin-2026", u.password)

    def test_admin_pages_render(self):
        self.login("admin")
        op = Operation.objects.filter(status=OpStatus.EN_MORA).first()
        pay = Payment.objects.first()
        urls = [
            reverse("core:dashboard"), reverse("core:dashboard") + "?moneda=PEN", reverse("core:alerts"),
            reverse("core:search") + "?q=11110001", reverse("core:search") + "?q=Valle",
            reverse("core:investor_list"), reverse("core:investor_create"), reverse("core:client_list"), reverse("core:client_create"),
            reverse("core:operation_list"), reverse("core:operation_create"), reverse("core:payment_list"), reverse("core:payment_create"),
            reverse("core:penalty_list"), reverse("core:trust_list"), reverse("core:trust_create"), reverse("core:document_list"),
            reverse("core:reports"), reverse("core:settings"), reverse("core:profile_create"), reverse("audit:list"),
            reverse("accounts:user_list"), reverse("accounts:user_create"), reverse("accounts:roles"), reverse("accounts:password_change"),
            reverse("core:payment_detail", args=[pay.pk]), reverse("core:statement", args=[op.pk]),
            reverse("core:operation_restructure", args=[op.pk]), reverse("core:operation_close", args=[op.pk]),
            reverse("core:guarantee_create", args=[op.pk]), reverse("core:api_operation", args=[op.pk]),
            reverse("core:investor_detail", args=[op.investor_id]), reverse("core:client_detail", args=[op.client_id]),
            reverse("core:trust_detail", args=[op.trusts.first().pk]),
        ]
        for tab in ("resumen", "cronograma", "pagos", "penalidades", "garantia", "fideicomiso", "documentos", "historial"):
            urls.append(reverse("core:operation_detail", args=[op.pk]) + f"?tab={tab}")
        for url in urls:
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 200)

    def test_exports(self):
        self.login("admin")
        op = Operation.objects.first()
        for fmt, ctype in (("pdf", "application/pdf"), ("xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")):
            r = self.client.get(reverse("core:statement", args=[op.pk]) + f"?formato={fmt}")
            self.assertEqual(r["Content-Type"], ctype)
        start = (today() - datetime.timedelta(days=400)).isoformat()
        for kind in ("capital_colocado", "capital_recuperado", "intereses_generados", "intereses_cobrados", "penalidades", "morosidad",
                     "vigentes", "vencidas", "pagos", "flujo_mensual", "rentabilidad"):
            with self.subTest(kind=kind):
                base = reverse("core:reports") + f"?report={kind}&start={start}&end={today().isoformat()}"
                r = self.client.get(base)
                self.assertEqual(r.status_code, 200)
                self.assertEqual(self.client.get(base + "&formato=xlsx").status_code, 200)
                self.assertEqual(self.client.get(base + "&formato=pdf")["Content-Type"], "application/pdf")
        self.assertEqual(self.client.get(reverse("audit:list") + "?formato=xlsx").status_code, 200)

    def test_role_restrictions(self):
        self.login("consulta")
        self.assertEqual(self.client.get(reverse("core:payment_create")).status_code, 403)
        self.assertEqual(self.client.get(reverse("core:settings")).status_code, 403)
        self.assertEqual(self.client.get(reverse("accounts:user_list")).status_code, 403)
        self.assertEqual(self.client.get(reverse("core:operation_list")).status_code, 200)
        self.login("cobranzas")
        self.assertEqual(self.client.get(reverse("core:payment_create")).status_code, 200)
        self.assertEqual(self.client.get(reverse("audit:list")).status_code, 403)

    def test_advisor_sees_only_assigned(self):
        self.login("asesor")
        asesor = User.objects.get(username="asesor")
        mine = Operation.objects.filter(advisor=asesor)
        other = Operation.objects.exclude(advisor=asesor).first()
        r = self.client.get(reverse("core:operation_list"))
        self.assertEqual(r.context["page"].paginator.count, mine.count())
        self.assertEqual(self.client.get(reverse("core:operation_detail", args=[other.pk])).status_code, 403)
        self.assertEqual(self.client.get(reverse("core:investor_list")).status_code, 403)

    def test_create_operation_with_preview(self):
        self.login("finanzas")
        op = Operation.objects.first()
        data = {"investor": op.investor_id, "client": op.client_id, "principal": "50000", "currency": "USD",
                "disbursement_date": today().isoformat(), "start_date": today().isoformat(), "term_months": "6",
                "rate_type": "TNM", "rate_value": "2.9", "interest_method": "SIMPLE", "day_base": "360", "day_count": "ACTUAL",
                "capitalizations_per_year": "12", "periodicity": "MONTHLY", "amortization": "BULLET", "grace_periods": "0",
                "grace_type": "PARTIAL", "penalty_type": "DAILY_PERCENT", "penalty_value": "0.05", "penalty_base": "INSTALLMENT",
                "penalty_grace_days": "0", "action": "preview"}
        r = self.client.post(reverse("core:operation_create"), data)
        self.assertContains(r, "TNM × 12")
        self.assertEqual(Operation.objects.count(), 7)
        data["action"] = "confirm"
        r = self.client.post(reverse("core:operation_create"), data)
        self.assertEqual(r.status_code, 302)
        new = Operation.objects.latest("id")
        self.assertRegex(new.code, rf"^OP-{today().year}-\d{{5}}$")
        self.assertEqual(new.current_schedule().count(), 6)
        self.assertTrue(AuditLog.objects.filter(action="CREATE", record_label=new.code).exists())

    def test_payment_simulate_register_and_void(self):
        self.login("finanzas")
        op = Operation.objects.get(status=OpStatus.EN_MORA)
        before = op.capital_pending
        data = {"operation": op.pk, "payment_date": today().isoformat(), "amount": "1000.00", "currency": op.currency,
                "concept": "CUOTA", "method": "TRANSFERENCIA", "capital": "0", "interest": "0", "penalty": "0"}
        r = self.client.post(reverse("core:payment_simulate"), data)
        self.assertTrue(r.json()["ok"])
        self.assertEqual(Payment.objects.filter(operation=op).count(), op.payments.count())
        n = op.payments.count()
        r = self.client.post(reverse("core:payment_create"), data)
        self.assertEqual(r.status_code, 302)
        self.assertEqual(op.payments.count(), n + 1)
        p = op.payments.latest("id")
        self.assertEqual(sum(a.amount for a in p.allocations.all()), Decimal("1000.00"))
        # penalidad primero, luego interés de la cuota más antigua
        first = p.allocations.order_by("id").first()
        self.assertEqual(first.component, "PENALTY")
        with self.assertRaises(PermissionError):
            p.delete()
        r = self.client.post(reverse("core:payment_void", args=[p.pk]), {"reason": "Monto digitado por error"})
        p.refresh_from_db()
        self.assertEqual(p.status, Payment.VOID)
        op.refresh_from_db()
        self.assertEqual(op.capital_pending, before)
        self.assertTrue(AuditLog.objects.filter(action="VOID", record_label=p.code).exists())

    def test_overpayment_rejected_and_cancellation(self):
        self.login("finanzas")
        op = Operation.objects.get(status=OpStatus.VENCIDA)
        data = {"operation": op.pk, "payment_date": today().isoformat(), "amount": "99999999.00", "currency": op.currency,
                "concept": "CUOTA", "method": "TRANSFERENCIA"}
        r = self.client.post(reverse("core:payment_create"), data)
        self.assertContains(r, "excede la deuda")
        api = self.client.get(reverse("core:api_operation", args=[op.pk])).json()
        data.update(amount=api["payoff"]["total"], concept="CANCELACION")
        r = self.client.post(reverse("core:payment_create"), data)
        self.assertEqual(r.status_code, 302)
        op.refresh_from_db()
        self.assertEqual(op.status, OpStatus.CANCELADA)
        self.assertFalse(PaymentSchedule.objects.filter(operation=op, version=op.schedule_version).exclude(status="PAGADO").exists())

    def test_penalty_waive_keeps_history(self):
        self.login("finanzas")
        pen = Penalty.objects.filter(status="VIGENTE").first()
        r = self.client.post(reverse("core:penalty_waive", args=[pen.pk]), {"amount": str(pen.calculated_amount), "reason": "Acuerdo con el cliente"})
        self.assertEqual(r.status_code, 302)
        pen.refresh_from_db()
        self.assertEqual(pen.status, "CONDONADA")
        self.assertGreater(pen.calculated_amount, 0)
        self.assertTrue(AuditLog.objects.filter(action="PENALTY_CHANGE", record_id=str(pen.pk)).exists())

    def test_terms_locked_after_payments(self):
        self.login("finanzas")
        op = Operation.objects.filter(payments__isnull=False).first()
        r = self.client.get(reverse("core:operation_edit_terms", args=[op.pk]))
        self.assertEqual(r.status_code, 302)

    def test_audit_log_is_immutable(self):
        log = AuditLog.objects.first()
        with self.assertRaises(PermissionError):
            log.delete()
        log.detail = "x"
        with self.assertRaises(PermissionError):
            log.save()

    def test_document_upload_and_protected_download(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        self.login("finanzas")
        op = Operation.objects.first()
        f = SimpleUploadedFile("dni.pdf", b"%PDF-1.4 demo", content_type="application/pdf")
        r = self.client.post(reverse("core:document_upload") + f"?operacion={op.pk}", {"doc_type": "DNI", "title": "DNI", "file": f})
        self.assertEqual(r.status_code, 302)
        doc = op.documents.latest("id")
        self.assertEqual(self.client.get(reverse("core:document_download", args=[doc.pk])).status_code, 200)
        bad = SimpleUploadedFile("x.exe", b"MZ", content_type="application/octet-stream")
        r = self.client.post(reverse("core:document_upload") + f"?operacion={op.pk}", {"doc_type": "OTRO", "file": bad})
        self.assertContains(r, "no permitido")
        self.client.logout()
        self.assertEqual(self.client.get(reverse("core:document_download", args=[doc.pk])).status_code, 302)
