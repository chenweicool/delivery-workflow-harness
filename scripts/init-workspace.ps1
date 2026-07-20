param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$DemandName,

    [Parameter(Mandatory = $false, Position = 1)]
    [string]$OutputRoot
)

$ErrorActionPreference = "Stop"

function Resolve-ScriptPath {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $null
    }

    return $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$WorkflowDir = Split-Path -Parent $ScriptDir
$RootDir = Split-Path -Parent $WorkflowDir

if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $OutputRoot = Join-Path (Split-Path -Parent $RootDir) "ai-workspaces"
}

$OutputRoot = Resolve-ScriptPath $OutputRoot
$TemplateDir = Join-Path $WorkflowDir "templates\workspace"
$TargetDir = Join-Path $OutputRoot $DemandName

if (-not (Test-Path -LiteralPath $TemplateDir -PathType Container)) {
    throw "模板目录不存在: $TemplateDir"
}

New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

if (Test-Path -LiteralPath $TargetDir) {
    $ExistingItems = Get-ChildItem -LiteralPath $TargetDir -Force
    if ($ExistingItems.Count -gt 0) {
        throw "目标 workspace 已存在且非空: $TargetDir"
    }

    Get-ChildItem -LiteralPath $TemplateDir -Force | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $TargetDir -Recurse -Force
    }
} else {
    Copy-Item -LiteralPath $TemplateDir -Destination $TargetDir -Recurse
}

$ContextRulesDir = Join-Path $TargetDir "context\rules"
$ContextSkillsDir = Join-Path $TargetDir "context\skills"
$ContextBusinessDir = Join-Path $TargetDir "context\business"
$ContextSystemsDir = Join-Path $TargetDir "context\systems"
$PrdAssetsDir = Join-Path $TargetDir "prd\assets"
$PrdTemplatesDir = Join-Path $TargetDir "prd\templates"
$PrdExamplesDir = Join-Path $TargetDir "prd\examples"
$PrdReferencesDir = Join-Path $TargetDir "prd\references"

New-Item -ItemType Directory -Force -Path $ContextRulesDir, $ContextSkillsDir, $ContextBusinessDir, $ContextSystemsDir, $PrdAssetsDir, $PrdTemplatesDir, $PrdExamplesDir, $PrdReferencesDir | Out-Null

$SourceRulesDir = Join-Path $RootDir "rules"
if (Test-Path -LiteralPath $SourceRulesDir -PathType Container) {
    Copy-Item -LiteralPath $SourceRulesDir -Destination (Join-Path $ContextRulesDir "source-rules") -Recurse
}

$SourceSkillsDir = Join-Path $RootDir "skills"
if (Test-Path -LiteralPath $SourceSkillsDir -PathType Container) {
    Copy-Item -LiteralPath $SourceSkillsDir -Destination (Join-Path $ContextSkillsDir "source-skills") -Recurse
}

$SourceBusinessDir = Join-Path $WorkflowDir "context\business"
if (Test-Path -LiteralPath $SourceBusinessDir -PathType Container) {
    Get-ChildItem -LiteralPath $SourceBusinessDir -Force | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $ContextBusinessDir -Recurse -Force
    }
}

$SourceSystemsDir = Join-Path $WorkflowDir "context\systems"
if (Test-Path -LiteralPath $SourceSystemsDir -PathType Container) {
    Get-ChildItem -LiteralPath $SourceSystemsDir -Force | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $ContextSystemsDir -Recurse -Force
    }
}

$SourceCommit = "unknown"
try {
    $SourceCommit = git -C $RootDir rev-parse HEAD
} catch {
    $SourceCommit = "unknown"
}

$KnowledgeVersion = @"
# Knowledge Snapshot Version

workspace: $DemandName
init_time: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
source_repo: $(Split-Path -Leaf $RootDir)
source_commit: $SourceCommit
delivery_workflow_path: $WorkflowDir
"@

Set-Content -LiteralPath (Join-Path $TargetDir "context\knowledge-version.md") -Value $KnowledgeVersion -Encoding UTF8

Write-Host "Workspace initialized:"
Write-Host $TargetDir
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Put PRD materials into: $TargetDir\prd\"
Write-Host "2. Enter workspace: cd $TargetDir"
Write-Host "3. Ask the AI agent: Read AGENTS.md and execute .workflow/commands/00-load-context.md"
