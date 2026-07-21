# Clears WorkHunter's WebView2 disk cache, then launches `tauri dev`.
# Use this instead of `npm run tauri dev` whenever UI changes (layout, CSS, structural JSX)
# don't seem to show up after a restart - WebView2 caches HTTP responses from the Vite
# dev server independently of Vite's own HMR/caching.

$identifier = "com.nrasm.workhunter"
$webviewDataPath = Join-Path $env:LOCALAPPDATA $identifier

Get-Process -Name "workhunter" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

if (Test-Path $webviewDataPath) {
    try {
        Remove-Item -Path $webviewDataPath -Recurse -Force -ErrorAction Stop
        Write-Host "Cleared WebView2 cache at $webviewDataPath"
    } catch {
        Write-Warning "Could not fully clear WebView2 cache (is WorkHunter still running?): $_"
        exit 1
    }
} else {
    Write-Host "No existing WebView2 cache found at $webviewDataPath - nothing to clear."
}

npm run tauri dev
