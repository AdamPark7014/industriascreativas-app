import os
import re
import paramiko

PASSWORD = os.environ["DO_ROOT_PASSWORD"]
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("147.182.128.128", username="root", password=PASSWORD, timeout=25)

def run(cmd: str) -> str:
    _, out, err = c.exec_command(cmd, timeout=90)
    return out.read().decode("utf-8", "replace") + err.read().decode("utf-8", "replace")

print("=== panel html snippet ===")
html = run("curl -sS https://panel.experiencebt.com.mx/accesos/")
print(html[:600])
m = re.search(r"assets/([^\"']+\.js)", html)
print("js match:", m.group(1) if m else None)
if m:
    js = run(f"curl -sS https://panel.experiencebt.com.mx/accesos/assets/{m.group(1)}")
    for n in ("Abrir cámara", "EN COLA OFFLINE", "zonaDentro", "Reingresos", "offline"):
        print(f"  panel {n!r}:", n in js)

print("=== demo backend zones ===")
print(run("grep -n accesos_zonas /opt/EVENTOS-app/backend/app.py | head -20"))
print(run("docker exec eventos_demo_web sh -c 'grep -n accesos_zonas /app/backend/app.py | head -20 || grep -n accesos_zonas /app/app.py | head -20'"))
print(run("docker exec eventos_demo_web sh -c 'ls -la /app/*.py /app/backend/*.py 2>/dev/null | head'"))

c.close()
