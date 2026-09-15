param([switch]$NoHooks)

$ErrorActionPreference = "Stop"

$MauroSourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$MauroClaudeDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME ".claude" }
$MauroRuntimeDir = Join-Path $MauroClaudeDir "mauro"
$MauroSkillDir = Join-Path $MauroClaudeDir "skills\mauro"

if ((Test-Path $MauroRuntimeDir) -or (Test-Path $MauroSkillDir)) {
  throw "Mauro is already installed. Remove the old installation or use plugin mode."
}

New-Item -ItemType Directory -Force -Path $MauroRuntimeDir | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $MauroSkillDir) | Out-Null
foreach ($Name in @(".claude-plugin", "agents", "bin", "docs", "hooks", "schemas", "scripts", "skills", "templates")) {
  Copy-Item -Recurse -Path (Join-Path $MauroSourceDir $Name) -Destination (Join-Path $MauroRuntimeDir $Name)
}
Copy-Item -Path (Join-Path $MauroSourceDir "package.json") -Destination $MauroRuntimeDir
Copy-Item -Path (Join-Path $MauroSourceDir "LICENSE") -Destination $MauroRuntimeDir
Copy-Item -Recurse -Path (Join-Path $MauroSourceDir "skills\mauro") -Destination $MauroSkillDir

if (-not $NoHooks) {
  & node (Join-Path $MauroRuntimeDir "scripts\install-standalone-hooks.mjs") $MauroClaudeDir
  if ($LASTEXITCODE -ne 0) { throw "Mauro hook installation failed." }
}

Write-Host "Installed Mauro. Restart Claude Code, then run /mauro help."
if ($NoHooks) { Write-Host "Hooks were not installed. Run /mauro check at session start." }
