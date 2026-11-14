# Motor de tela (Playwright)

CLI (`scripts/engine/cli.mjs`): `start | begin <TC> | observe | act '<json>' | assert '<json>' | end | close`, sempre com `--run <id> [--session sN]`; saída = uma linha JSON.
- Política (código): só domínios da org, sem XPath, ação destrutiva só em registro criado pela execução, valores `{{ref.campo}}` resolvidos no motor.
- Observação: árvore de acessibilidade (atravessa shadow DOM aberto), texto, notificações; PII mascarada.
- Detectores passivos: INV-001 erro não tratado, INV-002 HTTP 5xx, INV-003 texto cru, INV-004 erro de console, INV-005 tela travada.
- Login híbrido: `sf org open --url-only` (CLI autenticado) → sessão salva (`scripts/entrar.mjs`, uma vez) → BLOQUEADO.
- Limites: iframe de outro domínio aparece vazio na árvore; shadow DOM fechado não é alcançado.
