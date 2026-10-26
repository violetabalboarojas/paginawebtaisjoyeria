-- =====================================================================================
-- CAPEX Gestión · 03_administrador.sql
-- Crea el primer usuario ADMINISTRADOR.
-- 1) Genere el hash:  python3 generar_hash.py
-- 2) Reemplace PEGUE_AQUI_EL_HASH, el usuario, el correo y el nombre.
-- 3) Ejecute:  psql -d capex_gestion -f 03_administrador.sql
-- Al ingresar por primera vez el sistema le pedirá cambiar la contraseña.
-- =====================================================================================

INSERT INTO public.users (
    password, last_login, is_superuser, username, first_name, last_name, email, is_staff, is_active,
    date_joined, phone, failed_attempts, locked_until, must_change_password, role_id)
VALUES (
    'PEGUE_AQUI_EL_HASH', NULL, false, 'admin', 'Administrador', '', 'admin@suempresa.pe', true, true,
    NOW(), '', 0, NULL, true, (SELECT id FROM public.roles WHERE name = 'ADMINISTRADOR'));
