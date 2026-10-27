from functools import wraps

from django.core.exceptions import PermissionDenied


def require(*codes):
    """Decorador de vista: exige todos los permisos indicados."""

    def decorator(view):
        @wraps(view)
        def wrapped(request, *args, **kwargs):
            if not all(request.user.can(c) for c in codes):
                raise PermissionDenied
            return view(request, *args, **kwargs)

        return wrapped

    return decorator


class RequirePerm:
    """Mixin para vistas basadas en clase."""

    required_perms = ()

    def dispatch(self, request, *args, **kwargs):
        if not all(request.user.can(c) for c in self.required_perms):
            raise PermissionDenied
        return super().dispatch(request, *args, **kwargs)
