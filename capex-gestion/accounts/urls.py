from django.urls import path

from . import views

app_name = "accounts"
urlpatterns = [
    path("ingresar/", views.LoginView.as_view(), name="login"),
    path("salir/", views.logout_view, name="logout"),
    path("recuperar/", views.PasswordResetView.as_view(), name="password_reset"),
    path("recuperar/enviado/", views.PasswordResetDoneView.as_view(), name="password_reset_done"),
    path("restablecer/<uidb64>/<token>/", views.PasswordResetConfirmView.as_view(), name="password_reset_confirm"),
    path("restablecer/listo/", views.PasswordResetCompleteView.as_view(), name="password_reset_complete"),
    path("contrasena/", views.PasswordChangeView.as_view(), name="password_change"),
    path("usuarios/", views.user_list, name="user_list"),
    path("usuarios/nuevo/", views.user_form, name="user_create"),
    path("usuarios/<int:pk>/", views.user_form, name="user_edit"),
    path("usuarios/<int:pk>/contrasena/", views.user_password, name="user_password"),
    path("usuarios/<int:pk>/cerrar-sesiones/", views.user_kill_sessions, name="user_kill_sessions"),
    path("roles/", views.roles, name="roles"),
    path("roles/nuevo/", views.role_create, name="role_create"),
]
