# Runs spotify-audio.cs in-process: Smart App Control blocks unsigned exes,
# but signed PowerShell can compile and run the same code.
$ErrorActionPreference = "Stop"
Add-Type -Path (Join-Path $PSScriptRoot "spotify-audio.cs")
[SpotifyAudio]::Main()
