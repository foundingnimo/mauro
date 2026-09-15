param([switch]$NoHooks, [switch]$Update)

$ErrorActionPreference = "Stop"

$MauroSourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$MauroClaudeDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME ".claude" }
$MauroRuntimeDir = Join-Path $MauroClaudeDir "mauro"
$MauroSkillDir = Join-Path $MauroClaudeDir "skills\mauro"

if ($Update) {
  if (-not (Test-Path $MauroRuntimeDir)) { throw "Mauro is not installed. Run install.ps1 without -Update." }
  # Replace the runtime and the skill from this checkout. Hooks and settings stay.
  Remove-Item -Recurse -Force -Path $MauroRuntimeDir
  if (Test-Path $MauroSkillDir) { Remove-Item -Recurse -Force -Path $MauroSkillDir }
} elseif ((Test-Path $MauroRuntimeDir) -or (Test-Path $MauroSkillDir)) {
  throw "Mauro is already installed. Run install.ps1 -Update to replace it from this checkout, or use plugin mode."
}

New-Item -ItemType Directory -Force -Path $MauroRuntimeDir | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $MauroSkillDir) | Out-Null
foreach ($Name in @(".claude-plugin", "agents", "bin", "docs", "hooks", "schemas", "scripts", "skills", "templates")) {
  Copy-Item -Recurse -Path (Join-Path $MauroSourceDir $Name) -Destination (Join-Path $MauroRuntimeDir $Name)
}
Copy-Item -Path (Join-Path $MauroSourceDir "package.json") -Destination $MauroRuntimeDir
Copy-Item -Path (Join-Path $MauroSourceDir "LICENSE") -Destination $MauroRuntimeDir
Copy-Item -Recurse -Path (Join-Path $MauroSourceDir "skills\mauro") -Destination $MauroSkillDir

if ($Update) {
  Write-Host "Updated Mauro from $MauroSourceDir. Restart Claude Code."
  exit 0
}
if (-not $NoHooks) {
  & node (Join-Path $MauroRuntimeDir "scripts\install-standalone-hooks.mjs") $MauroClaudeDir
  if ($LASTEXITCODE -ne 0) { throw "Mauro hook installation failed." }
}

Write-Host "Installed Mauro. Restart Claude Code, then run /mauro help."
if ($NoHooks) { Write-Host "Hooks were not installed. Run /mauro check at session start." }
