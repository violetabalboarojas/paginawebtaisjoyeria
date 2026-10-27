"""
Genera el hash de una contraseña en el formato que usa el sistema (PBKDF2-SHA256, igual que Django).
Uso:  python3 generar_hash.py
No necesita instalar nada: solo Python 3. La contraseña no se guarda en ningún archivo.
"""
import base64
import getpass
import hashlib
import secrets

ITERACIONES = 1_000_000  # mismo valor que Django 5.2

clave = getpass.getpass("Contraseña del administrador (mín. 10 caracteres): ")
if len(clave) < 10 or clave != getpass.getpass("Repita la contraseña: "):
    raise SystemExit("Las contraseñas no coinciden o tienen menos de 10 caracteres.")
sal = secrets.token_urlsafe(16)[:22]
dk = hashlib.pbkdf2_hmac("sha256", clave.encode(), sal.encode(), ITERACIONES)
print(f"pbkdf2_sha256${ITERACIONES}${sal}${base64.b64encode(dk).decode()}")
