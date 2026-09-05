"""Deploy Accesos FICTI harden+UI a DO. Password solo por env DO_ROOT_PASSWORD."""
from __future__ import annotations

import io
import os
import secrets
import tarfile
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
HOST = "147.182.128.128"
PASSWORD = os.environ.get("DO_ROOT_PASSWORD", "")
REMOTE = "/opt/EVENTOS-app"

FILES = [
    "panel/accesos.py",
    "panel/gafete_pdf.py",
    "panel/seguridad.py",
    "panel/app.py",
    "panel/seed.py",
    "panel/Dockerfile",
    "panel/.dockerignore",
    "panel/requirements.txt",
    "panel/docker-compose.panel.yml",
    "panel/entrypoint.sh",
    "panel/templates/panel.html",
    "panel/static/js/panel.js",
    "panel/static/css/panel.css",
    "panel/migraciones/002_accesos.sql",
    "panel/ui/package.json",
    "panel/ui/package-lock.json",
    "panel/ui/vite.config.ts",
    "panel/ui/tsconfig.json",
    "panel/ui/tsconfig.app.json",
    "panel/ui/tsconfig.node.json",
    "panel/ui/index.html",
    "backend/app.py",
    "backend/.env.example",
    "docker-compose.demo.yml",
    "web/src/pages/EscanearPage.tsx",
    "web/src/styles/escanear.module.scss",
    "web/src/lib/useCameraCapture.ts",
    "web/src/lib/offlineQueue.ts",
    "web/src/components/CameraScan.tsx",
    "web/src/components/camera-scan.module.scss",
    "docs/ACCESOS-REACT.md",
    ".gitignore",
]


def add(tar: tarfile.TarFile, rel: str) -> None:
    path = ROOT / rel
    if not path.exists():
        raise SystemExit(f"missing {rel}")
    tar.add(path, arcname=rel)


def main() -> None:
    if not PASSWORD:
        raise SystemExit("Set DO_ROOT_PASSWORD")

    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for rel in FILES:
            add(tar, rel)
        for path in (ROOT / "panel" / "ui" / "src").rglob("*"):
            if path.is_file():
                add(tar, str(path.relative_to(ROOT)).replace("\\", "/"))
    buf.seek(0)

    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", password=PASSWORD, timeout=30)
    sftp = c.open_sftp()
    remote_tar = "/tmp/ficti-accesos.tgz"
    with sftp.file(remote_tar, "wb") as rf:
        rf.write(buf.read())
    sftp.close()
    print("uploaded", remote_tar)

    scan_key = secrets.token_urlsafe(24)
    cmds = f"""
set -e
cd {REMOTE}
tar xzf {remote_tar}
# SCAN_API_KEY: crear si falta, no rotar si ya existe
if ! grep -q '^SCAN_API_KEY=' .env 2>/dev/null; then
  echo "SCAN_API_KEY={scan_key}" >> .env
  echo "SCAN_API_KEY_CREATED=1"
else
  echo "SCAN_API_KEY_EXISTS=1"
fi
if ! grep -q '^SCAN_API_KEY=' backend/.env 2>/dev/null; then
  # sync key from root .env into backend/.env for env_file
  KEY=$(grep '^SCAN_API_KEY=' .env | head -1 | cut -d= -f2-)
  echo "SCAN_API_KEY=$KEY" >> backend/.env
fi
# also export for compose variable substitution
export $(grep -E '^(SCAN_API_KEY|DATABASE_URL|SECRET_KEY|POSTGRES_|PANEL_|PUBLIC_)' .env | xargs -d '\\n')
cd panel
docker compose -f docker-compose.panel.yml build panel_web
docker compose -f docker-compose.panel.yml up -d panel_web
cd {REMOTE}
docker compose -f docker-compose.demo.yml build demo_web
docker compose -f docker-compose.demo.yml up -d demo_web
sleep 5
docker ps --filter name=eventos_ --format '{{{{.Names}}}} {{{{.Status}}}}'
curl -sS -o /dev/null -w 'panel_login=%{{http_code}}\\n' https://panel.experiencebt.com.mx/login
curl -sS -o /dev/null -w 'panel_accesos=%{{http_code}}\\n' -L https://panel.experiencebt.com.mx/accesos
curl -sS -o /dev/null -w 'api_accesos_anon=%{{http_code}}\\n' https://panel.experiencebt.com.mx/api/accesos/sesion
curl -sS -o /dev/null -w 'demo_scan_anon=%{{http_code}}\\n' -X POST https://demo.experiencebt.com.mx/api/escanear -H 'Content-Type: application/json' -d '{{"qr_data":"x","modo":"entrada"}}'
curl -sS -o /dev/null -w 'demo_escanear=%{{http_code}}\\n' https://demo.experiencebt.com.mx/escanear
"""
    stdin, stdout, stderr = c.exec_command(cmds, timeout=1200)
    out = stdout.read().decode()
    err = stderr.read().decode()
    print(out)
    if err:
        print("STDERR:", err[-5000:])
    code = stdout.channel.recv_exit_status()
    c.close()
    raise SystemExit(code)


if __name__ == "__main__":
    main()
