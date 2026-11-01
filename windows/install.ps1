<#
  Бабусин помічник: одноразове встановлення автооновлення (запускає онук, адміністратор не потрібен).

  Приклад:
    irm https://raw.githubusercontent.com/yyyaniv/granny-extension/main/windows/install.ps1 -OutFile $env:TEMP\i.ps1
    powershell -ExecutionPolicy Bypass -File $env:TEMP\i.ps1 -ZipUrl https://github.com/yyyaniv/granny-extension/releases/latest/download/BabusynPomichnyk.zip

  Параметри:
    -ZipUrl           посилання на BabusynPomichnyk.zip з останнього релізу
    -ExtensionDir     тека розширення (за замовчуванням C:\Babusia\GrannyExtention)
    -UpdateScriptUrl  звідки взяти update.ps1, якщо його немає поруч (за замовчуванням виводиться з -ZipUrl)
    -CreateIfMissing  якщо теки розширення ще немає — завантажити туди останню версію
    -Uninstall        прибрати завдання планувальника і скрипти (розширення не чіпає)
#>
param(
  [string]$ZipUrl,
  [string]$ExtensionDir = 'C:\Babusia\GrannyExtention',
  [string]$UpdateScriptUrl,
  [switch]$CreateIfMissing,
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$TaskName = 'BabusynPomichnyk-Update'
$AppDir = Join-Path $env:LOCALAPPDATA 'BabusynPomichnyk'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Stop-With([string]$Message) {
  Write-Host ''
  Write-Host $Message -ForegroundColor Red
  exit 1
}

if ($Uninstall) {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Завдання $TaskName видалено."
  } else {
    Write-Host 'Завдання автооновлення не знайдено.'
  }
  if (Test-Path $AppDir) { Remove-Item -Path $AppDir -Recurse -Force -ErrorAction SilentlyContinue }
  Write-Host 'Готово. Саме розширення в Chrome і його дані не змінювались.' -ForegroundColor Green
  exit 0
}

if (-not $ZipUrl -or $ZipUrl -notmatch '^https://') {
  Stop-With 'Вкажіть -ZipUrl, наприклад: -ZipUrl https://github.com/yyyaniv/granny-extension/releases/latest/download/BabusynPomichnyk.zip'
}

# ---- extension folder ----
if (-not (Test-Path (Join-Path $ExtensionDir 'manifest.json'))) {
  if ($CreateIfMissing) {
    Write-Host "Теки розширення немає, завантажую останню версію в $ExtensionDir ..."
    $tmp = Join-Path $env:TEMP ('bp-install-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tmp -Force | Out-Null
    try {
      $zip = Join-Path $tmp 'package.zip'
      Invoke-WebRequest -Uri $ZipUrl -OutFile $zip -UseBasicParsing -TimeoutSec 120 | Out-Null
      New-Item -ItemType Directory -Path $ExtensionDir -Force | Out-Null
      Expand-Archive -Path $zip -DestinationPath $ExtensionDir -Force
    } catch {
      Stop-With "Не вдалося завантажити розширення: $($_.Exception.Message)"
    } finally {
      Remove-Item -Path $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
    if (-not (Test-Path (Join-Path $ExtensionDir 'manifest.json'))) { Stop-With 'В архіві немає manifest.json.' }
    Write-Host ''
    Write-Host 'Тепер один раз підключіть його в Chrome (потім автооновлення працюватиме саме):' -ForegroundColor Yellow
    Write-Host "  chrome://extensions -> Режим розробника -> Завантажити розпаковане -> $ExtensionDir"
    Write-Host ''
  } else {
    Stop-With ("У теці $ExtensionDir немає manifest.json.`n" +
      "Спочатку підключіть розширення в Chrome:`n" +
      "  1) скопіюйте теку розширення в $ExtensionDir;`n" +
      "  2) відкрийте chrome://extensions, увімкніть «Режим розробника»;`n" +
      "  3) натисніть «Завантажити розпаковане» і оберіть цю теку;`n" +
      "  4) запустіть цей скрипт ще раз.`n" +
      "Або додайте -CreateIfMissing, щоб скрипт сам завантажив розширення в цю теку.")
  }
}

# ---- scripts ----
New-Item -ItemType Directory -Path $AppDir -Force | Out-Null
$dest = Join-Path $AppDir 'update.ps1'
$local = Join-Path $PSScriptRoot 'update.ps1'
if ($PSScriptRoot -and (Test-Path $local)) {
  Copy-Item -Path $local -Destination $dest -Force
} else {
  if (-not $UpdateScriptUrl) {
    if ($ZipUrl -match '^https://github\.com/([^/]+)/([^/]+)/') {
      $UpdateScriptUrl = "https://raw.githubusercontent.com/$($Matches[1])/$($Matches[2])/main/windows/update.ps1"
    } else {
      Stop-With 'update.ps1 немає поруч. Вкажіть -UpdateScriptUrl.'
    }
  }
  try {
    Invoke-WebRequest -Uri $UpdateScriptUrl -OutFile $dest -UseBasicParsing -TimeoutSec 60 | Out-Null
  } catch {
    Stop-With "Не вдалося завантажити update.ps1: $($_.Exception.Message)"
  }
}

$config = @{ zipUrl = $ZipUrl; extensionDir = $ExtensionDir } | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $AppDir 'config.json'), $config, (New-Object System.Text.UTF8Encoding($false)))

# ---- scheduled task (current user, no admin) ----
# No console flash: conhost --headless (Windows 10 1809+); older systems fall back to a hidden window.
$psArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$dest`""
if ([Environment]::OSVersion.Version.Build -ge 17763) {
  $action = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument "--headless powershell.exe $psArgs"
} else {
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-WindowStyle Hidden $psArgs"
}
$user = "$env:USERDOMAIN\$env:USERNAME"
$logon = New-ScheduledTaskTrigger -AtLogOn -User $user
# No -RepetitionDuration: repeats indefinitely (MaxValue breaks Register-ScheduledTask on some builds).
$hourly = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 1)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew -Hidden
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
try {
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($logon, $hourly) -Settings $settings -Principal $principal -Force | Out-Null
} catch {
  Stop-With "Не вдалося створити завдання планувальника: $($_.Exception.Message)"
}

# ---- first run ----
Write-Host 'Перевіряю оновлення...'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $dest
$code = $LASTEXITCODE
$log = Join-Path $AppDir 'update.log'
Write-Host ''
if ($code -eq 0) {
  Write-Host 'Готово! Автооновлення встановлено: перевірка під час входу в Windows і щогодини.' -ForegroundColor Green
} else {
  Write-Host "Завдання створено, але перша перевірка закінчилась кодом $code. Дивіться журнал." -ForegroundColor Yellow
}
Write-Host "Журнал: $log"
if (Test-Path $log) { Get-Content -Path $log -Tail 3 -Encoding UTF8 }
Write-Host 'Не переносьте теку розширення: від її шляху залежать збережені дані.'
exit $code
