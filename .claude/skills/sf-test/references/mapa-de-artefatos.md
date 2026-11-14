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
| Roteiro do protótipo da PO | `entregas/proto_meta.json` | sugestão de passos (não é oráculo) |

Autoridade menor número = vale mais. Sem nada disto a base é fraca.
