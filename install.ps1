param(
  [switch]$NoHooks,
  [switch]$Update,
  [switch]$Yes,
  [Alias("Host")][ValidateSet("claude", "shared", "all")][string]$TargetHost = "all"
)

$ErrorActionPreference = "Stop"

$MauroSourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$MauroClaudeDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME ".claude" }
$MauroRuntimeDir = if ($env:MAURO_HOME) { $env:MAURO_HOME } else { Join-Path $HOME ".mauro" }
$MauroLegacyRuntimeDir = Join-Path $MauroClaudeDir "mauro"
$MauroClaudeSkillsDir = Join-Path $MauroClaudeDir "skills"
$MauroSharedSkillsDir = if ($env:AGENT_SKILLS_DIR) { $env:AGENT_SKILLS_DIR } else { Join-Path $HOME ".agents\skills" }

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Mauro requires Node.js 22 or newer; node was not found."
}
$NodeVersion = (& node -p "process.versions.node").Trim()
$NodeMajor = [int]($NodeVersion.Split('.')[0])
if ($NodeMajor -lt 22) {
  throw "Mauro requires Node.js 22 or newer; found v$NodeVersion."
}

$MauroRuntimeDir = [IO.Path]::GetFullPath($MauroRuntimeDir)
$MauroClaudeDir = [IO.Path]::GetFullPath($MauroClaudeDir)
$MauroSharedSkillsDir = [IO.Path]::GetFullPath($MauroSharedSkillsDir)
$MauroLegacyRuntimeDir = Join-Path $MauroClaudeDir "mauro"
$MauroClaudeSkillsDir = Join-Path $MauroClaudeDir "skills"
function Test-SameOrAncestor($Parent, $Child) {
  $Separators = [char[]]@([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
  $ParentPath = [IO.Path]::GetFullPath($Parent).TrimEnd($Separators)
  $ChildPath = [IO.Path]::GetFullPath($Child).TrimEnd($Separators)
  return $ChildPath.Equals($ParentPath, [StringComparison]::OrdinalIgnoreCase) -or $ChildPath.StartsWith("$ParentPath$([IO.Path]::DirectorySeparatorChar)", [StringComparison]::OrdinalIgnoreCase)
}
$RuntimeRoot = [IO.Path]::GetPathRoot($MauroRuntimeDir)
if ($MauroRuntimeDir -eq $RuntimeRoot -or (Test-SameOrAncestor $MauroRuntimeDir $HOME) `
    -or (Test-SameOrAncestor $MauroRuntimeDir $MauroSourceDir) -or (Test-SameOrAncestor $MauroSourceDir $MauroRuntimeDir) `
    -or (Test-SameOrAncestor $MauroRuntimeDir $MauroClaudeDir) -or (Test-SameOrAncestor $MauroRuntimeDir $MauroSharedSkillsDir)) {
  throw "Unsafe MAURO_HOME: $MauroRuntimeDir"
}
foreach ($Directory in @($MauroClaudeSkillsDir, $MauroSharedSkillsDir)) {
  if ($Directory -eq [IO.Path]::GetPathRoot($Directory) -or (Test-SameOrAncestor $Directory $MauroSourceDir) -or (Test-SameOrAncestor $MauroSourceDir $Directory)) {
    throw "Unsafe skill directory: $Directory"
  }
}

function Get-MauroVersion($Dir) {
  try { return (Get-Content (Join-Path $Dir "package.json") -Raw | ConvertFrom-Json).version } catch { return "unknown" }
}
function Get-MauroCommit($Dir) {
  try { $c = & git -C $Dir rev-parse --short HEAD 2>$null; if ($LASTEXITCODE -eq 0) { return $c } } catch {}
  return "no commit"
}
function Get-MauroDirty($Dir) {
  try {
    $Status = & git -C $Dir status --porcelain --untracked-files=normal 2>$null
    return $LASTEXITCODE -eq 0 -and [bool]$Status
  } catch { return $false }
}
function Format-MauroRevision($Commit, $Dirty) {
  if ($Dirty) { return "${Commit}-dirty" }
  return $Commit
}

$SourceVersion = Get-MauroVersion $MauroSourceDir
$SourceCommit = Get-MauroCommit $MauroSourceDir
$SourceDirty = Get-MauroDirty $MauroSourceDir
$SourceRevision = Format-MauroRevision $SourceCommit $SourceDirty
$CurrentRuntime = if (Test-Path $MauroRuntimeDir) { $MauroRuntimeDir } elseif (Test-Path $MauroLegacyRuntimeDir) { $MauroLegacyRuntimeDir } else { $MauroRuntimeDir }
$Installed = (Test-Path $MauroRuntimeDir) -or (Test-Path $MauroLegacyRuntimeDir) `
  -or (Test-Path (Join-Path $MauroClaudeSkillsDir "mauro")) -or (Test-Path (Join-Path $MauroClaudeSkillsDir "mauro-context")) `
  -or (Test-Path (Join-Path $MauroSharedSkillsDir "mauro")) -or (Test-Path (Join-Path $MauroSharedSkillsDir "mauro-context"))

if ($Installed) {
  $InstalledVersion = Get-MauroVersion $CurrentRuntime
  $InstalledCommit = "unknown commit"
  $InstalledDirty = $false
  try {
    $InstalledStamp = Get-Content (Join-Path $CurrentRuntime ".install.json") -Raw | ConvertFrom-Json
    $InstalledCommit = $InstalledStamp.commit
    $InstalledDirty = $InstalledStamp.dirty -eq $true
  } catch {}
  $InstalledRevision = Format-MauroRevision $InstalledCommit $InstalledDirty
  Write-Host "Mauro $InstalledVersion ($InstalledRevision) is installed in $CurrentRuntime."
  Write-Host "This checkout is $SourceVersion ($SourceRevision)."
  if (-not $Update) {
    if ($Yes) {
      $Update = $true
    } elseif ([Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
      $Answer = Read-Host "Update the installation from this checkout? [Y/n]"
      if ($Answer -eq "" -or $Answer -match '^(y|yes)$') { $Update = $true } else { Write-Host "Nothing changed."; exit 0 }
    } else {
      throw "Run install.ps1 -Update to replace it from this checkout, or use plugin mode."
    }
  }
} elseif ($Update) {
  throw "Mauro is not installed. Run install.ps1 without -Update."
}

$StageDir = "$MauroRuntimeDir.install-$PID"
if (Test-Path $StageDir) { Remove-Item -Recurse -Force -Path $StageDir }
New-Item -ItemType Directory -Force -Path $StageDir | Out-Null
foreach ($Name in @(".claude-plugin", "agents", "bin", "docs", "hooks", "schemas", "scripts", "skills", "templates")) {
  Copy-Item -Recurse -Path (Join-Path $MauroSourceDir $Name) -Destination (Join-Path $StageDir $Name)
}
Copy-Item -Path (Join-Path $MauroSourceDir "package.json") -Destination $StageDir
Copy-Item -Path (Join-Path $MauroSourceDir "LICENSE") -Destination $StageDir
$Hosts = if ($TargetHost -eq "all") { @("claude", "shared") } else { @($TargetHost) }
$InstallHooks = -not $NoHooks -and ($TargetHost -eq "claude" -or $TargetHost -eq "all")
@{ version = $SourceVersion; commit = $SourceCommit; dirty = $SourceDirty; source = $MauroSourceDir; runtime = $MauroRuntimeDir; hosts = $Hosts; hooks = $InstallHooks; installed_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ") } |
  ConvertTo-Json | Set-Content (Join-Path $StageDir ".install.json")

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $MauroRuntimeDir) | Out-Null
$BackupDir = "$MauroRuntimeDir.previous-$PID"
if (Test-Path $BackupDir) { Remove-Item -Recurse -Force -Path $BackupDir }
if (Test-Path $MauroRuntimeDir) { Move-Item -Path $MauroRuntimeDir -Destination $BackupDir }
try {
  Move-Item -Path $StageDir -Destination $MauroRuntimeDir
  if (Test-Path $BackupDir) { Remove-Item -Recurse -Force -Path $BackupDir }
} catch {
  if (Test-Path $MauroRuntimeDir) { Remove-Item -Recurse -Force -Path $MauroRuntimeDir }
  if (Test-Path $BackupDir) { Move-Item -Path $BackupDir -Destination $MauroRuntimeDir }
  throw "Mauro could not replace the runtime; the previous installation was restored. $($_.Exception.Message)"
}
if ($TargetHost -ne "shared" -and $MauroLegacyRuntimeDir -ne $MauroRuntimeDir -and (Test-Path $MauroLegacyRuntimeDir)) {
  Remove-Item -Recurse -Force -Path $MauroLegacyRuntimeDir
}

function Install-MauroSkillPair($Destination) {
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  foreach ($Name in @("mauro", "mauro-context")) {
    $Target = Join-Path $Destination $Name
    if (Test-Path $Target) { Remove-Item -Recurse -Force -Path $Target }
    Copy-Item -Recurse -Path (Join-Path $MauroSourceDir "skills\$Name") -Destination $Target
  }
}

if ($TargetHost -eq "claude" -or $TargetHost -eq "all") { Install-MauroSkillPair $MauroClaudeSkillsDir }
if ($TargetHost -eq "shared" -or $TargetHost -eq "all") { Install-MauroSkillPair $MauroSharedSkillsDir }

if (-not $NoHooks -and ($TargetHost -eq "claude" -or $TargetHost -eq "all")) {
  & node (Join-Path $MauroRuntimeDir "scripts\install-standalone-hooks.mjs") $MauroClaudeDir $MauroRuntimeDir
  if ($LASTEXITCODE -ne 0) { throw "Mauro hook installation failed." }
}

if ($Update) {
  Write-Host "Updated Mauro to $SourceVersion ($SourceRevision) for $TargetHost. Restart open coding-agent sessions."
} else {
  Write-Host "Installed Mauro $SourceVersion ($SourceRevision) for $TargetHost. Restart open coding-agent sessions."
}
if ($NoHooks -and ($TargetHost -eq "claude" -or $TargetHost -eq "all")) { Write-Host "Claude hooks were not installed. Mauro remains available on demand." }
