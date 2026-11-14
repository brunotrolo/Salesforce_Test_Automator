#!/usr/bin/env node
// Classificação dos resultados brutos em BUG | PREVISTO | A_CONFIRMAR | BLOQUEADO | INSTAVEL | PASSOU, por REGRAS sobre os oráculos.
// O juiz (contexto novo) só confirma ou rebaixa; sem juiz, o que depende dele fica A_CONFIRMAR ("not run"), nunca PASSOU.
// Uso: node classify.mjs --run <id>        (lê test_basis.json, caderno.json, resultados/, resultados/*.rerun.json, juiz/resultado-*.json)
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDir } from './lib/config.mjs';
import { norm } from './lib/md.mjs';
import { lerDecisoes, impressao, impressaoTecnica, registrarPrecedentes, lerPrecedentes } from './knowledge.mjs';

const SEV_INV = { 'INV-001': 'alta', 'INV-002': 'alta', 'INV-005': 'alta', 'INV-003': 'media', 'INV-004': 'media' };
const SEV_PRIO = { P1: 'alta', P2: 'media', P3: 'baixa' };
const STOP = new Set(['para', 'quando', 'como', 'mais', 'esta', 'este', 'esse', 'essa', 'deve', 'mesmo', 'assim', 'entre', 'sobre', 'pelo', 'pela', 'uma', 'que', 'com', 'dos', 'das', 'tela', 'campo', 'caso']);
const toks = (t) => [...new Set(norm(t).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w)))];
const ORIGENS_MUDANCA = new Set(['pr', 'commit', 'metadados', 'build-report', 'plan']);

/** Oráculos MAIS RECENTES que a spec (PR, commits, metadados, decisões) cujo texto aparece no que a tela mostrou: sinal de mudança não documentada. */
const CUES = /mensag|texto|aviso|erro|rotulo|label|titulo|botao|message|text|mostra|exibe|aparece|show|display/;
export function candidatosMudanca(basis, observado, excluir = []) {
  const o = norm(observado ?? ''); if (!o) return [];
  return basis.oracles.filter((x) => ORIGENS_MUDANCA.has(x.origem) && x.classe !== 'gap-conhecido' && !excluir.includes(x.id)).map((x) => {
    // 1) mensagem da regra de validação aparece literalmente; 2) PR/commit que fala de texto exibido e cita um trecho que aparece na tela;
    // 3) sobreposição muito alta de palavras. Citação de nome de campo ("Prioridade") ou sobreposição fraca NÃO é evidência.
    const msg = x.mensagem && o.includes(norm(x.mensagem));
    const citados = [...String(x.texto).matchAll(/["“«]([^"”»]{6,80})["”»]/g)].map((m) => norm(m[1]));
    const citacao = (x.origem === 'pr' || x.origem === 'commit') && CUES.test(norm(x.texto)) && citados.some((q) => o.includes(q));
    const t = toks(x.texto); const sobre = t.length >= 4 && t.filter((w) => o.includes(w)).length / t.length >= 0.85;
    return { id: x.id, origem: x.origem, classe: x.classe, texto: x.texto, fonte: x.fonte, score: msg || citacao ? 1 : sobre ? 0.85 : 0 };
  }).filter((c) => c.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
}

const falhasDe = (r) => r.verificacoes.filter((v) => v.pass === false).map((v) => v.texto);

export function classificar({ basis, caderno, resultados, reruns = {}, juiz = {}, decisoes = {}, precedentes = {}, observado = {} }) {
  const orc = new Map(basis.oracles.map((o) => [o.id, o])); const casos = []; const precisaRerun = []; const pacotes = [];
  for (const r of resultados) {
    const caso = caderno.casos.find((c) => c.id === r.caso); const base = { caso: r.caso, titulo: r.titulo, prioridade: r.prioridade, oraculos: r.oraculos, evidencias: r.evidencias };
    const imp = impressao(r.caso, falhasDe(r)); const dec = decisoes[imp];
    if (r.status === 'verde') { casos.push({ ...base, veredito: 'PASSOU', motivo: 'asserções verdadeiras', impressao: imp }); continue; }
    if (r.status === 'bloqueado') { casos.push({ ...base, veredito: 'BLOQUEADO', motivo: bloqueioMotivo(r), impressao: imp }); continue; }
    const oc = (r.oraculos || []).map((id) => orc.get(id)).filter(Boolean);
    const gaps = (r.gaps_relacionados || []).map((id) => orc.get(id)).filter(Boolean);
    const melhor = Math.min(9, ...oc.map((o) => o.autoridade));
    const pacote = { caso: r.caso, esperado: r.verificacoes.map((v) => ({ texto: v.texto, pass: v.pass, detalhe: v.detalhe })), oraculos: oc.filter((o) => o.autoridade <= 3).map((o) => ({ id: o.id, classe: o.classe, texto: o.texto, fonte: o.fonte })), gaps: gaps.map((g) => ({ id: g.id, texto: g.texto })), evidencias: r.evidencias };
    if (dec) { casos.push({ ...base, veredito: dec.decisao === 'bug' ? 'BUG' : dec.decisao === 'mudanca' ? 'MUDANCA_NAO_DOCUMENTADA' : 'PREVISTO', motivo: `decisão registrada do dev${dec.motivo ? `: ${dec.motivo}` : ''}`, severidade: SEV_PRIO[r.prioridade], impressao: imp }); continue; }
    if (gaps.length) { casos.push({ ...base, veredito: 'PREVISTO', motivo: `diferença prevista no build-report: ${gaps[0].texto.slice(0, 120)} (${gaps[0].id})`, impressao: imp }); continue; }
    if (oc.some((o) => o.incerto)) { const q = basis.questions.find((x) => x.kind === 'negocio'); casos.push({ ...base, veredito: 'A_CONFIRMAR', motivo: 'o oráculo tem pergunta de negócio em aberto', pergunta: q?.texto ?? 'Confirmar a regra com o negócio', impressao: imp }); continue; }
    if (melhor > 2) { casos.push({ ...base, veredito: 'A_CONFIRMAR', motivo: oc.length ? 'só há oráculo de baixa autoridade (decisão/gap/padrão)' : 'nenhum oráculo cobre este comportamento', pergunta: `O comportamento observado é o desejado? (${r.verificacoes.find((v) => v.pass === false)?.texto ?? r.titulo})`, impressao: imp }); continue; }
    const rr = reruns[r.caso]; const cand = candidatosMudanca(basis, observado[r.caso], r.oraculos); pacote.evidencias_de_mudanca = cand.map(({ id, origem, texto, fonte }) => ({ id, origem, texto, fonte })); const especAlvo = oc.find((o) => o.autoridade === 1) ?? oc[0];
    if (r.status === 'pendente_juiz') {
      const j = juiz[r.caso]; if (!j) { casos.push({ ...base, veredito: 'A_CONFIRMAR', motivo: 'verificação semântica sem juiz (not run)', pergunta: `Confirmar: ${r.verificacoes.find((v) => v.pass === null)?.texto ?? r.titulo}`, impressao: imp }); pacotes.push(pacote); continue; }
      casos.push({ ...base, ...aplicarJuiz(j, r), impressao: imp }); continue;
    }
    // vermelho com oráculo forte: BUG candidato → precisa reproduzir 2 de 2
    if (!rr) { precisaRerun.push(r.caso); casos.push({ ...base, veredito: 'A_CONFIRMAR', motivo: 'bug candidato ainda não reproduzido (rode a reexecução)', provisorio: true, impressao: imp }); continue; }
    if (rr.status !== 'vermelho' || falhasDe(rr).join('|') !== falhasDe(r).join('|')) { casos.push({ ...base, veredito: 'INSTAVEL', motivo: `resultado diferente na reexecução (${rr.status})`, impressao: imp }); continue; }
    const j = juiz[r.caso];
    if (!j) { pacotes.push(pacote); casos.push({ ...base, veredito: 'A_CONFIRMAR', motivo: `bug candidato reproduzido; falta a confirmação do juiz independente (not run)${cand.length ? ` — possível mudança não documentada (${cand[0].id})` : ''}`, provisorio: true, severidade: SEV_PRIO[r.prioridade], impressao: imp }); continue; }
    const ap = aplicarJuiz(j, r, cand.length > 0); casos.push({ ...base, ...ap, severidade: ap.veredito === 'BUG' ? SEV_PRIO[r.prioridade] : undefined, ...(ap.veredito === 'MUDANCA_NAO_DOCUMENTADA' ? { evidencia_mudanca: cand, spec_a_atualizar: especAlvo ? { oraculo: especAlvo.id, fonte: especAlvo.fonte, texto: especAlvo.texto } : null } : {}), reproduzido: true, ...(precedentes[imp] ? { visto_antes: precedentes[imp].veredito } : {}), impressao: imp });
  }
  // achados técnicos (invariantes): agrupados por tipo+evidência; contam quantos casos/reexecuções viram
  const tec = new Map();
  const ver = (lista, rerun) => { for (const r of lista) for (const a of r.achados || []) { const k = impressaoTecnica(a.inv, a.evidencia); const t = tec.get(k) ?? { inv: a.inv, evidencia: a.evidencia, casos: new Set(), vistos: 0, impressao: k }; t.casos.add(r.caso); t.vistos++; tec.set(k, t); } };
  ver(resultados); ver(Object.values(reruns));
  const tecnicos = [...tec.values()].map((t) => { const dec = decisoes[t.impressao]; const reproduzido = t.vistos >= 2;
    return { inv: t.inv, evidencia: t.evidencia, casos: [...t.casos], impressao: t.impressao, reproduzido, veredito: dec ? (dec.decisao === 'bug' ? 'BUG' : 'PREVISTO') : reproduzido ? 'BUG' : 'A_CONFIRMAR', severidade: SEV_INV[t.inv] ?? 'media',
      motivo: dec ? `decisão registrada do dev` : reproduzido ? `invariante ${t.inv} violada (vista ${t.vistos}×)` : `invariante ${t.inv} vista uma vez: reexecutar para confirmar` }; });
  for (const t of tecnicos) if (!t.reproduzido && !decisoes[t.impressao]) for (const c of t.casos) if (!precisaRerun.includes(c)) precisaRerun.push(c);
  const conta = (v) => casos.filter((c) => c.veredito === v).length;
  const resumo = { mudanca_nao_documentada: conta('MUDANCA_NAO_DOCUMENTADA'), passou: conta('PASSOU'), bug: conta('BUG'), previsto: conta('PREVISTO'), a_confirmar: conta('A_CONFIRMAR'), bloqueado: conta('BLOQUEADO'), instavel: conta('INSTAVEL'), bugs_tecnicos: tecnicos.filter((t) => t.veredito === 'BUG').length, total: casos.length };
  return { casos, tecnicos, resumo, precisa_rerun: [...new Set(precisaRerun)], pacotes_juiz: pacotes };
}

function aplicarJuiz(j, r, temEvidenciaDeMudanca = false) {
  const v = ['BUG', 'PREVISTO', 'MUDANCA_NAO_DOCUMENTADA', 'A_CONFIRMAR', 'PASSOU'].includes(j.veredito) ? j.veredito : 'A_CONFIRMAR';
  if (v === 'MUDANCA_NAO_DOCUMENTADA' && !temEvidenciaDeMudanca) return { veredito: 'A_CONFIRMAR', motivo: 'o juiz alegou mudança não documentada, mas não há evidência mais recente (PR, commit, metadados) que a sustente', pergunta: 'O comportamento mudou de propósito? Se sim, a especificação precisa ser atualizada.' };
  if (r.status === 'vermelho' && v === 'PASSOU') return { veredito: 'A_CONFIRMAR', motivo: `o juiz considera o esperado mal formulado: ${String(j.motivo).slice(0, 140)}`, pergunta: 'Revisar o caso de teste: a asserção pode estar errada.' };
  return { veredito: v, motivo: `juiz: ${String(j.motivo).slice(0, 160)}`, ...(v === 'A_CONFIRMAR' && j.pergunta ? { pergunta: j.pergunta } : {}) };
}
function bloqueioMotivo(r) {
  const f = r.falhas_de_passo?.[0]; if (!f) return 'não foi possível executar o caso';
  return { massa_ausente: 'falta massa de teste para o caso', politica: 'a política do QA barrou uma ação (ver passo)', login_indisponivel: 'sem login na org' }[f.codigo] ?? `passo ${f.n} falhou (${f.codigo})`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = process.argv.slice(2); const i = a.indexOf('--run'); if (i < 0) { console.error('Uso: classify.mjs --run <id>'); process.exit(1); }
  const dir = runDir(a[i + 1]); const rd = (p, d) => { try { return JSON.parse(readFileSync(join(dir, p), 'utf8')); } catch { return d; } };
  const lista = (sub, ext) => existsSync(join(dir, sub)) ? readdirSync(join(dir, sub)).filter((n) => n.endsWith(ext)) : [];
  const resultados = lista('resultados', '.json').filter((n) => !n.includes('.rerun')).map((n) => rd(`resultados/${n}`, null)).filter(Boolean);
  const reruns = Object.fromEntries(lista('resultados', '.rerun.json').map((n) => { const x = rd(`resultados/${n}`, null); return [x.caso, x]; }));
  const juiz = Object.fromEntries(lista('juiz', '.json').filter((n) => n.startsWith('resultado-')).map((n) => { const x = rd(`juiz/${n}`, null); return [x.caso, x]; }));
  const lerObs = (r) => { try { return readFileSync(r.evidencias.aria, 'utf8'); } catch { return ''; } };
  const observado = Object.fromEntries(resultados.map((r) => [r.caso, lerObs(r)]));
  const out = classificar({ basis: rd('test_basis.json', { oracles: [], questions: [] }), caderno: rd('caderno.json', { casos: [] }), resultados, reruns, juiz, decisoes: lerDecisoes(), precedentes: lerPrecedentes(), observado });
  mkdirSync(join(dir, 'juiz'), { recursive: true }); for (const p of out.pacotes_juiz) writeFileSync(join(dir, 'juiz', `pacote-${p.caso}.json`), JSON.stringify(p, null, 2));
  writeFileSync(join(dir, 'classificacao.json'), JSON.stringify(out, null, 2)); registrarPrecedentes(a[i + 1], out.casos.filter((c) => c.veredito !== 'PASSOU').map((c) => ({ impressao: c.impressao, veredito: c.veredito })));
  console.log(JSON.stringify({ ok: true, resumo: out.resumo, precisa_rerun: out.precisa_rerun, juiz_pendente: out.pacotes_juiz.map((p) => p.caso) }));
}
