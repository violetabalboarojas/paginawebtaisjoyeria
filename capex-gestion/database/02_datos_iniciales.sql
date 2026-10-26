-- =====================================================================================
-- CAPEX Gestión · 02_datos_iniciales.sql
-- Catálogos que el sistema necesita para arrancar:
--   · registro de migraciones aplicadas (Django no volverá a crear las tablas)
--   · 27 permisos y 6 roles (ADMINISTRADOR, GERENCIA, FINANZAS, COBRANZAS, ASESOR, CONSULTA)
--   · configuración general y 2 perfiles de condiciones
-- No contiene usuarios ni datos de clientes. Ejecutar después de 01_estructura.sql.
-- =====================================================================================

BEGIN;
-- PostgreSQL database dump

SELECT pg_catalog.set_config('search_path', '', false);

-- Data for Name: django_content_type; Type: TABLE DATA; Schema: public; Owner: -

INSERT INTO public.django_content_type (id, app_label, model) VALUES (1, 'auth', 'permission');
INSERT INTO public.django_content_type (id, app_label, model) VALUES (2, 'auth', 'group');
INSERT INTO public.django_content_type (id, app_label, model) VALUES (3, 'contenttypes', 'contenttype');
INSERT INTO public.django_content_type (id, app_label, model) VALUES (4, 'sessions', 'session');
INSERT INTO public.django_content_type (id, app_label, model) VALUES (5, 'accounts', 'permission');
INSERT INTO public.django_content_type (id, app_label, model) VALUES (6, 'accounts', 'role');
INSERT INTO public.django_content_type (id, app_label, model) VALUES (7, 'accounts', 'user');
INSERT INTO public.django_content_type (id, app_label, model) VALUES (8, 'audit', 'auditlog');
INSERT INTO public.django_content_type (id, app_label, model) VALUES (9, 'core', 'financialprofile');
INSERT INTO public.django_content_type (id, app_label, model) VALUES (10, 'core', 'systemsettings');
INSERT INTO public.django_content_type (id, app_label, model) VALUES (11, 'core', 'client');
INSERT INTO public.django_content_type (id, app_label, model) VALUES (12, 'core', 'investor');
INSERT INTO public.django_content_type (id, app_label, model) VALUES (13, 'core', 'operation');
INSERT INTO public.django_content_type (id, app_label, model) VALUES (14, 'core', 'payment');
INSERT INTO public.django_content_type (id, app_label, model) VALUES (15, 'core', 'paymentschedule');
INSERT INTO public.django_content_type (id, app_label, model) VALUES (16, 'core', 'paymentallocation');
INSERT INTO public.django_content_type (id, app_label, model) VALUES (17, 'core', 'penalty');
INSERT INTO public.django_content_type (id, app_label, model) VALUES (18, 'core', 'property');
INSERT INTO public.django_content_type (id, app_label, model) VALUES (19, 'core', 'mortgage');
INSERT INTO public.django_content_type (id, app_label, model) VALUES (20, 'core', 'trust');
INSERT INTO public.django_content_type (id, app_label, model) VALUES (21, 'core', 'document');
INSERT INTO public.django_content_type (id, app_label, model) VALUES (22, 'core', 'importbatch');
INSERT INTO public.django_content_type (id, app_label, model) VALUES (23, 'core', 'bondholding');

-- Data for Name: auth_permission; Type: TABLE DATA; Schema: public; Owner: -

INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (1, 'Can add permission', 1, 'add_permission');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (2, 'Can change permission', 1, 'change_permission');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (3, 'Can delete permission', 1, 'delete_permission');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (4, 'Can view permission', 1, 'view_permission');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (5, 'Can add group', 2, 'add_group');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (6, 'Can change group', 2, 'change_group');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (7, 'Can delete group', 2, 'delete_group');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (8, 'Can view group', 2, 'view_group');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (9, 'Can add content type', 3, 'add_contenttype');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (10, 'Can change content type', 3, 'change_contenttype');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (11, 'Can delete content type', 3, 'delete_contenttype');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (12, 'Can view content type', 3, 'view_contenttype');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (13, 'Can add session', 4, 'add_session');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (14, 'Can change session', 4, 'change_session');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (15, 'Can delete session', 4, 'delete_session');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (16, 'Can view session', 4, 'view_session');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (17, 'Can add permission', 5, 'add_permission');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (18, 'Can change permission', 5, 'change_permission');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (19, 'Can delete permission', 5, 'delete_permission');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (20, 'Can view permission', 5, 'view_permission');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (21, 'Can add role', 6, 'add_role');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (22, 'Can change role', 6, 'change_role');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (23, 'Can delete role', 6, 'delete_role');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (24, 'Can view role', 6, 'view_role');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (25, 'Can add user', 7, 'add_user');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (26, 'Can change user', 7, 'change_user');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (27, 'Can delete user', 7, 'delete_user');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (28, 'Can view user', 7, 'view_user');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (29, 'Can add registro de auditoría', 8, 'add_auditlog');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (30, 'Can change registro de auditoría', 8, 'change_auditlog');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (31, 'Can delete registro de auditoría', 8, 'delete_auditlog');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (32, 'Can view registro de auditoría', 8, 'view_auditlog');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (33, 'Can add financial profile', 9, 'add_financialprofile');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (34, 'Can change financial profile', 9, 'change_financialprofile');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (35, 'Can delete financial profile', 9, 'delete_financialprofile');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (36, 'Can view financial profile', 9, 'view_financialprofile');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (37, 'Can add system settings', 10, 'add_systemsettings');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (38, 'Can change system settings', 10, 'change_systemsettings');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (39, 'Can delete system settings', 10, 'delete_systemsettings');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (40, 'Can view system settings', 10, 'view_systemsettings');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (41, 'Can add client', 11, 'add_client');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (42, 'Can change client', 11, 'change_client');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (43, 'Can delete client', 11, 'delete_client');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (44, 'Can view client', 11, 'view_client');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (45, 'Can add investor', 12, 'add_investor');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (46, 'Can change investor', 12, 'change_investor');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (47, 'Can delete investor', 12, 'delete_investor');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (48, 'Can view investor', 12, 'view_investor');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (49, 'Can add operation', 13, 'add_operation');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (50, 'Can change operation', 13, 'change_operation');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (51, 'Can delete operation', 13, 'delete_operation');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (52, 'Can view operation', 13, 'view_operation');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (53, 'Can add payment', 14, 'add_payment');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (54, 'Can change payment', 14, 'change_payment');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (55, 'Can delete payment', 14, 'delete_payment');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (56, 'Can view payment', 14, 'view_payment');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (57, 'Can add payment schedule', 15, 'add_paymentschedule');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (58, 'Can change payment schedule', 15, 'change_paymentschedule');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (59, 'Can delete payment schedule', 15, 'delete_paymentschedule');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (60, 'Can view payment schedule', 15, 'view_paymentschedule');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (61, 'Can add payment allocation', 16, 'add_paymentallocation');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (62, 'Can change payment allocation', 16, 'change_paymentallocation');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (63, 'Can delete payment allocation', 16, 'delete_paymentallocation');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (64, 'Can view payment allocation', 16, 'view_paymentallocation');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (65, 'Can add penalty', 17, 'add_penalty');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (66, 'Can change penalty', 17, 'change_penalty');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (67, 'Can delete penalty', 17, 'delete_penalty');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (68, 'Can view penalty', 17, 'view_penalty');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (69, 'Can add property', 18, 'add_property');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (70, 'Can change property', 18, 'change_property');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (71, 'Can delete property', 18, 'delete_property');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (72, 'Can view property', 18, 'view_property');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (73, 'Can add mortgage', 19, 'add_mortgage');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (74, 'Can change mortgage', 19, 'change_mortgage');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (75, 'Can delete mortgage', 19, 'delete_mortgage');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (76, 'Can view mortgage', 19, 'view_mortgage');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (77, 'Can add trust', 20, 'add_trust');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (78, 'Can change trust', 20, 'change_trust');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (79, 'Can delete trust', 20, 'delete_trust');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (80, 'Can view trust', 20, 'view_trust');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (81, 'Can add document', 21, 'add_document');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (82, 'Can change document', 21, 'change_document');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (83, 'Can delete document', 21, 'delete_document');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (84, 'Can view document', 21, 'view_document');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (85, 'Can add import batch', 22, 'add_importbatch');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (86, 'Can change import batch', 22, 'change_importbatch');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (87, 'Can delete import batch', 22, 'delete_importbatch');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (88, 'Can view import batch', 22, 'view_importbatch');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (89, 'Can add bond holding', 23, 'add_bondholding');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (90, 'Can change bond holding', 23, 'change_bondholding');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (91, 'Can delete bond holding', 23, 'delete_bondholding');
INSERT INTO public.auth_permission (id, name, content_type_id, codename) VALUES (92, 'Can view bond holding', 23, 'view_bondholding');

-- Data for Name: django_migrations; Type: TABLE DATA; Schema: public; Owner: -

INSERT INTO public.django_migrations (id, app, name, applied) VALUES (1, 'contenttypes', '0001_initial', '2026-10-26 18:56:04.119341+00');
INSERT INTO public.django_migrations (id, app, name, applied) VALUES (2, 'contenttypes', '0002_remove_content_type_name', '2026-10-26 18:56:04.124624+00');
INSERT INTO public.django_migrations (id, app, name, applied) VALUES (3, 'auth', '0001_initial', '2026-10-26 18:56:04.151792+00');
INSERT INTO public.django_migrations (id, app, name, applied) VALUES (4, 'auth', '0002_alter_permission_name_max_length', '2026-10-26 18:56:04.156231+00');
INSERT INTO public.django_migrations (id, app, name, applied) VALUES (5, 'auth', '0003_alter_user_email_max_length', '2026-10-26 18:56:04.160327+00');
INSERT INTO public.django_migrations (id, app, name, applied) VALUES (6, 'auth', '0004_alter_user_username_opts', '2026-10-26 18:56:04.164083+00');
INSERT INTO public.django_migrations (id, app, name, applied) VALUES (7, 'auth', '0005_alter_user_last_login_null', '2026-10-26 18:56:04.167833+00');
INSERT INTO public.django_migrations (id, app, name, applied) VALUES (8, 'auth', '0006_require_contenttypes_0002', '2026-10-26 18:56:04.168864+00');
INSERT INTO public.django_migrations (id, app, name, applied) VALUES (9, 'auth', '0007_alter_validators_add_error_messages', '2026-10-26 18:56:04.173482+00');
INSERT INTO public.django_migrations (id, app, name, applied) VALUES (10, 'auth', '0008_alter_user_username_max_length', '2026-10-26 18:56:04.177219+00');
INSERT INTO public.django_migrations (id, app, name, applied) VALUES (11, 'auth', '0009_alter_user_last_name_max_length', '2026-10-26 18:56:04.181513+00');
INSERT INTO public.django_migrations (id, app, name, applied) VALUES (12, 'auth', '0010_alter_group_name_max_length', '2026-10-26 18:56:04.187037+00');
INSERT INTO public.django_migrations (id, app, name, applied) VALUES (13, 'auth', '0011_update_proxy_permissions', '2026-10-26 18:56:04.192293+00');
INSERT INTO public.django_migrations (id, app, name, applied) VALUES (14, 'auth', '0012_alter_user_first_name_max_length', '2026-10-26 18:56:04.196404+00');
INSERT INTO public.django_migrations (id, app, name, applied) VALUES (15, 'accounts', '0001_initial', '2026-10-26 18:56:04.25198+00');
INSERT INTO public.django_migrations (id, app, name, applied) VALUES (16, 'audit', '0001_initial', '2026-10-26 18:56:04.28322+00');
INSERT INTO public.django_migrations (id, app, name, applied) VALUES (17, 'core', '0001_initial', '2026-10-26 18:56:04.609239+00');
INSERT INTO public.django_migrations (id, app, name, applied) VALUES (18, 'core', '0002_importacion_excel', '2026-10-26 18:56:05.054707+00');
INSERT INTO public.django_migrations (id, app, name, applied) VALUES (19, 'sessions', '0001_initial', '2026-10-26 18:56:05.063171+00');

-- Data for Name: financial_profiles; Type: TABLE DATA; Schema: public; Owner: -

INSERT INTO public.financial_profiles (id, name, description, rate_type, rate_value, interest_method, day_base, day_count, capitalizations_per_year, periodicity, amortization, penalty_type, penalty_value, penalty_base, penalty_grace_days, is_active) VALUES (1, 'Titulización bullet · TNM ACT/360', 'Intereses mensuales, capital al vencimiento, base ACT/360 (estructura del contrato de fideicomiso de titulización). Defina la tasa moratoria vigente antes de usar.', 'TNM', 2.9000, 'SIMPLE', 360, 'ACTUAL', 12, 'MONTHLY', 'BULLET', 'MORATORY', 0.0000, 'INSTALLMENT', 0, true);
INSERT INTO public.financial_profiles (id, name, description, rate_type, rate_value, interest_method, day_base, day_count, capitalizations_per_year, periodicity, amortization, penalty_type, penalty_value, penalty_base, penalty_grace_days, is_active) VALUES (2, 'Ejemplo · cuota francesa TEA', 'Perfil de ejemplo: ajuste tasa y penalidad a sus condiciones reales.', 'TEA', 18.0000, 'COMPOUND', 360, 'PERIOD', 12, 'MONTHLY', 'FRENCH', 'DAILY_PERCENT', 0.1000, 'INSTALLMENT', 3, true);

-- Data for Name: permissions; Type: TABLE DATA; Schema: public; Owner: -

INSERT INTO public.permissions (id, code, module, description) VALUES (1, 'dashboard.view', 'Dashboard', 'Ver dashboard y alertas');
INSERT INTO public.permissions (id, code, module, description) VALUES (2, 'investors.view', 'Bonistas', 'Ver bonistas');
INSERT INTO public.permissions (id, code, module, description) VALUES (3, 'investors.edit', 'Bonistas', 'Crear y editar bonistas');
INSERT INTO public.permissions (id, code, module, description) VALUES (4, 'clients.view', 'Clientes', 'Ver clientes');
INSERT INTO public.permissions (id, code, module, description) VALUES (5, 'clients.edit', 'Clientes', 'Crear y editar clientes');
INSERT INTO public.permissions (id, code, module, description) VALUES (6, 'operations.view', 'Operaciones', 'Ver operaciones y cronogramas');
INSERT INTO public.permissions (id, code, module, description) VALUES (7, 'operations.create', 'Operaciones', 'Registrar operaciones');
INSERT INTO public.permissions (id, code, module, description) VALUES (8, 'operations.edit', 'Operaciones', 'Modificar condiciones económicas y reestructurar');
INSERT INTO public.permissions (id, code, module, description) VALUES (9, 'operations.status', 'Operaciones', 'Cambiar estado manualmente');
INSERT INTO public.permissions (id, code, module, description) VALUES (10, 'operations.all', 'Operaciones', 'Ver la cartera completa (no solo la asignada)');
INSERT INTO public.permissions (id, code, module, description) VALUES (11, 'payments.view', 'Pagos', 'Ver pagos');
INSERT INTO public.permissions (id, code, module, description) VALUES (12, 'payments.create', 'Pagos', 'Registrar pagos');
INSERT INTO public.permissions (id, code, module, description) VALUES (13, 'payments.void', 'Pagos', 'Anular pagos');
INSERT INTO public.permissions (id, code, module, description) VALUES (14, 'penalties.view', 'Penalidades', 'Ver penalidades');
INSERT INTO public.permissions (id, code, module, description) VALUES (15, 'penalties.manage', 'Penalidades', 'Condonar o ajustar penalidades');
INSERT INTO public.permissions (id, code, module, description) VALUES (16, 'guarantees.edit', 'Garantías', 'Registrar y editar garantías hipotecarias');
INSERT INTO public.permissions (id, code, module, description) VALUES (17, 'trusts.view', 'Fideicomisos', 'Ver fideicomisos');
INSERT INTO public.permissions (id, code, module, description) VALUES (18, 'trusts.edit', 'Fideicomisos', 'Registrar y editar fideicomisos');
INSERT INTO public.permissions (id, code, module, description) VALUES (19, 'documents.view', 'Documentos', 'Ver y descargar documentos');
INSERT INTO public.permissions (id, code, module, description) VALUES (20, 'documents.upload', 'Documentos', 'Cargar documentos');
INSERT INTO public.permissions (id, code, module, description) VALUES (21, 'documents.void', 'Documentos', 'Anular documentos');
INSERT INTO public.permissions (id, code, module, description) VALUES (22, 'reports.view', 'Reportes', 'Ver reportes y estados de cuenta');
INSERT INTO public.permissions (id, code, module, description) VALUES (23, 'reports.export', 'Reportes', 'Exportar a Excel y PDF');
INSERT INTO public.permissions (id, code, module, description) VALUES (24, 'imports.run', 'Importación', 'Importar cronogramas desde Excel');
INSERT INTO public.permissions (id, code, module, description) VALUES (25, 'audit.view', 'Auditoría', 'Ver bitácora de auditoría');
INSERT INTO public.permissions (id, code, module, description) VALUES (26, 'settings.manage', 'Configuración', 'Configurar empresa y parámetros');
INSERT INTO public.permissions (id, code, module, description) VALUES (27, 'users.manage', 'Configuración', 'Administrar usuarios, roles y permisos');

-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: -

INSERT INTO public.roles (id, name, description, is_system) VALUES (1, 'ADMINISTRADOR', 'Acceso total al sistema', true);
INSERT INTO public.roles (id, name, description, is_system) VALUES (2, 'GERENCIA', 'Supervisión de cartera, reportes y auditoría', true);
INSERT INTO public.roles (id, name, description, is_system) VALUES (3, 'FINANZAS', 'Operaciones, pagos y penalidades', true);
INSERT INTO public.roles (id, name, description, is_system) VALUES (4, 'COBRANZAS', 'Seguimiento de cobranza y registro de pagos', true);
INSERT INTO public.roles (id, name, description, is_system) VALUES (5, 'ASESOR', 'Clientes y operaciones asignadas', true);
INSERT INTO public.roles (id, name, description, is_system) VALUES (6, 'CONSULTA', 'Solo lectura', true);

-- Data for Name: role_permissions; Type: TABLE DATA; Schema: public; Owner: -

INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (1, 1, 1);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (2, 1, 2);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (3, 1, 3);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (4, 1, 4);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (5, 1, 5);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (6, 1, 6);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (7, 1, 7);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (8, 1, 8);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (9, 1, 9);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (10, 1, 10);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (11, 1, 11);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (12, 1, 12);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (13, 1, 13);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (14, 1, 14);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (15, 1, 15);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (16, 1, 16);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (17, 1, 17);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (18, 1, 18);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (19, 1, 19);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (20, 1, 20);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (21, 1, 21);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (22, 1, 22);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (23, 1, 23);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (24, 1, 24);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (25, 1, 25);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (26, 1, 26);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (27, 1, 27);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (28, 2, 1);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (29, 2, 2);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (30, 2, 3);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (31, 2, 4);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (32, 2, 5);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (33, 2, 6);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (34, 2, 7);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (35, 2, 8);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (36, 2, 9);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (37, 2, 10);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (38, 2, 11);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (39, 2, 12);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (40, 2, 13);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (41, 2, 14);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (42, 2, 15);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (43, 2, 16);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (44, 2, 17);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (45, 2, 18);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (46, 2, 19);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (47, 2, 20);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (48, 2, 21);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (49, 2, 22);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (50, 2, 23);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (51, 2, 24);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (52, 2, 25);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (53, 3, 1);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (54, 3, 2);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (55, 3, 3);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (56, 3, 4);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (57, 3, 5);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (58, 3, 6);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (59, 3, 7);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (60, 3, 8);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (61, 3, 10);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (62, 3, 11);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (63, 3, 12);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (64, 3, 13);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (65, 3, 14);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (66, 3, 15);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (67, 3, 16);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (68, 3, 17);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (69, 3, 18);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (70, 3, 19);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (71, 3, 20);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (72, 3, 22);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (73, 3, 23);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (74, 3, 24);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (75, 4, 1);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (76, 4, 2);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (77, 4, 4);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (78, 4, 6);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (79, 4, 10);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (80, 4, 11);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (81, 4, 12);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (82, 4, 14);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (83, 4, 17);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (84, 4, 19);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (85, 4, 20);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (86, 4, 22);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (87, 4, 23);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (88, 5, 1);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (89, 5, 4);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (90, 5, 5);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (91, 5, 6);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (92, 5, 7);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (93, 5, 11);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (94, 5, 14);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (95, 5, 16);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (96, 5, 17);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (97, 5, 19);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (98, 5, 20);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (99, 5, 22);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (100, 6, 1);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (101, 6, 2);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (102, 6, 4);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (103, 6, 6);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (104, 6, 10);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (105, 6, 11);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (106, 6, 14);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (107, 6, 17);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (108, 6, 19);
INSERT INTO public.role_permissions (id, role_id, permission_id) VALUES (109, 6, 22);

-- Data for Name: system_settings; Type: TABLE DATA; Schema: public; Owner: -

INSERT INTO public.system_settings (id, company_name, company_ruc, company_address, logo, default_currency, exchange_rate, max_ltv, alert_days, maturity_alert_days, mora_days, appraisal_validity_months, allocation_order, required_documents, operation_prefix, last_refresh, income_tax_withholding, max_rate_pen, max_rate_usd) VALUES (1, 'CAPEX Express S.A.C.', '', '', '', 'USD', 3.7500, 50.00, 7, 30, 30, 12, 'PENALTY,INTEREST,CAPITAL', 'CONTRATO,TASACION,COPIA_LITERAL,CONTRATO_FIDEICOMISO', 'OP', NULL, 4.99, 0.0000, 0.0000);

-- Name: auth_permission_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -

SELECT pg_catalog.setval('public.auth_permission_id_seq', 92, true);

-- Name: django_content_type_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -

SELECT pg_catalog.setval('public.django_content_type_id_seq', 23, true);

-- Name: django_migrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -

SELECT pg_catalog.setval('public.django_migrations_id_seq', 19, true);

-- Name: financial_profiles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -

SELECT pg_catalog.setval('public.financial_profiles_id_seq', 2, true);

-- Name: permissions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -

SELECT pg_catalog.setval('public.permissions_id_seq', 27, true);

-- Name: role_permissions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -

SELECT pg_catalog.setval('public.role_permissions_id_seq', 109, true);

-- Name: roles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -

SELECT pg_catalog.setval('public.roles_id_seq', 6, true);

-- Name: system_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -

SELECT pg_catalog.setval('public.system_settings_id_seq', 1, true);

-- PostgreSQL database dump complete

COMMIT;
