"""Smoke Accesos completeness on DO — password via DO_ROOT_PASSWORD."""
from __future__ import annotations

import os
import re
import sys

import paramiko

PASSWORD = os.environ.get("DO_ROOT_PASSWORD", "")
if not PASSWORD:
    raise SystemExit("Set DO_ROOT_PASSWORD")


def run(c: paramiko.SSHClient, cmd: str) -> str:
    _, out, err = c.exec_command(cmd, timeout=90)
    text = out.read().decode("utf-8", "replace")
    e = err.read().decode("utf-8", "replace")
    if e.strip():
        text += "\nERR: " + e[:400]
    return text


def main() -> None:
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect("147.182.128.128", username="root", password=PASSWORD, timeout=25)

    checks: list[tuple[str, bool]] = []

    html = run(c, "curl -sS https://panel.experiencebt.com.mx/accesos/")
    m = re.search(r"assets/([^\"']+\.js)", html)
    js_name = m.group(1) if m else ""
    checks.append(("panel accesos html", "accesos" in html.lower() or "root" in html or bool(js_name)))

    if js_name:
        js = run(c, f"curl -sS https://panel.experiencebt.com.mx/accesos/assets/{js_name}")
        for needle in ("Abrir cámara", "EN COLA OFFLINE", "zonaDentro", "Reingresos"):
            checks.append((f"panel js has {needle}", needle in js))

    demo_html = run(c, "curl -sS https://demo.experiencebt.com.mx/escanear")
    m2 = re.search(r"assets/([^\"']+\.js)", demo_html)
    demo_js = m2.group(1) if m2 else ""
    checks.append(("demo escanear html", bool(demo_js) or "escanear" in demo_html.lower()))
    if demo_js:
        js2 = run(c, f"curl -sS https://demo.experiencebt.com.mx/assets/{demo_js}")
        for needle in ("Abrir cámara", "/api/zonas", "EN COLA OFFLINE"):
            checks.append((f"demo js has {needle}", needle in js2))

    code_zonas = run(
        c,
        "curl -sS -o /dev/null -w '%{http_code}' https://demo.experiencebt.com.mx/api/zonas",
    ).strip()
    checks.append(("api/zonas anon 401", code_zonas == "401"))

    code_bad = run(
        c,
        "curl -sS -o /dev/null -w '%{http_code}' -H 'X-Scan-Key: wrong' "
        "https://demo.experiencebt.com.mx/api/zonas",
    ).strip()
    checks.append(("api/zonas bad key 401", code_bad == "401"))

    code_sesion = run(
        c,
        "curl -sS -o /dev/null -w '%{http_code}' "
        "https://panel.experiencebt.com.mx/api/accesos/sesion",
    ).strip()
    checks.append(("api/accesos/sesion anon 401", code_sesion == "401"))

    src_ok = run(
        c,
        "docker exec eventos_demo_web python -c "
        "\"from app import procesar_escaneo; import inspect; "
        "s=inspect.getsource(procesar_escaneo); "
        "print('zona' in s and 'accesos_zonas' in s)\"",
    ).strip()
    checks.append(("demo procesar_escaneo zones", src_ok.endswith("True")))

    failed = 0
    for name, ok in checks:
        mark = "OK" if ok else "FAIL"
        if not ok:
            failed += 1
        print(f"[{mark}] {name}")

    c.close()
    raise SystemExit(failed)


if __name__ == "__main__":
    main()
