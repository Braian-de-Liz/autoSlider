# ADR-016 — Roadmap "relatório primeiro" e voz adiada

Status: aceita · 09/10/2026 · Requisitos: RF-04, RF-16, RF-20

## Contexto

O autoSlider é um assistente de escritório para relatórios. Na v0.4, o M1 entregava os quatro renderers sem ordem definida e o M8 incluía voz (RF-20).

## Decisão

- O docx vem primeiro: no M1 (renderer ABNT com tabelas e figuras) e no M4 (geração do docx com `LONG_TEXT` antes do pptx). A sequência de execução passa a ser: renderer docx → ingestão (M2) → gráfico com dados reais (M3) → geração de docx → pptx e xlsx → M5 a M8.
- A voz (RF-20) sai do roadmap com status `adiado`. O M8 cobre só o desktop (RF-19, RNF-09).
- O docx é gerado do zero com preset ABNT. O renderer isola a base do documento para que um template institucional possa entrar depois via `patchDocument`, por nova mudança de spec.

## Consequências

- Nenhum marco é removido; as dependências da v0.4 continuam válidas.
- pptx e xlsx podem ser entregues depois da geração de docx, mesmo pertencendo ao M1.
- Retomar a voz exige mudar RF-20 para `planejado` e atribuir um marco.
