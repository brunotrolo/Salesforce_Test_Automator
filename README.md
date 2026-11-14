# Salesforce Test Automator

<p align="center">

  <img src="assets/banner.svg" width="960" alt="Salesforce Test Automator">
</p>

<p align="center">
  <img src="https://img.shields.io/github/stars/brunotrolo/Salesforce_Test_Automator?style=flat-square&color=00A1E0&label=stars" alt="Stars">
  <img src="https://img.shields.io/badge/agentes-4-04E1CB?style=flat-square" alt="4 agentes">
  <img src="https://img.shields.io/badge/works%20with-Claude%20Code-032D60?style=flat-square" alt="Works with Claude Code">
</p>


QA de **tela** para o que o **[Journey Developer](https://github.com/brunotrolo/Salesforce_Journey_Developer)** construiu e implantou. Lê os artefatos do PO, do Journey Designer e do Developer, monta o **caderno de teste** e a **massa**, opera a tela com **Playwright**, separa **bug** de **comportamento previsto** e de **"a confirmar"**, e devolve um **relatório de uma tela**. Roda **local**, só em **sandbox**, **sem perguntas durante a execução**.

Instale no mesmo projeto do Designer e do Developer: os três compartilham `specs/` e o `build-report.md` de cada capacidade (de onde vêm os gaps conhecidos).

## Como funciona
- **Oráculo antes de veredito:** todo BUG cita a especificação (`arquivo:linha`) ou uma invariante técnica. Sem fonte, é "a confirmar".
- **Decisão por código:** política de segurança, preflight (recusa produção), classificação e relatório são scripts testados; um **juiz independente** (contexto novo) confirma os bugs.
- **Aprende uma vez, repete sem modelo:** o agente aprende o caso observando a tela; as próximas execuções reproduzem a jornada sem chamar modelo.

## Os 4 agentes

| Agente | Papel |
|---|---|
| `sf-qa-executor` | Executa **um** caso na tela (≤ 30 ações) e registra o resultado. Não decide bug. Até 3 em paralelo. |
| `sf-qa-judge` | Juiz independente: só vê o oráculo e a evidência e devolve BUG, PREVISTO, A_CONFIRMAR ou PASSOU. |
| `sf-qa-coverage-review` | Revisa o caderno: cada critério e regra está realmente exercitado? Há caso negativo e de limite? |
| `sf-qa-case-quality-review` | Revisa a qualidade dos casos: esperado observável, passos sem ambiguidade, nada inventado. |

## Pré-requisitos
- **Node.js ≥ 20** e **Playwright** (`npm install playwright && npx playwright install chromium`).
- **Salesforce CLI (`sf`) v2** com uma **sandbox ou scratch** autenticada. Produção é recusada.
- O projeto com o **Designer e o Developer** instalados e uma capacidade já **construída e implantada** (`specs/<domínio>/<NNN>-<slug>/` com `spec.md` e `build-report.md`). Opcional: `discovery/<R>/backlog.json` da skill Discovery-to-Backlog.

## Instalação

Dentro da pasta do **seu projeto Salesforce**:

```bash
git clone --depth 1 https://github.com/brunotrolo/Salesforce_Test_Automator.git .ta-tmp
node .ta-tmp/install.mjs
```

Depois apague a pasta temporária: `rm -rf .ta-tmp` (Mac/Linux/Git Bash) ou `Remove-Item -Recurse -Force .ta-tmp` (PowerShell).

O instalador funciona igual em Mac, Linux e Windows. Ele **copia** `.claude/` sem apagar nada seu, **mescla** o seu `.claude/settings.json` (hooks e permissões; guarda a cópia em `settings.json.anterior`) e acrescenta `.sf-test/` ao `.gitignore`. Pode rodar de novo. `--dry-run` mostra o que faria sem alterar nada.

Depois, uma vez:

```bash
npm install playwright && npx playwright install chromium
sf org login web --alias minha-sandbox
export SF_TARGET_ORG=minha-sandbox       # PowerShell: $env:SF_TARGET_ORG = "minha-sandbox"
```

Nenhum alias vem embutido no repositório. Sem `SF_TARGET_ORG` (ou `target-org` em `.sf/config.json`), nada roda. Em `claude -p`, o workspace precisa estar confiável para o hook e as permissões valerem.

## Comandos

| Comando | O que faz |
|---|---|
| `/sf-test <domínio>/<NNN-slug>` | QA de ponta a ponta, sem perguntas. |
| `/sf-test … --rapido` | Só replay + classificação + relatório (dia a dia, antes do commit). |
| `/sf-test … --explorar` | Acrescenta testes exploratórios; achados sem oráculo ficam "a confirmar". |
| `/sf-test-status` | Situação das execuções e o próximo passo. |

## Como decide o que é bug

| Veredito | Significa |
|---|---|
| **PASSOU** | as asserções do caso foram verdadeiras |
| **BUG** | contradiz um oráculo forte, **reproduziu 2 de 2** e o juiz confirmou; ou violou uma invariante (erro Apex/Flow não tratado, HTTP 5xx, texto cru, erro de console, tela travada) |
| **PREVISTO** | já documentado como gap no `build-report` ou decisão registrada pelo dev |
| **A_CONFIRMAR** | sem oráculo ou em dúvida: traz a **pergunta de negócio**; nunca conta como bug nem sucesso |
| **BLOQUEADO** | login, massa, permissão ou política (causa fora do produto) |
| **INSTAVEL** | a reexecução deu outro resultado |

Ordem dos oráculos: critério de aceite/regra de negócio › decisão do plan/build-report › gap conhecido › invariante técnica. Nada vira "previsto" sozinho.

## Segurança (por código)
- `preflight` exige `IsSandbox=true` e **recusa produção** (na dúvida, recusa).
- O hook `guard-qa` só deixa passar `sf data query`, `sf data create record`, `sf org display` e `sf org open --url-only`, na org alvo. **Sem deploy, `apex run`, importação em massa nem login.** Alterar/excluir só ids criados pela execução.
- Massa sempre sintética e marcada `ZZ_TEST_<execução>`. A sessão do navegador (`.sf-test/auth`) é intocável. Evidências com PII mascarada.

## Ciclo

```
specs/ + build-report.md + (backlog.json) + force-app/  →  base de teste (oráculos citados)
→ caderno (2 revisores) → massa ZZ_TEST_ → replay sem modelo → executores aprendem o que falta
→ classificação → reexecução 2 de 2 → juiz → resultado.md (1 tela) + bugs/BUG-nnn.md + limpeza da massa
```

Gate da capacidade: **APROVADO** · **APROVADO COM PENDÊNCIAS** (há "a confirmar") · **NÃO CONCLUÍDO** (P1 bloqueado) · **REPROVADO** (há bug). Saída do comando: 0 sem bug · 1 há bug · 2 não concluído.

Detalhes (passo a passo, origem dos oráculos, caderno, massa, motor, exemplo de relatório): [`docs/como-funciona.md`](docs/como-funciona.md).

## O que NÃO foi verificado
Tudo rodou contra uma app de teste que imita o console e um `sf` simulado. **Não** foi exercitado: Lightning real (LWC, abas do console, iframes de outro domínio), `sf org open --url-only` e o login real, o formato exato dos comandos `sf data …`, os subagentes numa sessão real, nem a troca de usuário por perfil. Limites completos em [`docs/open-decisions.md`](docs/open-decisions.md).

## Testes
`npm install && npm test` (inclui avaliação com bugs plantados e testes do instalador) e `node scripts/verify-skills.mjs`.

---

## 📋 Resumo

| | |
|---|---|
| **Input** | Capacidade construída e implantada (`spec.md`, `build-report.md`, opcional `backlog.json`, metadados em `force-app/`) e uma sandbox autenticada no CLI. |
| **O que faz** | Base de teste com oráculos citados → caderno revisado → massa sintética → replay sem modelo + aprendizado → classificação com reexecução e juiz → relatório. |
| **Entrega** | `resultado.md` de uma tela, `bugs/BUG-nnn.md` com passos e evidência, `test-report.md` na pasta da spec e jornadas aprendidas em `.sf-test/knowledge/`. |

---

<p align="center">
  ⭐ <b><a href="https://github.com/brunotrolo/Salesforce_Test_Automator/stargazers">Dê uma star no repo</a></b> para ser avisado das melhorias.
</p>
