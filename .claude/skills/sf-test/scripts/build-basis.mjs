#!/usr/bin/env node
// Base de teste: lê os artefatos do PO, do Designer e do Developer e extrai ORÁCULOS (o que define "certo") com citação verificável.
// Uso: node build-basis.mjs --spec <specs/dom/NNN-slug> [--build-report <arquivo>] [--discovery <backlog.json> [--story US-001]]
//                           [--force-app <dir>] [--run <id>] [--out <test_basis.json>]
// Exit: 0 ok (avisa se a base é fraca) | 2 nenhuma fonte encontrada
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, basename, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sections, items, strip, norm } from './lib/md.mjs';
import { sha256 } from './lib/util.mjs';
import { runDir, ensureDir, newRunId } from './lib/config.mjs';

export const AUTORIDADE = { aceite: 1, regra: 1, decisao: 2, validacao: 2, campo: 2, 'gap-conhecido': 3, invariante: 4, 'padrao-sf': 5 };
export const INVARIANTES = [
  ['INV-001', 'Erro Apex/Flow não tratado exibido ao usuário (toast de erro, "An error occurred", "Error ID", stack trace)'],
  ['INV-002', 'Resposta HTTP 5xx em chamada feita pela página'],
  ['INV-003', 'Texto técnico cru na tela ("[object Object]", "undefined", "null", "NaN", merge field "{!x}" ou "{{x}}")'],
  ['INV-004', 'Erro de console de componente (uncaught exception, erro de LWC/Aura)'],
  ['INV-005', 'Tela travada: indicador de carregamento que não termina ou ação sem resposta'],
];

const read = (p) => readFileSync(p, 'utf8');
function add(basis, classe, texto, fonte, extra = {}) {
  const o = { id: `O-${String(basis.oracles.length + 1).padStart(3, '0')}`, classe, autoridade: AUTORIDADE[classe], texto, ...(fonte ? { fonte } : {}), ...extra };
  if (/\[NEEDS CLARIFICATION/i.test(texto)) { o.incerto = true; o.texto = texto.replace(/\s*\[NEEDS CLARIFICATION:[^\]]*\].*$/i, '').trim() || texto; }
  basis.oracles.push(o); return o;
}
const src = (arquivo, n0, n1 = n0, citacao = '') => ({ arquivo, linha_de: n0, linha_ate: n1, citacao: strip(citacao).slice(0, 300) });

function parseSpec(basis, file, root) {
  const rel = relative(root, file); const text = read(file);
  for (const sec of sections(text)) {
    const t = norm(sec.title);
    if (/cenario|aceite|acceptance|given|dado/.test(t)) {
      let blk = null; const flush = () => { if (blk) { add(basis, 'aceite', strip(blk.parts.join(' ')), src(rel, blk.from, blk.to, blk.first), { origem: 'spec' }); blk = null; } };
      for (const { n, t: l } of sec.lines) {
        const st = /^\s*(?:[-*+]|\d+[.)])?\s*(?:\*\*|__)?(dado|given)\b/i.test(l);
        if (st) { flush(); blk = { from: n, to: n, first: l, parts: [strip(l)] }; }
        else if (blk && l.trim() && !/^\s*(?:[-*+]|\d+[.)])\s+(?!\*{0,2}(?:e|and|quando|when|ent[aã]o|then)\b)/i.test(l)) { blk.parts.push(strip(l)); blk.to = n; }
        else if (blk && !l.trim()) flush();
      }
      flush();
    } else if (/regra.*negocio|business rule|regras/.test(t)) {
      for (const it of items(sec)) add(basis, 'regra', it.text, src(rel, it.n, it.n, it.text), { origem: 'spec' });
    } else if (/borda|edge|excec|erro|limite/.test(t)) {
      for (const it of items(sec)) add(basis, 'aceite', it.text, src(rel, it.n, it.n, it.text), { origem: 'spec', subtipo: 'borda' });
    }
  }
  text.split(/\r?\n/).forEach((l, i) => {
    const m = l.match(/\[NEEDS CLARIFICATION:\s*(neg[oó]cio|descoberta)\]\s*(.*)/i);
    if (m) basis.questions.push({ id: `Q-${String(basis.questions.length + 1).padStart(3, '0')}`, kind: /^neg/i.test(m[1]) ? 'negocio' : 'descoberta', texto: strip(m[2]) || strip(l), fonte: src(rel, i + 1, i + 1, l) });
  });
}
function parsePlan(basis, file, root) {
  const rel = relative(root, file);
  for (const sec of sections(read(file))) if (/decis|approach|abordagem|veredito|verdict|classifica|padrao|customizado/.test(norm(sec.title))) for (const it of items(sec)) add(basis, 'decisao', it.text, src(rel, it.n, it.n, it.text), { origem: 'plan' });
}
function parseBuildReport(basis, file, root) {
  const rel = relative(root, file);
  for (const sec of sections(read(file))) {
    const t = norm(sec.title);
    if (/gaps? found|lacuna|\bgaps?\b/.test(t)) for (const it of items(sec)) { if (!/^(none|nenhum|n\/a|-)\.?$/i.test(it.text)) add(basis, 'gap-conhecido', it.text, src(rel, it.n, it.n, it.text), { origem: 'build-report' }); }
    else if (/decisions? made|decis/.test(t)) for (const it of items(sec)) add(basis, 'decisao', it.text, src(rel, it.n, it.n, it.text), { origem: 'build-report' });
  }
}
function parseTasks(basis, file, root) {
  const rel = relative(root, file);
  read(file).split(/\r?\n/).forEach((l, i) => { if (/\[GATE-\d+\]/.test(l)) add(basis, 'gap-conhecido', strip(l), src(rel, i + 1, i + 1, l), { origem: 'tasks', subtipo: 'descoberta-pendente' }); });
}
function parseDiscovery(basis, file, root, storyId, capabilityName) {
  const rel = relative(root, file); const raw = read(file); const lines = raw.split(/\r?\n/); const bl = JSON.parse(raw);
  const at = (s) => { const i = lines.findIndex((l) => l.includes(JSON.stringify(String(s)).slice(1, -1).slice(0, 60))); return i < 0 ? 1 : i + 1; };
  for (const e of bl.epics || []) for (const s of e.stories || []) {
    if (storyId ? s.id !== storyId : !(capabilityName && s.handoff?.capability === capabilityName)) continue;
    for (const a of s.acceptance || []) { const n = at(a.then); add(basis, 'aceite', `Dado ${a.given}, quando ${a.when}, então ${a.then}`, src(rel, n, n, a.then), { origem: 'discovery', historia: s.id, prioridade: s.priority ?? null }); }
    for (const r of s.business_rules || []) { const n = at(r.text); add(basis, 'regra', r.text, src(rel, n, n, r.text), { origem: 'discovery', historia: s.id }); }
    for (const q of (s.open_questions || []).filter((x) => !x.resolved)) basis.questions.push({ id: `Q-${String(basis.questions.length + 1).padStart(3, '0')}`, kind: q.kind, texto: q.text, fonte: src(rel, at(q.text), at(q.text), q.text), historia: s.id });
    if ((s.compliance_flags || []).length) basis.compliance.push({ historia: s.id, flags: s.compliance_flags });
  }
}
function walk(dir, pred, out = []) { if (!existsSync(dir)) return out; for (const n of readdirSync(dir)) { const p = join(dir, n); const st = statSync(p); if (st.isDirectory()) { if (!/node_modules|\.git/.test(n)) walk(p, pred, out); } else if (pred(p)) out.push(p); } return out; }
const tag = (x, name) => x.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1]?.trim();
function parseMetadata(basis, dir, root) {
  for (const f of walk(dir, (p) => p.endsWith('.validationRule-meta.xml'))) {
    const x = read(f); if (tag(x, 'active') === 'false') continue;
    const msg = tag(x, 'errorMessage'); if (!msg) continue; const rel = relative(root, f);
    const n = read(f).split(/\r?\n/).findIndex((l) => l.includes('<errorMessage>')) + 1 || 1;
    add(basis, 'validacao', `Regra de validação "${basename(f).replace('.validationRule-meta.xml', '')}": impede salvar quando ${(tag(x, 'errorConditionFormula') || '?').replace(/\s+/g, ' ').slice(0, 160)}; mensagem ao usuário: "${msg}"`, src(rel, n, n, msg), { origem: 'metadados', mensagem: msg });
  }
  for (const f of walk(dir, (p) => p.endsWith('.field-meta.xml'))) {
    const x = read(f); const rel = relative(root, f); const label = tag(x, 'label') || basename(f);
    const lines = x.split(/\r?\n/);
    if (tag(x, 'required') === 'true') { const n = lines.findIndex((l) => l.includes('<required>')) + 1 || 1; add(basis, 'campo', `Campo "${label}" é obrigatório`, src(rel, n, n, '<required>true</required>'), { origem: 'metadados' }); }
    const vals = [...x.matchAll(/<fullName>([^<]+)<\/fullName>\s*<default>/g)].map((m) => m[1]);
    const pv = [...x.matchAll(/<value>\s*<fullName>([^<]+)<\/fullName>/g)].map((m) => m[1]);
    if (pv.length) { const n = lines.findIndex((l) => l.includes('<valueSet>')) + 1 || 1; add(basis, 'campo', `Campo "${label}" só aceita os valores: ${pv.join(', ')}`, src(rel, n, n, '<valueSet>'), { origem: 'metadados', subtipo: 'picklist' }); }
  }
}

export function buildBasis(opt, root = process.cwd()) {
  const basis = { schema: '1.0', gerado_em: new Date().toISOString(), capacidade: opt.spec ? basename(opt.spec) : (opt.story ?? 'desconhecida'), oracles: [], questions: [], compliance: [], fontes: [], avisos: [] };
  const usar = (p, fn, ...a) => { if (p && existsSync(p)) { fn(basis, p, root, ...a); basis.fontes.push({ arquivo: relative(root, p), sha256: sha256(read(p)).slice(0, 16) }); return true; } return false; };
  let achou = false;
  if (opt.spec) {
    achou = usar(join(opt.spec, 'spec.md'), parseSpec) || achou;
    usar(join(opt.spec, 'plan.md'), parsePlan); usar(join(opt.spec, 'tasks.md'), parseTasks);
    usar(opt.buildReport || join(opt.spec, 'build-report.md'), parseBuildReport);
  }
  if (opt.discovery && existsSync(opt.discovery)) { parseDiscovery(basis, opt.discovery, root, opt.story, opt.spec ? basename(opt.spec) : null); basis.fontes.push({ arquivo: relative(root, opt.discovery), sha256: sha256(read(opt.discovery)).slice(0, 16) }); achou = true; }
  const fa = opt.forceApp || (opt.spec && existsSync(join(root, 'force-app')) ? join(root, 'force-app') : null);
  if (fa && existsSync(fa)) {
    const dom = opt.spec ? basename(dirname(opt.spec)) : null; const dd = dom && existsSync(join(fa, 'domains', dom)) ? join(fa, 'domains', dom) : fa;
    parseMetadata(basis, dd, root);
  }
  for (const [id, texto] of INVARIANTES) basis.oracles.push({ id, classe: 'invariante', autoridade: AUTORIDADE.invariante, texto, origem: 'plataforma' });
  const fortes = basis.oracles.filter((o) => o.autoridade === 1).length;
  basis.base_forte = fortes > 0;
  if (!fortes) basis.avisos.push('Base fraca: nenhum critério de aceite ou regra de negócio com fonte. Só testes exploratórios; resultados ficam A_CONFIRMAR.');
  if (basis.questions.some((q) => q.kind === 'negocio')) basis.avisos.push(`${basis.questions.filter((q) => q.kind === 'negocio').length} pergunta(s) de negócio em aberto: os casos relacionados terminam A_CONFIRMAR.`);
  return { basis, achou };
}

/** Confere por código que cada citação existe nas linhas indicadas (a base nunca cita o que não está na fonte). */
export function verifyOracles(basis, root = process.cwd()) {
  const erros = []; const cache = {};
  for (const o of [...basis.oracles, ...basis.questions]) {
    const f = o.fonte; if (!f) continue;
    const p = join(root, f.arquivo); if (!existsSync(p)) { erros.push(`${o.id}: arquivo ${f.arquivo} não existe`); continue; }
    const lines = (cache[p] ??= read(p).split(/\r?\n/));
    const trecho = norm(lines.slice(Math.max(0, f.linha_de - 1), f.linha_ate).join(' '));
    if (f.citacao && !trecho.includes(norm(f.citacao).slice(0, 80))) erros.push(`${o.id}: a citação não está em ${f.arquivo}:${f.linha_de}-${f.linha_ate}`);
  }
  return erros;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = process.argv.slice(2); const v = (n) => { const i = a.indexOf(n); return i > -1 ? a[i + 1] : undefined; };
  const opt = { spec: v('--spec'), buildReport: v('--build-report'), discovery: v('--discovery'), story: v('--story'), forceApp: v('--force-app') };
  const { basis, achou } = buildBasis(opt);
  if (!achou && !basis.oracles.some((o) => o.autoridade < 4)) { console.error('[build-basis] nenhuma fonte encontrada (spec.md, backlog.json ou metadados). Informe --spec e/ou --discovery.'); process.exit(2); }
  const erros = verifyOracles(basis); if (erros.length) { erros.forEach((e) => console.error(`  ERRO: ${e}`)); process.exit(2); }
  const out = v('--out') || join(ensureDir(runDir(v('--run') || newRunId())), 'test_basis.json');
  writeFileSync(out, JSON.stringify(basis, null, 2) + '\n');
  const c = (cl) => basis.oracles.filter((o) => o.classe === cl).length;
  console.log(`[build-basis] ${basis.oracles.length} oráculos (aceite ${c('aceite')}, regra ${c('regra')}, decisão ${c('decisao')}, validação ${c('validacao')}, campo ${c('campo')}, gap ${c('gap-conhecido')}) e ${basis.questions.length} pergunta(s) → ${out}`);
  basis.avisos.forEach((x) => console.log(`  AVISO: ${x}`));
}
