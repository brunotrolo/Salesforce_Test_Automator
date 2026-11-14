import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { startFixture } from './fixture-app/server.mjs';
import { tmp } from './helpers.mjs';

process.env.SFT_ALLOW_LOCAL = '1';
const S = '.claude/skills/sf-test/scripts';
const { Engine } = await import(`../${S}/engine/engine.mjs`);
const { detectarInvariantes } = await import(`../${S}/engine/detectors.mjs`);
let fx;
before(async () => { fx = await startFixture(); });
after(async () => { await fx.close(); });

const novo = async (query = '', massa = {}, extra = {}) => {
  const dir = tmp('run-'); const e = new Engine({ runDir: dir, baseUrl: fx.url, ...extra }); await e.start(); e.setMassa(massa);
  await e.begin('TC-001'); await e.act({ acao: 'ir', url: `/${query ? `?${query}` : ''}` }); return { e, dir };
};
const salvar = async (e, { assunto = 'Falha na fatura', prio = 'Baixa', desc = '' } = {}) => {
  await e.act({ acao: 'clicar', alvo: { papel: 'button', nome: 'Novo caso' } });
  await e.act({ acao: 'preencher', alvo: { rotulo: 'Assunto' }, valor: assunto });
  if (desc) await e.act({ acao: 'preencher', alvo: { rotulo: 'Descrição' }, valor: desc });
  await e.act({ acao: 'selecionar', alvo: { rotulo: 'Prioridade' }, valor: prio });
  return e.act({ acao: 'clicar', alvo: { papel: 'button', nome: /Salvar|Gravar/ instanceof RegExp ? 'Salvar' : 'Salvar' } });
};

test('detectores: cada invariante é reconhecida e o texto de validação normal NÃO é defeito', () => {
  const ids = (o) => detectarInvariantes(o).map((f) => f.inv);
  assert.deepEqual(ids({ notificacoes: ['An unexpected error occurred. Error ID: 4711'] }), ['INV-001']);
  assert.deepEqual(ids({ respostas: [{ status: 503, url: 'https://x/api/a' }] }), ['INV-002']);
  assert.deepEqual(ids({ texto: 'Cliente: [object Object]' }), ['INV-003']);
  assert.deepEqual(ids({ texto: 'Total: NaN' }), ['INV-003']);
  assert.deepEqual(ids({ console: ['Uncaught TypeError: x is undefined'] }), ['INV-004']);
  assert.deepEqual(ids({ spinnerMs: 15000 }), ['INV-005']);
  assert.deepEqual(ids({ notificacoes: ['Informe o assunto'], texto: 'Informe o assunto', console: ['Failed to load resource: 404 favicon.ico'] }), []);
});

test('motor: fluxo feliz — preenche (shadow DOM), salva, lê o número e verifica; sem achados', async () => {
  const { e } = await novo(); const r = await salvar(e); assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal((await e.assert({ tipo: 'texto-visivel', valor: 'Número do caso' })).pass, true);
  assert.equal((await e.assert({ tipo: 'elemento-visivel', alvo: { rotulo: 'Assunto' } })).pass, true);
  const fim = await e.end(); assert.deepEqual(fim.achados, []); assert.ok(fim.passos.every((p) => p.ok)); assert.ok(fim.evidencias.png); await e.close();
});

test('motor: validação de negócio é tela normal, não defeito técnico', async () => {
  const { e } = await novo(); await salvar(e, { assunto: ' ' });
  assert.equal((await e.assert({ tipo: 'texto-visivel', valor: 'Informe o assunto' })).pass, true);
  assert.deepEqual((await e.end()).achados, []); await e.close();
});

test('motor: bugs técnicos plantados viram achados com a invariante certa', async () => {
  for (const [flag, inv] of [['erro', 'INV-001'], ['object', 'INV-003'], ['console', 'INV-004'], ['5xx', 'INV-002']]) {
    const { e } = await novo(`bug=${flag}`); await salvar(e); await e.page.waitForTimeout(150);
    const fim = await e.end(); assert.ok(fim.achados.some((a) => a.inv === inv), `${flag}: ${JSON.stringify(fim.achados)}`); await e.close();
  }
});

test('motor: spinner que não termina vira INV-005 (medido ao assentar a tela)', async () => {
  const { e } = await novo('spin=1', {}, { limiteAssentarMs: 1500, limiteSpinnerMs: 1000 }); await salvar(e);
  const fim = await e.end(); assert.ok(fim.achados.some((a) => a.inv === 'INV-005'), JSON.stringify(fim.achados)); assert.ok(fim.spinner_ms >= 1000); await e.close();
});

test('motor: política barra navegação fora da origem, XPath e clique destrutivo; erro de alvo é classificado', async () => {
  const { e } = await novo();
  const fora = await e.act({ acao: 'ir', url: 'https://evil.example.com/' }); assert.equal(fora.codigo, 'politica');
  const xp = await e.act({ acao: 'clicar', alvo: { seletor: '//button' } }); assert.equal(xp.codigo, 'politica');
  const del = await e.act({ acao: 'clicar', alvo: { papel: 'button', nome: 'Excluir caso' } }); assert.equal(del.codigo, 'politica');
  const nao = await e.act({ acao: 'clicar', alvo: { papel: 'button', nome: 'Botão que não existe' }, timeout: 600 }); assert.equal(nao.codigo, 'alvo_nao_encontrado');
  const amb = await e.act({ acao: 'clicar', alvo: { papel: 'button' }, timeout: 800 }); assert.equal(amb.codigo, 'alvo_ambiguo');
  await e.end(); await e.close();
});

test('motor: placeholders da massa são resolvidos só no motor; massa ausente falha com código claro', async () => {
  const { e } = await novo('', { 'TC-001': { cliente: { id: '001X', nome: 'ZZ_TEST_r1_MD-001' } } });
  await e.act({ acao: 'clicar', alvo: { papel: 'button', nome: 'Novo caso' } });
  const r = await e.act({ acao: 'preencher', alvo: { rotulo: 'Assunto' }, valor: 'Caso de {{cliente.nome}}' }); assert.equal(r.ok, true);
  assert.equal((await e.assert({ tipo: 'valor-campo', alvo: { rotulo: 'Assunto' }, valor: 'Caso de {{cliente.nome}}' })).pass, true);
  const falta = await e.act({ acao: 'preencher', alvo: { rotulo: 'Assunto' }, valor: '{{outro.nome}}' }); assert.equal(falta.codigo, 'massa_ausente');
  const fim = await e.end(); assert.equal(fim.passos[2].valor, 'Caso de {{cliente.nome}}'); await e.close();   // o trace guarda o modelo, não o valor
});

test('motor via CLI (daemon): start → begin → act → assert → end → close', async () => {
  const run = `cli-${Date.now()}`; const env = { ...process.env, SFT_DIR: tmp('sft-'), SFT_ALLOW_LOCAL: '1' };
  const cli = (...a) => new Promise((res) => execFile('node', [resolve(S, 'engine/cli.mjs'), ...a, '--run', run], { env, timeout: 30000 }, (err, out) => res({ code: err ? err.code : 0, j: JSON.parse(String(out).trim().split('\n').pop() || '{}') })));
  const st = await cli('start', '--base-url', fx.url); assert.equal(st.j.ok, true, JSON.stringify(st)); assert.equal(st.j.via, 'local');
  assert.equal((await cli('begin', 'TC-009')).j.via, 'local');
  assert.equal((await cli('act', JSON.stringify({ acao: 'ir', url: '/' }))).j.ok, true);
  assert.equal((await cli('act', JSON.stringify({ acao: 'clicar', alvo: { papel: 'button', nome: 'Novo caso' } }))).j.ok, true);
  assert.equal((await cli('assert', JSON.stringify({ tipo: 'elemento-visivel', alvo: { rotulo: 'Assunto' } }))).j.pass, true);
  const fim = (await cli('end')).j; assert.equal(fim.caso, 'TC-009'); assert.ok(fim.passos.length >= 2);
  assert.equal((await cli('close')).j.ok, true);
  assert.equal((await cli('act', JSON.stringify({ acao: 'ir', url: '/' }))).code, 2);   // motor encerrado
});
