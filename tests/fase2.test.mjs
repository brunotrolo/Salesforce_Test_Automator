import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmp } from './helpers.mjs';

const S = '.claude/skills/sf-test/scripts';
const { buildBasis, verifyOracles } = await import(`../${S}/build-basis.mjs`);
const { checkCaderno } = await import(`../${S}/validate-caderno.mjs`);
const { renderCaderno } = await import(`../${S}/render-caderno.mjs`);
const ROOT = resolve('tests/fixtures/projeto');
const opt = { spec: join(ROOT, 'specs/atendimento/001-intake-de-caso'), discovery: join(ROOT, 'discovery/R01/backlog.json') };
const cad = () => JSON.parse(readFileSync(join(ROOT, 'caderno.json'), 'utf8'));

test('base: extrai oráculos por classe/autoridade dos artefatos do PO, Designer e Developer', () => {
  const { basis } = buildBasis(opt, ROOT);
  const c = (cl) => basis.oracles.filter((o) => o.classe === cl).length;
  assert.equal(c('aceite'), 4); assert.equal(c('regra'), 3); assert.equal(c('gap-conhecido'), 2); assert.equal(c('validacao'), 1); assert.equal(c('campo'), 2); assert.equal(c('invariante'), 5);
  assert.ok(basis.oracles.find((o) => o.classe === 'gap-conhecido' && /limitação conhecida/.test(o.texto)));
  assert.ok(basis.oracles.find((o) => o.classe === 'validacao' && /Informe o assunto/.test(o.texto)));
  assert.equal(basis.questions[0].kind, 'negocio'); assert.equal(basis.base_forte, true);
  assert.ok(basis.oracles.find((o) => /nunca é exibido completo\./.test(o.texto)).incerto, 'regra com NEEDS CLARIFICATION fica marcada como incerta');
  assert.ok(!/NEEDS CLARIFICATION/.test(basis.oracles.find((o) => o.incerto).texto));
});

test('base: toda citação é verificada contra o arquivo; citação adulterada é detectada', () => {
  const { basis } = buildBasis(opt, ROOT);
  assert.deepEqual(verifyOracles(basis, ROOT), []);
  basis.oracles.find((o) => o.id === 'O-003').fonte.citacao = 'regra que não existe no arquivo';
  assert.ok(verifyOracles(basis, ROOT).some((e) => /O-003/.test(e)));
});

test('base: sem critérios com fonte a base é fraca e avisa', () => {
  const { basis } = buildBasis({ spec: join(ROOT, 'specs/atendimento/nada') }, ROOT);
  assert.equal(basis.base_forte, false); assert.ok(basis.avisos.some((a) => /Base fraca/.test(a)));
});

test('caderno: aprovado com cobertura total; id, oráculo e gap inválidos são recusados', () => {
  const { basis } = buildBasis(opt, ROOT);
  const ok = checkCaderno(cad(), basis); assert.equal(ok.ok, true, ok.errors.join(';')); assert.equal(ok.cobertura.cobertos, ok.cobertura.exigidos);
  const x = cad(); x.casos[0].oraculos = ['O-999']; assert.ok(checkCaderno(x, basis).errors.some((e) => /O-999/.test(e)));
  const y = cad(); y.casos[0].gaps_relacionados = ['O-001']; assert.ok(checkCaderno(y, basis).errors.some((e) => /gap-conhecido/.test(e)));
  const z = cad(); z.casos[1].id = 'TC-001'; assert.ok(checkCaderno(z, basis).errors.some((e) => /duplicado/.test(e)));
});

test('caderno: critério de aceite sem caso reprova a cobertura; caso sem oráculo só como exploratório', () => {
  const { basis } = buildBasis(opt, ROOT);
  const x = cad(); x.casos = x.casos.filter((c) => c.id !== 'TC-003');
  assert.ok(checkCaderno(x, basis).errors.some((e) => /cobertura: O-003/.test(e)));
  const y = cad(); y.casos[0].oraculos = [];
  assert.ok(checkCaderno(y, basis).errors.some((e) => /sem oráculo/.test(e)));
  const w = cad(); w.casos[0].oraculos = []; w.casos[0].tipo = 'exploratorio';
  assert.ok(!checkCaderno(w, basis).errors.some((e) => /sem oráculo/.test(e)));
});

test('caderno: esperado vago, verificação sem valor, alvo com XPath e passo fora de sequência', () => {
  const { basis } = buildBasis(opt, ROOT);
  const x = cad(); x.casos[1].esperado[0].texto = 'A tela funciona corretamente'; assert.ok(checkCaderno(x, basis).warnings.some((w) => /vago/.test(w)));
  const y = cad(); y.casos[1].esperado[0].verificacao.valor = ''; assert.ok(checkCaderno(y, basis).errors.some((e) => /sem valor/.test(e)));
  const z = cad(); z.casos[0].esperado[0].verificacao.alvo = { seletor: '//div' }; assert.ok(checkCaderno(z, basis).errors.some((e) => /XPath/.test(e)));
  const w = cad(); w.casos[0].passos[1].n = 5; assert.ok(checkCaderno(w, basis).errors.some((e) => /sequência/.test(e)));
});

test('caderno.md e CLI: build-basis grava test_basis.json, validate-caderno aprova', () => {
  const md = renderCaderno(cad()); assert.match(md, /## TC-002/); assert.match(md, /Gap conhecido relacionado: O-008/);
  const out = join(tmp(), 'test_basis.json');
  const r = spawnSync('node', [resolve(S, 'build-basis.mjs'), '--spec', 'specs/atendimento/001-intake-de-caso', '--discovery', 'discovery/R01/backlog.json', '--out', out], { cwd: ROOT, encoding: 'utf8', env: { ...process.env } });
  assert.equal(r.status, 0, r.stderr);
});

// ---- Fase 3: massa
import { spawnSync as _sp } from 'node:child_process';
import { fakeSf } from './helpers.mjs';
const { planMassa, prepararMassa, limparMassa, makeSf, documentoSintetico } = await import(`../${S}/massa.mjs`);

test('massa: plano reúne a necessidade por caso e por entidade', () => {
  const p = planMassa(cad());
  assert.equal(p.itens.length, 1); assert.equal(p.itens[0].estrategia, 'criar'); assert.equal(p.por_entidade.Account, 1);
});

test('massa: documento sintético tem dígitos verificadores válidos e é determinístico', () => {
  const d = documentoSintetico('semente'); assert.match(d, /^\d{3}\.\d{3}\.\d{3}-\d{2}$/); assert.equal(d, documentoSintetico('semente'));
  const n = d.replace(/\D/g, '').split('').map(Number); const dv = (a) => { const s = a.reduce((t, x, i) => t + x * (a.length + 1 - i), 0) % 11; return s < 2 ? 0 : 11 - s; };
  assert.equal(dv(n.slice(0, 9)), n[9]); assert.equal(dv(n.slice(0, 10)), n[10]);
});

function ambiente(extra = {}) {
  const f = fakeSf('ok'); const log = join(tmp(), 'sf.log'); const env = { ...f.env, FAKE_SF_LOG: log, SF_TARGET_ORG: 'orgx', ...extra };
  const spawn = (c, a, o) => _sp(c, a, { ...o, env });
  return { env, log, sf: makeSf({ org: 'orgx', spawn }), spawn };
}

test('massa: cria dado sintético MARCADO, com referência entre itens, e registra no log', () => {
  const { sf, log } = ambiente();
  const plano = { itens: [
    { id: 'MD-001', caso: 'TC-001', ref: 'cliente', entidade: 'Account', atributos: { Name: 'Cliente' }, quantidade: 1 },
    { id: 'MD-002', caso: 'TC-001', ref: 'contato', entidade: 'Contact', atributos: { LastName: 'Silva', AccountId: '@cliente.id', Documento__c: '@documento' }, quantidade: 1 },
  ] };
  const r = prepararMassa(plano, { sf, runId: '20260101-0000Z', org: 'orgx' });
  assert.equal(r.log.criados.length, 2); assert.equal(r.log.bloqueados.length, 0);
  assert.match(r.log.criados[0].nome, /^ZZ_TEST_20260101-0000Z_MD-001/);
  assert.match(r.log.criados[1].nome, /^ZZ_TEST_20260101-0000Z_MD-002_Silva/);
  const cmd = readFileSync(log, 'utf8'); assert.match(cmd, new RegExp(r.log.criados[0].id));    // contato usa o id da conta
  assert.match(r.resolvida['TC-001'].contato.documento, /^\d{3}\.\d{3}\.\d{3}-\d{2}$/);
});

test('massa: dado existente só quando pedido; ausente vira bloqueio com motivo; nada é criado nem apagado', () => {
  const { sf } = ambiente();
  const plano = { itens: [
    { id: 'MD-001', caso: 'TC-001', ref: 'fila', entidade: 'Group', atributos: { Name: 'Fila Padrao', __existente: true }, quantidade: 1, usar_existente: true },
    { id: 'MD-002', caso: 'TC-002', ref: 'fila', entidade: 'Group', atributos: { Name: 'Fila Inexistente', __existente: true }, quantidade: 1, usar_existente: true },
  ] };
  const r = prepararMassa(plano, { sf, runId: 'r1', org: 'orgx' });
  assert.equal(r.log.encontrados.length, 1); assert.equal(r.log.criados.length, 0);
  assert.match(r.log.bloqueados[0].motivo, /não encontrado/); assert.equal(r.log.bloqueados[0].caso, 'TC-002');
  const l = limparMassa(r.log, { sf, org: 'orgx' }); assert.equal(l.limpos.length, 0);     // existente nunca é excluído
});

test('massa: limpeza exclui só o que foi criado; id estranho é barrado pela política', () => {
  const { sf, log } = ambiente();
  const { log: ml } = prepararMassa({ itens: [{ id: 'MD-001', caso: 'TC-001', ref: 'c', entidade: 'Account', atributos: {}, quantidade: 2 }] }, { sf, runId: 'r2', org: 'orgx' });
  const sfLimpeza = makeSf({ org: 'orgx', spawn: ambiente().spawn, createdIds: () => new Set(ml.criados.map((r) => r.id)) });
  const l = limparMassa(ml, { sf: sfLimpeza, org: 'orgx' }); assert.equal(l.limpos.length, 2); assert.equal(l.falhas.length, 0);
  assert.throws(() => sfLimpeza(['data', 'delete', 'record', '--target-org', 'orgx', '--sobject', 'Account', '--record-id', '001ESTRANHO', '--json']), /política/);
  assert.throws(() => sfLimpeza(['project', 'deploy', 'start', '--target-org', 'orgx']), /política/);
});

test('massa: valor inseguro (aspas) é recusado e vira bloqueio, sem chamar o CLI', () => {
  const { sf, log } = ambiente();
  const r = prepararMassa({ itens: [{ id: 'MD-001', caso: 'TC-001', ref: 'c', entidade: 'Account', atributos: { Name: "x' OR '1'='1" }, quantidade: 1 }] }, { sf, runId: 'r3', org: 'orgx' });
  assert.equal(r.log.criados.length, 0); assert.match(r.log.bloqueados[0].motivo, /inseguro/);
  assert.ok(!existsSync(log) || !/create/.test(readFileSync(log, 'utf8')));
});
