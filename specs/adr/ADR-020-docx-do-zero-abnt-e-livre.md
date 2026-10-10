# ADR-020 — Docx gerado do zero, só com os presets ABNT e livre

Status: aceita · 09/10/2026 · Requisitos: RF-04 · Fecha a questão aberta nº 2

## Contexto

A questão aberta nº 2 perguntava se, além da ABNT, existe um modelo institucional a ser suportado como template. O usuário não tem o template do SENAI.

## Decisão

- O renderer docx gera o documento **do zero**, com a biblioteca `docx`.
- O `DocxSpec` mantém `preset: 'abnt' | 'livre'`. Não há `templateId`, preenchimento de template nem ponto de extensão para isso.
- `abnt`: fonte 12, espaçamento 1,5, margens de 3 cm (superior e esquerda) e 2 cm (inferior e direita), legendas de tabela e figura numeradas. `livre`: Calibri 11, espaçamento 1,15, margens de 2,5 cm.
- Um template institucional fica **fora da v1**. Se surgir, entra por mudança de spec e nova ADR.

## Consequências

- Menos superfície e nenhum spike de template.
- Quem precisar do formato de uma instituição específica terá de ajustar o documento depois de gerado, ou esperar a mudança de spec.
