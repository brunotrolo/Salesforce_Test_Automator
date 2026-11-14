# Aprender sozinho

1. 1ª execução de um caso: `sf-qa-executor` observa e age (≤ 30 ações). `concluir` roda as asserções; se verde, o trace vira `journeys/<cap>/TC-nnn.json` (alvos por papel/rótulo/texto, valores como `{{ref.campo}}`).
2. Próximas execuções: `executar.mjs replay`, **sem modelo**. 3 verdes seguidos promovem a jornada.
3. Se a tela mudou e o replay para no passo k: o executor leva a tela até k−1 (`prefixo`), continua e regrava a jornada **só se** a verificação passar (cura). Nunca clica no "mais parecido".
4. Caso alterado no caderno → jornada obsoleta → reaprender.
5. Decisões do dev (`knowledge.mjs decidir <id> bug|previsto`) valem nas próximas execuções; precedentes só anotam.
