@echo off
title PawTalk Backend
echo ==========================================
echo   PawTalk Backend - Starting...
echo ==========================================
echo.
cd /d "%~dp0backend"
call venv\Scripts\activate.bat
echo Starting Flask server on http://192.168.29.82:5000
echo Press Ctrl+C to stop.
echo.
python app.py
pause
