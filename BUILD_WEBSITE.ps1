$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$compiler = Join-Path $PSScriptRoot 'frontend/node_modules/@esbuild/win32-x64/esbuild.exe'
if (!(Test-Path -LiteralPath $compiler)) { throw 'Run npm install in frontend first.' }
& $compiler frontend/src/main.jsx --bundle --minify --outfile=frontend/dist/assets/app.js '--define:process.env.NODE_ENV="production"'
if ($LASTEXITCODE -ne 0) { throw 'Website build failed.' }
Copy-Item -LiteralPath frontend/public/gdrfa-logo.png -Destination frontend/dist/gdrfa-logo.png
Copy-Item -LiteralPath frontend/public/uae-pass-mark.png -Destination frontend/dist/uae-pass-mark.png
Copy-Item -LiteralPath frontend/public/uae-pass-mark-transparent.png -Destination frontend/dist/uae-pass-mark-transparent.png
$page = '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>GDRFA Shelter Services</title><link rel="stylesheet" href="/assets/app.css"></head><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>'
Set-Content -LiteralPath frontend/dist/index.html -Value $page -Encoding utf8
Write-Host 'Website built. Run START_PROJECT.bat or py -3 run_shelter.py.'
