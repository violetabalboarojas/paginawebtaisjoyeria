from django.core.exceptions import PermissionDenied
from django.core.paginator import Paginator
from django.db.models import Q

from ..models import Client, Operation


def scoped_operations(user, qs=None):
    """El ASESOR (sin 'operations.all') solo ve las operaciones que tiene asignadas."""
    qs = qs if qs is not None else Operation.objects.all()
    if user.can("operations.all"):
        return qs
    return qs.filter(advisor=user)


def scoped_clients(user, qs=None):
    qs = qs if qs is not None else Client.objects.all()
    if user.can("operations.all"):
        return qs
    return qs.filter(Q(advisor=user) | Q(operations__advisor=user)).distinct()


def check_operation_access(user, op):
    if not user.can("operations.view"):
        raise PermissionDenied
    if not user.can("operations.all") and op.advisor_id != user.id:
        raise PermissionDenied


def check_client_access(user, client):
    if not user.can("clients.view"):
        raise PermissionDenied
    if not scoped_clients(user).filter(pk=client.pk).exists():
        raise PermissionDenied


def paginate(request, qs, per_page=25):
    return Paginator(qs, per_page).get_page(request.GET.get("page"))
