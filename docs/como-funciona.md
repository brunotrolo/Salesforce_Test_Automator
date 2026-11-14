# Como o QA funciona (detalhe)

Complemento do [README](../README.md).

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

## Como o orquestrador funciona internamente

### Orquestração na conversa principal

Subagente não chama subagente nem pergunta ao usuário. Por isso o `/sf-test` roda na conversa principal e despacha só agentes de primeiro nível. Se não houver ferramenta de subagente, a skill **para**: revisão e juiz no mesmo contexto não valem. Revisor ou juiz que falha é `not run` — e o que dependia dele fica `A_CONFIRMAR`, nunca "sem achados".

### Contrato do executor

O `sf-qa-executor` devolve um JSON curto — `{"caso","status","via","acts","observacoes"}` — e o resultado bruto do caso é gravado em `resultados/TC-nnn.json` por `executar.mjs concluir`. O **status** (`verde`, `vermelho`, `bloqueado`, `pendente_juiz`) nasce das asserções, não da impressão do agente; um caso vermelho nunca vira `PASSOU`.

### Limites e reexecução

O executor para após **30 ações** ou **3 falhas seguidas**. Bug candidato só é confirmado se **reproduzir 2 de 2** (reexecução) e o juiz concordar. Resultado diferente na reexecução vira `INSTAVEL`. Replay que para no meio vira cura: o agente leva a tela até o passo anterior (`prefixo`), continua e só regrava a jornada se uma verificação passar.

### Falha de infraestrutura

Login, massa, permissão e política barrada são `BLOQUEADO`, com a correção exata — o produto não falhou, o ambiente falhou. Um caso P1 bloqueado deixa o gate em `NÃO CONCLUÍDO`.

