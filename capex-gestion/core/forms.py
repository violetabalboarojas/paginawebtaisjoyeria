from django import forms
from django.contrib.auth import get_user_model
from django.utils import timezone

from .models import (
    DOCUMENT_TYPES, ECONOMIC_FIELDS, Client, Document, FinancialProfile, Investor, Mortgage, Operation, OpStatus,
    Payment, Property, SystemSettings, Trust, CURRENCIES,
)

User = get_user_model()


class DateInput(forms.DateInput):
    input_type = "date"

    def __init__(self, **kwargs):
        super().__init__(format="%Y-%m-%d", **kwargs)


class StyledMixin:
    """Agrega clases y atributos comunes a los widgets."""

    wide_fields = ()

    def _style(self):
        for name, field in self.fields.items():
            w = field.widget
            if isinstance(w, forms.DateInput) and not isinstance(w, DateInput):
                field.widget = DateInput(attrs=w.attrs)
            if isinstance(w, forms.Textarea):
                w.attrs["rows"] = 3
            if isinstance(field, forms.DecimalField):
                w.attrs.setdefault("inputmode", "decimal")
            if name in self.wide_fields or isinstance(w, forms.Textarea):
                field.wide = True


class StyledModelForm(StyledMixin, forms.ModelForm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._style()


class StyledForm(StyledMixin, forms.Form):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._style()


def advisors_qs():
    return User.objects.filter(is_active=True).order_by("first_name", "last_name")


class UserChoice(forms.ModelChoiceField):
    def label_from_instance(self, obj):
        return f"{obj.get_full_name() or obj.username} ({obj.role or 'sin rol'})"


# ----------------------------------------------------------------------------------- personas
class InvestorForm(StyledModelForm):
    wide_fields = ("address",)

    class Meta:
        model = Investor
        fields = ["first_name", "last_name", "doc_type", "doc_number", "phone", "whatsapp", "email", "address",
                  "bank", "account_number", "cci", "registered_on", "status", "notes"]
        widgets = {"registered_on": DateInput()}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if not self.instance.pk:
            self.initial.setdefault("registered_on", timezone.localdate())


class ClientForm(StyledModelForm):
    wide_fields = ("full_name", "address")
    advisor = UserChoice(queryset=advisors_qs(), required=False, label="Asesor")

    class Meta:
        model = Client
        fields = ["full_name", "doc_type", "doc_number", "phone", "whatsapp", "email", "address", "economic_activity",
                  "declared_income", "income_currency", "advisor", "status", "notes"]

    def __init__(self, *args, user=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["advisor"].queryset = advisors_qs()
        if user and not user.can("operations.all"):
            self.fields["advisor"].queryset = User.objects.filter(pk=user.pk)
            self.initial.setdefault("advisor", user.pk)


# ----------------------------------------------------------------------------------- operaciones
TERMS_FIELDS = ["principal", "currency", "disbursement_date", "start_date", "term_months", "rate_type", "rate_value",
                "interest_method", "day_base", "day_count", "capitalizations_per_year", "periodicity", "amortization",
                "payment_day", "grace_periods", "grace_type", "penalty_type", "penalty_value", "penalty_base",
                "penalty_grace_days"]


OPERATION_GROUPS = [
    ("Partes", ["investor", "client", "advisor", "profile"]),
    ("Capital y fechas", ["principal", "currency", "disbursement_date", "start_date", "term_months", "payment_day"]),
    ("Tasa e interés", ["rate_type", "rate_value", "interest_method", "day_base", "day_count", "capitalizations_per_year"]),
    ("Cuotas", ["periodicity", "amortization", "grace_periods", "grace_type"]),
    ("Penalidad por atraso", ["penalty_type", "penalty_value", "penalty_base", "penalty_grace_days"]),
    ("Otros", ["capitalize_arrears", "purpose", "notes", "reason"]),
]


class OperationForm(StyledModelForm):
    wide_fields = ("purpose",)
    advisor = UserChoice(queryset=advisors_qs(), required=False, label="Asesor")

    class Meta:
        model = Operation
        fields = ["investor", "client", "advisor", "profile"] + TERMS_FIELDS + ["purpose", "notes"]
        widgets = {"disbursement_date": DateInput(), "start_date": DateInput()}
        help_texts = {
            "penalty_value": "Porcentaje (ej. 0.1 = 0.1%) o monto según el tipo de penalidad.",
            "rate_value": "En porcentaje: 2.9 = 2.9%.",
            "capitalizations_per_year": "Solo aplica a tasas nominales con interés compuesto.",
        }

    def __init__(self, *args, user=None, clients=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["investor"].queryset = Investor.objects.filter(status="ACTIVO")
        self.fields["client"].queryset = clients if clients is not None else Client.objects.exclude(status="INACTIVO")
        self.fields["advisor"].queryset = advisors_qs()
        self.fields["profile"].queryset = FinancialProfile.objects.filter(is_active=True)
        self.fields["profile"].help_text = "Copia sus condiciones a esta operación. Cambiar el perfil después no altera la operación."
        if user and not user.can("operations.all"):
            self.fields["advisor"].queryset = User.objects.filter(pk=user.pk)
            self.initial.setdefault("advisor", user.pk)
        if not self.instance.pk and not self.is_bound:
            cfg = SystemSettings.load()
            prof = FinancialProfile.objects.filter(is_active=True).first()
            today = timezone.localdate()
            self.initial.update({"currency": cfg.default_currency, "disbursement_date": today, "start_date": today,
                                 "term_months": 12})
            if prof:
                self.initial["profile"] = prof.pk
                for f in ("rate_type", "rate_value", "interest_method", "day_base", "day_count", "capitalizations_per_year",
                          "periodicity", "amortization", "penalty_type", "penalty_value", "penalty_base", "penalty_grace_days"):
                    self.initial[f] = getattr(prof, f)

    def clean(self):
        data = super().clean()
        d, s = data.get("disbursement_date"), data.get("start_date")
        if d and s and s < d:
            self.add_error("start_date", "La fecha de inicio no puede ser anterior al desembolso.")
        return data


class TermsEditForm(StyledModelForm):
    reason = forms.CharField(label="Motivo del cambio (queda en auditoría)", widget=forms.Textarea, min_length=5)

    class Meta:
        model = Operation
        fields = TERMS_FIELDS
        widgets = {"disbursement_date": DateInput(), "start_date": DateInput()}


class OperationInfoForm(StyledModelForm):
    """Datos no económicos: editables en cualquier momento, con auditoría."""

    advisor = UserChoice(queryset=advisors_qs(), required=False, label="Asesor")

    class Meta:
        model = Operation
        fields = ["advisor", "purpose", "notes"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["advisor"].queryset = advisors_qs()


class RestructureForm(StyledModelForm):
    capitalize_arrears = forms.BooleanField(label="Capitalizar intereses y penalidades pendientes", required=False)
    reason = forms.CharField(label="Motivo de la reestructuración", widget=forms.Textarea, min_length=5)

    class Meta:
        model = Operation
        fields = [f for f in TERMS_FIELDS if f not in ("principal",)] + ["advisor"]
        widgets = {"disbursement_date": DateInput(), "start_date": DateInput()}


class ReasonForm(StyledForm):
    reason = forms.CharField(label="Motivo", widget=forms.Textarea, min_length=5)


# ----------------------------------------------------------------------------------- garantías
class PropertyForm(StyledModelForm):
    wide_fields = ("address",)

    class Meta:
        model = Property
        fields = ["property_type", "owner_name", "owner_doc", "address", "district", "province", "department",
                  "registry_number", "registry_office", "value_currency", "commercial_value", "realization_value",
                  "appraisal_date", "appraiser", "notes"]
        widgets = {"appraisal_date": DateInput()}


class MortgageForm(StyledModelForm):
    class Meta:
        model = Mortgage
        fields = ["secured_amount", "rank", "inscription_status", "registry_seat", "notes"]
        labels = {"notes": "Observaciones de la hipoteca"}


class TrustForm(StyledModelForm):
    wide_fields = ("trust_estate", "beneficiary", "contributed_assets")

    class Meta:
        model = Trust
        fields = ["fiduciary_entity", "code", "constitution_date", "trust_estate", "settlor", "trustee", "beneficiary",
                  "contributed_assets", "status", "effective_date", "expiry_date", "operations", "notes"]
        widgets = {"constitution_date": DateInput(), "effective_date": DateInput(), "expiry_date": DateInput(),
                   "operations": forms.SelectMultiple(attrs={"size": 6})}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["operations"].queryset = Operation.objects.select_related("client").order_by("-id")
        self.fields["operations"].label_from_instance = lambda o: f"{o.code} · {o.client}"
        self.fields["operations"].help_text = "Ctrl/Cmd + clic para seleccionar varias."
        self.fields["operations"].wide = True


# ----------------------------------------------------------------------------------- pagos
class PaymentForm(StyledModelForm):
    receipt = forms.FileField(label="Comprobante", required=False)

    class Meta:
        model = Payment
        fields = ["operation", "payment_date", "amount", "currency", "concept", "capital", "interest", "penalty",
                  "bank_reference", "bank", "method", "notes"]
        widgets = {"payment_date": DateInput()}
        help_texts = {"capital": "Deje capital, interés y penalidad en 0 para imputar automáticamente."}

    def __init__(self, *args, operations=None, **kwargs):
        super().__init__(*args, **kwargs)
        qs = operations if operations is not None else Operation.objects.all()
        self.fields["operation"].queryset = qs.exclude(status__in=[OpStatus.CANCELADA, OpStatus.REESTRUCTURADA]).select_related("client")
        self.fields["operation"].label_from_instance = lambda o: f"{o.code} · {o.client} · {o.currency}"
        for f in ("capital", "interest", "penalty"):
            self.fields[f].required = False
        if not self.is_bound:
            self.initial.setdefault("payment_date", timezone.localdate())

    def clean(self):
        data = super().clean()
        for f in ("capital", "interest", "penalty"):
            if data.get(f) is None:
                data[f] = 0
        return data


class PenaltyWaiveForm(StyledForm):
    amount = forms.DecimalField(label="Monto total condonado", min_value=0, decimal_places=2)
    reason = forms.CharField(label="Motivo", widget=forms.Textarea, min_length=5)


# ----------------------------------------------------------------------------------- documentos
class DocumentForm(StyledForm):
    doc_type = forms.ChoiceField(label="Tipo de documento", choices=DOCUMENT_TYPES)
    title = forms.CharField(label="Descripción", required=False, max_length=200)
    file = forms.FileField(label="Archivo")


# ----------------------------------------------------------------------------------- configuración
class SettingsForm(StyledModelForm):
    class Meta:
        model = SystemSettings
        exclude = ["last_refresh"]


class FinancialProfileForm(StyledModelForm):
    class Meta:
        model = FinancialProfile
        fields = "__all__"


# ----------------------------------------------------------------------------------- reportes
class ReportFilterForm(StyledForm):
    REPORTS = [
        ("capital_colocado", "Capital colocado"), ("capital_recuperado", "Capital recuperado"),
        ("intereses_generados", "Intereses generados"), ("intereses_cobrados", "Intereses cobrados"),
        ("penalidades", "Penalidades"), ("morosidad", "Morosidad"), ("vigentes", "Operaciones vigentes"),
        ("vencidas", "Operaciones vencidas"), ("pagos", "Pagos"), ("flujo_mensual", "Flujo mensual"),
        ("rentabilidad", "Rentabilidad por inversionista"),
    ]
    report = forms.ChoiceField(label="Reporte", choices=REPORTS)
    start = forms.DateField(label="Fecha inicial", required=False, widget=DateInput())
    end = forms.DateField(label="Fecha final", required=False, widget=DateInput())
    client = forms.ModelChoiceField(label="Cliente", queryset=Client.objects.all(), required=False)
    investor = forms.ModelChoiceField(label="Inversionista", queryset=Investor.objects.all(), required=False)
    status = forms.ChoiceField(label="Estado", choices=[("", "Todos")] + list(OpStatus.choices), required=False)
    currency = forms.ChoiceField(label="Moneda", choices=[("", "Todas")] + CURRENCIES, required=False)
    advisor = UserChoice(label="Asesor", queryset=advisors_qs(), required=False)

    def __init__(self, *args, clients=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["advisor"].queryset = advisors_qs()
        if clients is not None:
            self.fields["client"].queryset = clients
