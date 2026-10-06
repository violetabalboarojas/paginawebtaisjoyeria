import uuid
from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.urls import reverse

ZERO = Decimal("0.00")
USER = settings.AUTH_USER_MODEL

# --------------------------------------------------------------------------------------
# Catálogos
# --------------------------------------------------------------------------------------
CURRENCIES = [("PEN", "Soles (PEN)"), ("USD", "Dólares (USD)")]
CURRENCY_SYMBOL = {"PEN": "S/", "USD": "US$"}
DOC_TYPES = [("DNI", "DNI"), ("CE", "Carné de extranjería"), ("RUC", "RUC"), ("PAS", "Pasaporte")]

RATE_TYPES = [
    ("TEA", "Tasa efectiva anual (TEA)"),
    ("TNA", "Tasa nominal anual (TNA)"),
    ("TEM", "Tasa efectiva mensual (TEM)"),
    ("TNM", "Tasa nominal mensual (TNM)"),
]
INTEREST_METHODS = [("SIMPLE", "Interés simple"), ("COMPOUND", "Interés compuesto")]
DAY_BASES = [(360, "Base 360"), (365, "Base 365")]
DAY_COUNTS = [
    ("ACTUAL", "Días reales entre fechas (ACT)"),
    ("PERIOD", "Periodo estándar (30 días por mes)"),
]
PERIODICITIES = [
    ("MONTHLY", "Mensual"),
    ("BIMONTHLY", "Bimestral"),
    ("QUARTERLY", "Trimestral"),
    ("SEMIANNUAL", "Semestral"),
    ("ANNUAL", "Anual"),
    ("AT_MATURITY", "Al vencimiento (pago único)"),
]
PERIOD_MONTHS = {"MONTHLY": 1, "BIMONTHLY": 2, "QUARTERLY": 3, "SEMIANNUAL": 6, "ANNUAL": 12}
AMORTIZATIONS = [
    ("BULLET", "Bullet: solo intereses y capital al vencimiento"),
    ("FRENCH", "Francés: cuota constante"),
    ("GERMAN", "Alemán: amortización constante"),
]
GRACE_TYPES = [("PARTIAL", "Parcial: se pagan intereses"), ("TOTAL", "Total: intereses se capitalizan")]
PENALTY_TYPES = [
    ("NONE", "Sin penalidad"),
    ("FIXED", "Monto fijo por cuota vencida"),
    ("PERCENT", "Porcentaje único sobre lo vencido"),
    ("DAILY_PERCENT", "Porcentaje diario sobre lo vencido"),
    ("DAILY_FIXED", "Monto fijo por día de atraso"),
    ("MORATORY", "Tasa moratoria anual (interés simple)"),
]
PENALTY_BASES = [
    ("INSTALLMENT", "Cuota vencida (capital + interés)"),
    ("CAPITAL", "Capital vencido"),
    ("INTEREST", "Interés vencido"),
]
ALLOCATION_ORDERS = [
    ("PENALTY,INTEREST,CAPITAL", "Penalidad → interés → capital"),
    ("INTEREST,PENALTY,CAPITAL", "Interés → penalidad → capital"),
    ("INTEREST,CAPITAL,PENALTY", "Interés → capital → penalidad"),
]


class OpStatus(models.TextChoices):
    ACTIVA = "ACTIVA", "Activa"
    AL_DIA = "AL_DIA", "Al día"
    POR_VENCER = "POR_VENCER", "Por vencer"
    VENCIDA = "VENCIDA", "Vencida"
    EN_MORA = "EN_MORA", "En mora"
    CANCELADA = "CANCELADA", "Cancelada"
    REESTRUCTURADA = "REESTRUCTURADA", "Reestructurada"


class InstStatus(models.TextChoices):
    PENDIENTE = "PENDIENTE", "Pendiente"
    PAGADO = "PAGADO", "Pagado"
    PAGO_PARCIAL = "PAGO_PARCIAL", "Pago parcial"
    VENCIDO = "VENCIDO", "Vencido"


class TimeStamped(models.Model):
    created_at = models.DateTimeField("Creado", auto_now_add=True)
    updated_at = models.DateTimeField("Actualizado", auto_now=True)
    created_by = models.ForeignKey(USER, null=True, blank=True, on_delete=models.PROTECT, related_name="+")

    class Meta:
        abstract = True


# --------------------------------------------------------------------------------------
# Configuración
# --------------------------------------------------------------------------------------
class SystemSettings(models.Model):
    company_name = models.CharField("Nombre de la empresa", max_length=150, default="CAPEX Express S.A.C.")
    company_ruc = models.CharField("RUC", max_length=20, blank=True)
    company_address = models.CharField("Dirección", max_length=200, blank=True)
    logo = models.FileField("Logo", upload_to="branding/", blank=True)
    default_currency = models.CharField("Moneda por defecto", max_length=3, choices=CURRENCIES, default="USD")
    exchange_rate = models.DecimalField("Tipo de cambio referencial (S/ por US$)", max_digits=8, decimal_places=4, default=Decimal("3.7500"))
    max_ltv = models.DecimalField("Límite máximo de LTV (%)", max_digits=5, decimal_places=2, default=Decimal("50.00"))
    alert_days = models.PositiveSmallIntegerField("Días de alerta para cuotas por vencer", default=7)
    maturity_alert_days = models.PositiveSmallIntegerField("Días de alerta para operaciones por vencer", default=30)
    mora_days = models.PositiveSmallIntegerField("Días de atraso para considerar EN MORA", default=30)
    appraisal_validity_months = models.PositiveSmallIntegerField("Vigencia de tasación (meses)", default=12)
    allocation_order = models.CharField("Orden de aplicación de pagos", max_length=40, choices=ALLOCATION_ORDERS, default="PENALTY,INTEREST,CAPITAL")
    required_documents = models.CharField(
        "Documentos obligatorios por operación", max_length=300,
        default="CONTRATO,TASACION,COPIA_LITERAL,CONTRATO_FIDEICOMISO",
        help_text="Códigos separados por coma.",
    )
    operation_prefix = models.CharField("Prefijo de operaciones", max_length=5, default="OP")
    last_refresh = models.DateField(null=True, blank=True, editable=False)

    class Meta:
        db_table = "system_settings"

    def __str__(self):
        return "Configuración del sistema"

    @classmethod
    def load(cls):
        obj = cls.objects.first()
        if obj is None:
            obj = cls.objects.create()
        return obj

    @property
    def required_document_list(self):
        return [c.strip() for c in self.required_documents.split(",") if c.strip()]


class FinancialProfile(models.Model):
    """Plantilla de condiciones. Al crear una operación sus valores se COPIAN a la operación,
    de modo que cambiar el perfil nunca altera operaciones existentes."""

    name = models.CharField("Nombre", max_length=100, unique=True)
    description = models.CharField("Descripción", max_length=250, blank=True)
    rate_type = models.CharField("Tipo de tasa", max_length=3, choices=RATE_TYPES, default="TNM")
    rate_value = models.DecimalField("Tasa (%)", max_digits=9, decimal_places=4, default=Decimal("2.9"))
    interest_method = models.CharField("Método", max_length=8, choices=INTEREST_METHODS, default="SIMPLE")
    day_base = models.PositiveSmallIntegerField("Base de días", choices=DAY_BASES, default=360)
    day_count = models.CharField("Conteo de días", max_length=6, choices=DAY_COUNTS, default="ACTUAL")
    capitalizations_per_year = models.PositiveSmallIntegerField("Capitalizaciones por año (tasas nominales)", default=12)
    periodicity = models.CharField("Periodicidad", max_length=12, choices=PERIODICITIES, default="MONTHLY")
    amortization = models.CharField("Amortización", max_length=6, choices=AMORTIZATIONS, default="BULLET")
    penalty_type = models.CharField("Tipo de penalidad", max_length=14, choices=PENALTY_TYPES, default="DAILY_PERCENT")
    penalty_value = models.DecimalField("Valor de penalidad", max_digits=12, decimal_places=4, default=Decimal("0.1"))
    penalty_base = models.CharField("Base de penalidad", max_length=12, choices=PENALTY_BASES, default="INSTALLMENT")
    penalty_grace_days = models.PositiveSmallIntegerField("Días de tolerancia", default=0)
    is_active = models.BooleanField("Activo", default=True)

    class Meta:
        db_table = "financial_profiles"
        ordering = ["name"]

    def __str__(self):
        return self.name


# --------------------------------------------------------------------------------------
# Personas
# --------------------------------------------------------------------------------------
class Investor(TimeStamped):
    STATUS = [("ACTIVO", "Activo"), ("INACTIVO", "Inactivo")]
    code = models.CharField("ID del inversionista", max_length=20, unique=True, editable=False)
    first_name = models.CharField("Nombres o razón social", max_length=120)
    last_name = models.CharField("Apellidos", max_length=120, blank=True)
    doc_type = models.CharField("Tipo de documento", max_length=3, choices=DOC_TYPES, default="DNI")
    doc_number = models.CharField("N° de documento", max_length=20, unique=True)
    phone = models.CharField("Teléfono", max_length=30, blank=True)
    whatsapp = models.CharField("WhatsApp", max_length=30, blank=True)
    email = models.EmailField("Correo electrónico", blank=True)
    address = models.CharField("Dirección", max_length=250, blank=True)
    bank = models.CharField("Banco", max_length=80, blank=True)
    account_number = models.CharField("N° de cuenta", max_length=40, blank=True)
    cci = models.CharField("CCI", max_length=30, blank=True)
    registered_on = models.DateField("Fecha de registro")
    status = models.CharField("Estado", max_length=10, choices=STATUS, default="ACTIVO")
    notes = models.TextField("Observaciones", blank=True)

    class Meta:
        db_table = "investors"
        ordering = ["first_name", "last_name"]

    def __str__(self):
        return self.full_name

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    def get_absolute_url(self):
        return reverse("core:investor_detail", args=[self.pk])


class Client(TimeStamped):
    STATUS = [("ACTIVO", "Activo"), ("INACTIVO", "Inactivo"), ("OBSERVADO", "Observado")]
    code = models.CharField("Código del cliente", max_length=20, unique=True, editable=False)
    full_name = models.CharField("Nombres y apellidos o razón social", max_length=200)
    doc_type = models.CharField("Tipo de documento", max_length=3, choices=DOC_TYPES, default="DNI")
    doc_number = models.CharField("N° de documento", max_length=20, unique=True)
    phone = models.CharField("Teléfono", max_length=30, blank=True)
    whatsapp = models.CharField("WhatsApp", max_length=30, blank=True)
    email = models.EmailField("Correo", blank=True)
    address = models.CharField("Dirección", max_length=250, blank=True)
    economic_activity = models.CharField("Actividad económica", max_length=150, blank=True)
    declared_income = models.DecimalField("Ingresos declarados (mensual)", max_digits=14, decimal_places=2, null=True, blank=True)
    income_currency = models.CharField("Moneda de ingresos", max_length=3, choices=CURRENCIES, default="PEN")
    advisor = models.ForeignKey(USER, null=True, blank=True, on_delete=models.PROTECT, related_name="clients", verbose_name="Asesor")
    status = models.CharField("Estado", max_length=10, choices=STATUS, default="ACTIVO")
    notes = models.TextField("Observaciones", blank=True)

    class Meta:
        db_table = "clients"
        ordering = ["full_name"]

    def __str__(self):
        return self.full_name

    def get_absolute_url(self):
        return reverse("core:client_detail", args=[self.pk])


# --------------------------------------------------------------------------------------
# Operaciones
# --------------------------------------------------------------------------------------
ECONOMIC_FIELDS = [
    "principal", "currency", "disbursement_date", "start_date", "term_months", "rate_type", "rate_value",
    "interest_method", "day_base", "day_count", "capitalizations_per_year", "periodicity", "amortization",
    "payment_day", "grace_periods", "grace_type", "penalty_type", "penalty_value", "penalty_base",
    "penalty_grace_days",
]


class Operation(TimeStamped):
    code = models.CharField("Código", max_length=20, unique=True, editable=False)
    investor = models.ForeignKey(Investor, on_delete=models.PROTECT, related_name="operations", verbose_name="Inversionista")
    client = models.ForeignKey(Client, on_delete=models.PROTECT, related_name="operations", verbose_name="Cliente")
    advisor = models.ForeignKey(USER, null=True, blank=True, on_delete=models.PROTECT, related_name="operations", verbose_name="Asesor")
    profile = models.ForeignKey(FinancialProfile, null=True, blank=True, on_delete=models.SET_NULL, verbose_name="Perfil de condiciones")
    restructured_from = models.ForeignKey("self", null=True, blank=True, on_delete=models.PROTECT, related_name="restructurings", verbose_name="Reestructura de")

    principal = models.DecimalField("Capital entregado", max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    currency = models.CharField("Moneda", max_length=3, choices=CURRENCIES, default="USD")
    disbursement_date = models.DateField("Fecha de desembolso")
    start_date = models.DateField("Fecha de inicio")
    maturity_date = models.DateField("Fecha de vencimiento", editable=False)
    term_months = models.PositiveSmallIntegerField("Plazo (meses)", validators=[MinValueValidator(1)])

    rate_type = models.CharField("Tipo de tasa", max_length=3, choices=RATE_TYPES)
    rate_value = models.DecimalField("Tasa de interés (%)", max_digits=9, decimal_places=4, validators=[MinValueValidator(Decimal("0"))])
    interest_method = models.CharField("Método de interés", max_length=8, choices=INTEREST_METHODS)
    day_base = models.PositiveSmallIntegerField("Base de días", choices=DAY_BASES)
    day_count = models.CharField("Conteo de días", max_length=6, choices=DAY_COUNTS)
    capitalizations_per_year = models.PositiveSmallIntegerField("Capitalizaciones por año", default=12)
    periodicity = models.CharField("Periodicidad de pago", max_length=12, choices=PERIODICITIES)
    amortization = models.CharField("Amortización", max_length=6, choices=AMORTIZATIONS)
    payment_day = models.PositiveSmallIntegerField("Día de pago", null=True, blank=True, help_text="Vacío: mismo día de la fecha de inicio.")
    grace_periods = models.PositiveSmallIntegerField("Periodos de gracia", default=0)
    grace_type = models.CharField("Tipo de gracia", max_length=7, choices=GRACE_TYPES, default="PARTIAL")
    installment_amount = models.DecimalField("Monto de cuota o interés", max_digits=14, decimal_places=2, default=ZERO, editable=False)
    installments_count = models.PositiveSmallIntegerField("Número de cuotas", default=0, editable=False)

    penalty_type = models.CharField("Tipo de penalidad", max_length=14, choices=PENALTY_TYPES, default="NONE")
    penalty_value = models.DecimalField("Valor de penalidad", max_digits=12, decimal_places=4, default=ZERO)
    penalty_base = models.CharField("Base de penalidad", max_length=12, choices=PENALTY_BASES, default="INSTALLMENT")
    penalty_grace_days = models.PositiveSmallIntegerField("Días de tolerancia", default=0)

    status = models.CharField("Estado", max_length=15, choices=OpStatus.choices, default=OpStatus.ACTIVA, db_index=True)
    closed_manually = models.BooleanField(default=False, editable=False)
    close_reason = models.TextField("Motivo de cierre", blank=True, editable=False)
    purpose = models.CharField("Destino del crédito", max_length=200, blank=True)
    notes = models.TextField("Observaciones", blank=True)

    # Valores calculados (caché para filtros y reportes; la fuente de verdad son cronograma y pagos)
    capital_pending = models.DecimalField(max_digits=14, decimal_places=2, default=ZERO, editable=False)
    days_late = models.IntegerField(default=0, editable=False)
    next_due_date = models.DateField(null=True, blank=True, editable=False)
    refreshed_on = models.DateField(null=True, blank=True, editable=False)
    schedule_version = models.PositiveSmallIntegerField(default=1, editable=False)

    class Meta:
        db_table = "operations"
        ordering = ["-start_date", "-id"]

    def __str__(self):
        return self.code

    def get_absolute_url(self):
        return reverse("core:operation_detail", args=[self.pk])

    @property
    def symbol(self):
        return CURRENCY_SYMBOL[self.currency]

    @property
    def is_closed(self):
        return self.status in (OpStatus.CANCELADA, OpStatus.REESTRUCTURADA)

    def current_schedule(self):
        return self.schedule.filter(version=self.schedule_version).order_by("number")

    def has_payments(self):
        return self.payments.filter(status=Payment.VALID).exists()


class PaymentSchedule(models.Model):
    operation = models.ForeignKey(Operation, on_delete=models.PROTECT, related_name="schedule")
    version = models.PositiveSmallIntegerField(default=1)
    number = models.PositiveSmallIntegerField("N° cuota")
    period_start = models.DateField("Inicio del periodo")
    due_date = models.DateField("Fecha de vencimiento")
    days = models.PositiveSmallIntegerField("Días del periodo")
    period_rate = models.DecimalField("Tasa del periodo", max_digits=14, decimal_places=10)
    opening_balance = models.DecimalField("Saldo inicial", max_digits=14, decimal_places=2)
    capital = models.DecimalField("Capital", max_digits=14, decimal_places=2)
    interest = models.DecimalField("Interés", max_digits=14, decimal_places=2)
    capitalized_interest = models.DecimalField("Interés capitalizado", max_digits=14, decimal_places=2, default=ZERO)
    closing_balance = models.DecimalField("Saldo de capital", max_digits=14, decimal_places=2)
    # Caché recalculado desde las imputaciones de pagos y penalidades
    paid_capital = models.DecimalField(max_digits=14, decimal_places=2, default=ZERO)
    paid_interest = models.DecimalField(max_digits=14, decimal_places=2, default=ZERO)
    waived_interest = models.DecimalField("Interés descontado por prepago", max_digits=14, decimal_places=2, default=ZERO)
    penalty_amount = models.DecimalField("Penalidad", max_digits=14, decimal_places=2, default=ZERO)
    paid_penalty = models.DecimalField(max_digits=14, decimal_places=2, default=ZERO)
    payment_date = models.DateField("Fecha de pago", null=True, blank=True)
    days_late = models.IntegerField("Días de atraso", default=0)
    status = models.CharField("Estado", max_length=12, choices=InstStatus.choices, default=InstStatus.PENDIENTE)

    class Meta:
        db_table = "payment_schedules"
        ordering = ["operation", "version", "number"]
        constraints = [models.UniqueConstraint(fields=["operation", "version", "number"], name="uniq_schedule_row")]

    def __str__(self):
        return f"{self.operation.code} cuota {self.number}"

    @property
    def expected_total(self):
        return self.capital + self.interest + self.penalty_amount

    @property
    def paid_total(self):
        return self.paid_capital + self.paid_interest + self.paid_penalty

    @property
    def balance(self):
        return max(ZERO, self.expected_total - self.paid_total - self.waived_interest)

    @property
    def pending_capital(self):
        return self.capital - self.paid_capital

    @property
    def pending_interest(self):
        return max(ZERO, self.interest - self.paid_interest - self.waived_interest)


class Payment(models.Model):
    VALID, VOID = "VALIDO", "ANULADO"
    STATUS = [(VALID, "Válido"), (VOID, "Anulado")]
    CONCEPTS = [("CUOTA", "Pago de cuota"), ("PREPAGO", "Pago adelantado"), ("CANCELACION", "Cancelación total"),
                ("PENALIDAD", "Pago de penalidad"), ("OTRO", "Otro")]
    METHODS = [("TRANSFERENCIA", "Transferencia"), ("DEPOSITO", "Depósito en cuenta"), ("EFECTIVO", "Efectivo"),
               ("CHEQUE", "Cheque"), ("BILLETERA", "Yape / Plin"), ("OTRO", "Otro")]

    code = models.CharField("Código", max_length=20, unique=True, editable=False)
    operation = models.ForeignKey(Operation, on_delete=models.PROTECT, related_name="payments", verbose_name="Operación")
    client = models.ForeignKey(Client, on_delete=models.PROTECT, related_name="payments", verbose_name="Cliente")
    payment_date = models.DateField("Fecha de pago")
    amount = models.DecimalField("Monto", max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    currency = models.CharField("Moneda", max_length=3, choices=CURRENCIES)
    concept = models.CharField("Concepto", max_length=12, choices=CONCEPTS, default="CUOTA")
    capital = models.DecimalField("Capital", max_digits=14, decimal_places=2, default=ZERO)
    interest = models.DecimalField("Interés", max_digits=14, decimal_places=2, default=ZERO)
    penalty = models.DecimalField("Penalidad", max_digits=14, decimal_places=2, default=ZERO)
    bank_reference = models.CharField("N° de operación bancaria", max_length=60, blank=True)
    bank = models.CharField("Banco", max_length=80, blank=True)
    method = models.CharField("Medio de pago", max_length=14, choices=METHODS, default="TRANSFERENCIA")
    notes = models.TextField("Observaciones", blank=True)
    status = models.CharField("Estado", max_length=8, choices=STATUS, default=VALID, db_index=True)
    registered_by = models.ForeignKey(USER, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    voided_by = models.ForeignKey(USER, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    voided_at = models.DateTimeField(null=True, blank=True)
    void_reason = models.TextField("Motivo de anulación", blank=True)

    class Meta:
        db_table = "payments"
        ordering = ["-payment_date", "-id"]

    def __str__(self):
        return self.code

    def delete(self, *args, **kwargs):
        raise PermissionError("Los pagos no se eliminan: use ANULAR PAGO.")

    @property
    def is_void(self):
        return self.status == self.VOID


class PaymentAllocation(models.Model):
    COMPONENTS = [("CAPITAL", "Capital"), ("INTEREST", "Interés"), ("PENALTY", "Penalidad"),
                  ("INT_WAIVED", "Interés no devengado (descuento por cancelación anticipada)")]
    payment = models.ForeignKey(Payment, on_delete=models.PROTECT, related_name="allocations")
    installment = models.ForeignKey(PaymentSchedule, on_delete=models.PROTECT, related_name="allocations")
    component = models.CharField(max_length=10, choices=COMPONENTS)
    amount = models.DecimalField(max_digits=14, decimal_places=2)

    class Meta:
        db_table = "payment_allocations"

    def delete(self, *args, **kwargs):
        raise PermissionError("Las imputaciones de pago no se eliminan.")


class Penalty(models.Model):
    STATUS = [("VIGENTE", "Vigente"), ("PAGADA", "Pagada"), ("CONDONADA", "Condonada"),
              ("SIN_EFECTO", "Sin efecto (recalculada a cero)")]
    operation = models.ForeignKey(Operation, on_delete=models.PROTECT, related_name="penalties")
    installment = models.OneToOneField(PaymentSchedule, on_delete=models.PROTECT, related_name="penalty")
    penalty_type = models.CharField("Tipo de penalidad", max_length=14, choices=PENALTY_TYPES)
    base = models.CharField("Base de cálculo", max_length=12, choices=PENALTY_BASES)
    value = models.DecimalField("Porcentaje o monto", max_digits=12, decimal_places=4)
    grace_days = models.PositiveSmallIntegerField("Días de tolerancia", default=0)
    day_base = models.PositiveSmallIntegerField(default=360)
    applies_from = models.DateField("Se aplica desde")
    days_late = models.IntegerField("Días de atraso", default=0)
    calculated_amount = models.DecimalField("Penalidad calculada", max_digits=14, decimal_places=2, default=ZERO)
    waived_amount = models.DecimalField("Monto condonado", max_digits=14, decimal_places=2, default=ZERO)
    paid_amount = models.DecimalField("Penalidad pagada", max_digits=14, decimal_places=2, default=ZERO)
    status = models.CharField("Estado", max_length=10, choices=STATUS, default="VIGENTE")
    formula = models.TextField("Fórmula aplicada", blank=True)
    last_calculated = models.DateField(null=True, blank=True)
    notes = models.TextField("Observaciones", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "penalties"
        ordering = ["-applies_from"]

    def __str__(self):
        return f"Penalidad {self.installment}"

    @property
    def net_amount(self):
        return self.calculated_amount - self.waived_amount

    @property
    def pending_amount(self):
        return max(ZERO, self.net_amount - self.paid_amount)

    def delete(self, *args, **kwargs):
        raise PermissionError("Las penalidades históricas no se eliminan.")


# --------------------------------------------------------------------------------------
# Garantías y fideicomisos
# --------------------------------------------------------------------------------------
class Property(TimeStamped):
    TYPES = [("CASA", "Casa"), ("DEPARTAMENTO", "Departamento"), ("TERRENO_URBANO", "Terreno urbano"),
             ("TERRENO_RUSTICO", "Terreno rústico"), ("LOCAL_COMERCIAL", "Local comercial"),
             ("OFICINA", "Oficina"), ("INDUSTRIAL", "Inmueble industrial"), ("OTRO", "Otro")]
    property_type = models.CharField("Tipo de inmueble", max_length=16, choices=TYPES)
    owner_name = models.CharField("Propietario", max_length=200)
    owner_doc = models.CharField("DNI/RUC propietario", max_length=20)
    address = models.CharField("Dirección", max_length=250)
    district = models.CharField("Distrito", max_length=80)
    province = models.CharField("Provincia", max_length=80)
    department = models.CharField("Departamento", max_length=80)
    registry_number = models.CharField("Partida registral SUNARP", max_length=30, db_index=True)
    registry_office = models.CharField("Oficina registral", max_length=80)
    value_currency = models.CharField("Moneda de valorización", max_length=3, choices=CURRENCIES, default="USD")
    commercial_value = models.DecimalField("Valor comercial", max_digits=14, decimal_places=2)
    realization_value = models.DecimalField("Valor de realización", max_digits=14, decimal_places=2)
    appraisal_date = models.DateField("Fecha de tasación")
    appraiser = models.CharField("Tasador", max_length=150)
    notes = models.TextField("Observaciones", blank=True)

    class Meta:
        db_table = "properties"
        verbose_name_plural = "properties"

    def __str__(self):
        return f"{self.get_property_type_display()} · Partida {self.registry_number}"


class Mortgage(TimeStamped):
    INSCRIPTION = [("PENDIENTE", "Pendiente"), ("EN_TRAMITE", "En trámite"), ("OBSERVADA", "Observada"),
                   ("INSCRITA", "Inscrita"), ("LEVANTADA", "Levantada")]
    RANKS = [(1, "Primer rango"), (2, "Segundo rango"), (3, "Tercer rango"), (4, "Cuarto rango")]
    operation = models.ForeignKey(Operation, on_delete=models.PROTECT, related_name="mortgages")
    property = models.ForeignKey(Property, on_delete=models.PROTECT, related_name="mortgages")
    secured_amount = models.DecimalField("Monto garantizado", max_digits=14, decimal_places=2)
    rank = models.PositiveSmallIntegerField("Rango hipotecario", choices=RANKS, default=1)
    inscription_status = models.CharField("Estado de inscripción", max_length=10, choices=INSCRIPTION, default="PENDIENTE")
    registry_seat = models.CharField("Asiento registral", max_length=30, blank=True)
    notes = models.TextField("Observaciones", blank=True)

    class Meta:
        db_table = "mortgages"

    def __str__(self):
        return f"Hipoteca {self.get_rank_display().lower()} · {self.property.registry_number}"


class Trust(TimeStamped):
    STATUS = [("EN_CONSTITUCION", "En constitución"), ("PENDIENTE_INSCRIPCION", "Pendiente de inscripción"),
              ("VIGENTE", "Vigente"), ("EN_EJECUCION", "En ejecución"), ("LIQUIDADO", "Liquidado"),
              ("EXTINGUIDO", "Extinguido")]
    fiduciary_entity = models.CharField("Entidad fiduciaria", max_length=150)
    code = models.CharField("Número o código del fideicomiso", max_length=60, unique=True)
    constitution_date = models.DateField("Fecha de constitución")
    trust_estate = models.CharField("Patrimonio fideicometido", max_length=200)
    settlor = models.CharField("Fideicomitente", max_length=200)
    trustee = models.CharField("Fiduciario", max_length=200)
    beneficiary = models.CharField("Fideicomisario / beneficiario", max_length=250)
    contributed_assets = models.TextField("Bienes aportados")
    status = models.CharField("Estado", max_length=22, choices=STATUS, default="EN_CONSTITUCION")
    effective_date = models.DateField("Fecha de vigencia", null=True, blank=True)
    expiry_date = models.DateField("Fecha de vencimiento", null=True, blank=True)
    operations = models.ManyToManyField(Operation, blank=True, related_name="trusts", db_table="trust_operations", verbose_name="Operaciones")
    notes = models.TextField("Observaciones", blank=True)

    class Meta:
        db_table = "trusts"
        ordering = ["-constitution_date"]

    def __str__(self):
        return f"{self.code} · {self.fiduciary_entity}"

    def get_absolute_url(self):
        return reverse("core:trust_detail", args=[self.pk])


# --------------------------------------------------------------------------------------
# Documentos
# --------------------------------------------------------------------------------------
DOCUMENT_TYPES = [
    ("DNI", "DNI"), ("CONTRATO", "Contrato"), ("TASACION", "Tasación"), ("COPIA_LITERAL", "Copia literal"),
    ("CERT_REGISTRAL", "Certificado registral"), ("SUNARP", "Documento SUNARP"),
    ("CONTRATO_FIDEICOMISO", "Contrato de fideicomiso"), ("COMPROBANTE", "Comprobante"), ("VOUCHER", "Voucher"),
    ("ADENDA", "Adenda"), ("OTRO", "Otro"),
]


def document_path(instance, filename):
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    return f"documentos/{instance.uploaded_at:%Y/%m}/{uuid.uuid4().hex}.{ext}" if instance.uploaded_at else f"documentos/{uuid.uuid4().hex}.{ext}"


class Document(models.Model):
    doc_type = models.CharField("Tipo de documento", max_length=22, choices=DOCUMENT_TYPES)
    title = models.CharField("Descripción", max_length=200, blank=True)
    file = models.FileField("Archivo", upload_to=document_path)
    original_name = models.CharField(max_length=255)
    size = models.PositiveIntegerField(default=0)
    client = models.ForeignKey(Client, null=True, blank=True, on_delete=models.PROTECT, related_name="documents")
    investor = models.ForeignKey(Investor, null=True, blank=True, on_delete=models.PROTECT, related_name="documents")
    operation = models.ForeignKey(Operation, null=True, blank=True, on_delete=models.PROTECT, related_name="documents")
    trust = models.ForeignKey(Trust, null=True, blank=True, on_delete=models.PROTECT, related_name="documents")
    payment = models.ForeignKey(Payment, null=True, blank=True, on_delete=models.PROTECT, related_name="documents")
    uploaded_by = models.ForeignKey(USER, on_delete=models.PROTECT, related_name="+")
    uploaded_at = models.DateTimeField()
    is_void = models.BooleanField(default=False)
    void_reason = models.CharField(max_length=250, blank=True)

    class Meta:
        db_table = "documents"
        ordering = ["-uploaded_at"]

    def __str__(self):
        return f"{self.get_doc_type_display()} · {self.original_name}"

    def delete(self, *args, **kwargs):
        raise PermissionError("Los documentos no se eliminan: se anulan.")
