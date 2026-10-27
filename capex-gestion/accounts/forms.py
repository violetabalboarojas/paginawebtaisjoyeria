from django import forms
from django.contrib.auth import password_validation
from django.contrib.auth.forms import AuthenticationForm

from .backends import AccountLocked
from .models import Role, User


class LoginForm(AuthenticationForm):
    username = forms.CharField(label="Usuario o correo electrónico", max_length=254,
                               widget=forms.TextInput(attrs={"autofocus": True, "autocomplete": "username"}))
    error_messages = {
        "invalid_login": "Usuario o contraseña incorrectos. Después de varios intentos fallidos la cuenta se bloquea temporalmente.",
        "inactive": "Esta cuenta está desactivada. Contacte al administrador.",
        "locked": "La cuenta está bloqueada temporalmente por intentos fallidos. Intente más tarde o recupere su contraseña.",
    }

    def clean(self):
        try:
            return super().clean()
        except AccountLocked:
            raise forms.ValidationError(self.error_messages["locked"], code="locked")


class _UserBase(forms.ModelForm):
    class Meta:
        model = User
        fields = ["username", "first_name", "last_name", "email", "phone", "role", "is_active", "must_change_password"]
        labels = {"username": "Usuario", "first_name": "Nombres", "last_name": "Apellidos", "is_active": "Activo"}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["role"].required = True
        self.fields["role"].queryset = Role.objects.all()
        self.fields["first_name"].required = True


class UserCreateForm(_UserBase):
    password1 = forms.CharField(label="Contraseña temporal", widget=forms.PasswordInput(attrs={"autocomplete": "new-password"}))
    password2 = forms.CharField(label="Repetir contraseña", widget=forms.PasswordInput(attrs={"autocomplete": "new-password"}))

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.initial.setdefault("must_change_password", True)

    def clean(self):
        data = super().clean()
        p1, p2 = data.get("password1"), data.get("password2")
        if p1 and p1 != p2:
            self.add_error("password2", "Las contraseñas no coinciden.")
        elif p1:
            try:
                password_validation.validate_password(p1, self.instance)
            except forms.ValidationError as e:
                self.add_error("password1", e)
        return data

    def save(self, commit=True):
        user = super().save(commit=False)
        user.set_password(self.cleaned_data["password1"])
        if commit:
            user.save()
        return user


class UserEditForm(_UserBase):
    pass


class AdminPasswordForm(forms.Form):
    password1 = forms.CharField(label="Nueva contraseña temporal", widget=forms.PasswordInput(attrs={"autocomplete": "new-password"}))
    password2 = forms.CharField(label="Repetir contraseña", widget=forms.PasswordInput(attrs={"autocomplete": "new-password"}))

    def __init__(self, user, *args, **kwargs):
        self.user = user
        super().__init__(*args, **kwargs)

    def clean(self):
        data = super().clean()
        if data.get("password1") != data.get("password2"):
            raise forms.ValidationError("Las contraseñas no coinciden.")
        password_validation.validate_password(data.get("password1"), self.user)
        return data


class RoleForm(forms.ModelForm):
    class Meta:
        model = Role
        fields = ["name", "description"]
        labels = {"name": "Nombre del rol", "description": "Descripción"}

    def clean_name(self):
        return self.cleaned_data["name"].strip().upper()
