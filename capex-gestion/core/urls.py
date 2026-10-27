from django.urls import path

from .views import dashboard, imports, operations, payments, people, records, reports

app_name = "core"
urlpatterns = [
    path("", dashboard.dashboard, name="dashboard"),
    path("alertas/", dashboard.alerts, name="alerts"),
    path("buscar/", dashboard.search, name="search"),
    path("logo/", records.logo, name="logo"),
    # Bonistas
    path("bonistas/", people.investor_list, name="investor_list"),
    path("bonistas/nuevo/", people.investor_form, name="investor_create"),
    path("bonistas/<int:pk>/", people.investor_detail, name="investor_detail"),
    path("bonistas/<int:pk>/editar/", people.investor_form, name="investor_edit"),
    # Clientes
    path("clientes/", people.client_list, name="client_list"),
    path("clientes/nuevo/", people.client_form, name="client_create"),
    path("clientes/<int:pk>/", people.client_detail, name="client_detail"),
    path("clientes/<int:pk>/editar/", people.client_form, name="client_edit"),
    # Operaciones
    path("operaciones/", operations.operation_list, name="operation_list"),
    path("operaciones/nueva/", operations.operation_create, name="operation_create"),
    path("operaciones/<int:pk>/", operations.operation_detail, name="operation_detail"),
    path("operaciones/<int:pk>/datos/", operations.operation_edit_info, name="operation_edit_info"),
    path("operaciones/<int:pk>/condiciones/", operations.operation_edit_terms, name="operation_edit_terms"),
    path("operaciones/<int:pk>/reestructurar/", operations.operation_restructure, name="operation_restructure"),
    path("operaciones/<int:pk>/cerrar/", operations.operation_close, name="operation_close"),
    path("operaciones/<int:pk>/reabrir/", operations.operation_reopen, name="operation_reopen"),
    path("operaciones/<int:pk>/estado-de-cuenta/", operations.statement, name="statement"),
    path("operaciones/<int:pk>/garantia/", operations.guarantee_form, name="guarantee_create"),
    path("operaciones/<int:pk>/garantia/<int:mortgage_id>/", operations.guarantee_form, name="guarantee_edit"),
    path("api/operaciones/<int:pk>/", operations.api_operation, name="api_operation"),
    # Pagos y penalidades
    path("pagos/", payments.payment_list, name="payment_list"),
    path("pagos/registrar/", payments.payment_create, name="payment_create"),
    path("pagos/simular/", payments.payment_simulate, name="payment_simulate"),
    path("pagos/<int:pk>/", payments.payment_detail, name="payment_detail"),
    path("pagos/<int:pk>/anular/", payments.payment_void, name="payment_void"),
    path("penalidades/", payments.penalty_list, name="penalty_list"),
    path("penalidades/<int:pk>/condonar/", payments.penalty_waive, name="penalty_waive"),
    # Fideicomisos
    path("fideicomisos/", records.trust_list, name="trust_list"),
    path("fideicomisos/nuevo/", records.trust_form, name="trust_create"),
    path("fideicomisos/<int:pk>/", records.trust_detail, name="trust_detail"),
    path("fideicomisos/<int:pk>/editar/", records.trust_form, name="trust_edit"),
    # Documentos
    path("documentos/", records.document_list, name="document_list"),
    path("documentos/cargar/", records.document_upload, name="document_upload"),
    path("documentos/<int:pk>/descargar/", records.document_download, name="document_download"),
    path("documentos/<int:pk>/anular/", records.document_void, name="document_void"),
    # Importación de Excel
    path("importar/", imports.import_list, name="import_list"),
    path("importar/<int:pk>/", imports.import_preview, name="import_preview"),
    # Reportes y configuración
    path("reportes/", reports.reports, name="reports"),
    path("configuracion/", records.settings_view, name="settings"),
    path("configuracion/perfiles/nuevo/", records.profile_form, name="profile_create"),
    path("configuracion/perfiles/<int:pk>/", records.profile_form, name="profile_edit"),
]
