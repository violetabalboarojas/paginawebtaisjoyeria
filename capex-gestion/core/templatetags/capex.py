from decimal import Decimal, InvalidOperation

from django import template
from django.utils.html import format_html

from core.models import CURRENCY_SYMBOL

register = template.Library()


def _fmt(value, places=2):
    try:
        d = Decimal(value)
    except (InvalidOperation, TypeError, ValueError):
        return "–"
    q = Decimal(1).scaleb(-places)
    s = f"{d.quantize(q):,.{places}f}"
    return s


@register.filter
def money(value, currency=None):
    if value is None or value == "":
        return "–"
    sym = CURRENCY_SYMBOL.get(currency or "", "")
    return f"{sym} {_fmt(value)}".strip()


@register.filter
def num(value, places=2):
    return _fmt(value, int(places))


@register.filter
def pct(value, places=2):
    if value is None:
        return "–"
    return f"{_fmt(value, int(places))}%"


@register.filter
def rate_pct(value):
    """Tasa de periodo guardada como fracción → porcentaje con 4 decimales."""
    try:
        return f"{Decimal(value) * 100:.4f}%"
    except (InvalidOperation, TypeError):
        return "–"


@register.filter
def can(user, code):
    return bool(getattr(user, "is_authenticated", False) and user.can(code))


SEMAFORO = {
    # estado: (color, etiqueta del semáforo)
    "AL_DIA": ("green", "Al día"), "ACTIVA": ("green", "Activa"), "PAGADO": ("green", "Pagado"),
    "POR_VENCER": ("yellow", "Por vencer"), "PAGO_PARCIAL": ("yellow", "Pago parcial"), "PENDIENTE": ("gray", "Pendiente"),
    "VENCIDA": ("red", "Vencida"), "VENCIDO": ("red", "Vencida"), "EN_MORA": ("black", "En mora crítica"),
    "CANCELADA": ("gray", "Cancelada"), "REESTRUCTURADA": ("violet", "Reestructurada"),
    "VIGENTE": ("yellow", "Vigente"), "PAGADA": ("green", "Pagada"), "CONDONADA": ("gray", "Condonada"), "SIN_EFECTO": ("gray", "Sin efecto"),
    "VALIDO": ("green", "Válido"), "ANULADO": ("black", "Anulado"),
    "INSCRITA": ("green", "Inscrita"), "PENDIENTE_INS": ("yellow", "Pendiente"), "EN_TRAMITE": ("yellow", "En trámite"),
    "OBSERVADA": ("red", "Observada"), "LEVANTADA": ("black", "Levantada"),
    "ACTIVO": ("green", "Activo"), "INACTIVO": ("black", "Inactivo"), "OBSERVADO": ("yellow", "Observado"),
}


@register.simple_tag
def chip(status, label=None):
    color, default = SEMAFORO.get(status, ("gray", status))
    return format_html('<span class="chip chip-{}"><i></i>{}</span>', color, label or default)


@register.simple_tag(takes_context=True)
def qs(context, **kwargs):
    """Conserva los filtros actuales al paginar o exportar."""
    q = context["request"].GET.copy()
    for k, v in kwargs.items():
        if v is None:
            q.pop(k, None)
        else:
            q[k] = v
    return "?" + q.urlencode()


@register.filter
def get(d, key):
    try:
        return d.get(key)
    except AttributeError:
        return None


@register.filter
def filesize(n):
    n = int(n or 0)
    if n < 1024:
        return f"{n} B"
    if n < 1024 * 1024:
        return f"{n / 1024:.0f} KB"
    return f"{n / 1024 / 1024:.1f} MB"


@register.simple_tag
def dot(status):
    color, label = SEMAFORO.get(status, ("gray", status))
    return format_html('<span class="chip chip-{}" title="{}" style="padding:4px"><i></i></span>', color, label)


@register.filter
def field(form, name):
    try:
        return form[name]
    except KeyError:
        return None


@register.filter
def has_any(form, names):
    return any(n in form.fields for n in names)


@register.filter
def split_pairs(value):
    """'a:A,b:B' → [('a','A'), ('b','B')]"""
    return [tuple(p.split(":", 1)) for p in value.split(",")]


@register.filter
def split(value, sep=" "):
    return value.split(sep)


@register.filter
def dmy(value):
    """'2026-08-24' → '24/08/2026' (fechas guardadas como texto ISO)."""
    s = str(value or "")
    return f"{s[8:10]}/{s[5:7]}/{s[:4]}" if len(s) >= 10 and s[4] == "-" else (s or "–")


@register.filter
def frac_pct(value, places=2):
    """Fracción → porcentaje: 0.777778 → 77.78%"""
    try:
        return f"{Decimal(value) * 100:.{int(places)}f}%"
    except (InvalidOperation, TypeError):
        return "–"


@register.filter
def mul(a, b):
    try:
        return Decimal(a) * Decimal(b)
    except (InvalidOperation, TypeError):
        return None


@register.filter
def add_dec(a, b):
    try:
        return Decimal(a) + Decimal(b)
    except (InvalidOperation, TypeError):
        return None
