@echo off
setlocal
cd /d "%~dp0"
title Optimization Analyzer - Milestone 3

echo.
echo  ==============================================
echo     OPTIMIZATION ANALYZER - MILESTONE 3
echo  ==============================================
echo.

where py >nul 2>nul
if %errorlevel%==0 (
    set "PYTHON=py"
) else (
    where python >nul 2>nul
    if errorlevel 1 (
        echo ERROR: Python was not found.
        echo Install Python 3.10 or newer from https://www.python.org/downloads/
        echo During installation, select "Add Python to PATH".
        pause
        exit /b 1
    )
    set "PYTHON=python"
)

echo [1/2] Installing/checking project packages. First run may take a few minutes...
%PYTHON% -m pip install -r requirements.txt
if errorlevel 1 (
    echo.
    echo ERROR: Package installation failed. Check your internet connection and Python installation.
    pause
    exit /b 1
)

echo.
echo [2/2] Starting the web application...
echo When it starts, use http://127.0.0.1:5000 in your browser.
echo Keep this window open while using the app. Press Ctrl+C to stop.
echo.
%PYTHON% app.py
if errorlevel 1 (
    echo.
    echo The app stopped because of an error. Read the message above.
    pause
)
endlocal
