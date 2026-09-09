# Despliega panel_web + accesos_api al droplet DO (147.182.128.128) via .ai/_deploy_print_fix.py.
# Pide la password root en pantalla (no se muestra, no queda en historial ni en el repo).
# Uso:  pwsh -File .ai\deploy-print.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

try { python -c "import paramiko" 2>$null } catch {}
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Falta paramiko: pip install paramiko' -ForegroundColor Red
  exit 1
}

$limpiar = $false
if (-not $env:DO_ROOT_PASSWORD) {
  $sec = Read-Host -Prompt 'Password root del droplet DO (no se muestra)' -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  try { $env:DO_ROOT_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  $limpiar = $true
}

try {
  python .ai\_deploy_print_fix.py
  $code = $LASTEXITCODE
}
finally {
  if ($limpiar) { Remove-Item Env:DO_ROOT_PASSWORD -ErrorAction SilentlyContinue }
}

if ($code -ne 0) { Write-Host "Deploy fallo (exit $code)" -ForegroundColor Red; exit $code }
Write-Host ''
Write-Host 'Deploy OK. Comprueba: https://panel.experiencebt.com.mx/accesos/buscar (Ctrl+F5).' -ForegroundColor Green
