# Oráculos e veredito

Um **oráculo** é o que define "certo", com citação verificável (`arquivo:linha`).
Veredito por **regras** (`classify.mjs`) + juiz independente:

| Veredito | Quando |
|---|---|
| PASSOU | todas as asserções do caso verdadeiras |
| BUG | contradiz oráculo de autoridade ≤ 2, **reproduz 2 de 2**, e o juiz confirma; ou invariante técnica repetida |
| MUDANCA_NAO_DOCUMENTADA | contradiz a spec, **reproduz 2 de 2**, e há evidência **mais recente que a spec** de que a mudança foi intencional (PR, commit, regra de validação, decisão do build) que bate com o que a tela mostrou; o juiz confirma. Não reprova o gate: vira pendência "atualizar a spec" |
| PREVISTO | o caso aponta um gap/decisão documentada (`gaps_relacionados`) ou há decisão registrada do dev |
| A_CONFIRMAR | sem oráculo, oráculo fraco/incerto, juiz não executado (`not run`) ou juiz em dúvida — traz a pergunta de negócio |
| BLOQUEADO | login, massa, permissão ou política: causa fora do produto |
| INSTAVEL | a reexecução deu resultado diferente |

Evidência de mudança é literal, não palpite: a mensagem de uma regra de validação aparece na tela, ou um PR/commit que fala de texto exibido cita um trecho que aparece na tela (nome de campo não conta). Sem isso o juiz não pode alegar mudança e o caso segue BUG ou A_CONFIRMAR.
Nada vira PREVISTO sozinho: só por `knowledge.mjs decidir`. Um caso vermelho nunca vira PASSOU.
