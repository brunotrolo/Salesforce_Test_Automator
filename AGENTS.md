# CLAUDE.md — Salesforce Test Automator

QA de tela autônomo para Salesforce Service Cloud: caderno de teste, massa, execução com Playwright, relatório. Skill em `.claude/skills/sf-test`.

## Regras (sempre ativas — detalhes em `.claude/rules/`)
- Oráculo antes de veredito: BUG exige citação `arquivo:linha` ou invariante técnica; sem oráculo, `A_CONFIRMAR`.
- Zero perguntas durante a execução: falta algo → `BLOQUEADO` com a correção; dúvida → `A_CONFIRMAR`.
- Orquestração na conversa principal; executores e revisores são de primeiro nível (subagente não pergunta nem chama subagente). Revisor/juiz que falha = `not run`.
- Só sandbox. Nunca contornar `preflight` nem `guard-qa`. Nunca ler `.sf-test/auth`. Nunca gravar alias de org, nome ou documento real.
- O resultado vem de asserção (`executar.mjs concluir`), não de impressão; um caso vermelho nunca vira PASSOU.
- Documentos para humanos em PT-BR; regras e prompts de agente em EN onde já estiverem.

## Comandos
- `npm test` — testes (usa a app de teste e um `sf` simulado; precisa do Playwright + Chromium).
- `node scripts/verify-skills.mjs` — lint de skills e agentes.
