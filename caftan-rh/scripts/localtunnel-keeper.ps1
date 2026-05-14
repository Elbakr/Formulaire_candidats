# localtunnel-keeper.ps1
# Garde un localtunnel actif avec un subdomain stable (URL fixe).
# Alternative a cloudflared quick tunnel : ici l'URL ne change pas
# d'un restart a l'autre, donc la PWA iOS reste valide.
#
# URL produite : https://caftanrh.loca.lt
#
# Note iOS PWA : a la premiere visite, loca.lt affiche une page
# "Click to continue". Il faut cliquer une fois dans Safari avant
# d'installer la PWA. Ensuite la PWA fonctionne normalement.
#
# Pour exécuter au démarrage : tâche planifiée AtLogon pointant ce script.

$ErrorActionPreference = "Continue"
$Subdomain   = "caftanrh"
$LocalPort   = 3000
$RepoDir     = "C:\Users\KElba\Documents\GitHub\Formulaire_candidats"
$LtBin       = Join-Path $RepoDir "caftan-rh\node_modules\.bin\lt.cmd"
$LockFile    = "$env:USERPROFILE\localtunnel-keeper.lock"
$LogPath     = "$env:USERPROFILE\localtunnel-keeper.log"
$UrlFile     = Join-Path $RepoDir "caftan-rh\TUNNEL_URL.txt"
$ExpectedUrl = "https://$Subdomain.loca.lt"
$Git         = "C:\Users\KElba\PortableGit\cmd\git.exe"

# Anti-doublon : un seul keeper a la fois.
if (Test-Path $LockFile) {
    $oldPid = Get-Content $LockFile -ErrorAction SilentlyContinue
    if ($oldPid) {
        $other = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
        if ($other) {
            Write-Host "[lt-keeper] another keeper already running (PID $oldPid), exiting."
            exit 0
        }
    }
}
$PID | Out-File $LockFile -Encoding ASCII -Force

Write-Host "[lt-keeper] start $(Get-Date) PID=$PID subdomain=$Subdomain"

function Publish-Url {
    param([string]$Url)
    $existing = ""
    if (Test-Path $UrlFile) {
        $first = Get-Content $UrlFile -First 1 -ErrorAction SilentlyContinue
        if ($first) { $existing = $first.Trim() }
    }
    if ($existing -eq $Url) { return }
    Write-Host "[lt-keeper] publishing $Url"
    $stamp = (Get-Date -Format "yyyy-MM-dd HH:mm")
    $lines = @(
        $Url,
        "",
        "Tunnel localtunnel actif depuis $stamp.",
        "Subdomain stable : $Subdomain.loca.lt -- ne change pas d'un restart a l'autre.",
        "Mis a jour automatiquement par scripts/localtunnel-keeper.ps1."
    )
    Set-Content -Path $UrlFile -Value $lines -Encoding UTF8
    if (Test-Path $Git) {
        Push-Location $RepoDir
        try {
            & $Git add caftan-rh/TUNNEL_URL.txt 2>&1 | Out-Null
            & $Git commit -m "chore(tunnel): switch to localtunnel ($Subdomain.loca.lt)" 2>&1 | Out-Null
            & $Git push origin caftan-rh-v2-prod:caftan-rh-v2-prod 2>&1 | Out-Null
            Write-Host "[lt-keeper] pushed"
        } catch {
            Write-Host "[lt-keeper] push failed: $_"
        }
        Pop-Location
    }
}

while ($true) {
    if (-not (Test-Path $LtBin)) {
        Write-Host "[lt-keeper] $LtBin introuvable. Lance 'npm install' dans caftan-rh, puis relance le script."
        Start-Sleep -Seconds 30
        continue
    }
    Write-Host "[lt-keeper] launching lt --port $LocalPort --subdomain $Subdomain"
    # On publie l'URL avant le lancement : elle est deterministe avec --subdomain.
    Publish-Url -Url $ExpectedUrl
    # Lance lt en foreground -- bloque jusqu'a deconnexion / crash.
    try {
        & $LtBin --port $LocalPort --subdomain $Subdomain *>> $LogPath
    } catch {
        Write-Host "[lt-keeper] error: $_"
    }
    Write-Host "[lt-keeper] lt exited, restart in 5s"
    Start-Sleep -Seconds 5
}
