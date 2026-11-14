# Massa de teste

Sempre sintética e marcada `ZZ_TEST_<execução>`; criada via `sf data create record` na org alvo (sandbox); só os ids de `massa_log.json` são excluídos. Dado existente só se o caso pedir (`__existente`) e nunca é alterado. Sem massa → caso `BLOQUEADO` com o que faltou. Valores com aspas ou `;` são recusados. Documentos sintéticos têm dígitos verificadores válidos (só para regras que validam o documento).
