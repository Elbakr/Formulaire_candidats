# Tunnel keeper — maintient un tunnel Cloudflare quick en vie 24/7 et publie
# l'URL active dans caftan-rh/TUNNEL_URL.txt (committé+pushé sur GitHub).
#
# Karim peut bookmarker en permanence :
#   https://raw.githubusercontent.com/Elbakr/Formulaire_candidats/caftan-rh-v2-prod/caftan-rh/TUNNEL_URL.txt
# qui contient toujours l'URL active. Il l'ouvre sur iPhone, copie, navigue.
#
# Usage : ouvrir un PowerShell admin et lancer
#   pwsh -File scripts\tunnel-keeper.ps1
# (ou tâche planifiée Windows pour démarrer au boot)

$ErrorActionPreference = "Continue"
$LogPath = "$env:USERPROFILE\cloudflared-tunnel.log"
$UrlFile = "C:\Users\KElba\Documents\GitHub\Formulaire_candidats\caftan-rh\TUNNEL_URL.txt"
$Cloudflared = "$env:USERPROFILE\cloudflared.exe"
$Git = "C:\Users\KElba\PortableGit\cmd\git.exe"
$RepoDir = "C:\Users\KElba\Documents\GitHub\Formulaire_candidats"
$LocalPort = 3000

Write-Host "[tunnel-keeper] Demarre — $(Get-Date)"

function Get-CloudflaredProcess {
    Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Select-Object -First 1
}

function Get-TunnelUrlFromLog {
    if (-not (Test-Path $LogPath)) { return $null }
    $content = Get-Content $LogPath -Raw -ErrorAction SilentlyContinue
    if (-not $content) { return $null }
    $m = [regex]::Match($content, "https://[a-z0-9-]+\.trycloudflare\.com")
    if ($m.Success) { return $m.Value }
    return $null
}

function Start-Tunnel {
    Write-Host "[tunnel-keeper] Lance cloudflared..."
    if (Test-Path $LogPath) { Remove-Item $LogPath -Force -ErrorAction SilentlyContinue }
    Start-Process -FilePath $Cloudflared `
        -ArgumentList @("tunnel", "--url", "http://localhost:$LocalPort") `
        -RedirectStandardError $LogPath `
        -WindowStyle Hidden
    Start-Sleep -Seconds 8
    for ($i = 0; $i -lt 10; $i++) {
        $url = Get-TunnelUrlFromLog
        if ($url) { return $url }
        Start-Sleep -Seconds 2
    }
    return $null
}

function Publish-Url {
    param([string]$Url)
    $current = if (Test-Path $UrlFile) { (Get-Content $UrlFile -Raw -ErrorAction SilentlyContinue).Trim() } else { "" }
    if ($current -eq $Url) { return }
    Write-Host "[tunnel-keeper] URL change : $current -> $Url"
    $payload = @"
$Url

Tunnel actif depuis $(Get-Date -Format "yyyy-MM-dd HH:mm").
Ce fichier est mis a jour automatiquement par scripts/tunnel-keeper.ps1.
Bookmark cette page sur ton iPhone, l'URL ici est toujours la bonne.
"@
    Set-Content -Path $UrlFile -Value $payload -Encoding UTF8
    Push-Location $RepoDir
    try {
        & $Git add caftan-rh/TUNNEL_URL.txt 2>&1 | Out-Null
        & $Git commit -m "chore(tunnel): publish active URL $($Url.Substring(8, [Math]::Min(32, $Url.Length - 8)))" 2>&1 | Out-Null
        & $Git push origin caftan-rh-v2-prod:caftan-rh-v2-prod 2>&1 | Out-Null
        Write-Host "[tunnel-keeper] Push GitHub OK"
    } catch {
        Write-Host "[tunnel-keeper] Push echoue : $_"
    }
    Pop-Location
}

function Test-TunnelAlive {
    param([string]$Url)
    if (-not $Url) { return $false }
    try {
        $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 8 -MaximumRedirection 0 -ErrorAction Stop
        return ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500)
    } catch {
        return $false
    }
}

# Boucle de surveillance principale
$currentUrl = $null
while ($true) {
    $proc = Get-CloudflaredProcess
    if (-not $proc) {
        $currentUrl = Start-Tunnel
        if ($currentUrl) { Publish-Url -Url $currentUrl }
    } else {
        $url = Get-TunnelUrlFromLog
        if ($url -and $url -ne $currentUrl) {
            $currentUrl = $url
            Publish-Url -Url $currentUrl
        }
        # Healthcheck : si le tunnel ne repond plus depuis 2 min, on le tue
        if (-not (Test-TunnelAlive -Url $currentUrl)) {
            Write-Host "[tunnel-keeper] Healthcheck KO, kill+restart"
            Stop-Process -Name "cloudflared" -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
            $currentUrl = Start-Tunnel
            if ($currentUrl) { Publish-Url -Url $currentUrl }
        }
    }
    Start-Sleep -Seconds 60
}
