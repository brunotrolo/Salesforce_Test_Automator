# Oráculos e veredito

Um **oráculo** é o que define "certo", com citação verificável (`arquivo:linha`).
Veredito por **regras** (`classify.mjs`) + juiz independente:

| Veredito | Quando |
|---|---|
| PASSOU | todas as asserções do caso verdadeiras |
| BUG | contradiz oráculo de autoridade ≤ 2, **reproduz 2 de 2**, e o juiz confirma; ou invariante técnica repetida |
| PREVISTO | o caso aponta um gap/decisão documentada (`gaps_relacionados`) ou há decisão registrada do dev |
| A_CONFIRMAR | sem oráculo, oráculo fraco/incerto, juiz não executado (`not run`) ou juiz em dúvida — traz a pergunta de negócio |
| BLOQUEADO | login, massa, permissão ou política: causa fora do produto |
| INSTAVEL | a reexecução deu resultado diferente |

Nada vira PREVISTO sozinho: só por `knowledge.mjs decidir`. Um caso vermelho nunca vira PASSOU.
