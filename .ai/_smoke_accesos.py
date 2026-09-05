import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("147.182.128.128", username="root", password="H#1Bp(6V9z'<a", timeout=25)
cmds = [
    "curl -sS https://panel.experiencebt.com.mx/accesos | head -c 500",
    "curl -sS -o /dev/null -w 'resumen_anon=%{http_code}\\n' https://panel.experiencebt.com.mx/api/accesos/resumen",
    "curl -sS -o /dev/null -w 'scan_wrong=%{http_code}\\n' -X POST https://demo.experiencebt.com.mx/api/escanear -H 'Content-Type: application/json' -H 'X-Scan-Key: wrong' -d '{\"qr_data\":\"1\",\"modo\":\"entrada\"}'",
]
for cmd in cmds:
    print("==", cmd)
    _, out, err = c.exec_command(cmd, timeout=40)
    print(out.read().decode()[:800])
    e = err.read().decode()
    if e:
        print("err", e[:200])
c.close()
