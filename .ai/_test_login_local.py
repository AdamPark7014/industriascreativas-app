"""Prueba local de la tolerancia de clave y del bloqueo por usuario (sin BD)."""
import os
import sys
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "postgresql://x:x@127.0.0.1:1/x")
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "panel"))
import app as panel  # noqa: E402
from werkzeug.security import check_password_hash, generate_password_hash  # noqa: E402

real = "Ab3d-Ef6h-Jk9M-Np2Q"
h = generate_password_hash(real)
ok = lambda c: any(check_password_hash(h, v) for v in panel._variantes_clave(c))  # noqa: E731

casos = {
    real: True,
    real + " ": True,
    " " + real: True,
    "Ab3dEf6hJk9MNp2Q": True,
    "Ab3d Ef6h Jk9M Np2Q": True,
    "ab3d-ef6h-jk9m-np2q": False,
    "Ab3d-Ef6h-Jk9M-Np2": False,
}
fallos = 0
for clave, esperado in casos.items():
    r = ok(clave)
    fallos += r != esperado
    print("OK " if r == esperado else "MAL", repr(clave), r)

panel._intentos.clear()
for _ in range(panel.MAX_INTENTOS):
    panel._registrar_fallo("1.1.1.1", "impresion3")
b1 = panel._bloqueado("1.1.1.1", "impresion3")
b2 = panel._bloqueado("1.1.1.1", "registro1")
print("OK " if b1 else "MAL", "impresion3 bloqueado tras 8 fallos", b1)
print("OK " if not b2 else "MAL", "registro1 desde la misma IP sigue entrando", not b2)
fallos += (not b1) + b2
print("fallos:", fallos)
sys.exit(1 if fallos else 0)
