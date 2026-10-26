# Base de datos de CAPEX Gestión (PostgreSQL)

| Archivo | Qué hace |
|---|---|
| `01_estructura.sql` | Crea las 29 tablas con sus llaves, índices y restricciones |
| `02_datos_iniciales.sql` | Carga permisos, los 6 roles, la configuración y los perfiles de condiciones |
| `generar_hash.py` | Genera el hash seguro de la contraseña del administrador |
| `03_administrador.sql` | Crea el primer usuario ADMINISTRADOR |

## Paso a paso (servidor VPS con Ubuntu)

```bash
# 1. Instalar PostgreSQL
sudo apt update && sudo apt install -y postgresql

# 2. Crear el usuario y la base de datos (cambie la clave)
sudo -u postgres psql -c "CREATE USER capex WITH PASSWORD 'UnaClaveLargaYSegura';"
sudo -u postgres psql -c "CREATE DATABASE capex_gestion OWNER capex ENCODING 'UTF8' TEMPLATE template0;"

# 3. Crear las tablas y cargar los catálogos
psql "postgres://capex:UnaClaveLargaYSegura@localhost/capex_gestion" -v ON_ERROR_STOP=1 -f 01_estructura.sql
psql "postgres://capex:UnaClaveLargaYSegura@localhost/capex_gestion" -v ON_ERROR_STOP=1 -f 02_datos_iniciales.sql

# 4. Crear el administrador
python3 generar_hash.py            # copie el texto que empieza con pbkdf2_sha256$
nano 03_administrador.sql          # pegue el hash y ponga su usuario, correo y nombre
psql "postgres://capex:UnaClaveLargaYSegura@localhost/capex_gestion" -v ON_ERROR_STOP=1 -f 03_administrador.sql

# 5. Verificar
psql "postgres://capex:UnaClaveLargaYSegura@localhost/capex_gestion" -c "\dt"
psql "postgres://capex:UnaClaveLargaYSegura@localhost/capex_gestion" -c "SELECT name FROM roles;"
```

Conecte el sistema con la variable de entorno:
`DATABASE_URL=postgres://capex:UnaClaveLargaYSegura@localhost:5432/capex_gestion`

## Alternativa automática

Con el sistema instalado, estos dos comandos producen exactamente la misma base:

```bash
python manage.py migrate
python manage.py inicializar --correo admin@suempresa.pe --clave 'UnaClaveDeAlMenos10'
```

## Notas

- Use los scripts sobre una base **vacía**. Para actualizaciones futuras use `python manage.py migrate`: aplica solo los cambios nuevos, sin borrar datos.
- `02_datos_iniciales.sql` registra las migraciones como aplicadas, así Django no intenta crear las tablas otra vez.
- Copias de seguridad diarias: `pg_dump -Fc capex_gestion > respaldo_$(date +%F).dump`
- Restaurar una copia: `pg_restore -d capex_gestion respaldo_AAAA-MM-DD.dump`
- Los scripts son para PostgreSQL, no para MySQL/phpMyAdmin del hosting compartido.
