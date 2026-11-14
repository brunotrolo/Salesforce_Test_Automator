# Governança do QA de tela (sempre ativa)

1. **Oráculo antes de veredito.** BUG exige oráculo citado (`arquivo:linha`) ou invariante técnica da plataforma. Sem oráculo → `A_CONFIRMAR`. Nunca invente regra de negócio para justificar um bug.
2. **Zero interação durante a execução.** Não faça perguntas ao dev enquanto roda. Pré-condição ausente → `BLOQUEADO` com a correção exata. Dúvida de classificação → `A_CONFIRMAR` e siga.
3. **Orquestração na conversa principal.** Subagente não chama subagente nem pergunta ao usuário. Executores e revisores são de primeiro nível; revisor que falha = `not run`.
4. **Determinístico no caminho principal.** O agente aprende uma vez, compila a jornada, e as execuções seguintes rodam sem modelo. Replay nunca "adivinha" o controle mais parecido.
5. **O resultado nasce de asserção, não de impressão.** "Passou" exige asserção determinística verdadeira; o juiz (contexto novo) decide só o que não dá para afirmar por código.
6. **Artefato primeiro, resultado curto.** Detalhes em `.sf-test/<execução>/`; no chat vai o resumo do relatório (≤ 1 tela).
7. **Aprendizado conservador.** Nada vira "previsto" sozinho; precedentes só reaproveitam decisões já registradas.
8. **Escopo.** Teste de tela. Não faz teste unitário de Apex, carga, segurança nem teste em produção; não implanta nada.
