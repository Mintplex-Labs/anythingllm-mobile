# This script creates a universal APK for CDN distribution

Write-Host "Creating universal APK for CDN distribution..."

& "C:\Program Files\Java\jdk-17\bin\java.exe" -jar "scripts\bundletool-1.18.1.jar" build-apks `
--bundle="android\app\build\outputs\bundle\release\app-release.aab" `
--output="android\app\build\outputs\apks\app-release-universal.apks" `
--mode=universal `
--ks="android/app/anythingllm-upload-key.keystore" `
--ks-key-alias="anythingllm-keystore" `
--ks-pass="pass:anythingllm!"

Write-Host "Universal APK generated successfully"

# Extract the universal APK
$outputDir = "android\app\build\outputs\apks\universal"
if (!(Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

# Copy and extract
Copy-Item "android\app\build\outputs\apks\app-release-universal.apks" "android\app\build\outputs\apks\app-release-universal.zip" -Force
Expand-Archive -Path "android\app\build\outputs\apks\app-release-universal.zip" -DestinationPath $outputDir -Force
Remove-Item "android\app\build\outputs\apks\app-release-universal.zip" -Force

Write-Host "Universal APK extracted to: $outputDir"
Write-Host "Ready for CDN upload!"

Read-Host "Press Enter to continue" 