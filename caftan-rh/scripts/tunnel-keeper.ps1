$ErrorActionPreference = "Continue"
$LogPath = "$env:USERPROFILE\cloudflared-tunnel.log"
$UrlFile = "C:\Users\KElba\Documents\GitHub\Formulaire_candidats\caftan-rh\TUNNEL_URL.txt"
$Cloudflared = "$env:USERPROFILE\cloudflared.exe"
$Git = "C:\Users\KElba\PortableGit\cmd\git.exe"
$RepoDir = "C:\Users\KElba\Documents\GitHub\Formulaire_candidats"
$LocalPort = 3000
$LockFile = "$env:USERPROFILE\tunnel-keeper.lock"

# Anti-doublon : un seul keeper a la fois. Si un autre tourne deja, on exit.
if (Test-Path $LockFile) {
    $oldPid = Get-Content $LockFile -ErrorAction SilentlyContinue
    if ($oldPid) {
        $other = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
        if ($other) {
            Write-Host "[keeper] another keeper already running (PID $oldPid), exiting."
            exit 0
        }
    }
}
$PID | Out-File $LockFile -Encoding ASCII -Force

Write-Host "[keeper] start $(Get-Date) PID=$PID"

function Get-Url {
    if (-not (Test-Path $LogPath)) { return $null }
    $c = Get-Content $LogPath -Raw -ErrorAction SilentlyContinue
    if (-not $c) { return $null }
    $m = [regex]::Match($c, "https://[a-z0-9-]+\.trycloudflare\.com")
    if ($m.Success) { return $m.Value }
    return $null
}

function Start-Tunnel {
    Write-Host "[keeper] starting cloudflared"
    if (Test-Path $LogPath) { Remove-Item $LogPath -Force -ErrorAction SilentlyContinue }
    Start-Process -FilePath $Cloudflared -ArgumentList @("tunnel", "--protocol", "http2", "--url", "http://localhost:$LocalPort") -RedirectStandardError $LogPath -WindowStyle Hidden
    Start-Sleep -Seconds 8
    for ($i = 0; $i -lt 10; $i++) {
        $u = Get-Url
        if ($u) { return $u }
        Start-Sleep -Seconds 2
    }
    return $null
}

function Publish {
    param([string]$Url)
    $existing = ""
    if (Test-Path $UrlFile) {
        $first = Get-Content $UrlFile -First 1 -ErrorAction SilentlyContinue
        if ($first) { $existing = $first.Trim() }
    }
    if ($existing -eq $Url) { return }
    Write-Host "[keeper] URL change to $Url"
    $stamp = (Get-Date -Format "yyyy-MM-dd HH:mm")
    $lines = @($Url, "", "Tunnel actif depuis $stamp.", "Mis a jour automatiquement par scripts/tunnel-keeper.ps1.", "Bookmark cette page, l URL ici est toujours la bonne.")
    Set-Content -Path $UrlFile -Value $lines -Encoding UTF8
    Push-Location $RepoDir
    try {
        & $Git add caftan-rh/TUNNEL_URL.txt 2>&1 | Out-Null
        $shortUrl = $Url.Substring(8, [Math]::Min(32, $Url.Length - 8))
        & $Git commit -m "chore(tunnel): publish $shortUrl" 2>&1 | Out-Null
        & $Git push origin caftan-rh-v2-prod:caftan-rh-v2-prod 2>&1 | Out-Null
        Write-Host "[keeper] pushed"
    } catch {
        Write-Host "[keeper] push failed"
    }
    Pop-Location
}

function Test-Alive {
    param([string]$Url)
    if (-not $Url) { return $false }
    try {
        $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 8 -MaximumRedirection 0 -ErrorAction Stop
        return ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500)
    } catch {
        return $false
    }
}

$currentUrl = $null
while ($true) {
    $proc = Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $proc) {
        $currentUrl = Start-Tunnel
        if ($currentUrl) { Publish -Url $currentUrl }
    } else {
        $u = Get-Url
        if ($u -and $u -ne $currentUrl) {
            $currentUrl = $u
            Publish -Url $currentUrl
        }
        if (-not (Test-Alive -Url $currentUrl)) {
            Write-Host "[keeper] healthcheck KO, restart"
            Stop-Process -Name "cloudflared" -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
            $currentUrl = Start-Tunnel
            if ($currentUrl) { Publish -Url $currentUrl }
        }
    }
    Start-Sleep -Seconds 60
}