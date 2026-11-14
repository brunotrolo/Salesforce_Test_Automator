#!/usr/bin/env node
// caderno.json → caderno.md (para o dev ler e revisar). Uso: node render-caderno.mjs <caderno.json> [--out caderno.md]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function renderCaderno(cad) {
  const L = [`# Caderno de teste — ${cad.capacidade}`, '', `${cad.casos.length} caso(s). Rastreio: cada caso aponta para os oráculos (O-nnn) da base de teste.`, ''];
  L.push('| Caso | Tipo | Prio | Título | Oráculos |', '|---|---|---|---|---|');
  for (const c of cad.casos) L.push(`| ${c.id} | ${c.tipo} | ${c.prioridade} | ${c.titulo} | ${(c.oraculos || []).join(', ') || '—'} |`);
  for (const c of cad.casos) {
    L.push('', `## ${c.id} — ${c.titulo}`, '', `Tipo: ${c.tipo} · Prioridade: ${c.prioridade}${c.perfil ? ` · Perfil: ${c.perfil}` : ''}`);
    if ((c.gaps_relacionados || []).length) L.push(`Gap conhecido relacionado: ${c.gaps_relacionados.join(', ')} (diferença nesta área é PREVISTA)`);
    if ((c.pre_condicoes || []).length) L.push('', '**Pré-condições**', ...c.pre_condicoes.map((x) => `- ${x}`));
    if ((c.massa || []).length) L.push('', '**Massa**', ...c.massa.map((m) => `- \`${m.ref}\`: ${m.quantidade ?? 1}× ${m.entidade}${m.atributos ? ` ${JSON.stringify(m.atributos)}` : ''}`));
    L.push('', '**Passos**', ...c.passos.map((p) => `${p.n}. ${p.acao}`), '', '**Esperado**', ...c.esperado.map((e) => `- ${e.texto} _(${e.verificacao.tipo}${e.verificacao.valor ? `: "${e.verificacao.valor}"` : ''})_`));
  }
  return L.join('\n') + '\n';
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = process.argv.slice(2); if (!a[0]) { console.error('Uso: render-caderno.mjs <caderno.json> [--out caderno.md]'); process.exit(1); }
  const oi = a.indexOf('--out'); const out = oi > -1 ? a[oi + 1] : join(dirname(a[0]), 'caderno.md');
  writeFileSync(out, renderCaderno(JSON.parse(readFileSync(a[0], 'utf8')))); console.log(`[render-caderno] → ${out}`);
}
