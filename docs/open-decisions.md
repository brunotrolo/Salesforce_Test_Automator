# Decisões em aberto e limites conhecidos

| # | Item | Efeito hoje |
|---|---|---|
| 1 | **Nada foi rodado em Lightning/org reais.** Comandos `sf` (`org open --url-only --json`, `data create record --values`, `data delete record`, consulta `IsSandbox`) e seus formatos de saída foram assumidos a partir do uso comum e testados só com um `sf` simulado | Validar na primeira sessão na máquina do dev; ajustar `massa.mjs`/`engine/factory.mjs` |
| 2 | **Casos de permissão por perfil**: o motor ainda não troca de usuário (`perfil` no caderno é informativo) | Casos que exigem outro perfil ficam `A_CONFIRMAR`/`BLOQUEADO` |
| 3 | Criação/exclusão de massa por API (`sf data`) na sandbox é permitida só para ids criados pela execução | Confirmar com a equipe a política da sandbox |
| 4 | Documentos sintéticos têm dígitos verificadores válidos (necessário para regras que validam CPF/CNPJ) e podem coincidir com documentos reais | Confirmar a política de dados; trocar por faixa reservada, se existir |
| 5 | iframe de outro domínio e shadow DOM **fechado** não são alcançados pela observação | Esses trechos ficam sem asserção determinística |
| 6 | Promoção da jornada após N=3 execuções verdes (`SFT_ESTABILIZAR`) | Ajustar conforme a estabilidade real |
| 7 | Anotar o resultado no `BACKLOG.md` do Designer e abrir bug no Jira | Não implementado; o relatório é o insumo (`test-report.md` na pasta da spec) |
| 8 | Permissões de ferramenta em sessões `claude -p` (workspace não confiável ignora `.claude/settings.json`) | Rodar interativamente ou confiar no workspace |
| 9 | Padrões de erro não tratado (INV-001) e lista de ruído de console (INV-004) são heurísticas | Ajustar `engine/detectors.mjs` com exemplos reais |
| 10 | Nomes de abas/botões dependem do idioma do usuário da org | Fixar o idioma do usuário de teste |
