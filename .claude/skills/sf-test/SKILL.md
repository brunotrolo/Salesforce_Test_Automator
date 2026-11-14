---
name: sf-test
description: QA autônomo de tela para Salesforce Service Cloud, depois do Journey Developer. Lê os artefatos do PO, do Journey Designer e do Journey Developer, monta o caderno de teste e a massa de dados, opera a tela com Playwright (aprende uma vez, depois reproduz sem modelo), separa BUG de comportamento previsto, de regra de negócio e de "a confirmar", e entrega um relatório de uma tela. Roda na máquina do dev, só em sandbox, sem fazer perguntas durante a execução. Use quando o dev pedir para testar a tela de uma capacidade construída (ex.: "testa busca-cliente 001", "roda o QA de tela").
disable-model-invocation: true
argument-hint: <dominio/NNN-slug> [--rapido] [--explorar]
arguments: [capacidade]
---

# sf-test — QA de tela autônomo

Roda na **conversa principal** (subagente não chama subagente nem pergunta ao usuário). Executa de ponta a ponta **sem perguntar nada**: o que falta vira `BLOQUEADO` com a correção exata; o que não dá para classificar vira `A_CONFIRMAR`. Leia as regras em `.claude/rules/qa-governance.md` e `sandbox-only.md`.

## Regras duras
1. **Oráculo antes de veredito.** BUG exige oráculo citado (`arquivo:linha`) ou invariante técnica. Sem oráculo → `A_CONFIRMAR`.
2. **Sem perguntas durante a execução.** Pré-condição ausente → pare esse trecho, registre `BLOQUEADO` e a correção.
3. **Só sandbox/scratch.** O `preflight` recusa produção; o hook `guard-qa` barra comandos `sf` fora da lista. Nunca contorne.
4. **Orquestração aqui.** Se não houver ferramenta de subagente (`Agent`), pare e diga: revisão e juiz no mesmo contexto não valem.
5. **Resultado vem de asserção** (`concluir`), não da sua impressão. Você nunca muda um veredito sem evidência nova.
6. Nunca grave alias de org, nome real, e-mail ou documento real. Nunca leia `.sf-test/auth`.

## Pastas
`RUN=$(date +%Y%m%d-%H%M%SZ)`; tudo em `.sf-test/runs/$RUN/`. Conhecimento persistente (jornadas, decisões) em `.sf-test/knowledge/`.

## Passos
1. **Preflight** — `node .claude/skills/sf-test/scripts/preflight.mjs --run $RUN`. Exit ≠ 0 → mostre os `→` de correção, escreva "BLOQUEADO" e **encerre**.
2. **Base de teste** — `node …/build-basis.mjs --spec specs/<dom>/<NNN-slug> [--discovery discovery/<R>/backlog.json] --run $RUN`. Leia `references/mapa-de-artefatos.md` se faltar fonte. Base fraca (sem critérios com fonte) → só `--explorar`, tudo `A_CONFIRMAR`.
3. **Caderno** (`caderno.json` em `.sf-test/runs/$RUN/`, formato em `references/caderno.md`): um caso por critério de aceite/regra, mais negativos e limites derivados das regras de validação e campos obrigatórios, permissão e LGPD quando houver oráculo. Cada caso cita oráculos e, quando o `build-report` registra um gap, `gaps_relacionados`. Esperado **observável** e compilado em `verificacao` (texto/elemento/URL/valor; `semantica` só se não der para afirmar exatamente).
   - `node …/validate-caderno.mjs caderno.json --basis test_basis.json` até aprovar (máx. 3 voltas) e `node …/render-caderno.mjs`.
   - Dispare **em paralelo** `sf-qa-coverage-review` e `sf-qa-case-quality-review` (contexto novo; passe só os caminhos). Aplique os achados 🔴; no máximo 1 reauditoria. Revisor que falhar = `not run` (diga).
4. **Massa** — `node …/massa.mjs plan caderno.json --out massa.json` (em `$RUN`) e `node …/massa.mjs prepare --run $RUN`. Casos sem massa viram `BLOQUEADO` (registrado em `massa_log.json`); siga com os demais.
5. **Replay** — `node …/executar.mjs replay --run $RUN` reproduz as jornadas já aprendidas **sem modelo**. O que sair em `pendentes.json` (sem jornada, obsoleta ou replay interrompido) vai para o passo 6. `--rapido`: pule os passos 3–4 se já há `caderno.json` e massa da última execução, e **não** aprenda casos novos.
6. **Aprender/curar** — para cada pendente, dispare `sf-qa-executor` (**até 3 em paralelo**, sessões `s1`, `s2`, `s3`; passe `run`, `session`, o caso e o `handoff` se houver). Cada um aprende observando a tela, chama `concluir` e a jornada é compilada. Ao fim: `node …/engine/cli.mjs close --run $RUN --session sN`.
7. **Classificar** — `node …/classify.mjs --run $RUN`. Se `precisa_rerun` não vazio: reexecute esses casos (`executar.mjs replay --rerun --casos TC-…`; sem jornada, `sf-qa-executor` com `--rerun`) e rode `classify` de novo. Para cada pacote em `juiz/pacote-*.json`, dispare `sf-qa-judge` (contexto novo, só o caminho) e salve a resposta JSON em `juiz/resultado-<caso>.json`; rode `classify` uma última vez.
8. **Relatório e limpeza** — `node …/report.mjs --run $RUN --spec-dir specs/<dom>/<NNN-slug>` e `node …/massa.mjs clean --run $RUN`. Mostre `resultado.md` **inteiro** (é uma tela) e os caminhos de `bugs/BUG-nnn.md`. Não acrescente narrativa.
9. **Estabilizar (opcional)** — jornadas recém-aprendidas só são "promovidas" após 3 execuções verdes seguidas; rodar `/sf-test <capacidade> --rapido` de novo as conta (o replay não usa modelo).

## Modos
- `--rapido`: só replay + classificação + relatório (o que roda no dia a dia e antes do commit).
- `--explorar`: acrescenta casos exploratórios por *charter* (primeiro uso, números e textos, entrada limite, recarregar a tela, caminho de erro) sobre as telas da capacidade; achados sem oráculo ficam `A_CONFIRMAR`, defeitos técnicos viram BUG.

## O que você não é
Não é testador de Apex, de carga ou de segurança; não implanta nada; não corrige o produto; não abre bug no Jira (o relatório é o insumo).
