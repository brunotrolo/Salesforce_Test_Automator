# Salesforce Test Automator

<p align="center">

  <img src="assets/banner.svg" width="960" alt="Salesforce Test Automator">
</p>

<p align="center">
  <img src="https://img.shields.io/github/stars/brunotrolo/Salesforce_Test_Automator?style=flat-square&color=00A1E0&label=stars" alt="Stars">
  <img src="https://img.shields.io/badge/agentes-4-04E1CB?style=flat-square" alt="4 agentes">
  <img src="https://img.shields.io/badge/works%20with-Claude%20Code-032D60?style=flat-square" alt="Works with Claude Code">
</p>


Testa de verdade, **pela tela**, o que a skill irmã **[Salesforce Journey Developer](https://github.com/brunotrolo/Salesforce_Journey_Developer)** construiu e deployou. O Developer leva uma capacidade de `tasks.md` a metadado real num org e prova que ela existe e está implantada; este repositório faz o papel de **QA**: lê o que o PO, o Journey Designer e o Journey Developer produziram, monta o **caderno de teste** e a **massa**, opera a tela com **Playwright**, separa **bug** de **comportamento previsto** e de **"a confirmar"**, e devolve um **relatório de uma tela** — nunca só "a tela abriu".

**Instale no mesmo projeto que o Designer e o Developer** — os três compartilham `specs/`, `docs/sdd/BACKLOG.md` e o `build-report.md` de cada capacidade (de onde vêm os gaps conhecidos). O Developer nunca testa a interface; este repositório é onde isso acontece. Roda **local**, na máquina do dev, **só em sandbox**, **sem perguntas durante a execução**.

**Como funciona** — mesma separação de papéis das skills irmãs, adaptada para teste de tela:
- **Orquestração e decisão** (a sequência, o que vira caso de teste, o que é bug vs. previsto vs. a confirmar) → o `SKILL.md` do `/sf-test` na conversa principal e os **4 agentes autorais** em `.claude/agents/`. É aqui que mora o conhecimento do projeto; nada disto é importado de fora.
- **Decisão por código, não por lembrete** (política de segurança, preflight que recusa produção, validação do caderno, classificação por oráculo, relatório e gate) → os **scripts Node** em `.claude/skills/sf-test/scripts/`, com testes. O agente executa; quem decide o veredito são as regras e um **juiz independente de contexto novo**.
- **Aprende uma vez, repete sem modelo:** o agente observa a tela e age na primeira execução; o trace vira uma jornada determinística e o replay seguinte **não chama modelo**. Se a tela mudar, o agente continua de onde o replay parou.
- Não importa nenhuma skill de terceiros: Playwright é a única dependência.

## Os 4 agentes

| Agente | Papel |
|---|---|
| `sf-qa-executor` | Worker que executa **um** caso na tela pelo CLI do motor: observa, age (≤ 30 ações, para após 3 falhas seguidas), chama `concluir` para rodar as asserções e compilar a jornada. Não decide bug vs. previsto, não faz perguntas. Até 3 em paralelo, cada um com sua sessão de navegador. |
| `sf-qa-judge` | Juiz independente (contexto novo, somente leitura): recebe só o pacote de evidência (oráculo citado, esperado, o que a tela mostrou, gaps relacionados) e devolve `BUG`, `PREVISTO`, `A_CONFIRMAR` ou `PASSOU` com a razão. Nunca vê a narrativa do executor. |
| `sf-qa-coverage-review` | Revisor de contexto novo do caderno: cada critério de aceite e regra está **realmente** exercitado (não só citado)? Há caso negativo e de limite para validações e campos obrigatórios, e caso de LGPD/compliance quando o oráculo pede? |
| `sf-qa-case-quality-review` | Revisor de contexto novo da qualidade dos casos: esperado observável e compilado em verificação determinística, passos sem ambiguidade, nenhum valor ou mensagem inventados fora dos oráculos. |

O orquestrador e as regras de decisão estão em [`.claude/skills/sf-test/SKILL.md`](.claude/skills/sf-test/SKILL.md); o detalhe de cada parte em [`.claude/skills/sf-test/references/`](.claude/skills/sf-test/references/).

## Pré-requisitos

- **Salesforce CLI (`sf`) v2** instalado e uma **org autenticada** que seja **sandbox ou scratch** — `sf --version` e `sf org display --target-org <alias>` precisam funcionar. Produção é **recusada** pelo `preflight`; sem CLI autenticado a skill cai para a sessão salva e, sem ela, para com `BLOQUEADO` e a correção exata — nunca simula um teste.
- **Node.js ≥ 20** e **Playwright** com Chromium: `npm install playwright && npx playwright install chromium`.
- O projeto já ter o **Salesforce Journey Designer** e o **Journey Developer** instalados, com pelo menos uma capacidade **construída e implantada** (`specs/<domínio>/<NNN>-<slug>/` com `spec.md` e `build-report.md`). Sem critérios de aceite com fonte, a base é fraca: só testes exploratórios, tudo `A_CONFIRMAR`.
- Opcional: `discovery/<rodada>/backlog.json` (da skill **Discovery-to-Backlog**) — traz critérios de aceite e perguntas de negócio ancorados em fontes.

## Como começar

### O que o Developer entrega a você

Antes de rodar `/sf-test`, verifique que a capacidade está **construída e implantada** na sandbox: a pasta `specs/<domínio>/<NNN>-<slug>/` deve ter `spec.md` (critérios de aceite e regras), `plan.md`, `tasks.md` e `build-report.md` (evidência do deploy, **gaps conhecidos** e decisões). O `build-report.md` é o que permite classificar uma diferença como **previsto**; sem ele, a mesma diferença fica `A_CONFIRMAR`. Veja o [README do Developer](https://github.com/brunotrolo/Salesforce_Journey_Developer) para o ciclo completo.

### Instalação

Rode **de dentro da pasta do projeto onde o Designer e o Developer já estão instalados**:

**Mac / Linux / Git Bash:**
```bash
git clone --depth 1 https://github.com/brunotrolo/Salesforce_Test_Automator.git .ta-tmp && mkdir -p .claude && { [ -f .claude/settings.json ] && mv .claude/settings.json .claude/settings.json.anterior; :; } && cp -r .ta-tmp/.claude/. .claude/ && rm -rf .ta-tmp && npm install playwright
```

**Windows (PowerShell):**
```powershell
git clone --depth 1 https://github.com/brunotrolo/Salesforce_Test_Automator.git .ta-tmp; if (-not (Test-Path .claude)) { New-Item -ItemType Directory .claude | Out-Null }; if (Test-Path .claude\settings.json) { Move-Item -Force .claude\settings.json .claude\settings.json.anterior }; Copy-Item -Recurse -Force .ta-tmp\.claude\* .claude\; Remove-Item -Recurse -Force .ta-tmp; npm install playwright
```

A cópia é aditiva: agentes, skills e rules do Test Automator têm prefixo próprio (`sf-qa-*`, `sf-test`) e não colidem com os das skills irmãs. **Exceção: `settings.json`.** Se você já tinha um (o do Developer tem o hook `guard-deploy`), ele é preservado como `.claude/settings.json.anterior` — **junte os dois**: mantenha os hooks e permissões que já tinha e acrescente o hook `guard-qa` e as permissões de `.claude/settings.json` deste repositório. Depois: `npx playwright install chromium`.

### Configuração obrigatória: `SF_TARGET_ORG`

Antes de qualquer teste, autentique a **sandbox** e defina o alias dela:

```bash
sf org login web --alias minha-sandbox        # uma vez
export SF_TARGET_ORG=minha-sandbox            # Mac / Linux / Git Bash
```
```powershell
$env:SF_TARGET_ORG = "minha-sandbox"          # Windows (PowerShell)
```

Nenhum alias vem embutido no repositório, de propósito: um clone não pode herdar a org de outra pessoa. O `preflight.mjs` lê `SF_TARGET_ORG` (ou `target-org` em `.sf/config.json`), exige `IsSandbox=true` e **recusa** produção ou qualquer dúvida; o hook `guard-qa.mjs` é **fail-closed** — sem a variável, nenhum comando `sf` de dados passa. Coloque o `export` no seu shell profile.

Depois, abra o Claude Code na pasta do projeto — o comando `/sf-test` e os agentes carregam automaticamente junto com os das skills irmãs. Em sessões não interativas (`claude -p`), o workspace precisa estar confiável para o hook e as permissões valerem.

## O que entra no seu `.claude/`

| Caminho | O que faz | Quando carrega |
|---|---|---|
| `agents/sf-qa-*` | Os 4 subagentes (executor, juiz e dois revisores). Cada um roda na própria janela de contexto. | Quando despachados |
| `rules/` | `qa-governance.md` (oráculo antes de veredito, zero perguntas, orquestração na conversa principal) e `sandbox-only.md` (só sandbox, só dado fictício), ambas sem `paths:`. | No início da sessão |
| `skills/sf-test/`, `skills/sf-test-status/` | Os comandos `/sf-test` e `/sf-test-status`, com `scripts/` (política, preflight, base de teste, caderno, massa, motor, jornadas, classificação, relatório), `schemas/` e `references/`. | Sob demanda, quando você digita |
| `settings.json` | Hook `guard-qa` (em `Bash`, `Read`, `Grep`, `Glob`, `Edit`, `Write`) e permissões dos scripts do QA. | Aplicado em toda chamada de ferramenta |
| `.sf-test/` *(na raiz do projeto, fora do git)* | Execuções (`runs/`), jornadas aprendidas e decisões (`knowledge/`), sessão do navegador (`auth/`, 0600). | Criada na primeira execução |

### Comandos

| Comando | O que faz |
|---|---|
| `/sf-test <domínio>/<NNN-slug>` | Roda o QA de ponta a ponta: preflight, base de teste, caderno, massa, replay, aprendizado, classificação com juiz, relatório e limpeza. Sem perguntas durante a execução. |
| `/sf-test <domínio>/<NNN-slug> --rapido` | Só replay + classificação + relatório (o do dia a dia e antes do commit). |
| `/sf-test <domínio>/<NNN-slug> --explorar` | Acrescenta testes exploratórios por *charter*; achados sem oráculo ficam `A_CONFIRMAR`. |
| `/sf-test-status` | Mostra a situação das execuções: gate, bugs, itens a confirmar, bloqueios e o próximo passo. |

### O que o `settings.json` e o hook impedem na prática

O hook `.claude/skills/sf-test/scripts/guard-qa.mjs` cobre o que **derrotaria a segurança do QA em silêncio** — por isso é bloqueio, não prosa:

- qualquer comando `sf` fora da lista permitida: só `sf data query`, `sf data create record`, `sf org display`, `sf org open --url-only` (e `--version`) passam; **deploy, `apex run`, importação em massa e login são negados**;
- comando `sf` sem `--target-org`, ou apontado para uma org diferente de `$SF_TARGET_ORG`;
- `sf data update/delete record` em id que **não foi criado pela execução** (só os ids do `massa_log.json`);
- leitura ou edição da sessão do navegador (`.sf-test/auth`), por ferramenta ou por shell.

O **motor de tela** tem a mesma política em código: navega só para domínios da org e da plataforma, não aceita XPath, e clique em "Excluir/Remover/Mesclar" só em registro criado pela execução. Se o payload do hook vier quebrado, ele sai em silêncio sem bloquear: um bug no guard nunca pode travar trabalho legítimo.

## Como o orquestrador funciona internamente

### Orquestração na conversa principal

Subagente não chama subagente nem pergunta ao usuário. Por isso o `/sf-test` roda na conversa principal e despacha só agentes de primeiro nível. Se não houver ferramenta de subagente, a skill **para**: revisão e juiz no mesmo contexto não valem. Revisor ou juiz que falha é `not run` — e o que dependia dele fica `A_CONFIRMAR`, nunca "sem achados".

### Contrato do executor

O `sf-qa-executor` devolve um JSON curto — `{"caso","status","via","acts","observacoes"}` — e o resultado bruto do caso é gravado em `resultados/TC-nnn.json` por `executar.mjs concluir`. O **status** (`verde`, `vermelho`, `bloqueado`, `pendente_juiz`) nasce das asserções, não da impressão do agente; um caso vermelho nunca vira `PASSOU`.

### Limites e reexecução

O executor para após **30 ações** ou **3 falhas seguidas**. Bug candidato só é confirmado se **reproduzir 2 de 2** (reexecução) e o juiz concordar. Resultado diferente na reexecução vira `INSTAVEL`. Replay que para no meio vira cura: o agente leva a tela até o passo anterior (`prefixo`), continua e só regrava a jornada se uma verificação passar.

### Falha de infraestrutura

Login, massa, permissão e política barrada são `BLOQUEADO`, com a correção exata — o produto não falhou, o ambiente falhou. Um caso P1 bloqueado deixa o gate em `NÃO CONCLUÍDO`.

## Ciclo por capacidade

```
specs/<domínio>/<NNN>-<slug>/ + build-report.md   (Designer + Developer: critérios, regras, gaps, decisões)
discovery/<R>/backlog.json                         (PO: critérios com fonte, perguntas de negócio — opcional)
force-app/**                                       (regras de validação, campos obrigatórios, picklists)
        ↓
preflight (recusa produção) → base de teste (oráculos com citação verificada) → caderno (2 revisores) → massa ZZ_TEST_
        ↓
replay sem modelo  →  executores aprendem/curam o que falta (≤ 3 em paralelo)  →  jornadas compiladas
        ↓
classificação por oráculo → reexecução 2 de 2 → juiz independente → BUG | PREVISTO | A_CONFIRMAR | BLOQUEADO
        ↓
resultado.md (1 tela) + bugs/BUG-nnn.md + test-report.md na pasta da spec + limpeza da massa
```

Uma capacidade só passa no gate quando **não há bug** e nenhum caso P1 ficou bloqueado; itens `A_CONFIRMAR` não reprovam, mas ficam listados com a pergunta de negócio.

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

## Verificação
`npm install && npm test` — 46 testes com **app de teste que imita o console Lightning** (shadow DOM, validações, toasts) e **bugs plantados** (regra quebrada, erro não tratado, banner sem especificação, gap documentado). Critério: veredito certo em cada caso, zero falso positivo no caminho limpo, replay sem agente.

## O que NÃO foi verificado
Tudo acima rodou contra a app de teste e um `sf` simulado. **Não** foi exercitado: Lightning real (LWC, abas do console, iframes de outro domínio, shadow DOM fechado), `sf org open --url-only` e o login real, segundo fator, padrões reais de erro do Apex/Flow, o formato exato dos comandos `sf data create/delete record`, execução dos subagentes (`sf-qa-executor`, `sf-qa-judge`, revisores) numa sessão real. Casos de **permissão por perfil** ainda não trocam de usuário. Ver `docs/open-decisions.md`.

---

## 📋 Resumo — input, o que faz, o que entrega

| | |
|---|---|
| **Input** | A capacidade **construída e implantada**: `specs/<domínio>/<NNN>-<slug>/` com `spec.md` e `build-report.md` (Designer + Developer), opcionalmente `discovery/<R>/backlog.json` (PO) e os metadados em `force-app/`. Uma sandbox autenticada no Salesforce CLI (`SF_TARGET_ORG`). |
| **O que faz** | `preflight` (recusa produção) → base de teste com oráculos citados → caderno validado e revisado → massa sintética `ZZ_TEST_` → replay das jornadas aprendidas **sem modelo** → executores (≤ 3 em paralelo) aprendem ou curam o que falta → classificação por regras, reexecução 2 de 2 e juiz independente → relatório e limpeza da massa criada. Cada veredito exige oráculo citado ou invariante técnica; nada vira "previsto" sozinho. |
| **Entrega** | `resultado.md` de **uma tela** (gate, bugs com a fonte da expectativa, perguntas a confirmar, bloqueios, previstos), `bugs/BUG-nnn.md` com passos para reproduzir e evidência, `test-report.md` na pasta da spec, jornadas aprendidas em `.sf-test/knowledge/` e código de saída para o terminal (0 sem bug · 1 há bug · 2 não concluído). |

---

<p align="center">
  ⭐ <b><a href="https://github.com/brunotrolo/Salesforce_Test_Automator/stargazers">Dê uma star no repo</a></b> para ser avisado quando novas melhorias saírem.
</p>
