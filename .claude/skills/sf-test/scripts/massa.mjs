#!/usr/bin/env node
// Massa de teste: descobre a necessidade a partir do caderno, prepara dados sintéticos MARCADOS (ZZ_TEST_<execução>) via Salesforce CLI
// e limpa SÓ o que esta execução criou. Dado existente só é usado se o caso pedir explicitamente (usar_existente) e nunca é alterado.
// Uso: node massa.mjs plan <caderno.json> [--out massa.json]
//      node massa.mjs prepare --run <id> [--caderno ...]     (cria a massa; grava massa_log.json e massa_resolvida.json)
//      node massa.mjs clean --run <id>                       (exclui só os ids de massa_log.json)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runDir, ensureDir, EXIT } from './lib/config.mjs';
import { sfVerdict } from './engine/policy.mjs';
import { sha256 } from './lib/util.mjs';

const MARCA = 'ZZ_TEST_';
const CAMPO_MARCA = { Case: 'Subject', Contact: 'LastName', Lead: 'LastName', Task: 'Subject', Opportunity: 'Name' };
const SEGURO = /^[\p{L}\p{N} _.,:@/()+-]*$/u;        // sem aspas, ponto e vírgula nem caracteres de controle

export function planMassa(cad) {
  const itens = []; const avisos = [];
  for (const c of cad.casos) for (const m of c.massa || []) {
    itens.push({ id: `MD-${String(itens.length + 1).padStart(3, '0')}`, caso: c.id, ref: m.ref, entidade: m.entidade, atributos: m.atributos ?? {}, quantidade: m.quantidade ?? 1, usar_existente: m.atributos?.__existente === true, estrategia: m.atributos?.__existente === true ? 'existente' : 'criar' });
  }
  const porEntidade = {}; for (const i of itens) porEntidade[i.entidade] = (porEntidade[i.entidade] || 0) + i.quantidade;
  for (const c of cad.casos) if (!(c.massa || []).length && c.tipo !== 'exploratorio' && /cliente|conta|caso|contato/i.test(c.pre_condicoes?.join(' ') ?? '')) avisos.push(`${c.id}: as pré-condições citam registro, mas o caso não declara massa`);
  return { schema: '1.0', itens, por_entidade: porEntidade, avisos };
}

/** CPF sintético com dígitos verificadores válidos, determinístico por semente (só para regras que validam o documento). */
export function documentoSintetico(semente) {
  const h = sha256(String(semente)); const d = [...h].filter((c) => /\d/.test(c)).slice(0, 9).map(Number); while (d.length < 9) d.push(7);
  const dv = (a) => { const s = a.reduce((t, n, i) => t + n * (a.length + 1 - i), 0) % 11; return s < 2 ? 0 : 11 - s; };
  const d1 = dv(d); const d2 = dv([...d, d1]); const all = [...d, d1, d2].join('');
  return `${all.slice(0, 3)}.${all.slice(3, 6)}.${all.slice(6, 9)}-${all.slice(9)}`;
}

export function makeSf({ org = process.env.SF_TARGET_ORG, spawn = spawnSync, createdIds = () => new Set() } = {}) {
  return (args) => {
    const cmd = `sf ${args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}`;
    const v = sfVerdict(cmd, { targetOrg: org, createdIds: createdIds() });
    if (!v.allow) throw new Error(`bloqueado pela política: ${v.reason}`);
    const r = spawn('sf', args, { encoding: 'utf8', shell: process.platform === 'win32', timeout: 90000 });
    let json = null; try { json = JSON.parse(r.stdout || 'null'); } catch { /* não-JSON */ }
    if (r.status !== 0) throw new Error(json?.message || json?.name || 'comando sf falhou');
    return json;
  };
}

const q = (v) => `'${String(v)}'`;
export function prepararMassa(plano, { sf, runId, org = process.env.SF_TARGET_ORG }) {
  const log = { run: runId, criados: [], encontrados: [], bloqueados: [] }; const resolvida = {};
  const refs = {};                                           // `${caso}.${ref}` -> primeiro id
  for (const it of plano.itens) {
    try {
      for (let n = 1; n <= it.quantidade; n++) {
        const attrs = Object.fromEntries(Object.entries(it.atributos).filter(([k]) => !k.startsWith('__')));
        if (it.usar_existente) {
          const where = Object.entries(attrs).map(([k, v]) => `${k} = ${q(v)}`).join(' AND ');
          const r = sf(['data', 'query', '--target-org', org, '--query', `SELECT Id FROM ${it.entidade}${where ? ` WHERE ${where}` : ''} LIMIT 1`, '--json']);
          const id = r?.result?.records?.[0]?.Id;
          if (!id) throw new Error(`dado existente não encontrado (${it.entidade})`);
          log.encontrados.push({ id, entidade: it.entidade, ref: it.ref, caso: it.caso });
          (resolvida[it.caso] ??= {})[it.ref] = { id, existente: true }; refs[`${it.caso}.${it.ref}`] ??= id; continue;
        }
        const campo = Object.keys(attrs).find((k) => k === (CAMPO_MARCA[it.entidade] || 'Name')) || CAMPO_MARCA[it.entidade] || 'Name';
        const valores = { ...attrs };
        valores[campo] = `${MARCA}${runId}_${it.id}${it.quantidade > 1 ? `_${n}` : ''}${attrs[campo] ? `_${attrs[campo]}` : ''}`;
        for (const [k, v] of Object.entries(valores)) {
          if (v === '@documento') valores[k] = documentoSintetico(`${runId}${it.id}${n}`);
          else if (typeof v === 'string' && /^@[a-z][a-z0-9_]*\.id$/.test(v)) { const id = refs[`${it.caso}.${v.slice(1, -3)}`]; if (!id) throw new Error(`referência ${v} ainda não criada`); valores[k] = id; }
          if (!SEGURO.test(String(valores[k]))) throw new Error(`valor inseguro no campo ${k}`);
        }
        const r = sf(['data', 'create', 'record', '--target-org', org, '--sobject', it.entidade, '--values', Object.entries(valores).map(([k, v]) => `${k}=${q(v)}`).join(' '), '--json']);
        const id = r?.result?.id; if (!id) throw new Error('criação sem id');
        log.criados.push({ id, entidade: it.entidade, ref: it.ref, caso: it.caso, nome: valores[campo] });
        const doc = Object.values(valores).find((v) => /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(String(v)));
        (resolvida[it.caso] ??= {})[it.ref] = { id, nome: valores[campo], ...(doc ? { documento: doc } : {}) }; refs[`${it.caso}.${it.ref}`] ??= id;
      }
    } catch (e) { log.bloqueados.push({ caso: it.caso, item: it.id, motivo: String(e.message).slice(0, 200) }); }
  }
  return { log, resolvida };
}

export function limparMassa(log, { sf, org = process.env.SF_TARGET_ORG }) {
  const limpos = []; const falhas = [];
  for (const r of [...log.criados].reverse()) {
    try { sf(['data', 'delete', 'record', '--target-org', org, '--sobject', r.entidade, '--record-id', r.id, '--json']); limpos.push(r.id); }
    catch (e) { falhas.push({ id: r.id, motivo: String(e.message).slice(0, 120) }); }
  }
  return { limpos, falhas };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd, ...a] = process.argv.slice(2); const v = (n) => { const i = a.indexOf(n); return i > -1 ? a[i + 1] : undefined; };
  const run = v('--run'); const dir = run ? runDir(run) : null;
  if (cmd === 'plan') {
    const p = planMassa(JSON.parse(readFileSync(a[0], 'utf8'))); const out = v('--out') || (dir ? join(ensureDir(dir), 'massa.json') : 'massa.json');
    writeFileSync(out, JSON.stringify(p, null, 2) + '\n'); console.log(`[massa] plano: ${p.itens.length} item(ns) → ${out}`); p.avisos.forEach((x) => console.log(`  AVISO: ${x}`));
  } else if (cmd === 'prepare' && dir) {
    const plano = JSON.parse(readFileSync(join(dir, 'massa.json'), 'utf8'));
    const logPath = join(dir, 'massa_log.json'); const created = () => new Set((existsSync(logPath) ? JSON.parse(readFileSync(logPath, 'utf8')).criados : []).map((r) => r.id));
    const { log, resolvida } = prepararMassa(plano, { sf: makeSf({ createdIds: created }), runId: run });
    writeFileSync(logPath, JSON.stringify(log, null, 2)); writeFileSync(join(dir, 'massa_resolvida.json'), JSON.stringify(resolvida, null, 2), { mode: 0o600 });
    console.log(`[massa] criados ${log.criados.length}, existentes ${log.encontrados.length}, bloqueados ${log.bloqueados.length}`); process.exit(log.bloqueados.length ? EXIT.CONFIG : EXIT.OK);
  } else if (cmd === 'clean' && dir) {
    const log = JSON.parse(readFileSync(join(dir, 'massa_log.json'), 'utf8'));
    const { limpos, falhas } = limparMassa(log, { sf: makeSf({ createdIds: () => new Set(log.criados.map((r) => r.id)) }) });
    writeFileSync(join(dir, 'massa_limpeza.json'), JSON.stringify({ limpos, falhas }, null, 2)); console.log(`[massa] limpeza: ${limpos.length} excluídos, ${falhas.length} falha(s)`); process.exit(falhas.length ? EXIT.CONFIG : EXIT.OK);
  } else { console.error('Uso: massa.mjs plan <caderno.json> | prepare --run <id> | clean --run <id>'); process.exit(1); }
}
