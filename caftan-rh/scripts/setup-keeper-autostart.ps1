# Karim 2026-06-02 : enregistre tunnel-keeper.ps1 dans Task Scheduler
# pour qu'il demarre automatiquement au login Windows.
# Lance ce script en ADMIN UNE SEULE FOIS : powershell -ExecutionPolicy Bypass -File setup-keeper-autostart.ps1
#
# Le keeper :
#   - tourne en permanence en arriere-plan
#   - relance cloudflared si crash
#   - rotate le tunnel chaque matin 08:00
#   - envoie le mail recap a elbazikarim@gmail.com

$TaskName = "CaftanRH-TunnelKeeper"
$ScriptPath = "C:\Users\KElba\Documents\GitHub\Formulaire_candidats\caftan-rh\scripts\tunnel-keeper.ps1"

if (-not (Test-Path $ScriptPath)) {
    Write-Host "[X] keeper script not found: $ScriptPath"
    exit 1
}

# Supprime l'ancienne tache si existe
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "[setup] removing existing task $TaskName"
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

# Action : lance powershell avec le keeper
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ScriptPath`""

# Trigger : au login Windows + au demarrage
$trigger1 = New-ScheduledTaskTrigger -AtLogon
$trigger2 = New-ScheduledTaskTrigger -AtStartup

# Settings : restart 3x si fail + run hidden + pas de batterie limite
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Days 365)

# Run as current user
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger @($trigger1, $trigger2) `
    -Settings $settings `
    -Principal $principal `
    -Description "CaftanRH cloudflared tunnel keeper - rotation quotidienne 08h + mail recap auto" `
    -Force

Write-Host "[+] Task $TaskName enregistree."
Write-Host "[+] Le keeper redemarrera auto au prochain login Windows."
Write-Host ""
Write-Host "Pour le lancer immediatement (sans rebooter) :"
Write-Host "    Start-ScheduledTask -TaskName '$TaskName'"
