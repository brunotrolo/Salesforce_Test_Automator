# Como escrever o caderno (`caderno.json`)

Schema em `schemas/caderno.schema.json`. Cada caso: `id TC-nnn`, `titulo`, `tipo` (fumaca, funcional, negativo, limite, permissao, lgpd, exploratorio), `prioridade` (P1 para aceite/compliance), `oraculos` (obrigatório, menos em exploratório), `gaps_relacionados`, `pre_condicoes`, `massa`, `perfil`, `passos` (numerados, nomes como a tela mostra) e `esperado`.
- `massa`: `{ref, entidade, atributos, quantidade}`; `@documento` gera documento sintético; `@outra_ref.id` referencia outro item; `__existente: true` só para dado padrão que já existe (fila, perfil).
- `esperado[].verificacao`: `texto-visivel`/`texto-ausente`/`url`/`valor-campo` (com `valor`), `elemento-visivel`/`elemento-ausente` (com `alvo` papel/rotulo/texto), `semantica` (só se não der para afirmar exatamente).
- Um comportamento por caso, ≤ 8 passos. Valores e mensagens esperados vêm do oráculo, nunca da sua cabeça.
- Valide: `validate-caderno.mjs caderno.json --basis test_basis.json`.

## Navegação base e smoke
`navegacao_base`: `{app, caminho:[abas…], formulario:[passos para abrir o formulário]}`. `gerar-smoke.mjs` usa `caminho` (TC-901) e `formulario` + campos obrigatórios (TC-902); casos gerados levam `origem:"smoke"` e são regenerados, não editados à mão.
