// Cross-browser (Chromium, Firefox, WebKit REAIS quando instalados), ambiente por org e smoke automático.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { startFixture } from './fixture-app/server.mjs';
import { tmp } from './helpers.mjs';

process.env.SFT_ALLOW_LOCAL = '1';
const S = '.claude/skills/sf-test/scripts';
const { Engine, NAVEGADORES } = await import(`../${S}/engine/engine.mjs`);
const { loadPlaywright } = await import(`../${S}/lib/pw.mjs`);
const { compararNavegadores } = await import(`../${S}/compat.mjs`);
const { concluirCaso, executarReplay } = await import(`../${S}/executar.mjs`);
const { classificar } = await import(`../${S}/classify.mjs`);
const { montarRelatorio, bugMd } = await import(`../${S}/report.mjs`);
const { gerarSmoke, acrescentarSmoke } = await import(`../${S}/gerar-smoke.mjs`);
const { buildBasis } = await import(`../${S}/build-basis.mjs`);
const { checkCaderno } = await import(`../${S}/validate-caderno.mjs`);
let fx; before(async () => { fx = await startFixture(); }); after(async () => { await fx.close(); });

const disp = {}; async function disponivel(n) { if (n in disp) return disp[n]; try { const b = await loadPlaywright()[n].launch(); await b.close(); return (disp[n] = true); } catch { return (disp[n] = false); } }
const CAP = '001-intake-de-caso';
const NOVO = { acao: 'clicar', alvo: { papel: 'button', nome: 'Novo caso' } };
const caso = { id: 'TC-001', titulo: 'Salvar caso mostra o número', tipo: 'funcional', prioridade: 'P1', oraculos: ['O-001'], passos: [{ n: 1, acao: 'abrir' }], esperado: [{ texto: 'O número do caso aparece', verificacao: { tipo: 'texto-visivel', valor: 'Número do caso' } }] };
const ACTS = [{ acao: 'ir', url: '/' }, NOVO, { acao: 'preencher', alvo: { rotulo: 'Assunto' }, valor: 'Falha na fatura' }, { acao: 'clicar', alvo: { papel: 'button', nome: 'Salvar' } }];
const motor = async (cwd, run, navegador = 'chromium') => { const e = new Engine({ runDir: run, baseUrl: fx.url, cwd, navegador, limiteAssentarMs: 1500 }); await e.start(); return e; };
async function aprender(cwd, run) { const e = await motor(cwd, run); await e.begin('TC-001'); for (const a of ACTS) await e.act(a); await concluirCaso({ motor: e, caso, capacidade: CAP, via: 'aprendizado', runPath: run, cwd }); await e.close(); }
async function replayEm(nav, cwd, run, ref = 'chromium') { const e = await motor(cwd, run, nav); const r = await executarReplay({ motor: e, caderno: { casos: [caso] }, capacidade: CAP, runPath: run, cwd, sufixo: nav === ref ? '' : `.${nav}`, repetirFalha: nav !== ref }); await e.close(); return r; }

test('navegador: nome inválido e navegador não instalado dão erro claro com a correção', async () => {
  assert.deepEqual(NAVEGADORES, ['chromium', 'firefox', 'webkit']);
  await assert.rejects(() => new Engine({ runDir: tmp(), baseUrl: fx.url, navegador: 'edge' }).start(), (e) => e.codigo === 'navegador_invalido');
  await assert.rejects(() => new Engine({ runDir: tmp(), baseUrl: fx.url, navegador: 'webkit', lancador: async () => { throw new Error("browserType.launch: Executable doesn't exist at /x/webkit"); } }).start(),
    (e) => e.codigo === 'navegador_indisponivel' && /npx playwright install webkit/.test(e.message));
});

test('compat (unidade): passo interrompido, asserção e defeito técnico só no outro navegador; não reproduzido vira INSTAVEL', () => {
  const ref = [{ caso: 'TC-001', titulo: 't1', status: 'verde', achados: [] }, { caso: 'TC-002', titulo: 't2', status: 'verde', achados: [] }, { caso: 'TC-003', titulo: 't3', status: 'verde', achados: [] }, { caso: 'TC-004', titulo: 't4', status: 'verde', achados: [] }];
  const outros = { firefox: [{ caso: 'TC-001', status: 'interrompido', parou_no_passo: 4, de: 5, codigo: 'alvo_nao_encontrado', erro: 'x', reproduzida: true },
    { caso: 'TC-002', status: 'vermelho', verificacoes: [{ texto: 'aparece X', pass: false, detalhe: 'd' }], achados: [], reproduzida: true },
    { caso: 'TC-003', status: 'verde', achados: [{ inv: 'INV-004', evidencia: 'erro' }], reproduzida: null },
    { caso: 'TC-004', status: 'vermelho', verificacoes: [{ texto: 'y', pass: false }], achados: [], reproduzida: false }] };
  const r = compararNavegadores({ referencia: 'chromium', ref, outros }); const v = (c) => r.find((x) => x.caso === c);
  assert.equal(v('TC-001').tipo, 'passo'); assert.equal(v('TC-001').veredito, 'BUG'); assert.equal(v('TC-002').tipo, 'asserção'); assert.equal(v('TC-003').tipo, 'técnico'); assert.equal(v('TC-004').veredito, 'INSTAVEL');
  assert.deepEqual(compararNavegadores({ referencia: 'chromium', ref, outros: { firefox: [{ caso: 'TC-001', status: 'verde', achados: [] }] } }), []);
});

test('compat → classificação e relatório: divergência confirmada reprova o gate; navegador indisponível aparece como não testado', () => {
  const compat = [{ caso: 'TC-001', titulo: 'Salvar caso', navegador: 'firefox', referencia: 'chromium', tipo: 'asserção', detalhe: 'falhou: número do caso', confirmada: true, veredito: 'BUG', severidade: 'media' }];
  const cls = classificar({ basis: { oracles: [], questions: [] }, caderno: { casos: [] }, resultados: [{ caso: 'TC-001', titulo: 'Salvar caso', prioridade: 'P1', status: 'verde', oraculos: [], gaps_relacionados: [], verificacoes: [{ texto: 'x', pass: true }], achados: [], evidencias: {}, falhas_de_passo: [] }], compat, compatInfo: { referencia: 'chromium', testados: ['chromium', 'firefox'], indisponiveis: { webkit: 'não abriu' } } });
  assert.equal(cls.resumo.bugs_compat, 1);
  const rel = montarRelatorio({ run: 'c', classificacao: cls, caderno: { capacidade: 'x', casos: [] }, basis: { oracles: [] } });
  assert.equal(rel.gate, 'REPROVADO'); assert.match(rel.md, /Diverge no firefox/); assert.match(rel.md, /Navegadores: chromium, firefox · \*\*não testados:\*\* webkit/);
  assert.match(bugMd(rel.bugs[0], {}), /passa no chromium e falha no firefox/);
});

for (const nav of ['firefox', 'webkit']) {
  test(`cross-browser REAL (${nav}): o mesmo caso passa no app correto, sem divergência`, async (t) => {
    if (!(await disponivel(nav))) return t.skip(`${nav} não instalado neste ambiente`);
    fx.setFlags({}); const cwd = tmp(); const run = join(cwd, 'run'); mkdirSync(join(run, 'resultados'), { recursive: true });
    await aprender(cwd, run); const ref = await replayEm('chromium', cwd, run); const out = await replayEm(nav, cwd, run);
    assert.equal(ref.resultados[0].status, 'verde'); assert.equal(out.resultados[0].status, 'verde'); assert.equal(out.resultados[0].navegador, nav);
    assert.deepEqual(compararNavegadores({ referencia: 'chromium', ref: ref.resultados, outros: { [nav]: out.resultados } }), []);
  });
}

test('cross-browser REAL: bug que só aparece no Firefox é achado, reproduzido 2 de 2 e vira BUG de compatibilidade', async (t) => {
  if (!(await disponivel('firefox'))) return t.skip('firefox não instalado neste ambiente');
  fx.setFlags({}); const cwd = tmp(); const run = join(cwd, 'run'); mkdirSync(join(run, 'resultados'), { recursive: true });
  await aprender(cwd, run); fx.setFlags({ ffbug: '1' });
  const ref = await replayEm('chromium', cwd, run); const ff = await replayEm('firefox', cwd, run); fx.setFlags({});
  assert.equal(ref.resultados[0].status, 'verde'); assert.equal(ff.resultados[0].status, 'vermelho'); assert.equal(ff.resultados[0].reproduzida, true);
  const d = compararNavegadores({ referencia: 'chromium', ref: ref.resultados, outros: { firefox: ff.resultados } });
  assert.equal(d.length, 1); assert.equal(d[0].veredito, 'BUG'); assert.equal(d[0].navegador, 'firefox'); assert.match(d[0].detalhe, /número do caso/i);
  assert.ok(existsSync(join(run, 'resultados', 'TC-001.firefox.json'))); assert.ok(!existsSync(join(run, 'resultados', 'TC-001.chromium.json')));
});

test('CLI de ponta a ponta: replay --browsers (3 navegadores) → classify → report, com a divergência no relatório', async (t) => {
  const navs = ['chromium', 'firefox', 'webkit'].filter(Boolean); for (const n of ['firefox']) if (!(await disponivel(n))) return t.skip(`${n} não instalado`);
  const cwd = tmp(); const run = 'cli-compat'; process.env.SFT_DIR = cwd;
  try {
    const dir = join(cwd, 'runs', run); mkdirSync(join(dir, 'resultados'), { recursive: true });
    const cad = { schema: '1.0', capacidade: CAP, casos: [caso] }; writeFileSync(join(dir, 'caderno.json'), JSON.stringify(cad)); writeFileSync(join(dir, 'test_basis.json'), JSON.stringify({ oracles: [{ id: 'O-001', classe: 'aceite', autoridade: 1, texto: 'salvar mostra número', fonte: { arquivo: 'spec.md', linha_de: 3, linha_ate: 3, citacao: 'x' } }], questions: [], base_forte: true }));
    fx.setFlags({}); await aprender(cwd, dir); fx.setFlags({ ffbug: '1' });
    const cli = (script, ...a) => new Promise((res) => execFile('node', [resolve(S, script), ...a], { env: { ...process.env, SFT_DIR: cwd, SFT_ALLOW_LOCAL: '1' }, timeout: 150000 }, (err, out, er) => res({ code: err ? err.code : 0, out: String(out), err: String(er) })));
    const lista = (await disponivel('webkit')) ? 'chromium,firefox,webkit' : 'chromium,firefox';
    const rp = await cli('executar.mjs', 'replay', '--run', run, '--browsers', lista, '--base-url', fx.url); fx.setFlags({});
    const j = JSON.parse(rp.out.trim().split('\n').pop()); assert.equal(j.ok, true, rp.out + rp.err); assert.equal(j.replay.verde, 1); assert.ok(j.navegadores.testados.includes('firefox'));
    const cl = await cli('classify.mjs', '--run', run); assert.equal(JSON.parse(cl.out.trim().split('\n').pop()).resumo.bugs_compat, 1, cl.out + cl.err);
    const rep = await cli('report.mjs', '--run', run); assert.equal(rep.code, 1); assert.match(rep.out, /REPROVADO/); assert.match(rep.out, /Diverge no firefox/); assert.match(rep.out, /Navegadores: /);
    assert.ok(existsSync(join(dir, 'bugs', 'BUG-001.md')));
  } finally { delete process.env.SFT_DIR; }
});

// ---- smoke automático
const ROOT = resolve('tests/fixtures/projeto');
const { basis } = buildBasis({ spec: join(ROOT, 'specs/atendimento', CAP), discovery: join(ROOT, 'discovery/R01/backlog.json') }, ROOT);
const cadFix = () => ({ ...JSON.parse(readFileSync(join(ROOT, 'caderno.json'), 'utf8')) });

test('smoke: deriva abrir-e-carregar e campos aparecem por código; sem caminho ou sem formulário avisa; é idempotente', () => {
  const sem = gerarSmoke({ casos: [] }, basis); assert.equal(sem.casos.length, 0); assert.match(sem.avisos[0], /navegacao_base/);
  const c1 = gerarSmoke(cadFix(), basis); assert.deepEqual(c1.casos.map((c) => c.id), ['TC-901']); assert.ok(c1.avisos.some((a) => /formulario/.test(a)));
  const cad = { ...cadFix(), navegacao_base: { app: 'Service Console', caminho: ['Casos', 'Novo'], formulario: ['Clicar em Novo caso'] } };
  const { casos } = gerarSmoke(cad, basis); assert.deepEqual(casos.map((c) => c.id), ['TC-901', 'TC-902']);
  assert.ok(casos[0].oraculos.every((o) => /^INV-00\d$/.test(o))); assert.equal(casos[0].esperado[0].verificacao.valor, 'Casos'); assert.equal(casos[1].esperado[0].verificacao.alvo.rotulo, 'Prioridade');
  const a1 = acrescentarSmoke(cad, basis); const a2 = acrescentarSmoke(a1.caderno, basis); assert.equal(a1.caderno.casos.length, a2.caderno.casos.length); assert.equal(a2.novos, 0);
  assert.equal(checkCaderno(a1.caderno, basis).ok, true, checkCaderno(a1.caderno, basis).errors.join(';'));      // o caderno com smoke continua válido
});

test('smoke: roda na app de teste (passa) e pega a regressão quando falta a aba/campo (vermelho)', async () => {
  const cad = { ...cadFix(), navegacao_base: { app: 'Service Console', caminho: ['Casos', 'Novo'], formulario: ['Clicar em Novo caso'] } };
  const { casos } = gerarSmoke(cad, basis); fx.setFlags({}); const cwd = tmp(); const run = join(cwd, 'run'); mkdirSync(join(run, 'resultados'), { recursive: true });
  const e = await motor(cwd, run); const r = {};
  for (const c of casos) { await e.begin(c.id); await e.act({ acao: 'ir', url: '/' }); if (c.id === 'TC-902') await e.act(NOVO); r[c.id] = await concluirCaso({ motor: e, caso: c, capacidade: CAP, via: 'aprendizado', runPath: run, cwd }); }
  assert.equal(r['TC-901'].status, 'verde'); assert.equal(r['TC-902'].status, 'verde');
  const quebrado = { ...casos[1], esperado: [{ texto: 'O campo "Campo Inexistente" aparece', verificacao: { tipo: 'elemento-visivel', alvo: { rotulo: 'Campo Inexistente' }, timeout: 600 } }] };
  await e.begin('TC-902'); await e.act({ acao: 'ir', url: '/' }); await e.act(NOVO); const v = await concluirCaso({ motor: e, caso: quebrado, capacidade: CAP, via: 'aprendizado', runPath: run, cwd, sufixo: '.rerun' }); await e.close();
  assert.equal(v.status, 'vermelho');
});
