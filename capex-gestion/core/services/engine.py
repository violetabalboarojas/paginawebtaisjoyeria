"""
Motor de cálculo financiero.

Funciones puras (sin base de datos) para que cada fórmula se pueda probar y mostrar
al usuario antes de aplicarse. Todo se calcula con Decimal y se redondea a 2 decimales
(ROUND_HALF_UP) en cada monto de cuota.
"""

import calendar
import datetime
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal, getcontext

getcontext().prec = 34

CENT = Decimal("0.01")
ZERO = Decimal("0")
ONE = Decimal("1")
HUNDRED = Decimal("100")
PERIOD_MONTHS = {"MONTHLY": 1, "BIMONTHLY": 2, "QUARTERLY": 3, "SEMIANNUAL": 6, "ANNUAL": 12}
RATE_LABEL = {"TEA": "TEA", "TNA": "TNA", "TEM": "TEM", "TNM": "TNM"}


def money(x):
    return Decimal(x).quantize(CENT, rounding=ROUND_HALF_UP)


def pct(x, places=4):
    return f"{(Decimal(x) * HUNDRED).quantize(Decimal(1).scaleb(-places))}%"


def add_months(date, months, day=None):
    """Suma meses respetando el fin de mes (31 ene + 1 mes = 28/29 feb)."""
    month_index = date.month - 1 + months
    year = date.year + month_index // 12
    month = month_index % 12 + 1
    last = calendar.monthrange(year, month)[1]
    return datetime.date(year, month, min(day or date.day, last))


class TermsError(ValueError):
    pass


@dataclass
class Terms:
    principal: Decimal
    start_date: datetime.date
    term_months: int
    rate_type: str = "TNM"
    rate_value: Decimal = Decimal("0")  # en porcentaje: 2.9 = 2.9 %
    interest_method: str = "SIMPLE"
    day_base: int = 360
    day_count: str = "ACTUAL"
    capitalizations_per_year: int = 12
    periodicity: str = "MONTHLY"
    amortization: str = "BULLET"
    payment_day: int | None = None
    grace_periods: int = 0
    grace_type: str = "PARTIAL"
    penalty_type: str = "NONE"
    penalty_value: Decimal = Decimal("0")
    penalty_base: str = "INSTALLMENT"
    penalty_grace_days: int = 0

    @classmethod
    def from_obj(cls, obj):
        names = cls.__dataclass_fields__.keys()
        return cls(**{n: getattr(obj, n) for n in names})

    # ---------------------------------------------------------------- validación
    def validate(self):
        if self.principal is None or Decimal(self.principal) <= 0:
            raise TermsError("El capital debe ser mayor que cero.")
        if self.term_months < 1:
            raise TermsError("El plazo debe ser de al menos 1 mes.")
        if self.periodicity != "AT_MATURITY":
            step = PERIOD_MONTHS[self.periodicity]
            if self.term_months % step:
                raise TermsError(f"El plazo ({self.term_months} meses) debe ser múltiplo de la periodicidad ({step} meses).")
        if self.grace_periods >= self.periods:
            raise TermsError("Los periodos de gracia deben ser menores que el número de cuotas.")
        if self.payment_day is not None and not 1 <= self.payment_day <= 31:
            raise TermsError("El día de pago debe estar entre 1 y 31.")
        if self.periodicity == "AT_MATURITY" and self.amortization != "BULLET":
            raise TermsError("Con pago único al vencimiento la amortización debe ser bullet.")
        if Decimal(self.rate_value) < 0:
            raise TermsError("La tasa no puede ser negativa.")

    @property
    def months_per_period(self):
        return self.term_months if self.periodicity == "AT_MATURITY" else PERIOD_MONTHS[self.periodicity]

    @property
    def periods(self):
        return self.term_months // self.months_per_period

    # ---------------------------------------------------------------- tasas
    @property
    def r(self):
        return Decimal(self.rate_value) / HUNDRED

    def annual_simple_rate(self):
        """Tasa anual lineal j usada en interés simple."""
        if self.rate_type in ("TNM", "TEM"):
            return self.r * 12
        return self.r  # TEA o TNA

    def effective_annual_rate(self):
        """TEA equivalente usada en interés compuesto."""
        m = Decimal(self.capitalizations_per_year or 12)
        if self.rate_type == "TEA":
            return self.r
        if self.rate_type == "TEM":
            return (ONE + self.r) ** 12 - ONE
        if self.rate_type == "TNA":
            return (ONE + self.r / m) ** m - ONE
        # TNM: se anualiza linealmente (TNA = TNM × 12) y luego se capitaliza m veces
        return (ONE + self.r * 12 / m) ** m - ONE

    def period_rate(self, days):
        days = Decimal(days)
        base = Decimal(self.day_base)
        if self.interest_method == "SIMPLE":
            return self.annual_simple_rate() * days / base
        return (ONE + self.effective_annual_rate()) ** (days / base) - ONE

    def standard_days(self):
        months = Decimal(self.months_per_period)
        return int((Decimal(self.day_base) * months / 12).to_integral_value(rounding=ROUND_HALF_UP)) if self.day_base == 365 else int(30 * months)

    def period_days(self, start, end):
        return (end - start).days if self.day_count == "ACTUAL" else self.standard_days()

    # ---------------------------------------------------------------- fórmulas legibles
    def formula_lines(self, sample_days=None):
        """Texto que se muestra ANTES de registrar la operación."""
        d = sample_days or self.standard_days()
        lines = []
        label = RATE_LABEL[self.rate_type]
        rv = f"{Decimal(self.rate_value).normalize():f}%"
        days_txt = "días reales entre fechas (ACT/" + str(self.day_base) + ")" if self.day_count == "ACTUAL" \
            else f"días estándar por periodo ({self.standard_days()} días, base {self.day_base})"
        lines.append(f"Conteo de días: {days_txt}.")
        if self.interest_method == "SIMPLE":
            j = self.annual_simple_rate()
            if self.rate_type in ("TNM", "TEM"):
                lines.append(f"Tasa anual lineal j = {label} × 12 = {rv} × 12 = {pct(j)}")
            else:
                lines.append(f"Tasa anual lineal j = {label} = {pct(j)}")
            lines.append(f"Tasa del periodo i(d) = j × d / {self.day_base}")
            lines.append(f"Ejemplo: i({d}) = {pct(j)} × {d} / {self.day_base} = {pct(self.period_rate(d), 6)}")
        else:
            tea = self.effective_annual_rate()
            m = self.capitalizations_per_year
            if self.rate_type == "TEA":
                lines.append(f"TEA = {rv}")
            elif self.rate_type == "TEM":
                lines.append(f"TEA = (1 + TEM)^12 − 1 = (1 + {rv})^12 − 1 = {pct(tea)}")
            elif self.rate_type == "TNA":
                lines.append(f"TEA = (1 + TNA/{m})^{m} − 1 = (1 + {rv}/{m})^{m} − 1 = {pct(tea)}")
            else:
                lines.append(f"TEA = (1 + TNM × 12/{m})^{m} − 1 = (1 + {rv} × 12/{m})^{m} − 1 = {pct(tea)}")
            lines.append(f"Tasa del periodo i(d) = (1 + TEA)^(d / {self.day_base}) − 1")
            lines.append(f"Ejemplo: i({d}) = (1 + {pct(tea)})^({d}/{self.day_base}) − 1 = {pct(self.period_rate(d), 6)}")
        lines.append("Interés de la cuota = saldo de capital al inicio del periodo × i(d)")
        if self.amortization == "BULLET":
            lines.append("Amortización bullet: cada cuota paga solo intereses; el capital se paga completo en la última cuota.")
        elif self.amortization == "FRENCH":
            lines.append("Cuota francesa = Saldo × i / (1 − (1 + i)^−n), con i del periodo estándar y n cuotas de amortización. "
                         "Capital = cuota − interés; la última cuota ajusta el saldo.")
        else:
            lines.append("Amortización alemana: capital constante = saldo / n; interés sobre saldo decreciente.")
        if self.grace_periods:
            if self.grace_type == "PARTIAL":
                lines.append(f"Gracia parcial: las primeras {self.grace_periods} cuotas pagan solo intereses.")
            else:
                lines.append(f"Gracia total: en las primeras {self.grace_periods} cuotas no se paga nada y el interés se suma al capital.")
        lines.extend(penalty_formula_lines(self.penalty_type, self.penalty_value, self.penalty_base, self.penalty_grace_days, self.day_base))
        lines.append("Interés devengado al corte = interés de cuotas vencidas + interés de la cuota en curso × días transcurridos / días del periodo.")
        return lines


# ------------------------------------------------------------------------ cronograma
@dataclass
class Row:
    number: int
    period_start: datetime.date
    due_date: datetime.date
    days: int
    period_rate: Decimal
    opening_balance: Decimal
    capital: Decimal
    interest: Decimal
    capitalized_interest: Decimal
    closing_balance: Decimal

    @property
    def total(self):
        return self.capital + self.interest


def due_dates(t: Terms):
    step = t.months_per_period
    day = t.payment_day or t.start_date.day
    return [add_months(t.start_date, step * k, day) for k in range(1, t.periods + 1)]


def build_schedule(t: Terms):
    t.validate()
    dates = due_dates(t)
    n = len(dates)
    balance = money(t.principal)
    rows = []
    prev = t.start_date
    amort_n = n - t.grace_periods
    french_payment = None
    german_capital = None
    for k, due in enumerate(dates, start=1):
        days = t.period_days(prev, due)
        i = t.period_rate(days)
        interest = money(balance * i)
        opening = balance
        capital = ZERO
        capitalized = ZERO
        in_grace = k <= t.grace_periods
        if in_grace and t.grace_type == "TOTAL":
            capitalized = interest
            interest = ZERO
            balance = balance + capitalized
        elif in_grace:
            pass
        else:
            if t.amortization == "BULLET":
                capital = balance if k == n else ZERO
            elif t.amortization == "GERMAN":
                if german_capital is None:
                    german_capital = money(balance / amort_n)
                capital = balance if k == n else min(german_capital, balance)
            else:  # FRENCH
                if french_payment is None:
                    i_std = t.period_rate(t.standard_days())
                    if i_std == 0:
                        french_payment = money(balance / amort_n)
                    else:
                        french_payment = money(balance * i_std / (ONE - (ONE + i_std) ** (-amort_n)))
                capital = balance if k == n else max(ZERO, min(balance, french_payment - interest))
            balance = balance - capital
        rows.append(Row(k, prev, due, days, i, opening, capital, interest, capitalized, balance))
        prev = due
    return rows


def regular_installment(rows, t: Terms):
    """Monto de la cuota regular para mostrar en la ficha (interés en bullet, cuota en francés)."""
    post = [r for r in rows if r.number > t.grace_periods]
    if not post:
        return ZERO
    if t.amortization == "BULLET":
        return post[0].interest if len(post) > 1 else post[0].total
    return post[0].total


# ------------------------------------------------------------------------ devengo
def accrued_interest(rows, as_of):
    """Interés devengado al corte (lineal dentro del periodo en curso)."""
    total = ZERO
    for r in rows:
        interest = r.interest + r.capitalized_interest
        if as_of >= r.due_date:
            total += interest
        elif as_of > r.period_start:
            span = (r.due_date - r.period_start).days or 1
            total += money(interest * Decimal((as_of - r.period_start).days) / Decimal(span))
    return money(total)


# ------------------------------------------------------------------------ penalidades
def penalty_formula_lines(ptype, value, base, grace, day_base):
    v = f"{Decimal(value).normalize():f}"
    base_txt = {"INSTALLMENT": "la cuota vencida impaga (capital + interés)", "CAPITAL": "el capital vencido impago",
                "INTEREST": "el interés vencido impago"}[base]
    grace_txt = f" Se aplica desde el día {grace + 1} de atraso (tolerancia de {grace} días)." if grace else " Se aplica desde el primer día de atraso."
    if ptype == "NONE":
        return ["Penalidad: no se pactó penalidad."]
    if ptype == "FIXED":
        return [f"Penalidad fija = {v} por cada cuota vencida, una sola vez.{grace_txt}"]
    if ptype == "PERCENT":
        return [f"Penalidad porcentual = {v}% × {base_txt} al momento de aplicarse, una sola vez.{grace_txt}"]
    if ptype == "DAILY_PERCENT":
        return [f"Penalidad diaria = Σ ({base_txt} de cada día × {v}%) por cada día de atraso, hasta que se pague.{grace_txt}"]
    if ptype == "DAILY_FIXED":
        return [f"Penalidad diaria fija = {v} × días de atraso mientras {base_txt} siga impaga.{grace_txt}"]
    return [f"Interés moratorio = Σ ({base_txt} × {v}% / {day_base}) por cada día de atraso (interés simple).{grace_txt}"]


@dataclass
class PenaltyResult:
    amount: Decimal
    days_late: int
    applies_from: datetime.date
    formula: str
    detail: list = field(default_factory=list)


def compute_penalty(ptype, value, base, grace_days, day_base, due_date, base_amounts, paid_events, as_of):
    """
    base_amounts: dict {"CAPITAL": x, "INTEREST": y} de la cuota.
    paid_events: lista de (fecha, componente, monto) de pagos válidos a capital/interés de la cuota.
    Calcula día por día el saldo base impago para que los pagos parciales reduzcan la penalidad.
    """
    applies_from = due_date + datetime.timedelta(days=grace_days + 1)
    value = Decimal(value)
    comps = ("CAPITAL", "INTEREST") if base == "INSTALLMENT" else (base,)

    def base_before(day):
        """Saldo base impago al inicio de `day` (pagos con fecha anterior a `day`)."""
        owed = sum((Decimal(base_amounts.get(c, 0)) for c in comps), ZERO)
        paid = sum((amt for (d, c, amt) in paid_events if c in comps and d < day), ZERO)
        return max(ZERO, owed - paid)

    settled_on = None
    owed_total = sum((Decimal(base_amounts.get(c, 0)) for c in comps), ZERO)
    running = ZERO
    for d, c, amt in sorted(paid_events):
        if c in comps:
            running += amt
            if running >= owed_total and settled_on is None:
                settled_on = d
    end = min(as_of, settled_on) if settled_on else as_of
    days_late = max(0, (end - due_date).days)
    if ptype == "NONE" or end < applies_from or owed_total <= 0:
        return PenaltyResult(ZERO, days_late, applies_from, "", [])

    if ptype in ("FIXED", "PERCENT"):
        b = base_before(applies_from)
        if b <= 0:
            return PenaltyResult(ZERO, days_late, applies_from, "", [])
        if ptype == "FIXED":
            amt = money(value)
            formula = f"Penalidad fija = {amt}"
        else:
            amt = money(b * value / HUNDRED)
            formula = f"{b} × {value.normalize():f}% = {amt}"
        return PenaltyResult(amt, days_late, applies_from, formula, [])

    total = ZERO
    segments = []
    day = applies_from
    seg_start, seg_base, seg_days = None, None, 0
    while day <= end:
        b = base_before(day)
        if b <= 0:
            break
        if ptype == "DAILY_PERCENT":
            inc = b * value / HUNDRED
        elif ptype == "DAILY_FIXED":
            inc = value
        else:  # MORATORY
            inc = b * value / HUNDRED / Decimal(day_base)
        total += inc
        if seg_base is not None and b == seg_base:
            seg_days += 1
        else:
            if seg_base is not None:
                segments.append((seg_start, seg_base, seg_days))
            seg_start, seg_base, seg_days = day, b, 1
        day += datetime.timedelta(days=1)
    if seg_base is not None:
        segments.append((seg_start, seg_base, seg_days))
    amt = money(total)
    if ptype == "DAILY_PERCENT":
        parts = [f"{b} × {value.normalize():f}% × {n} d" for (_, b, n) in segments]
    elif ptype == "DAILY_FIXED":
        parts = [f"{value.normalize():f} × {n} d" for (_, b, n) in segments]
    else:
        parts = [f"{b} × {value.normalize():f}% / {day_base} × {n} d" for (_, b, n) in segments]
    formula = " + ".join(parts) + f" = {amt}" if parts else ""
    return PenaltyResult(amt, days_late, applies_from, formula, segments)


# ------------------------------------------------------------------------ imputación de pagos
def allocate(amount, buckets, order):
    """
    Reparte `amount` sobre buckets [(installment_key, component, pending)], primero por cuota
    (más antigua) y dentro de cada cuota según `order`. Devuelve (asignaciones, sobrante).
    """
    rank = {c: i for i, c in enumerate(order)}
    result = []
    left = money(amount)
    for key, comp, pending in sorted(buckets, key=lambda b: (b[0], rank[b[1]])):
        if left <= 0:
            break
        if pending <= 0:
            continue
        take = min(left, pending)
        result.append((key, comp, take))
        left -= take
    return result, left
