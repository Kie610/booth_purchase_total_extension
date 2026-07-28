[CmdletBinding()]
param(
  [string]$OutputDirectory = "dist",
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$extensionDirectory = Join-Path $repoRoot "extension"
$manifestPath = Join-Path $extensionDirectory "manifest.json"

if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw "extension/manifest.json が見つかりません。リポジトリ内の tools/release.ps1 を実行してください。"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$version = [string]$manifest.version
if ($version -notmatch '^\d+\.\d+\.\d+$') {
  throw "manifest.json の version が x.y.z 形式ではありません: $version"
}

if ([IO.Path]::IsPathRooted($OutputDirectory)) {
  $outputPath = [IO.Path]::GetFullPath($OutputDirectory)
} else {
  $outputPath = [IO.Path]::GetFullPath((Join-Path $repoRoot $OutputDirectory))
}

$releaseName = "booth-purchase-total-extension-v$version"
$zipPath = Join-Path $outputPath "$releaseName.zip"
$checksumPath = "$zipPath.sha256"

New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
foreach ($path in @($zipPath, $checksumPath)) {
  if ((Test-Path -LiteralPath $path) -and -not $Force) {
    throw "配布物が既にあります: $path (-Force で作り直せます)"
  }
}

if ($Force) {
  foreach ($path in @($zipPath, $checksumPath)) {
    if (Test-Path -LiteralPath $path) {
      Remove-Item -LiteralPath $path -Force
    }
  }
}

$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$stagingPath = Join-Path $tempBase ("booth-release-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $stagingPath | Out-Null

try {
  Get-ChildItem -LiteralPath $extensionDirectory -Force |
    Copy-Item -Destination $stagingPath -Recurse -Force

  $stagedManifest = Join-Path $stagingPath "manifest.json"
  if (-not (Test-Path -LiteralPath $stagedManifest -PathType Leaf)) {
    throw "配布物のルートに manifest.json を配置できませんでした。"
  }

  Compress-Archive -Path (Join-Path $stagingPath "*") -DestinationPath $zipPath -CompressionLevel Optimal
  $hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
  "$hash  $([IO.Path]::GetFileName($zipPath))" |
    Set-Content -LiteralPath $checksumPath -Encoding ascii
} finally {
  $resolvedStaging = [IO.Path]::GetFullPath($stagingPath)
  if ($resolvedStaging.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase) -and
      [IO.Path]::GetFileName($resolvedStaging).StartsWith("booth-release-")) {
    Remove-Item -LiteralPath $resolvedStaging -Recurse -Force -ErrorAction SilentlyContinue
  }
}

Write-Output "Created: $zipPath"
Write-Output "SHA256: $checksumPath"
