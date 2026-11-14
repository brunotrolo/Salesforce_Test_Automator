#!/usr/bin/env node
// Execução dos casos do caderno.
//   replay   --run <id> [--browsers chromium,firefox,webkit] [--base-url <url>]   reproduz (o 1º navegador é a referência; os outros só comparam) as jornadas compiladas (SEM modelo); o que não tem jornada válida vai para pendentes.json
//   prefixo  --run <id> --caso TC-001 [--sessao s1]   leva a tela até onde o replay parou (para o agente continuar: cura)
//   concluir --run <id> --caso TC-001 [--sessao s1]   roda as verificações do caso, fecha o caso, grava o resultado bruto e compila a jornada
// Resultado bruto por caso: <run>/resultados/TC-nnn.json  (status: verde | vermelho | bloqueado | pendente_juiz)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDir, ensureDir, EXIT } from './lib/config.mjs';
import { compilar, salvarJornada, carregarJornada, reproduzir, registrarExecucao, hashDoCaso, sementeDeOutroAmbiente } from './journeys.mjs';

const BLOQUEIO = new Set(['massa_ausente', 'politica', 'login_indisponivel', 'acao_invalida']);

export function montarResultado({ caso, trace, verificacoes, via, navegador = trace.navegador ?? 'chromium' }) {
  const falhas = trace.passos.filter((p) => !p.ok).map((p) => ({ n: p.n, codigo: p.codigo, acao: p.acao }));
  const okPassos = trace.passos.filter((p) => p.ok).length;
  let status;
  if (!okPassos) status = 'bloqueado';
  else if (verificacoes.some((v) => v.bloqueado) || (falhas.some((f) => BLOQUEIO.has(f.codigo)) && verificacoes.some((v) => v.pass !== true))) status = 'bloqueado';
  else if (verificacoes.some((v) => v.pass === false)) status = 'vermelho';
  else if (verificacoes.some((v) => v.pass === null)) status = 'pendente_juiz';
  else status = 'verde';
  return { caso: caso.id, navegador, titulo: caso.titulo, tipo: caso.tipo, prioridade: caso.prioridade, status, via, oraculos: caso.oraculos ?? [], gaps_relacionados: caso.gaps_relacionados ?? [],
    verificacoes: caso.esperado.map((e, i) => ({ texto: e.texto, tipo: e.verificacao.tipo, ...(verificacoes[i] ?? { pass: false, detalhe: 'não verificado' }) })),
    achados: trace.achados, falhas_de_passo: falhas, evidencias: trace.evidencias, passos: trace.passos.length, duracao_ms: trace.duracao_ms, spinner_ms: trace.spinner_ms };
}

/** `motor` precisa de assert(v) e end() — Engine direto ou adaptador do daemon. */
export async function concluirCaso({ motor, caso, capacidade, via, runPath, cwd = process.cwd(), sufixo = '', ambiente = motor.ambiente ?? 'default' }) {
  const verificacoes = []; for (const e of caso.esperado) verificacoes.push(await motor.assert(e.verificacao));
  const trace = await motor.end();
  const r = montarResultado({ caso, trace, verificacoes, via });
  mkdirSync(join(runPath, 'resultados'), { recursive: true }); writeFileSync(join(runPath, 'resultados', `${caso.id}${sufixo}.json`), JSON.stringify(r, null, 2));
  if (sufixo) return r;                                   // reexecução de confirmação: não compila nem conta estabilidade
  const deterministicasOk = verificacoes.length && verificacoes.every((v) => v.pass === true || v.pass === null) && verificacoes.some((v) => v.pass === true);
  if (['verde', 'pendente_juiz'].includes(r.status) && deterministicasOk && trace.passos.some((p) => p.ok)) {
    const j = compilar(trace, caso, capacidade, ambiente); try { salvarJornada(j, cwd); r.jornada = { hash: j.hash, passos: j.passos.length }; } catch (e) { r.jornada = { recusada: String(e.message).slice(0, 160) }; }
    registrarExecucao(capacidade, caso.id, hashDoCaso(caso), r.status === 'verde', { cwd, ambiente });
  } else registrarExecucao(capacidade, caso.id, hashDoCaso(caso), false, { cwd, ambiente });
  return r;
}

export async function executarReplay({ motor, caderno, capacidade, runPath, cwd = process.cwd(), soCasos = null, sufixo = '', ambiente = motor.ambiente ?? 'default', repetirFalha = false }) {
  const resultados = []; const pendentes = [];
  for (const caso of caderno.casos) {
    if (soCasos && !soCasos.includes(caso.id)) continue;
    let c = carregarJornada(capacidade, caso, cwd, ambiente); let semente = false;
    if (c.estado === 'ausente') { const sm = sementeDeOutroAmbiente(capacidade, caso, cwd, ambiente); if (sm) { c = { estado: 'ok', jornada: sm }; semente = true; } }
    if (c.estado !== 'ok') { pendentes.push({ caso: caso.id, motivo: c.estado === 'ausente' ? 'sem jornada (aprender)' : `jornada ${c.estado} (reaprender)` }); continue; }
    const rodar = async () => { await motor.begin(caso.id); const rep = await reproduzir(motor, c.jornada); const trace = await motor.end(); return { rep, trace }; };
    let { rep, trace } = await rodar(); let reproduzida = null;
    if (repetirFalha && (!rep.ok || rep.verificacoes.some((x) => x.pass === false))) { const outra = await rodar(); const mesma = !outra.rep.ok === !rep.ok && (rep.ok ? outra.rep.verificacoes.some((x) => x.pass === false) : outra.rep.parou_no_passo === rep.parou_no_passo); reproduzida = mesma; ({ rep, trace } = outra); }
    if (!rep.ok) {
      pendentes.push({ caso: caso.id, motivo: semente ? `jornada de outro ambiente (${c.jornada.derivada_de}) não reproduziu aqui (cura)` : 'replay interrompido (cura)', handoff: { parou_no_passo: rep.parou_no_passo, de: rep.total, codigo: rep.codigo, erro: rep.erro, passo: rep.passo } });
      mkdirSync(join(runPath, 'handoff'), { recursive: true }); writeFileSync(join(runPath, 'handoff', `${caso.id}${sufixo}.json`), JSON.stringify(trace, null, 2));
      if (sufixo && sufixo !== '.rerun') { mkdirSync(join(runPath, 'resultados'), { recursive: true }); writeFileSync(join(runPath, 'resultados', `${caso.id}${sufixo}.json`), JSON.stringify({ caso: caso.id, navegador: motor.navegador ?? 'chromium', status: 'interrompido', parou_no_passo: rep.parou_no_passo, de: rep.total, codigo: rep.codigo, erro: rep.erro, reproduzida, achados: trace.achados ?? [] }, null, 2)); }
      if (!sufixo) registrarExecucao(capacidade, caso.id, hashDoCaso(caso), false, { cwd, ambiente }); continue;
    }
    const r = montarResultado({ caso, trace, verificacoes: rep.verificacoes, via: 'replay' }); if (reproduzida !== null) r.reproduzida = reproduzida;
    mkdirSync(join(runPath, 'resultados'), { recursive: true }); writeFileSync(join(runPath, 'resultados', `${caso.id}${sufixo}.json`), JSON.stringify(r, null, 2));
    if (semente) { r.via = 'replay-semente'; writeFileSync(join(runPath, 'resultados', `${caso.id}${sufixo}.json`), JSON.stringify(r, null, 2)); }
    if (semente && r.status === 'verde' && !sufixo) { const { derivada_de, ...base } = c.jornada; try { salvarJornada({ ...base, ambiente, semeada_de: derivada_de }, cwd); } catch { /* semente recusada */ } }
    if (!sufixo) registrarExecucao(capacidade, caso.id, hashDoCaso(caso), r.status === 'verde', { cwd, ambiente }); resultados.push(r);
  }
  if (sufixo !== '.rerun') writeFileSync(join(runPath, `pendentes${sufixo}.json`), JSON.stringify(pendentes, null, 2)); return { resultados, pendentes };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd, ...a] = process.argv.slice(2); const v = (n) => { const i = a.indexOf(n); return i > -1 ? a[i + 1] : undefined; };
  const run = v('--run'); if (!cmd || !run) { console.error('Uso: executar.mjs <replay|prefixo|concluir> --run <id> [--caso TC-nnn] [--sessao s1] [--base-url url]'); process.exit(1); }
  const dir = ensureDir(runDir(run)); const caderno = JSON.parse(readFileSync(join(dir, 'caderno.json'), 'utf8')); const capacidade = caderno.capacidade;
  const { criarEngine } = await import('./engine/factory.mjs'); const { conectar } = await import('./engine/client.mjs');
  if (cmd === 'replay') {
    const navs = (v('--browsers') || 'chromium').split(',').map((x) => x.trim()).filter(Boolean); const ref = navs[0]; const rerun = a.includes('--rerun');
    const so = v('--casos') ? v('--casos').split(',') : null; const compat = { referencia: ref, testados: [], indisponiveis: {} }; let code = EXIT.OK; const tot = { verde: 0, vermelho: 0, bloqueado: 0, pendente_juiz: 0 }; let pend = 0;
    for (const nav of navs) {
      const motor = criarEngine(run, { baseUrl: v('--base-url') ?? null, navegador: nav });
      try { await motor.start(); }
      catch (e) { if (nav === ref) { console.log(JSON.stringify({ ok: false, codigo: e.codigo || 'falha', erro: String(e.message).slice(0, 300) })); process.exit(EXIT.CONFIG); } compat.indisponiveis[nav] = String(e.message).slice(0, 160); await motor.close(); continue; }
      try { const r = await executarReplay({ motor, caderno, capacidade, runPath: dir, soCasos: so, sufixo: nav === ref ? (rerun ? '.rerun' : '') : `.${nav}`, repetirFalha: nav !== ref });
        compat.testados.push(nav); if (nav === ref) { for (const k of Object.keys(tot)) tot[k] = r.resultados.filter((x) => x.status === k).length; pend = r.pendentes.length; } }
      catch (e) { console.log(JSON.stringify({ ok: false, codigo: e.codigo || 'falha', erro: String(e.message).slice(0, 300) })); code = EXIT.CONFIG; } finally { await motor.close(); }
    }
    if (navs.length > 1 && !rerun) writeFileSync(join(dir, 'compat_navegadores.json'), JSON.stringify(compat, null, 2));
    console.log(JSON.stringify({ ok: code === EXIT.OK, replay: tot, pendentes_para_agente: pend, navegadores: compat })); process.exit(code);
  }
  const caso = caderno.casos.find((c) => c.id === v('--caso')); if (!caso) { console.log(JSON.stringify({ ok: false, erro: 'caso não encontrado no caderno' })); process.exit(1); }
  const { call, info } = conectar(run, v('--sessao') || 's1');
  if (cmd === 'prefixo') {
    const c = carregarJornada(capacidade, caso, process.cwd(), info.ambiente ?? 'default'); if (!c.jornada) { console.log(JSON.stringify({ ok: false, erro: 'sem jornada anterior' })); process.exit(1); }
    await call('begin', { caso: caso.id }); const ate = Number(v('--ate') || 0) || c.jornada.passos.length; let feitos = 0;
    for (const p of c.jornada.passos.slice(0, ate)) { const r = await call('act', p); if (!r.ok) break; feitos++; }
    console.log(JSON.stringify({ ok: true, passos_reproduzidos: feitos, de: c.jornada.passos.length })); process.exit(0);
  }
  if (cmd === 'concluir') {
    const motor = { assert: (x) => call('assert', x), end: () => call('end'), ambiente: info.ambiente ?? 'default' }; const jaTinha = carregarJornada(capacidade, caso, process.cwd(), motor.ambiente).estado !== 'ausente';
    const r = await concluirCaso({ motor, caso, capacidade, via: jaTinha ? 'cura' : 'aprendizado', runPath: dir, sufixo: a.includes('--rerun') ? '.rerun' : '' });
    console.log(JSON.stringify({ caso: r.caso, status: r.status, via: r.via, achados: r.achados.length, jornada: r.jornada ?? null, verificacoes: r.verificacoes.map((x) => ({ texto: x.texto, pass: x.pass, detalhe: x.detalhe })) })); process.exit(0);
  }
  console.error('comando desconhecido'); process.exit(1);
}
