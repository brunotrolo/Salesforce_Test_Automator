# Só sandbox, só dado fictício (sempre ativa)

- A org alvo vem de `SF_TARGET_ORG` ou `.sf/config.json` em tempo de execução; **nunca** grave alias de org, nome real, e-mail ou documento real em arquivo da skill ou do relatório.
- O `preflight.mjs` recusa produção (exige `IsSandbox=true`; na dúvida, recusa). Não tente contornar.
- O hook `guard-qa.mjs` só deixa passar `sf data query`, `sf data create record`, `sf org display`, `sf org open --url-only` na org alvo. Alterar/excluir registro só dos ids criados pela execução (`massa_log.json`). Nada de deploy, `apex run`, importação em massa ou login.
- O navegador só vai a domínios da org e da plataforma. Ação "Excluir/Remover/Mesclar" na tela só em registro criado pela execução.
- A sessão do navegador fica em `.sf-test/auth/` (0600, fora do git). O agente não a lê nem a edita.
- Evidências (aria, textos, capturas descritas) passam por máscara de PII antes de ir para o relatório.
- Massa de teste sempre com a marca `ZZ_TEST_<execução>`; documentos sintéticos.
