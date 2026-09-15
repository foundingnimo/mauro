param([switch]$NoHooks, [switch]$Update, [switch]$Yes)

$ErrorActionPreference = "Stop"

$MauroSourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$MauroClaudeDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME ".claude" }
$MauroRuntimeDir = Join-Path $MauroClaudeDir "mauro"
$MauroSkillDir = Join-Path $MauroClaudeDir "skills\mauro"

function Get-MauroVersion($Dir) {
  try { return (Get-Content (Join-Path $Dir "package.json") -Raw | ConvertFrom-Json).version } catch { return "unknown" }
}
function Get-MauroCommit($Dir) {
  try { $c = & git -C $Dir rev-parse --short HEAD 2>$null; if ($LASTEXITCODE -eq 0) { return $c } } catch {}
  return "no commit"
}

$SourceVersion = Get-MauroVersion $MauroSourceDir
$SourceCommit = Get-MauroCommit $MauroSourceDir

if ((Test-Path $MauroRuntimeDir) -or (Test-Path $MauroSkillDir)) {
  $InstalledVersion = Get-MauroVersion $MauroRuntimeDir
  $InstalledCommit = "unknown commit"
  try { $InstalledCommit = (Get-Content (Join-Path $MauroRuntimeDir ".install.json") -Raw | ConvertFrom-Json).commit } catch {}
  Write-Host "Mauro $InstalledVersion ($InstalledCommit) is installed in $MauroRuntimeDir."
  Write-Host "This checkout is $SourceVersion ($SourceCommit)."
  if (-not $Update) {
    if ($Yes) {
      $Update = $true
    } elseif ([Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
      $Answer = Read-Host "Update the installation from this checkout? Settings and hooks stay. [Y/n]"
      if ($Answer -eq "" -or $Answer -match '^(y|yes)$') { $Update = $true } else { Write-Host "Nothing changed."; exit 0 }
    } else {
      throw "Run install.ps1 -Update to replace it from this checkout, or use plugin mode."
    }
  }
  # Replace the runtime and the skill from this checkout. Hooks and settings stay.
  Remove-Item -Recurse -Force -Path $MauroRuntimeDir
  if (Test-Path $MauroSkillDir) { Remove-Item -Recurse -Force -Path $MauroSkillDir }
} elseif ($Update) {
  throw "Mauro is not installed. Run install.ps1 without -Update."
}

New-Item -ItemType Directory -Force -Path $MauroRuntimeDir | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $MauroSkillDir) | Out-Null
foreach ($Name in @(".claude-plugin", "agents", "bin", "docs", "hooks", "schemas", "scripts", "skills", "templates")) {
  Copy-Item -Recurse -Path (Join-Path $MauroSourceDir $Name) -Destination (Join-Path $MauroRuntimeDir $Name)
}
Copy-Item -Path (Join-Path $MauroSourceDir "package.json") -Destination $MauroRuntimeDir
Copy-Item -Path (Join-Path $MauroSourceDir "LICENSE") -Destination $MauroRuntimeDir
Copy-Item -Recurse -Path (Join-Path $MauroSourceDir "skills\mauro") -Destination $MauroSkillDir
@{ version = $SourceVersion; commit = $SourceCommit; source = $MauroSourceDir; installed_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ") } |
  ConvertTo-Json | Set-Content (Join-Path $MauroRuntimeDir ".install.json")

if ($Update) {
  Write-Host "Updated Mauro to $SourceVersion ($SourceCommit). Restart Claude Code."
  exit 0
}
if (-not $NoHooks) {
  & node (Join-Path $MauroRuntimeDir "scripts\install-standalone-hooks.mjs") $MauroClaudeDir
  if ($LASTEXITCODE -ne 0) { throw "Mauro hook installation failed." }
}

Write-Host "Installed Mauro $SourceVersion ($SourceCommit). Restart Claude Code, then run /mauro help."
if ($NoHooks) { Write-Host "Hooks were not installed. Run /mauro check at session start." }
