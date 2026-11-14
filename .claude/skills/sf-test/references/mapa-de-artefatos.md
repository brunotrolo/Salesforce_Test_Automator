# Mapa de artefatos (de onde vem cada oráculo)

| Artefato | Onde | O que vira |
|---|---|---|
| Critérios de aceite (Dado/Quando/Então) | `specs/<dom>/<NNN>/spec.md` (seção de cenários), `discovery/<R>/backlog.json` | oráculo `aceite` (autoridade 1) |
| Regras de negócio / bordas | `spec.md` (regras, casos de borda), `backlog.json` | `regra` (1) / `aceite` com subtipo borda |
| `[NEEDS CLARIFICATION: negócio]` | `spec.md`, `backlog.json` | `questions` e oráculo `incerto` → `A_CONFIRMAR` |
| Decisões e abordagem | `plan.md`, `build-report.md` (Decisions Made) | `decisao` (2) |
| Regras de validação, campos obrigatórios, picklists | `force-app/**` (do domínio) | `validacao`/`campo` (2): casos negativos e de limite |
| Gaps e limitações conhecidas | `build-report.md` (Gaps Found), `tasks.md` (`[GATE-n]`) | `gap-conhecido` (3): diferença nessa área é `PREVISTO` |
| Invariantes técnicas | embutidas (INV-001…005) | `invariante` (4): erro Apex/Flow, 5xx, texto cru, erro de console, tela travada |
| Intenção do PR (descrição, "o que mudou", plano de teste, cenários Dado/Quando/Então) | `--pr pr.json` (título e corpo) | `pr` (autoridade 2): cenários quando a spec está ausente/desatualizada |
| Commits do intervalo | `--diff <intervalo git>` | `commit` (autoridade 3), sem `chore/docs/ci/test/style/merge` |
| Arquivos alterados | `--diff` (`git diff --name-status`) | `mudancas` (escopo) e `alterado_no_diff` nos oráculos afetados |
| Roteiro do protótipo da PO | `entregas/proto_meta.json` | sugestão de passos (não é oráculo) |

Autoridade menor número = vale mais. Sem nada disto a base é fraca.
