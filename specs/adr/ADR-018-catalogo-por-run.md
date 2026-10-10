# ADR-018 — Catálogo por run: anexos substituem o dataset de exemplo

Status: aceita · 09/10/2026 · Requisitos: RF-01, RF-11, RNF-04

## Contexto

Até a v0.5 o gráfico usava sempre o dataset de exemplo `vendas`, embutido no código. Com a ingestão (v0.6.0), o pedido pode trazer anexos. Misturar o exemplo com os dados do usuário deixaria o modelo citar dados de demonstração num relatório real, sem erro.

## Decisão

- Com anexos, o catálogo do run contém **somente** os datasets deles. O dataset de exemplo não é consultado, e uma spec que o cite falha com `E_REF`, listando os datasets disponíveis.
- Erro de ingestão (`E_INGEST_INVALIDO`, `E_INGEST_LIMITE`) termina o run em `FALHOU` **antes** de chamar o provedor. Anexos sem nenhum dataset (por exemplo, Markdown sem tabela) também.
- A ingestão acontece depois das verificações de formato e de `localOnly` e antes de `ROTEADO`; a timeline lista cada anexo, o id do dataset e o tamanho.
- Sem anexos, o run usa o catálogo do projeto (hoje, o exemplo), só para demonstração.

## Consequências

- Nunca há dado de demonstração num relatório feito com anexos.
- O dataset de exemplo deve sair do caminho de produção quando a Store (Task 20) existir; até lá ele serve para testes e para a demonstração do desktop.
- Dois anexos de mesmo nome recebem ids distintos (`vendas`, `vendas-2`), e o modelo os vê no prompt.
