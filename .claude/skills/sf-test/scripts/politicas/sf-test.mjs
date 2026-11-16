// Política do odin-guard para esta skill (ADR 0027 do Odin): as mesmas regras do guard-qa.mjs, aplicadas depois do `odin ensure sf-test`.
// Só comandos `sf` permitidos, na org alvo e em sandbox; a sessão do navegador (.sf-test/auth) nunca é lida nem editada.
import { decide } from '../guard-qa.mjs';

export default function politica(evento) {
  const d = decide(evento?.tool_name ?? '', evento?.tool_input ?? {}, evento?.cwd ?? process.cwd());
  return d.allow ? null : { decisao: 'negar', motivo: d.reason };
}
