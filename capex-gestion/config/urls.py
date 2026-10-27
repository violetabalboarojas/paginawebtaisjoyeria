from django.urls import include, path

urlpatterns = [
    path("", include("core.urls")),
    path("cuenta/", include("accounts.urls")),
    path("auditoria/", include("audit.urls")),
]



handler403 = "core.views.errors.forbidden"
handler404 = "core.views.errors.not_found"
