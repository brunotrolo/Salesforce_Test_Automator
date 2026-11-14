# Spec 001 — Intake de caso

## Contexto
O atendente abre um caso para o cliente identificado.

## Cenários de aceite
- **Dado** um cliente identificado, **quando** o atendente salva o caso com assunto e prioridade, **então** o número do caso aparece na tela.
- **Dado** um caso sem assunto, **quando** o atendente tenta salvar, **então** a tela mostra a mensagem "Informe o assunto".

## Regras de negócio
- Prioridade Alta exige descrição preenchida.
- O documento do cliente nunca é exibido completo. [NEEDS CLARIFICATION: negócio] Quais perfis podem ver o documento completo?

## Casos de borda
- Assunto com 255 caracteres é aceito; com 256 é recusado.
