import os
import paramiko

PASSWORD = os.environ["DO_ROOT_PASSWORD"]
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("147.182.128.128", username="root", password=PASSWORD, timeout=25)

def run(cmd: str) -> str:
    _, out, err = c.exec_command(cmd, timeout=90)
    return out.read().decode("utf-8", "replace")

print(run("docker exec eventos_panel_web sh -c 'ls /app/ui/dist/assets | head'"))
print(run(
    "docker exec eventos_panel_web sh -c "
    "\"grep -oE 'Abrir cámara|EN COLA OFFLINE|zonaDentro|Reingresos|Cola offline' "
    "/app/ui/dist/assets/*.js | sort -u\""
))
print(run(
    "docker exec eventos_panel_web sh -c "
    "\"grep -n 'camera=(self)' /app/app.py | head\""
))
print(run(
    "docker exec eventos_panel_web sh -c "
    "\"grep -n 'reingresos\\|NO CONFIRMADO\\|zonaDentro' /app/accesos.py | head -20\""
))
print(run(
    "docker exec eventos_demo_web sh -c "
    "\"cd /app/backend && python -c 'from app import procesar_escaneo; import inspect; "
    "s=inspect.getsource(procesar_escaneo); print(chr(10).join([x for x in "
    "[\\\"zona\\\" if \\\"zona_clave\\\" in s or \\\"zona_clave=\" in s else \\\"\\\", "
    "\\\"accesos_zonas\\\" if \\\"accesos_zonas\\\" in s else \\\"\\\"] if x]))'\""
))
# simpler
print("---")
print(run(
    "docker exec eventos_demo_web sh -c "
    "\"cd /app/backend && python - <<'PY'\n"
    "from app import procesar_escaneo\n"
    "import inspect\n"
    "s = inspect.getsource(procesar_escaneo)\n"
    "print('has_zones', 'accesos_zonas' in s)\n"
    "print('has_zona_arg', 'zona_clave' in s)\n"
    "PY\""
))
c.close()
