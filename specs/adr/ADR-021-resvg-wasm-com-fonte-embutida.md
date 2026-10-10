# ADR-021 — PNG pelo `resvg-wasm` com fonte embutida (troca do `resvg-js`)

Status: aceita · 09/10/2026 · Requisitos: RF-05, RF-19, RNF-10, RNF-07 · Aciona o plano B da seção 10 e o gatilho de revisão do roadmap ("se `resvg-js` não carregar, validar `resvg-wasm`").

## Contexto

O renderer de gráfico convertia SVG em PNG com `@resvg/resvg-js`, um addon nativo (N-API). Ele passou no smoke do M0 em Bun e em Deno, mas **não funciona dentro do app compilado com `deno desktop`**: o processo cai com `thread panicked … napi-sys … Must load N-API bindings`. Isolado com um app mínimo que só importa o pacote (cai) e um controle sem ele (abre). Resultado: o `desktop:deno` gerava um executável que não inicia.

O `@resvg/resvg-wasm` (mesma versão 2.6.2, mesma licença MPL-2.0) não usa N-API. Mas tem uma diferença que importa: **não enxerga as fontes do sistema** (só aceita `fontBuffers`). Medido: sem fonte, o PNG de um SVG com texto é byte a byte igual ao do mesmo SVG sem texto, e nenhum erro é lançado. Um gráfico sem rótulos e sem aviso violaria P6.

## Decisão

- Trocar `@resvg/resvg-js` por `@resvg/resvg-wasm@2.6.2` (versão exata). O contrato de `renderChart` não muda; só o módulo novo `src/render/png.ts` (`svgToPng`) substitui a chamada ao addon.
- Embutir uma fonte: `assets/fonts/DejaVuSans.ttf` (757 KB) com `assets/fonts/LICENSE-DejaVu.txt`. A licença (Bitstream Vera/Arev; mudanças do DejaVu em domínio público) permite redistribuir **desde que o aviso e a licença acompanhem a fonte**, e proíbe modificar sem renomear: a fonte é usada sem modificação.
- O wasm é iniciado uma única vez (um segundo `initWasm` falha) e a fonte é **verificada**: `verifyFont` renderiza um texto e um quadro em branco e exige que difiram; se forem iguais, o render termina em `E_RENDER` ("a fonte embutida não desenhou texto"). Fonte ilegível, wasm que não inicia e SVG inválido também são `E_RENDER`.
- As famílias padrão, serifada, sem serifa e monoespaçada do resvg apontam para a fonte embutida, e o Vega-Lite recebe `config.font`, então qualquer texto do gráfico usa a mesma fonte.
- Versões dos renderers (RNF-07): `chart-vega-resvg-wasm@2.0.0` (os pixels mudam em relação à 1.x) e `docx-abnt@1.2.0` (as figuras embutidas mudam).
- Em app compilado, a fonte precisa ir junto do binário: `--include assets/fonts` (o script `scripts/desktop-deno.ps1` já passa).

## Alternativas rejeitadas

- Manter o `resvg-js` e aceitar que o `desktop:deno` não inicia: o desktop só rodaria pelo modo fonte.
- Fonte do sistema (por exemplo, Arial do Windows): não é redistribuível e tornaria o PNG dependente da máquina (quebra P5).
- Fonte em base64 dentro de um `.ts`: roda em qualquer lugar, mas infla o código em cerca de 1 MB; o arquivo `.ttf` com `--include` bastou.

## Evidências (09/10/2026, Windows, Bun 1.4.2, Deno 2.9.5)

| Onde | SVG de teste com texto | Sem texto | Sem fonte |
|---|---|---|---|
| Bun | `2321ca0b0cf9` | `a476ff12bafb` | `a476ff12bafb` (texto some em silêncio) |
| Deno | `2321ca0b0cf9` | `a476ff12bafb` | `a476ff12bafb` |
| App compilado (`deno desktop`) | `2321ca0b0cf9` | — | — |

Os três runtimes dão o **mesmo PNG** (prefixo do SHA-256); o teste `tests/png.test.ts` fixa esse valor.

## Consequências

- O app compilado com `deno desktop` passa a iniciar o servidor (verificado com um app mínimo; a verificação do app completo está no CHANGELOG).
- A saída é igual entre Bun, Deno e o app compilado, e não depende das fontes instaladas na máquina.
- O gráfico usa a DejaVu Sans, não a fonte padrão do sistema; é uma mudança visual intencional.
- O repositório ganha 757 KB de fonte e o dever de manter a licença junto dela (há um teste para isso).
- Atualizar o `resvg-wasm` ou a fonte pode mudar os pixels: o hash de referência do teste deve ser atualizado de propósito e registrado.
- O `resvg-wasm` é mais lento que o addon nativo; para gráficos de 720×420 a diferença não é perceptível (a suíte inteira de gráficos roda em menos de 1 s).
