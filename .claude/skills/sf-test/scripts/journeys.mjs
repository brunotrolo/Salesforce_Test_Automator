// Jornadas: o que o agente aprendeu vira um roteiro DETERMINÍSTICO (sem modelo). Compila do trace, valida pela política, reproduz e conta estabilidade.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { hashOf } from './lib/util.mjs';
import { targetProblems } from './engine/policy.mjs';
import { knowledgeDir } from './lib/config.mjs';

export const ESTABILIZAR_PADRAO = Number(process.env.SFT_ESTABILIZAR || 3);
const ACOES = new Set(['ir', 'clicar', 'preencher', 'selecionar', 'marcar', 'pressionar', 'esperar']);
export const hashDoCaso = (c) => hashOf({ passos: c.passos, esperado: c.esperado, massa: c.massa ?? [], perfil: c.perfil ?? null });
export const pastaJornadas = (cap, cwd = process.cwd()) => join(knowledgeDir(cwd), 'journeys', cap.replace(/[^\w.-]/g, '_'));

/** Trace do motor (passos ok) → jornada. URL absoluta vira caminho relativo; o valor mantém o modelo {{ref.campo}}. */
export function compilar(trace, caso, capacidade) {
  const passos = [];
  for (const p of trace.passos) {
    if (!p.ok || !ACOES.has(p.acao)) continue;
    const s = { acao: p.acao };
    if (p.alvo) s.alvo = p.alvo;
    if (p.valor !== undefined) s.valor = p.valor;
    if (p.tecla) s.tecla = p.tecla;
    if (p.acao === 'ir') { try { const u = new URL(p.url, 'http://x'); s.url = /^https?:\/\//.test(p.url) ? `${u.pathname}${u.search}` : p.url; } catch { s.url = p.url; } }
    const ant = passos[passos.length - 1]; if (ant && JSON.stringify(ant) === JSON.stringify(s) && s.acao !== 'clicar') continue;
    passos.push(s);
  }
  const j = { versao: 1, capacidade, caso: caso.id, caso_hash: hashDoCaso(caso), compilada_em: new Date().toISOString(), passos, verificacoes: caso.esperado.map((e) => e.verificacao) };
  j.hash = hashOf({ passos: j.passos, verificacoes: j.verificacoes });
  return j;
}

export function validarJornada(j) {
  const p = [];
  if (!j || !Array.isArray(j.passos) || !j.passos.length) return ['jornada sem passos'];
  j.passos.forEach((s, i) => {
    if (!ACOES.has(s.acao)) p.push(`passo ${i + 1}: ação inválida`);
    if (s.acao !== 'ir') { const t = targetProblems(s.alvo); if (t.length) p.push(`passo ${i + 1}: ${t.join('; ')}`); }
    if (s.acao === 'ir' && !String(s.url ?? '').startsWith('/')) p.push(`passo ${i + 1}: "ir" só aceita caminho relativo à org`);
    if (typeof s.valor === 'string' && /\{\{(?!\s*[a-z][a-z0-9_]*\.(?:id|nome|documento)\s*\}\})/.test(s.valor)) p.push(`passo ${i + 1}: modelo de valor inválido`);
  });
  return p;
}

const arquivo = (cap, id, cwd) => join(pastaJornadas(cap, cwd), `${id}.json`);
export function salvarJornada(j, cwd = process.cwd()) {
  const erros = validarJornada(j); if (erros.length) throw new Error(`jornada recusada: ${erros.join(' | ')}`);
  mkdirSync(pastaJornadas(j.capacidade, cwd), { recursive: true }); writeFileSync(arquivo(j.capacidade, j.caso, cwd), JSON.stringify(j, null, 2)); return arquivo(j.capacidade, j.caso, cwd);
}
/** Carrega a jornada se ela ainda vale para o caso (mesmo hash); jornada de caso alterado é descartada. */
export function carregarJornada(cap, caso, cwd = process.cwd()) {
  const f = arquivo(cap, caso.id, cwd); if (!existsSync(f)) return { estado: 'ausente' };
  let j; try { j = JSON.parse(readFileSync(f, 'utf8')); } catch { return { estado: 'ilegivel' }; }
  if (j.caso_hash !== hashDoCaso(caso)) return { estado: 'obsoleta', jornada: j };
  const erros = validarJornada(j); if (erros.length) return { estado: 'invalida', erros };
  return { estado: 'ok', jornada: j };
}

/** Reproduz sem modelo. Ao quebrar, devolve onde parou e o que já foi feito, para o agente continuar da tela atual (cura). */
export async function reproduzir(engine, j) {
  const feitos = [];
  for (let i = 0; i < j.passos.length; i++) {
    const r = await engine.act(j.passos[i]);
    if (!r.ok) return { ok: false, parou_no_passo: i + 1, total: j.passos.length, codigo: r.codigo, erro: r.erro, passo: j.passos[i], feitos };
    feitos.push(i + 1);
  }
  const verificacoes = [];
  for (const [i, v] of j.verificacoes.entries()) verificacoes.push({ ...(await engine.assert(v)), tipo: v.tipo, n: i + 1 });
  return { ok: true, feitos, verificacoes };
}

// ---- estabilidade: N execuções verdes seguidas promovem a jornada; qualquer vermelho zera
const estadoFile = (cap, cwd) => join(pastaJornadas(cap, cwd), '_estabilidade.json');
export function lerEstabilidade(cap, cwd = process.cwd()) { try { return JSON.parse(readFileSync(estadoFile(cap, cwd), 'utf8')); } catch { return {}; } }
export function registrarExecucao(cap, caso, hash, verde, { cwd = process.cwd(), alvo = ESTABILIZAR_PADRAO } = {}) {
  const all = lerEstabilidade(cap, cwd); const e = all[caso] && all[caso].hash === hash ? all[caso] : { hash, verdes_seguidos: 0, promovida: false, execucoes: 0 };
  e.execucoes++; e.verdes_seguidos = verde ? e.verdes_seguidos + 1 : 0; e.promovida = e.verdes_seguidos >= alvo; e.hash = hash; all[caso] = e;
  mkdirSync(pastaJornadas(cap, cwd), { recursive: true }); writeFileSync(estadoFile(cap, cwd), JSON.stringify(all, null, 2)); return e;
}
