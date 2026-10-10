<#
.SYNOPSIS
  Abre o desktop do autoSlider.

.DESCRIPTION
  Dois modos:

  -Modo Compilado (padrao)
    Roda o app gerado por "deno desktop --backend webview src/desktop/main.ts" (pasta
    dist\autoSlider). Desde a v0.7.1 (ADR-021) os graficos usam o resvg-wasm, que funciona
    dentro do runtime do "deno desktop"; antes, o addon nativo resvg-js derrubava o app com
    "Must load N-API bindings". Se o app cair com essa mensagem, o script avisa.

  -Modo Fonte
    Roda "deno run --allow-all src/desktop/webview-main.ts": a mesma interface, numa janela
    WebView, sem compilar (equivale a "bun run desktop").

  O que o script resolve no modo Compilado (todos descobertos testando):
    - o build precisa de permissoes explicitas, senao o app morre com
      'Requires sys access to "hostname"';
    - o build precisa embutir a fonte dos graficos (--include assets/fonts); sem ela o
      render dos graficos termina em E_RENDER;
    - o lancador nao carrega o runtime sozinho e le caminhos com acento em Latin-1
      ("Usuario" vira lixo), entao ele recebe --runtime com o caminho curto 8.3 (so ASCII);
    - o WebView2Loader.dll precisa estar ao lado do .exe;
    - o app compilado nao le o .env; o script o carrega no ambiente (so mostra os NOMES).

  O arquivo e propositalmente sem acentos: o PowerShell 5.1 le .ps1 sem BOM como ANSI.

.PARAMETER Modo
  Compilado (padrao) ou Fonte.

.PARAMETER Build
  Recompila antes de abrir (modo Compilado). Leva alguns segundos.

.PARAMETER DryRun
  Mostra o que seria feito, sem compilar nem abrir nada.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\desktop-deno.ps1 -Modo Fonte
  powershell -ExecutionPolicy Bypass -File scripts\desktop-deno.ps1 -Build
#>
[CmdletBinding()]
param(
  [ValidateSet('Compilado', 'Fonte')]
  [string]$Modo = 'Compilado',
  [switch]$Build,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$entry = 'src/desktop/main.ts'
$appDir = Join-Path $root 'dist\autoSlider'
$exe = Join-Path $appDir 'autoSlider.exe'
$dll = Join-Path $appDir 'autoSlider.dll'
$loader = Join-Path $root 'WebView2Loader.dll'
$permissions = @('--allow-net', '--allow-env', '--allow-sys', '--allow-read', '--allow-write', '--allow-ffi', '--include', 'assets/fonts')

function Get-NewestSource {
  # O app embute src/, package.json e deno.json; se algum for mais novo que a .dll, o binario esta velho.
  $extra = @(Get-Item -Path (Join-Path $root 'package.json'), (Join-Path $root 'deno.json') -ErrorAction SilentlyContinue)
  $files = @(Get-ChildItem -Path (Join-Path $root 'src') -Recurse -File -Include *.ts) + $extra
  $files | Sort-Object LastWriteTime -Descending | Select-Object -First 1
}

function Import-DotEnv([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return @() }
  $loaded = @()
  foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
    $text = $line.Trim()
    if ($text -eq '' -or $text.StartsWith('#')) { continue }
    $text = $text -replace '^export\s+', ''
    $index = $text.IndexOf('=')
    if ($index -lt 1) { continue }
    $name = $text.Substring(0, $index).Trim()
    $value = $text.Substring($index + 1).Trim()
    if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    # Igual ao --env-file do Deno: o que ja esta no ambiente tem prioridade.
    if (-not [string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable($name, 'Process'))) { continue }
    if ($value -eq '') { continue }
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
    $loaded += $name
  }
  return $loaded
}

function Show-Environment {
  $names = Import-DotEnv (Join-Path $root '.env')
  if ($names.Count -gt 0) { Write-Host ('Variaveis carregadas do .env: ' + ($names -join ', ')) }
  else { Write-Host 'Nenhuma variavel carregada do .env (nao existe, esta vazio ou ja estava no ambiente).' }
  if ([string]::IsNullOrEmpty($env:LLM_MODEL)) { Write-Warning 'LLM_MODEL nao esta definido: o app usara o modelo padrao qwen3:8b.' }
  Write-Host 'Aviso: o servidor local nao tem autenticacao (escuta so em 127.0.0.1).'
}

function Get-ShortPath([string]$Path) {
  # Caminho 8.3 (so ASCII): o lancador do deno desktop corrompe acentos no caminho do runtime.
  $fso = New-Object -ComObject Scripting.FileSystemObject
  return $fso.GetFile($Path).ShortPath
}

function Invoke-Deno([string[]]$Arguments) {
  if (-not (Get-Command deno -ErrorAction SilentlyContinue)) { throw 'deno nao foi encontrado no PATH. Instale o Deno 2.9.5.' }
  Push-Location $root
  try {
    # O Deno escreve o progresso no stderr; no PowerShell 5.1 isso viraria erro com 'Stop'.
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & deno @Arguments
    $code = $LASTEXITCODE
    $ErrorActionPreference = $previous
  } finally {
    Pop-Location
  }
  return $code
}

# ---------------------------------------------------------------- modo Fonte
if ($Modo -eq 'Fonte') {
  Write-Host 'Modo Fonte: deno run --allow-all src/desktop/webview-main.ts'
  if ($DryRun) { Write-Host '[DryRun] nada foi aberto.'; Show-Environment; exit 0 }
  Show-Environment
  Write-Host 'Abrindo a janela (feche-a para encerrar).'
  exit (Invoke-Deno @('run', '--allow-all', 'src/desktop/webview-main.ts'))
}

# ------------------------------------------------------------- modo Compilado
$missing = -not ((Test-Path -LiteralPath $exe) -and (Test-Path -LiteralPath $dll))
$needsBuild = $Build -or $missing
if ($missing -and -not $Build) { Write-Host "App ainda nao compilado em $appDir." }

if ($DryRun) {
  Write-Host "[DryRun] executavel: $exe"
  Write-Host "[DryRun] compilar?   $needsBuild"
  Write-Host "[DryRun] build:      deno desktop --backend webview $($permissions -join ' ') $entry"
  Show-Environment
  exit 0
}

if ($needsBuild) {
  Write-Host "Compilando: deno desktop --backend webview $($permissions -join ' ') $entry"
  $code = Invoke-Deno (@('desktop', '--backend', 'webview') + $permissions + @($entry))
  if ($code -ne 0) { throw "A compilacao falhou (codigo $code)." }
}
if (-not (Test-Path -LiteralPath $exe)) { throw "Nao achei $exe depois da compilacao." }

if (Test-Path -LiteralPath $loader) {
  Copy-Item -LiteralPath $loader -Destination (Join-Path $appDir 'WebView2Loader.dll') -Force
} else {
  Write-Warning "WebView2Loader.dll nao esta na raiz do projeto; o .exe pode fechar sem mensagem."
}

if (-not $needsBuild) {
  $newest = Get-NewestSource
  if ($newest -and $newest.LastWriteTime -gt (Get-Item -LiteralPath $dll).LastWriteTime) {
    Write-Warning "O app compilado e mais antigo que '$($newest.FullName.Substring($root.Length + 1))'. Rode com -Build para atualizar."
  }
}

Show-Environment

$outFile = Join-Path ([IO.Path]::GetTempPath()) 'autoslider-desktop-out.txt'
$errFile = Join-Path ([IO.Path]::GetTempPath()) 'autoslider-desktop-err.txt'
Write-Host "Abrindo $exe (feche a janela para encerrar)."
$process = Start-Process -FilePath (Get-ShortPath $exe) -ArgumentList @('--runtime', (Get-ShortPath $dll)) -PassThru -Wait `
  -RedirectStandardOutput $outFile -RedirectStandardError $errFile

$stderr = if (Test-Path -LiteralPath $errFile) { Get-Content -LiteralPath $errFile -Raw } else { '' }
if ($stderr -match 'N-API') {
  Write-Host ''
  Write-Warning 'O app compilado caiu com erro de N-API: algum addon nativo foi importado (o resvg-js foi trocado pelo resvg-wasm na v0.7.1, ADR-021).'
  Write-Host 'Mensagem do runtime:'
  Write-Host ($stderr.Trim())
  Write-Host ''
  Write-Host 'Enquanto isso, o modo Fonte abre a mesma interface:'
  Write-Host '  powershell -ExecutionPolicy Bypass -File scripts\desktop-deno.ps1 -Modo Fonte'
} elseif ($process.ExitCode -ne 0 -and $stderr.Trim() -ne '') {
  Write-Host $stderr.Trim()
}
Remove-Item -LiteralPath $outFile, $errFile -ErrorAction SilentlyContinue
exit $process.ExitCode
