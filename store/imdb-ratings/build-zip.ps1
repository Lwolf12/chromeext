# Builds the Chrome Web Store upload ZIP for imdb-ratings: manifest.json at
# the ZIP root (the store requires that), no data/, no docs. Output: dist/.
#
# Uses ZipArchive directly rather than Compress-Archive: on Windows
# PowerShell 5.1 Compress-Archive writes entry names with backslashes
# (icons\icon128.png), and the store then cannot find the icons.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$src = Join-Path $root 'imdb-ratings'
$ver = (Get-Content (Join-Path $src 'manifest.json') -Raw | ConvertFrom-Json).version
$out = Join-Path $root "dist\imdb-ratings-v$ver-webstore.zip"
New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null
if (Test-Path $out) { Remove-Item $out }

$skipDirs = @('data')
$skipFiles = @('README.md', 'PRIVACY.md')
$skipExt = @('.zip', '.crx', '.pem')

$zip = [IO.Compression.ZipFile]::Open($out, [IO.Compression.ZipArchiveMode]::Create)
try {
  Get-ChildItem $src -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($src.Length + 1) -replace '\\', '/'
    $top = $rel.Split('/')[0]
    if ($top -in $skipDirs) { return }
    if ($rel -in $skipFiles -or $_.Extension -in $skipExt) { return }
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally {
  $zip.Dispose()
}
Write-Host "Wrote $out"
