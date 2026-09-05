"""Empaqueta panel Accesos + demo scan log y lo despliega en DO /opt/EVENTOS-app."""
import io
import os
import tarfile
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
HOST = "147.182.128.128"
PASSWORD = os.environ.get("DO_ROOT_PASSWORD", "H#1Bp(6V9z'<a")
REMOTE = "/opt/EVENTOS-app"


def add(tar: tarfile.TarFile, rel: str) -> None:
    path = ROOT / rel
    if not path.exists():
        raise SystemExit(f"missing {rel}")
    tar.add(path, arcname=rel)


def main() -> None:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for rel in [
            "panel/accesos.py",
            "panel/gafete_pdf.py",
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
            "web/src/pages/EscanearPage.tsx",
            "docs/ACCESOS-REACT.md",
        ]:
            add(tar, rel)
        # árbol src del SPA
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

    cmds = f"""
set -e
cd {REMOTE}
tar xzf {remote_tar}
cd panel
docker compose -f docker-compose.panel.yml build --no-cache panel_web
docker compose -f docker-compose.panel.yml up -d panel_web
cd {REMOTE}
docker compose -f docker-compose.demo.yml build --no-cache demo_web
docker compose -f docker-compose.demo.yml up -d demo_web
sleep 4
docker ps --filter name=eventos_ --format '{{{{.Names}}}} {{{{.Status}}}}'
curl -sS -o /dev/null -w 'panel_login=%{{http_code}}\\n' https://panel.experiencebt.com.mx/login
curl -sS -o /dev/null -w 'panel_accesos=%{{http_code}}\\n' https://panel.experiencebt.com.mx/accesos
curl -sS -o /dev/null -w 'demo_escanear=%{{http_code}}\\n' https://demo.experiencebt.com.mx/escanear
"""
    stdin, stdout, stderr = c.exec_command(cmds, timeout=900)
    print(stdout.read().decode())
    err = stderr.read().decode()
    if err:
        print("STDERR:", err[-4000:])
    code = stdout.channel.recv_exit_status()
    c.close()
    raise SystemExit(code)


if __name__ == "__main__":
    main()
