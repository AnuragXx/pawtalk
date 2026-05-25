@echo off
title PawTalk Frontend
echo ==========================================
echo   PawTalk App - Starting Expo...
echo ==========================================
echo.
cd /d "%~dp0"
echo A QR code will appear below.
echo Scan it with the Expo Go app on your phone.
echo Your phone must be on the same WiFi as this PC.
echo.
npx expo start
pause
