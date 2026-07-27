$ErrorActionPreference = 'Stop'

# Build a self-contained Windows analyzer. The target machine will not need
# Python, pip, numpy, OpenCV, or matplotlib installed.
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$venv = Join-Path $root '.venv-analyzer-build'
$python = Join-Path $venv 'Scripts\python.exe'
$dist = Join-Path $root 'python\dist'
$work = Join-Path $root 'python\build'

Set-Location $root

if (-not (Test-Path $python)) {
  py -3 -m venv $venv
}

& $python -m pip install --upgrade pip
& $python -m pip install -r (Join-Path $root 'python\requirements.txt') pyinstaller

if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
if (Test-Path $work) { Remove-Item $work -Recurse -Force }

& $python -m PyInstaller `
  --onefile `
  --clean `
  --name ScalpAI-Python-Analyzer `
  --distpath $dist `
  --workpath $work `
  --specpath $work `
  --collect-all cv2 `
  --collect-all numpy `
  --collect-all matplotlib `
  (Join-Path $root 'python\analyze.py')

$exe = Join-Path $dist 'ScalpAI-Python-Analyzer.exe'
if (-not (Test-Path $exe)) {
  throw "PyInstaller did not create $exe"
}

Write-Host "Standalone analyzer created: $exe" -ForegroundColor Green
Write-Host "The Electron NSIS build will include it automatically under resources/python." -ForegroundColor Cyan
