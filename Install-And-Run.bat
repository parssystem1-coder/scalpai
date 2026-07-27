@echo off
title ScalpAI Setup
cd /d "%~dp0"
color 0A

echo =========================================
echo       ScalpAI - Installation Script
echo =========================================
echo.

REM ---- Check Node.js -------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node.js 22 LTS or newer from https://nodejs.org
    pause
    exit /b 1
)

REM better-sqlite3 requires Node 22+. Warn early instead of failing later
REM with a confusing native-module error.
for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 22 (
    echo [ERROR] Node.js 22 or newer is required. Detected major version: %NODE_MAJOR%
    echo Please update Node.js from https://nodejs.org
    pause
    exit /b 1
)

REM ---- Enable pnpm ---------------------------------------------------------
REM This project is pinned to pnpm via "packageManager" in package.json.
REM Using npm here would create a second, diverging lockfile.
call corepack enable >nul 2>nul
where pnpm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] pnpm is not available and corepack could not enable it.
    echo Try running this command manually in an Administrator terminal:
    echo     corepack enable
    pause
    exit /b 1
)

echo [1/3] Installing dependencies...
call pnpm install
if errorlevel 1 (
    echo [ERROR] Failed to install dependencies!
    echo If the download timed out, set a mirror and retry:
    echo     set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
    pause
    exit /b 1
)

echo.
echo [2/3] Building application...
call pnpm run build
if errorlevel 1 (
    echo [ERROR] Build failed!
    pause
    exit /b 1
)

echo.
echo [3/3] Starting ScalpAI...
echo.
echo =========================================
echo    Installation complete! Starting...
echo =========================================
timeout /t 2 >nul

call pnpm run electron
