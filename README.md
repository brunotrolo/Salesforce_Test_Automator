# Salesforce Test Automator

Skill do Claude Code que faz o papel de **QA de tela** depois do Journey Developer: lê os artefatos do PO, do Journey Designer e do Journey Developer, monta o **caderno de teste** e a **massa**, opera a tela com **Playwright**, separa **bug** de **comportamento previsto** e de **"a confirmar"**, e devolve um **relatório de uma tela**. Roda **local**, na máquina do dev, **só em sandbox**, **sem perguntas durante a execução**.

```
/sf-test busca-cliente/001-busca-rapida     # tudo, de ponta a ponta
/sf-test busca-cliente/001-busca-rapida --rapido   # só replay + classificação + relatório (dia a dia)
/sf-test-status                              # situação das execuções
```

## Como decide o que é bug
Todo veredito nasce de um **oráculo** com citação verificável (`arquivo:linha`), na ordem: critério de aceite/regra de negócio (spec, backlog) › decisão do plan/build-report › gap conhecido do build-report › invariante técnica da plataforma.

| Veredito | Significa |
|---|---|
| **PASSOU** | as asserções do caso foram verdadeiras |
| **BUG** | contradiz um oráculo forte, **reproduziu 2 de 2** e o **juiz independente** confirmou — ou violou uma invariante (erro Apex/Flow não tratado, HTTP 5xx, texto cru como `[object Object]`, erro de console, tela travada) |
| **PREVISTO** | a diferença já está documentada (gap do build-report) ou o dev registrou a decisão |
| **A_CONFIRMAR** | sem oráculo, oráculo incerto ou juiz em dúvida: o relatório traz a **pergunta de negócio**. Nunca conta como bug nem como sucesso |
| **BLOQUEADO** | login, massa, permissão ou política: causa fora do produto |
| **INSTAVEL** | a reexecução deu outro resultado |

## Aprende sozinho
Na 1ª vez um agente observa a tela e age (≤ 30 ações), as asserções decidem o resultado e o trace vira uma **jornada determinística**. Nas próximas, o **replay roda sem modelo**; se a tela mudou, o agente continua da tela atual e regrava a jornada só depois de uma verificação passar. Nada vira "previsto" sozinho (`node .claude/skills/sf-test/scripts/knowledge.mjs decidir <id> bug|previsto`).

## Segurança (por código)
- `preflight.mjs` **recusa produção** (exige `IsSandbox=true`; na dúvida recusa). A org vem de `SF_TARGET_ORG` ou `.sf/config.json`, nunca de arquivo da skill.
- Hook `guard-qa.mjs`: só `sf data query`, `sf data create record`, `sf org display`, `sf org open --url-only` na org alvo; alterar/excluir só ids criados pela execução; nada de deploy; a sessão do navegador (`.sf-test/auth`) é intocável.
- Motor: só domínios da org, sem XPath, "Excluir/Remover" só em registro criado pela execução. Massa sempre `ZZ_TEST_<execução>`, sintética. Evidências com PII mascarada.
- Login: Salesforce CLI (`sf org open --url-only`) › sessão salva (`scripts/entrar.mjs`, uma vez) › BLOQUEADO.

## Instalar no projeto Salesforce
Copie para o projeto: `.claude/skills/sf-test`, `.claude/skills/sf-test-status`, `.claude/agents/sf-qa-*`, `.claude/rules/{qa-governance,sandbox-only}.md` e **mescle** `.claude/settings.json` (hook + permissões). Depois: `npm install playwright && npx playwright install chromium`, `sf org login web --alias <sandbox>` e `export SF_TARGET_ORG=<sandbox>`. Em sessões não interativas (`claude -p`) o workspace precisa estar confiável para o hook e as permissões valerem.

## Verificação
`npm install && npm test` — 46 testes com **app de teste que imita o console Lightning** (shadow DOM, validações, toasts) e **bugs plantados** (regra quebrada, erro não tratado, banner sem especificação, gap documentado). Critério: veredito certo em cada caso, zero falso positivo no caminho limpo, replay sem agente.

## O que NÃO foi verificado
Tudo acima rodou contra a app de teste e um `sf` simulado. **Não** foi exercitado: Lightning real (LWC, abas do console, iframes de outro domínio, shadow DOM fechado), `sf org open --url-only` e o login real, segundo fator, padrões reais de erro do Apex/Flow, o formato exato dos comandos `sf data create/delete record`, execução dos subagentes (`sf-qa-executor`, `sf-qa-judge`, revisores) numa sessão real. Casos de **permissão por perfil** ainda não trocam de usuário. Ver `docs/open-decisions.md`.
