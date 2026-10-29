# Disposable CI fixture only. Never remove a pre-existing application profile.
$ErrorActionPreference = 'Stop'
$installers = @(Get-ChildItem 'src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/*-setup.exe')
if ($installers.Count -ne 1) { throw 'Expected exactly one installer' }
$destination = Join-Path $env:RUNNER_TEMP ('xasma-installer-smoke-' + [Guid]::NewGuid().ToString())
$xasmaProfileDir = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'io.xasmabeats.release-manager'
if ((Test-Path $destination) -or (Test-Path $xasmaProfileDir)) {
  throw 'Smoke test requires fresh disposable paths; refusing to touch existing application data.'
}
New-Item -ItemType Directory -Path $xasmaProfileDir | Out-Null
$marker = Join-Path $xasmaProfileDir 'xasma-ci-retention-marker.txt'
Set-Content $marker 'Synthetic CI retention fixture; not user data.' -Encoding utf8

$install = Start-Process -FilePath $installers[0].FullName -ArgumentList @('/S', "/D=$destination") -Wait -PassThru
if ($install.ExitCode -ne 0) { throw "Silent install failed: $($install.ExitCode)" }
$payloads = @(Get-ChildItem $destination -File -Filter '*.exe' | Where-Object { $_.Name -notmatch 'uninstall' })
if ($payloads.Count -ne 1) { throw 'Expected one installed application executable' }
$app = $payloads[0].FullName
$tools = Join-Path $destination 'media-tools'
foreach ($file in @('ffmpeg.exe','ffprobe.exe','SHA256SUMS','COPYING.GPLv2','X264-COPYING','NOTICE.md','source/ffmpeg-source.tar.gz','source/x264-source.tar.gz','source/build-media-tools.sh')) {
  if (!(Test-Path (Join-Path $tools $file))) { throw "Installed tool/source/license resource missing: $file" }
}
foreach ($file in @('ffmpeg.exe','ffprobe.exe')) {
  $line = @(Get-Content (Join-Path $tools 'SHA256SUMS') | Where-Object { $_ -match "\s+$([Regex]::Escape($file))$" })
  if ($line.Count -ne 1) { throw "Missing installed checksum: $file" }
  $expected = ($line[0] -split '\s+')[0]
  $actual = (Get-FileHash (Join-Path $tools $file) -Algorithm SHA256).Hash
  if ($expected -ne $actual) { throw "Installed tool checksum mismatch: $file" }
}
# Execute installed tools without build-toolchain directories in PATH. This catches
# accidentally dynamic non-system DLL dependencies hidden by the CI environment.
$originalSearchPath = $env:PATH
try {
  $env:PATH = "$env:SystemRoot\System32;$env:SystemRoot"
  foreach ($file in @('ffmpeg.exe','ffprobe.exe')) {
    $probe = Start-Process -FilePath (Join-Path $tools $file) -ArgumentList '-version' -Wait -PassThru -NoNewWindow
    if ($probe.ExitCode -ne 0) { throw "Installed tool failed without development PATH: $file ($($probe.ExitCode))" }
  }
} finally { $env:PATH = $originalSearchPath }
# Check payload architecture, not the NSIS bootstrapper's own architecture.
$stream = [IO.File]::OpenRead($app)
try {
  $reader = [IO.BinaryReader]::new($stream)
  $stream.Position = 0x3c
  $offset = $reader.ReadInt32()
  $stream.Position = $offset
  if ($reader.ReadUInt32() -ne 0x4550 -or $reader.ReadUInt16() -ne 0x8664) { throw 'Installed payload is not Windows AMD64 PE' }
} finally { $stream.Dispose() }

$uninstaller = Join-Path $destination 'uninstall.exe'
if (!(Test-Path $uninstaller)) { throw 'NSIS uninstaller is missing' }
# In-place _?= makes completion deterministic; this is a silent fixture uninstall,
# not a claim about interactive UI behavior or every uninstall option.
$uninstall = Start-Process -FilePath $uninstaller -ArgumentList @('/S', "_?=$destination") -Wait -PassThru
if ($uninstall.ExitCode -ne 0) { throw "Silent uninstall failed: $($uninstall.ExitCode)" }
if (Test-Path $app) { throw 'Uninstaller did not remove the application executable' }
if (!(Test-Path $marker)) { throw 'Silent uninstall removed the synthetic application-data marker' }

'## Installer smoke verification' | Add-Content $env:GITHUB_STEP_SUMMARY
"Commit: $env:GITHUB_SHA" | Add-Content $env:GITHUB_STEP_SUMMARY
'Passed: silent per-user install, installed x64 payload, tool hashes/execution without development PATH, corresponding source/license resources, silent in-place uninstall, synthetic app-data retention.' | Add-Content $env:GITHUB_STEP_SUMMARY
'Not performed: interactive GUI, file picker/drag-drop, actual WebView2 first-install download, real-user desktop playback.' | Add-Content $env:GITHUB_STEP_SUMMARY
# Clean only the owned fixture marker and the explicitly unique install directory.
Remove-Item $marker
if (@(Get-ChildItem $xasmaProfileDir -Force).Count -eq 0) { Remove-Item $xasmaProfileDir }
if (Test-Path $destination) { Remove-Item $destination -Recurse -Force }
