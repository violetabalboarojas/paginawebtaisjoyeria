import datetime
from decimal import Decimal

from django.db import models
from django.db.models.fields.files import FieldFile

from .middleware import client_ip, get_current_request
from .models import AuditLog


def _jsonable(value):
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (datetime.date, datetime.datetime)):
        return value.isoformat()
    if isinstance(value, models.Model):
        return str(value)
    if isinstance(value, FieldFile):
        return value.name or ""
    return value


def snapshot(instance, fields=None):
    """Foto de los campos concretos de un modelo, apta para JSON."""
    data = {}
    for field in instance._meta.concrete_fields:
        if fields and field.name not in fields:
            continue
        if field.name in ("password",):
            continue
        if field.is_relation:
            data[field.name] = getattr(instance, field.attname)
        else:
            data[field.name] = _jsonable(getattr(instance, field.name))
    return data


def diff(old, new):
    """Devuelve (anterior, nuevo) solo con los campos que cambiaron."""
    old = old or {}
    new = new or {}
    keys = set(old) | set(new)
    changed = {k for k in keys if old.get(k) != new.get(k)}
    return ({k: old.get(k) for k in sorted(changed)}, {k: new.get(k) for k in sorted(changed)})


def log(action, module, instance=None, old=None, new=None, detail="", user=None, record_id=None, record_label=None, username=None):
    request = get_current_request()
    if user is None and request is not None and getattr(request, "user", None) and request.user.is_authenticated:
        user = request.user
    return AuditLog.objects.create(
        user=user if (user and user.pk) else None,
        username=username or (user.get_username() if user else "sistema"),
        action=action,
        module=module,
        record_id=str(record_id if record_id is not None else (instance.pk if instance is not None else "")),
        record_label=(record_label or (str(instance) if instance is not None else ""))[:200],
        old_value=old,
        new_value=new,
        ip_address=client_ip(request),
        detail=detail,
    )


def log_changes(module, instance, before, action="UPDATE", detail=""):
    """Registra solo si hubo cambios. `before` es un snapshot previo."""
    old, new = diff(before, snapshot(instance))
    if not old and not new:
        return None
    return log(action, module, instance, old, new, detail)
