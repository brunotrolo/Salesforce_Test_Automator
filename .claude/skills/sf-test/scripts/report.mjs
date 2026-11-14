#!/usr/bin/env node
// Relatório do QA: uma tela para o dev (resultado.md ≤ 40 linhas), detalhes em arquivos, e o gate da capacidade.
// Uso: node report.mjs --run <id> [--spec-dir specs/dom/NNN-slug]      Exit: 0 sem bugs | 1 há bug | 2 execução bloqueada
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDir, EXIT } from './lib/config.mjs';

const rd = (dir, p, d) => { try { return JSON.parse(readFileSync(join(dir, p), 'utf8')); } catch { return d; } };
const cur = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export function montarRelatorio({ run, classificacao, caderno, basis, massaLog = null, preflight = null, data = new Date().toISOString().slice(0, 10) }) {
  const casos = classificacao.casos; const bugs = [];
  for (const c of casos.filter((x) => x.veredito === 'BUG')) bugs.push({ tipo: 'negocio', caso: c.caso, titulo: c.titulo, severidade: c.severidade ?? 'media', motivo: c.motivo, oraculos: c.oraculos, evidencias: c.evidencias });
  for (const t of classificacao.tecnicos.filter((x) => x.veredito === 'BUG')) bugs.push({ tipo: 'tecnico', inv: t.inv, titulo: `Defeito técnico ${t.inv}: ${cur(t.evidencia, 70)}`, severidade: t.severidade, motivo: t.motivo, casos: t.casos });
  for (const c of (classificacao.compat ?? []).filter((x) => x.veredito === 'BUG')) bugs.push({ tipo: 'compatibilidade', caso: c.caso, titulo: `Diverge no ${c.navegador}: ${c.titulo ?? c.caso}`, severidade: c.severidade, motivo: `${c.detalhe} (passa no ${c.referencia})`, navegador: c.navegador, referencia: c.referencia });
  bugs.forEach((b, i) => { b.id = `BUG-${String(i + 1).padStart(3, '0')}`; });
  const aConf = casos.filter((c) => c.veredito === 'A_CONFIRMAR'); const bloq = casos.filter((c) => c.veredito === 'BLOQUEADO'); const mud = casos.filter((c) => c.veredito === 'MUDANCA_NAO_DOCUMENTADA'); const prev = casos.filter((c) => c.veredito === 'PREVISTO'); const inst = casos.filter((c) => c.veredito === 'INSTAVEL'); const ok = casos.filter((c) => c.veredito === 'PASSOU');
  const orc = new Map((basis?.oracles ?? []).map((o) => [o.id, o]));
  const exigidos = (basis?.oracles ?? []).filter((o) => (o.classe === 'aceite' || o.classe === 'regra') && !o.incerto);
  const resolvido = (id) => casos.some((c) => (c.oraculos || []).includes(id) && ['PASSOU', 'PREVISTO'].includes(c.veredito));
  const cobertos = exigidos.filter((o) => resolvido(o.id)).length;
  const p1Bloq = bloq.filter((c) => c.prioridade === 'P1');
  const instNav = (classificacao.compat ?? []).filter((x) => x.veredito === 'INSTAVEL'); const gate = bugs.length ? 'REPROVADO' : (p1Bloq.length || !casos.length) ? 'NAO_CONCLUIDO' : (aConf.length || mud.length) ? 'APROVADO_COM_PENDENCIAS' : 'APROVADO';
  const icone = { REPROVADO: '❌', NAO_CONCLUIDO: '⛔', APROVADO_COM_PENDENCIAS: '⚠️', APROVADO: '✅' }[gate];
  const L = [`# QA de tela — ${caderno?.capacidade ?? '?'} · ${data} · execução ${run}`, '',
    `**${icone} ${gate.replace(/_/g, ' ')}** — ${ok.length} passaram · ${bugs.length} bug(s) · ${mud.length ? `${mud.length} mudança(s) não documentada(s) · ` : ''}${aConf.length} a confirmar · ${prev.length} previstos · ${bloq.length} bloqueados${inst.length ? ` · ${inst.length} instáveis` : ''} (de ${casos.length} casos)`,
    `Critérios de aceite/regras resolvidos: ${cobertos}/${exigidos.length}${exigidos.length ? ` (${Math.round((100 * cobertos) / exigidos.length)}%)` : ''}${basis && !basis.base_forte ? ' — base fraca: poucos critérios com fonte' : ''}`, ''];
  if (bugs.length) { L.push('## ❌ Bugs', '', '| ID | Sev. | O quê | Fonte da expectativa |', '|---|---|---|---|'); for (const b of bugs) { const o = (b.oraculos || []).map((id) => orc.get(id)).find((x) => x && x.autoridade <= 2); L.push(`| ${b.id} | ${b.severidade} | ${cur(b.titulo, 70)} | ${o?.fonte ? `${o.fonte.arquivo}:${o.fonte.linha_de}` : b.tipo === 'tecnico' ? `invariante ${b.inv}` : '—'} |`); } L.push('', `Detalhe e passos para reproduzir em \`bugs/BUG-nnn.md\`.`, ''); }
  if (mud.length) { L.push('## 📝 Mudança não documentada (a spec ficou para trás — não é bug)', ''); for (const c of mud.slice(0, 6)) L.push(`- **${c.caso}** — a tela segue ${c.evidencia_mudanca?.[0]?.id ?? 'evidência mais recente'} (${c.evidencia_mudanca?.[0]?.origem ?? '?'}), não a spec ${c.spec_a_atualizar?.fonte ? `\`${c.spec_a_atualizar.fonte.arquivo}:${c.spec_a_atualizar.fonte.linha_de}\`` : ''} → atualizar a especificação`); L.push(''); }
  if (aConf.length) { L.push('## ⚠️ A confirmar (não é bug nem sucesso)', ''); for (const c of aConf.slice(0, 8)) L.push(`- **${c.caso}** — ${cur(c.pergunta ?? c.motivo, 110)}`); if (aConf.length > 8) L.push(`- … e mais ${aConf.length - 8} em resultado.json`); L.push(''); }
  if (bloq.length) { L.push('## ⛔ Bloqueados (causa fora do produto)', ''); for (const c of bloq.slice(0, 6)) L.push(`- **${c.caso}** — ${cur(c.motivo, 100)}`); L.push(''); }
  const ci = classificacao.compat_info; if (ci) L.push(`🌐 Navegadores: ${ci.testados.join(', ')}${Object.keys(ci.indisponiveis ?? {}).length ? ` · **não testados:** ${Object.entries(ci.indisponiveis).map(([n, m]) => `${n} (${String(m).slice(0, 60)})`).join(', ')}` : ''}${instNav.length ? ` · instáveis: ${instNav.map((x) => `${x.caso}@${x.navegador}`).join(', ')}` : ''}`);
  if (prev.length) L.push(`ℹ️ Previstos (diferença já documentada): ${prev.map((c) => c.caso).join(', ')}`);
  if (inst.length) L.push(`🔁 Instáveis: ${inst.map((c) => c.caso).join(', ')}`);
  if (classificacao.precisa_rerun?.length) L.push(`↻ Falta reexecutar para confirmar: ${classificacao.precisa_rerun.join(', ')}`);
  const prox = bugs.length ? 'Corrigir os bugs e rodar `/sf-test` de novo (as jornadas já aprendidas rodam sem modelo).' : mud.length && !aConf.length ? 'Atualizar a especificação das mudanças listadas (ou, se foi engano, tratá-las como bug: `knowledge.mjs decidir <id> bug`).' : aConf.length ? 'Responder as perguntas e registrar: `node .claude/skills/sf-test/scripts/knowledge.mjs decidir <id> bug|previsto`.' : p1Bloq.length ? 'Resolver os bloqueios (login/massa) e reexecutar.' : 'Nada a fazer.';
  L.push('', `**Próximo passo:** ${prox}`);
  const md = L.join('\n') + '\n';
  const json = { run, data, capacidade: caderno?.capacidade, gate, resumo: classificacao.resumo, bugs, a_confirmar: aConf, mudancas_nao_documentadas: mud, bloqueados: bloq, previstos: prev, instaveis: inst, tecnicos: classificacao.tecnicos, cobertura: { resolvidos: cobertos, exigidos: exigidos.length }, massa: massaLog ? { criados: massaLog.criados?.length ?? 0, bloqueados: massaLog.bloqueados ?? [] } : null, org: preflight?.org?.host ?? null };
  return { md, json, bugs, gate };
}

export function bugMd(b, { caderno, basis }) {
  const caso = caderno?.casos?.find((c) => c.id === b.caso); const orc = new Map((basis?.oracles ?? []).map((o) => [o.id, o]));
  const L = [`# ${b.id} — ${b.titulo}`, '', `Severidade: **${b.severidade}** · Tipo: ${b.tipo === 'tecnico' ? `defeito técnico (${b.inv})` : 'comportamento contraria a especificação'}`, ''];
  if (b.tipo === 'compatibilidade') L.push('## O que aconteceu', `- O caso ${b.caso} passa no ${b.referencia} e falha no ${b.navegador}: ${b.motivo}`, '', 'Reproduzir: rode `executar.mjs replay --browsers ' + `${b.referencia},${b.navegador}` + '` ou repita os passos do caderno nesse navegador.');
  else if (b.tipo === 'negocio') {
    L.push('## O que a especificação diz');
    for (const id of b.oraculos || []) { const o = orc.get(id); if (o) L.push(`- ${o.texto}${o.fonte ? ` — \`${o.fonte.arquivo}:${o.fonte.linha_de}\`` : ''}`); }
    L.push('', '## Como reproduzir', ...(caso?.passos ?? []).map((p) => `${p.n}. ${p.acao}`), '', '## Esperado', ...(caso?.esperado ?? []).map((e) => `- ${e.texto}`), '', `## Observado`, `- ${b.motivo}`);
    if (b.evidencias?.png) L.push('', `Evidência: \`${b.evidencias.png}\`${b.evidencias.aria ? `, \`${b.evidencias.aria}\`` : ''}`);
  } else if (b.tipo !== 'compatibilidade') L.push(`## Observado`, `- ${b.motivo}`, `- Casos em que apareceu: ${(b.casos || []).join(', ')}`, '', 'Reproduzir: abrir o caso na tela e repetir os passos do caderno; a evidência técnica está em `evidence/<caso>.trace.json`.');
  return L.join('\n') + '\n';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = process.argv.slice(2); const v = (n) => { const i = a.indexOf(n); return i > -1 ? a[i + 1] : undefined; };
  const run = v('--run'); if (!run) { console.error('Uso: report.mjs --run <id> [--spec-dir <pasta da spec>]'); process.exit(1); }
  const dir = runDir(run); const classificacao = rd(dir, 'classificacao.json', null);
  if (!classificacao) { console.error('classificacao.json ausente: rode classify.mjs antes.'); process.exit(2); }
  const r = montarRelatorio({ run, classificacao, caderno: rd(dir, 'caderno.json', null), basis: rd(dir, 'test_basis.json', null), massaLog: rd(dir, 'massa_log.json', null), preflight: rd(dir, 'preflight.json', null) });
  writeFileSync(join(dir, 'resultado.md'), r.md); writeFileSync(join(dir, 'resultado.json'), JSON.stringify(r.json, null, 2));
  mkdirSync(join(dir, 'bugs'), { recursive: true }); for (const b of r.bugs) writeFileSync(join(dir, 'bugs', `${b.id}.md`), bugMd(b, { caderno: rd(dir, 'caderno.json', null), basis: rd(dir, 'test_basis.json', null) }));
  if (v('--spec-dir') && existsSync(v('--spec-dir'))) writeFileSync(join(v('--spec-dir'), 'test-report.md'), `${r.md}\n_Gerado pelo sf-test (execução ${run}). Detalhes: \`.sf-test/runs/${run}/\`._\n`);
  process.stdout.write(r.md);
  process.exit(r.gate === 'REPROVADO' ? EXIT.BUG : r.gate === 'NAO_CONCLUIDO' ? EXIT.CONFIG : EXIT.OK);
}
