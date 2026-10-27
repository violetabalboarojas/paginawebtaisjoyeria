"""Datos de DEMOSTRACIÓN con personas y montos ficticios. No usar en producción."""

import datetime
import io
from decimal import Decimal as D

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from reportlab.pdfgen import canvas

from accounts.models import Role, User
from core.models import Client, Investor, Mortgage, Operation, Payment, Property, SystemSettings, Trust
from core.services.documents import store_document
from core.services.engine import add_months
from core.services.portfolio import (
    _buckets, create_client, create_investor, create_operation, payoff_amount, refresh_portfolio, register_payment, today,
)

DEMO_USERS = [
    ("gerencia", "Gabriela", "Salinas", "GERENCIA"), ("finanzas", "Fernando", "Quispe", "FINANZAS"),
    ("cobranzas", "Carla", "Medina", "COBRANZAS"), ("asesor", "Andrés", "Paredes", "ASESOR"),
    ("consulta", "Lucía", "Torres", "CONSULTA"),
]


def fake_pdf(title):
    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(72, 760, "DOCUMENTO DE DEMOSTRACIÓN")
    c.setFont("Helvetica", 12)
    c.drawString(72, 730, title)
    c.drawString(72, 710, "Archivo ficticio generado por el comando cargar_demo.")
    c.save()
    return SimpleUploadedFile(f"{title.lower().replace(' ', '_')}.pdf", buf.getvalue(), content_type="application/pdf")


class Command(BaseCommand):
    help = "Carga usuarios, bonistas, clientes, operaciones, pagos y garantías FICTICIOS para probar el sistema."

    def add_arguments(self, parser):
        parser.add_argument("--clave", required=True, help="Contraseña para los usuarios demo (uno por rol).")

    @transaction.atomic
    def handle(self, *args, **o):
        if Operation.objects.exists():
            raise CommandError("Ya hay operaciones registradas; la demo solo se carga en una base vacía.")
        admin = User.objects.filter(role__name="ADMINISTRADOR").first()
        if not admin:
            raise CommandError("Primero ejecute: python manage.py inicializar")
        users = {}
        for username, first, last, role in DEMO_USERS:
            u, _ = User.objects.get_or_create(username=username, defaults={
                "first_name": first, "last_name": last, "email": f"{username}@demo.capex.local", "role": Role.objects.get(name=role)})
            u.set_password(o["clave"])
            u.save()
            users[role] = u
        advisor = users["ASESOR"]
        T = today()
        cfg = SystemSettings.load()
        cfg.company_ruc = cfg.company_ruc or "20000000001"
        cfg.save()

        inv = [create_investor(Investor(first_name=f, last_name=l, doc_type=dt, doc_number=dn, phone=ph, whatsapp=ph, email=e,
                                        bank=b, account_number=acc, cci=cci, registered_on=add_months(T, -14)), admin)
               for f, l, dt, dn, ph, e, b, acc, cci in [
                   ("Rodrigo", "Valdivia Campos", "DNI", "40112233", "987111222", "rvaldivia@demo.pe", "BCP", "193-0000000-1-01", "00219300000000010100"),
                   ("Inversiones Altamar S.A.C.", "", "RUC", "20600000011", "014440000", "tesoreria@altamar.demo", "Interbank", "200-0000000001", "00320000000000000101"),
                   ("Mariela", "Ccori Huamán", "DNI", "41223344", "986222333", "mccori@demo.pe", "BBVA", "0011-0000-0200000001", "01100000020000000102"),
                   ("Fondo Familiar Ríos", "", "RUC", "20600000022", "015550000", "fondo.rios@demo.pe", "Scotiabank", "000-0000001", "00900000000000000103"),
               ]]
        cl = [create_client(Client(full_name=n, doc_type=dt, doc_number=dn, phone=ph, whatsapp=ph, email=e, address=a,
                                   economic_activity=act, declared_income=D(inc), income_currency=cur, advisor=adv), admin)
              for n, dt, dn, ph, e, a, act, inc, cur, adv in [
                  ("Agroindustrial Valle Norte E.I.R.L.", "RUC", "20500000101", "999000101", "gerencia@vallenorte.demo", "Av. Los Fresnos 120, Ate", "Agroindustria", "85000", "PEN", advisor),
                  ("Constructora Pachacámac S.A.C.", "RUC", "20500000102", "999000102", "contacto@pachacamac.demo", "Jr. Huáscar 455, Lurín", "Construcción", "120000", "PEN", None),
                  ("Julio César Mendoza Rivas", "DNI", "08990011", "999000103", "jmendoza@demo.pe", "Calle Las Gardenias 210, Surco", "Comercio minorista", "18000", "PEN", advisor),
                  ("Textiles Andinos S.R.L.", "RUC", "20500000104", "999000104", "admin@textilesandinos.demo", "Av. Argentina 3100, Callao", "Manufactura textil", "95000", "PEN", None),
                  ("Rosa Elena Paucar Lima", "DNI", "10223344", "999000105", "rpaucar@demo.pe", "Mz. B Lt. 7, Pachacámac", "Transporte", "12000", "PEN", advisor),
                  ("Logística Santa Felicia S.A.C.", "RUC", "20500000106", "999000106", "ops@santafelicia.demo", "Separadora Industrial 900, La Molina", "Logística", "140000", "PEN", None),
              ]]

        bullet = dict(rate_type="TNM", rate_value=D("2.9"), interest_method="SIMPLE", day_base=360, day_count="ACTUAL",
                      periodicity="MONTHLY", amortization="BULLET", penalty_type="DAILY_PERCENT", penalty_value=D("0.05"),
                      penalty_base="INSTALLMENT", penalty_grace_days=0)

        def new_op(investor, client, principal, currency, months_ago, term, adv=None, **terms):
            start = add_months(T, -months_ago) if months_ago >= 1 else T - datetime.timedelta(days=int(months_ago * 30))
            params = {**bullet, **terms}
            op = Operation(investor=investor, client=client, principal=D(principal), currency=currency, disbursement_date=start,
                           start_date=start, term_months=term, advisor=adv, purpose="Capital de trabajo (demo)", **params)
            return create_operation(op, admin)

        def pay(op, number, when, method="TRANSFERENCIA"):
            due = sum(b[2] for b in _buckets(op, when, cfg) if b[0] == number)
            if due <= 0:
                return
            p = Payment(operation=op, payment_date=when, amount=due, currency=op.currency, concept="CUOTA", method=method,
                        bank="BCP", bank_reference=f"{op.pk:03d}{number:02d}{when:%m%d}")
            register_payment(p, users["COBRANZAS"])

        def pay_until(op, last_number, delay_days=0):
            for r in op.current_schedule():
                if r.number <= last_number and r.due_date + datetime.timedelta(days=delay_days) <= T:
                    pay(op, r.number, r.due_date + datetime.timedelta(days=delay_days))

        ops = []
        o1 = new_op(inv[0], cl[0], "140000", "USD", 10, 12, advisor); pay_until(o1, 99); ops.append(o1)
        o2 = new_op(inv[1], cl[1], "60000", "USD", 8, 12); pay_until(o2, 5, delay_days=2); ops.append(o2)
        o3 = new_op(inv[2], cl[3], "250000", "PEN", 6, 24, rate_type="TEA", rate_value=D("22"), interest_method="COMPOUND",
                    day_count="PERIOD", amortization="FRENCH", penalty_value=D("0.08"), penalty_grace_days=3)
        last = [r for r in o3.current_schedule() if r.due_date < T]
        pay_until(o3, last[-2].number if len(last) > 1 else 0); ops.append(o3)
        o4 = new_op(inv[3], cl[5], "80000", "PEN", 14, 12, rate_type="TEA", rate_value=D("20"), interest_method="COMPOUND",
                    day_count="PERIOD", amortization="GERMAN"); pay_until(o4, 99); ops.append(o4)
        o5 = new_op(inv[0], cl[2], "45000", "USD", 0.7, 12, advisor); ops.append(o5)
        o6 = new_op(inv[1], cl[4], "90000", "USD", 11, 12, advisor); pay_until(o6, 99); ops.append(o6)
        o7 = new_op(inv[2], cl[0], "120000", "PEN", 5, 12, advisor, rate_type="TNA", rate_value=D("30"))
        pay_until(o7, 99)
        cancel_date = T - datetime.timedelta(days=5)
        po = payoff_amount(o7, cancel_date)
        register_payment(Payment(operation=o7, payment_date=cancel_date, amount=po["total"], currency="PEN", concept="CANCELACION",
                                 method="TRANSFERENCIA", bank="Interbank", bank_reference="CANC-0007"), users["FINANZAS"])
        ops.append(o7)

        props = [
            ("TERRENO_RUSTICO", "Agroindustrial Valle Norte E.I.R.L.", "20500000101", "Lote F Mz. 4, Valle de Ate", "Ate", "Lima", "Lima", "11110001", "710000", "560000", 3),
            ("LOCAL_COMERCIAL", "Constructora Pachacámac S.A.C.", "20500000102", "Av. Lima 1520", "Lurín", "Lima", "Lima", "11110002", "100000", "80000", 15),
            ("INDUSTRIAL", "Textiles Andinos S.R.L.", "20500000104", "Av. Argentina 3100", "Callao", "Callao", "Callao", "70010003", "780000", "620000", 7),
            ("CASA", "Logística Santa Felicia S.A.C.", "20500000106", "Calle Los Pinos 330", "La Molina", "Lima", "Lima", "11110004", "260000", "210000", 16),
            ("DEPARTAMENTO", "Julio César Mendoza Rivas", "08990011", "Calle Las Gardenias 210, dpto. 501", "Santiago de Surco", "Lima", "Lima", "11110005", "135000", "110000", 1),
            ("TERRENO_URBANO", "Rosa Elena Paucar Lima", "10223344", "Mz. B Lt. 7", "Pachacámac", "Lima", "Lima", "11110006", "230000", "185000", 12),
            ("OFICINA", "Agroindustrial Valle Norte E.I.R.L.", "20500000101", "Av. Javier Prado Este 4900, of. 3", "La Molina", "Lima", "Lima", "11110007", "390000", "310000", 6),
        ]
        statuses = ["INSCRITA", "INSCRITA", "INSCRITA", "INSCRITA", "EN_TRAMITE", "INSCRITA", "LEVANTADA"]
        currencies = ["USD", "USD", "PEN", "PEN", "USD", "USD", "PEN"]
        for op, p, st, cur in zip(ops, props, statuses, currencies):
            ptype, owner, doc, addr, dist, prov, dep, part, cv, rv, months = p
            prop = Property.objects.create(property_type=ptype, owner_name=owner, owner_doc=doc, address=addr, district=dist,
                                           province=prov, department=dep, registry_number=part, registry_office="Lima" if dep != "Callao" else "Callao",
                                           value_currency=cur, commercial_value=D(cv), realization_value=D(rv),
                                           appraisal_date=add_months(T, -months), appraiser="Tasaciones Demo S.A.C.", created_by=admin)
            Mortgage.objects.create(operation=op, property=prop, secured_amount=op.principal, rank=1, inscription_status=st,
                                    registry_seat="D00004" if st == "INSCRITA" else "", created_by=admin)

        t1 = Trust.objects.create(fiduciary_entity="Fiduciaria Demo S.A.", code="FID-DEMO-001", constitution_date=add_months(T, -10),
                                  trust_estate="Patrimonio en fideicomiso Valle Norte", settlor="Agroindustrial Valle Norte E.I.R.L.",
                                  trustee="Fiduciaria Demo S.A.", beneficiary="Titulares de valores representados por CAPEX Express S.A.C.",
                                  contributed_assets="Terreno rústico partida 11110001 y flujos de cobranza", status="VIGENTE",
                                  effective_date=add_months(T, -10), expiry_date=add_months(T, 14), created_by=admin)
        t1.operations.set([o1, o7])
        t2 = Trust.objects.create(fiduciary_entity="Fiduciaria Demo S.A.", code="FID-DEMO-002", constitution_date=add_months(T, -1),
                                  trust_estate="Patrimonio en fideicomiso Pachacámac", settlor="Rosa Elena Paucar Lima",
                                  trustee="Fiduciaria Demo S.A.", beneficiary="CAPEX Express S.A.C. en representación de bonistas",
                                  contributed_assets="Terreno urbano partida 11110006", status="PENDIENTE_INSCRIPCION", created_by=admin)
        t2.operations.set([o6, o2, o3, o4])
        for op in (o1, o3, o4):
            for kind, title in (("CONTRATO", "Contrato de préstamo"), ("TASACION", "Informe de tasación"),
                                ("COPIA_LITERAL", "Copia literal"), ("CONTRATO_FIDEICOMISO", "Contrato de fideicomiso")):
                store_document(fake_pdf(f"{title} {op.code}"), kind, admin, title=f"{title} (demo)", operation=op, client=op.client)
        store_document(fake_pdf("DNI demo"), "DNI", admin, title="DNI representante (demo)", client=cl[2])
        refresh_portfolio(force=True)
        self.stdout.write(self.style.SUCCESS(
            f"Demo cargada: {len(inv)} bonistas, {len(cl)} clientes, {len(ops)} operaciones. "
            f"Usuarios demo: {', '.join(u for u, *_ in DEMO_USERS)} (contraseña indicada en --clave)."))
