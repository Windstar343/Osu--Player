param([switch]$Release)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (!$nodeCommand) { throw 'Install Node.js LTS, then open a new terminal.' }
$cargoCommand = Get-Command cargo -ErrorAction SilentlyContinue
$cargoExecutable = if ($cargoCommand) { $cargoCommand.Source } else { Join-Path $env:USERPROFILE '.cargo\bin\cargo.exe' }
if (!(Test-Path -LiteralPath $cargoExecutable)) { throw 'Install Rust using rustup first.' }
if (!(Test-Path -LiteralPath 'node_modules/typescript/bin/tsc')) { throw 'Run npm install first.' }
& $nodeCommand.Source node_modules/typescript/bin/tsc
if ($LASTEXITCODE -ne 0) { throw 'TypeScript validation failed.' }
& $nodeCommand.Source node_modules/vite/bin/vite.js build
if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
& dotnet publish tools/LazerReader -c Release -o src-tauri/resources/lazer-reader
if ($LASTEXITCODE -ne 0) { throw 'Lazer reader build failed.' }
$buildArguments = @('build', '--manifest-path', 'src-tauri/Cargo.toml', '--features', 'custom-protocol')
if ($Release) { $buildArguments += '--release' }
& $cargoExecutable @buildArguments
if ($LASTEXITCODE -ne 0) { throw 'Desktop build failed.' }
$configuration = if ($Release) { 'release' } else { 'debug' }
Copy-Item -LiteralPath "src-tauri/target/$configuration/osu-player.exe" -Destination 'Osu! Player.exe' -Force
Write-Host 'Ready: double-click Osu! Player.exe in this folder.'
