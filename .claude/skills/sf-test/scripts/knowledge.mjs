// Conhecimento do QA (por projeto, em .sf-test/knowledge, fora do git): decisões do dev e precedentes.
// Regra de ouro: NADA vira "previsto" sozinho. Só uma decisão registrada (decidir) muda um veredito.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { knowledgeDir } from './lib/config.mjs';
import { hashOf } from './lib/util.mjs';

const f = (n, cwd) => join(knowledgeDir(cwd), n);
const ler = (p, vazio) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return vazio; } };
const gravar = (p, o) => { mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, JSON.stringify(o, null, 2)); };

/** Identidade estável de um achado: o caso e o que falhou (não o horário nem o valor lido). */
export const impressao = (caso, falhas) => hashOf({ caso, falhas: [...falhas].sort() });
export const impressaoTecnica = (inv, evidencia) => hashOf({ inv, ev: String(evidencia).replace(/\d+/g, '#').slice(0, 80) });

export const lerDecisoes = (cwd = process.cwd()) => ler(f('decisions.json', cwd), {});
export function decidir(id, decisao, { cwd = process.cwd(), motivo = '' } = {}) {
  if (!['bug', 'previsto', 'mudanca'].includes(decisao)) throw new Error('decisão deve ser bug, previsto ou mudanca');
  const d = lerDecisoes(cwd); d[id] = { decisao, motivo: String(motivo).slice(0, 200), em: new Date().toISOString() }; gravar(f('decisions.json', cwd), d); return d[id];
}
export const lerPrecedentes = (cwd = process.cwd()) => ler(f('precedentes.json', cwd), {});
export function registrarPrecedentes(run, itens, cwd = process.cwd()) {
  const p = lerPrecedentes(cwd); for (const i of itens) p[i.impressao] = { veredito: i.veredito, run, vezes: (p[i.impressao]?.vezes ?? 0) + 1 };
  gravar(f('precedentes.json', cwd), p); return p;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const [cmd, id, dec, ...resto] = process.argv.slice(2);
  if (cmd === 'decidir' && id && dec) { console.log(JSON.stringify({ ok: true, [id]: decidir(id, dec, { motivo: resto.join(' ') }) })); }
  else { console.error('Uso: knowledge.mjs decidir <id-do-achado> <bug|previsto|mudanca> [motivo]'); process.exit(1); }
}
