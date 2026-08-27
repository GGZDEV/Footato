$runtimeCommand = Get-Command python -ErrorAction SilentlyContinue
$runtimePython = if ($runtimeCommand) {
  $runtimeCommand.Source
} else {
  Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
}

if (-not (Test-Path -LiteralPath $runtimePython)) {
  throw 'Python 3 is required. Install it or run this command from a Codex desktop environment with the bundled runtime available.'
}

$skillSearch = Join-Path $PSScriptRoot '..\.agents\skills\ui-ux-pro-max\scripts\search.py'
if (-not (Test-Path -LiteralPath $skillSearch)) {
  throw 'UI/UX Pro Max is not installed in .agents/skills/ui-ux-pro-max.'
}

& $runtimePython $skillSearch @args
exit $LASTEXITCODE
