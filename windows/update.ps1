<#
  Бабусин помічник: автоматичне оновлення розширення (Windows PowerShell 5.1, без модулів).
  Запускається планувальником (див. install.ps1). Налаштування беруться з config.json поруч зі скриптом:
    { "zipUrl": "https://github.com/yyyaniv/granny-extension/releases/latest/download/BabusynPomichnyk.zip",
      "extensionDir": "C:\\Babusia\\GrannyExtention" }
  Коди завершення:
    0  оновлено або вже остання версія
    10 помилка налаштувань (config.json або тека розширення)
    11 не вдалося завантажити архів
    12 архів некоректний (перевірка не пройдена, нічого не змінено)
    13 не вдалося скопіювати файли
    14 інший екземпляр уже працює
    1  непередбачена помилка
#>
param([string]$ConfigPath)

$ErrorActionPreference = 'Stop'
$AppDir = Join-Path $env:LOCALAPPDATA 'BabusynPomichnyk'
$LogFile = Join-Path $AppDir 'update.log'
if (-not $ConfigPath) { $ConfigPath = Join-Path $PSScriptRoot 'config.json' }

function Write-Log([string]$Message) {
  try {
    if (-not (Test-Path $AppDir)) { New-Item -ItemType Directory -Path $AppDir -Force | Out-Null }
    # Cap the log: keep the last 300 lines once it grows past 200 KB.
    if ((Test-Path $LogFile) -and ((Get-Item $LogFile).Length -gt 200KB)) {
      $tail = Get-Content -Path $LogFile -Tail 300 -Encoding UTF8
      Set-Content -Path $LogFile -Value $tail -Encoding UTF8
    }
    $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
  } catch { }
}

function Finish([int]$Code, [string]$Message) {
  Write-Log ('[{0}] {1}' -f $Code, $Message)
  exit $Code
}

function Read-Manifest([string]$Path) {
  $raw = Get-Content -Path $Path -Raw -Encoding UTF8
  return ($raw | ConvertFrom-Json)
}

function To-Version($Text) {
  try { return [version]([string]$Text) } catch { return $null }
}

# Only one update at a time.
$mutex = New-Object System.Threading.Mutex($false, 'Local\BabusynPomichnykUpdate')
$hasLock = $false
$work = $null
try {
  try { $hasLock = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $hasLock = $true }
  if (-not $hasLock) { Finish 14 'Інший екземпляр оновлення вже працює.' }

  # ---- config ----
  if (-not (Test-Path $ConfigPath)) { Finish 10 "Немає файла налаштувань: $ConfigPath" }
  try { $cfg = Get-Content -Path $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { Finish 10 "config.json не читається: $($_.Exception.Message)" }
  $zipUrl = [string]$cfg.zipUrl
  $extDir = [string]$cfg.extensionDir
  if (-not $zipUrl -or $zipUrl -notmatch '^https://') { Finish 10 'У config.json немає правильного zipUrl (https://...).' }
  if (-not $extDir) { Finish 10 'У config.json немає extensionDir.' }
  $installedManifest = Join-Path $extDir 'manifest.json'
  if (-not (Test-Path $installedManifest)) { Finish 10 "У теці розширення немає manifest.json: $extDir" }
  try { $installed = Read-Manifest $installedManifest } catch { Finish 10 'Встановлений manifest.json не читається.' }
  $curVer = To-Version $installed.version
  if (-not $curVer) { Finish 10 "Незрозуміла встановлена версія: $($installed.version)" }

  # ---- download ----
  $work = Join-Path $env:TEMP ('bp-update-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $work -Force | Out-Null
  $zipFile = Join-Path $work 'package.zip'
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipFile -UseBasicParsing -TimeoutSec 120 | Out-Null
  } catch { Finish 11 "Не вдалося завантажити архів: $($_.Exception.Message)" }

  # ---- unpack + validate (nothing is touched in the extension folder yet) ----
  $stage = Join-Path $work 'stage'
  try { Expand-Archive -Path $zipFile -DestinationPath $stage -Force } catch { Finish 12 "Архів не розпакувався: $($_.Exception.Message)" }
  $pkgRoot = $stage
  if (-not (Test-Path (Join-Path $pkgRoot 'manifest.json'))) {
    $sub = Get-ChildItem -Path $stage -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'manifest.json') } | Select-Object -First 1
    if ($sub) { $pkgRoot = $sub.FullName }
  }
  $newManifestPath = Join-Path $pkgRoot 'manifest.json'
  if (-not (Test-Path $newManifestPath)) { Finish 12 'В архіві немає manifest.json.' }
  try { $new = Read-Manifest $newManifestPath } catch { Finish 12 'manifest.json в архіві не є правильним JSON.' }
  if ($new.manifest_version -ne 3) { Finish 12 'manifest_version в архіві не дорівнює 3.' }
  $newVer = To-Version $new.version
  if (-not $newVer) { Finish 12 "Незрозуміла версія в архіві: $($new.version)" }
  if (-not (Test-Path (Join-Path $pkgRoot 'src'))) { Finish 12 'В архіві немає теки src.' }
  $sw = [string]$new.background.service_worker
  if ($sw -and -not (Test-Path (Join-Path $pkgRoot $sw))) { Finish 12 "В архіві немає файла $sw" }

  if ($newVer -le $curVer) { Finish 0 "Оновлення не потрібне (встановлено $curVer, на сервері $newVer)." }

  # ---- copy: everything except manifest.json first, manifest.json LAST ----
  Write-Log "Оновлення $curVer -> $newVer"
  foreach ($dir in (Get-ChildItem -Path $pkgRoot -Directory)) {
    $dest = Join-Path $extDir $dir.Name
    # src is mirrored (obsolete files removed); other folders are only added to. Dot folders / windows are never touched.
    $mode = if ($dir.Name -eq 'src') { '/MIR' } else { '/E' }
    & robocopy $dir.FullName $dest $mode /R:2 /W:2 /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { Finish 13 "robocopy для $($dir.Name) завершився з кодом $LASTEXITCODE" }
  }
  foreach ($file in (Get-ChildItem -Path $pkgRoot -File | Where-Object { $_.Name -ne 'manifest.json' })) {
    try { Copy-Item -Path $file.FullName -Destination (Join-Path $extDir $file.Name) -Force } catch { Finish 13 "Не скопіювався $($file.Name): $($_.Exception.Message)" }
  }
  try {
    $tmpManifest = Join-Path $extDir 'manifest.json.new'
    Copy-Item -Path $newManifestPath -Destination $tmpManifest -Force
    Move-Item -Path $tmpManifest -Destination $installedManifest -Force
  } catch { Finish 13 "Не вдалося замінити manifest.json: $($_.Exception.Message)" }

  Finish 0 "Оновлено до $newVer. Chrome підхопить зміни сам (у безпечний момент)."
}
catch {
  Finish 1 "Непередбачена помилка: $($_.Exception.Message)"
}
finally {
  if ($work -and (Test-Path $work)) { Remove-Item -Path $work -Recurse -Force -ErrorAction SilentlyContinue }
  if ($hasLock) { try { $mutex.ReleaseMutex() } catch { } }
  $mutex.Dispose()
}
