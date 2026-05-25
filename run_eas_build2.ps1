$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
$env:EXPO_TOKEN = "LwqtDMB1yIR9jD0DHLY4cUroS5sbV0_yvpQ-uKLs"
Set-Location "F:\Users\Beast\Desktop\PawTalk-main"

$eas = "$env:APPDATA\npm\eas.cmd"
Write-Host "=== Building APK with Railway backend URL ==="
& $eas build --platform android --profile preview --non-interactive
