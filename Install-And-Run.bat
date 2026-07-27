@echo off
title ScalpAI Setup
cd /d "%~dp0"
color 0A

echo =========================================
echo       ScalpAI - Installation Script
echo =========================================
echo.

REM Check Node.js
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

echo [1/3] Installing dependencies...
call npm install
if errorlevel 1 (
    echo [ERROR] Failed to install dependencies!
    pause
    exit /b 1
)

echo.
echo [2/3] Building application...
call npm run build
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

start "" npx electron .
