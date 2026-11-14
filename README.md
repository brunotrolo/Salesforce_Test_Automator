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

## Fluxo de ponta a ponta
Tudo em `.sf-test/runs/<execução>/` (fora do git). Detalhe de cada passo: `.claude/skills/sf-test/SKILL.md`.

| # | Passo | O que acontece | Artefato |
|---|---|---|---|
| 0 | **Preflight** | confere Node, Playwright, `sf` CLI, org alvo e login; **recusa produção**; falha vira `BLOQUEADO` com a correção | `preflight.json` |
| 1 | **Base de teste** | lê as fontes e extrai os oráculos com citação verificada por código | `test_basis.json` |
| 2 | **Caderno** | um caso por critério/regra, mais negativos e limites derivados das regras de validação e campos obrigatórios; validado por script e por 2 revisores de contexto novo | `caderno.json` / `caderno.md` |
| 3 | **Massa** | planeja a necessidade de dados e cria registros sintéticos marcados `ZZ_TEST_<execução>`; sem massa, o caso fica `BLOQUEADO` | `massa.json`, `massa_log.json` |
| 4 | **Replay** | reproduz as jornadas já aprendidas, **sem modelo** | `resultados/`, `pendentes.json` |
| 5 | **Aprender/curar** | até 3 executores em paralelo aprendem os casos pendentes (ou continuam de onde o replay parou) e compilam a jornada | `.sf-test/knowledge/journeys/` |
| 6 | **Classificar** | regras sobre os oráculos; bug candidato é **reexecutado** (2 de 2) e vai ao **juiz independente** | `classificacao.json`, `juiz/` |
| 7 | **Relatório e limpeza** | uma tela para o dev; apaga só a massa criada pela execução | `resultado.md`, `bugs/BUG-nnn.md`, `test-report.md` |

## De onde vem cada oráculo
| Artefato | Onde | Vira |
|---|---|---|
| Critérios de aceite (Dado/Quando/Então) e regras de negócio | `specs/<dom>/<NNN>/spec.md`, `discovery/<R>/backlog.json` | oráculo de **maior autoridade** |
| `[NEEDS CLARIFICATION: negócio]` | `spec.md`, `backlog.json` | pergunta aberta → `A_CONFIRMAR` |
| Decisões e abordagem | `plan.md`, `build-report.md` (Decisions Made) | decisão |
| Regras de validação, campos obrigatórios, picklists | `force-app/**` do domínio | casos negativos e de limite |
| Gaps e limitações conhecidas | `build-report.md` (Gaps Found), `tasks.md` (`[GATE-n]`) | diferença nessa área é `PREVISTO` |
| Invariantes técnicas | embutidas (INV-001 a INV-005) | erro Apex/Flow, HTTP 5xx, texto cru, erro de console, tela travada |
Sem nenhuma dessas fontes a base é fraca: só testes exploratórios, tudo `A_CONFIRMAR`.

## Caderno, massa e motor
- **Caderno** (`schemas/caderno.schema.json`): cada caso tem `id TC-nnn`, `tipo` (fumaça, funcional, negativo, limite, permissão, LGPD, exploratório), `prioridade`, `oraculos` (obrigatório, exceto exploratório), `gaps_relacionados`, `massa`, `passos` e `esperado`. Cada `esperado` já traz uma **verificação determinística** (`texto-visivel`, `texto-ausente`, `url`, `valor-campo`, `elemento-visivel`, `elemento-ausente`; `semantica` só quando não dá para afirmar exatamente).
- **Massa:** `@documento` gera documento sintético, `@ref.id` referencia outro registro, `__existente: true` usa dado padrão que já existe (fila, perfil) sem nunca alterá-lo.
- **Motor** (`scripts/engine/cli.mjs`): `start | begin | observe | act | assert | end | close`, uma linha JSON por comando. Observa a árvore de acessibilidade (atravessa shadow DOM aberto) e roda detectores passivos a cada passo.

## Exemplo de relatório (`resultado.md`)
```
# QA de tela — 001-intake-de-caso · 2026-11-14 · execução 20261114-101500Z

**❌ REPROVADO** — 3 passaram · 1 bug(s) · 1 a confirmar · 1 previstos · 0 bloqueados (de 6 casos)
Critérios de aceite/regras resolvidos: 4/5 (80%)

## ❌ Bugs
| ID | Sev. | O quê | Fonte da expectativa |
|---|---|---|---|
| BUG-001 | media | t TC-003 | specs/atendimento/001-intake-de-caso/spec.md:11 |

## ⚠️ A confirmar (não é bug nem sucesso)
- **TC-007** — O comportamento observado é o desejado? (Não aparece o banner "Atendimento marcado como VIP")

ℹ️ Previstos (diferença já documentada): TC-006

**Próximo passo:** Corrigir os bugs e rodar `/sf-test` de novo (as jornadas já aprendidas rodam sem modelo).
```
Gate: **APROVADO** · **APROVADO COM PENDÊNCIAS** (há `A_CONFIRMAR`) · **NÃO CONCLUÍDO** (P1 bloqueado ou nada executado) · **REPROVADO** (há bug). Saída do comando: 0 sem bug · 1 há bug · 2 não concluído.

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
