// Avaliação de fim a fim com BUGS PLANTADOS: o mesmo QA (basis → caderno → execução → classificação → juiz → relatório)
// contra a app de teste. Critério: veredito certo em cada caso, zero falso positivo no caminho limpo, replay sem agente.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { startFixture } from './fixture-app/server.mjs';
import { tmp } from './helpers.mjs';

process.env.SFT_ALLOW_LOCAL = '1';
const S = '.claude/skills/sf-test/scripts';
const { Engine } = await import(`../${S}/engine/engine.mjs`);
const { buildBasis } = await import(`../${S}/build-basis.mjs`);
const { checkCaderno } = await import(`../${S}/validate-caderno.mjs`);
const { concluirCaso, executarReplay } = await import(`../${S}/executar.mjs`);
const { classificar } = await import(`../${S}/classify.mjs`);
const { montarRelatorio } = await import(`../${S}/report.mjs`);
let fx; before(async () => { fx = await startFixture(); }); after(async () => { await fx.close(); });

const ROOT = resolve('tests/fixtures/projeto'); const CAP = '001-intake-de-caso';
const { basis } = buildBasis({ spec: join(ROOT, 'specs/atendimento', CAP), discovery: join(ROOT, 'discovery/R01/backlog.json') }, ROOT);
const oid = (re) => basis.oracles.find((o) => re.test(o.texto)).id;
const O = { salvar: oid(/salva o caso com assunto/), assunto: oid(/mensagem "Informe o assunto"/), alta: oid(/Prioridade Alta exige/), limite: oid(/255 caracteres/), gap: oid(/não é preenchida automaticamente/) };

const NOVO = { acao: 'clicar', alvo: { papel: 'button', nome: 'Novo caso' } };
const SALVAR = { acao: 'clicar', alvo: { papel: 'button', nome: 'Salvar' } };
const f = (rot, valor) => ({ acao: 'preencher', alvo: { rotulo: rot }, valor });
const prio = (p) => ({ acao: 'selecionar', alvo: { rotulo: 'Prioridade' }, valor: p });
const ABRIR = [{ acao: 'ir', url: '/' }, NOVO];
const ACTS = {
  'TC-001': [...ABRIR, f('Assunto', 'Falha na fatura'), prio('Baixa'), SALVAR],
  'TC-002': [...ABRIR, f('Assunto', ' '), SALVAR],
  'TC-003': [...ABRIR, f('Assunto', 'Falha'), prio('Alta'), SALVAR],
  'TC-004': [...ABRIR, f('Assunto', 'x'.repeat(256)), SALVAR],
  'TC-006': [...ABRIR],
  'TC-007': [...ABRIR, f('Assunto', 'Cobrança duplicada'), SALVAR],
};
const caso = (id, titulo, tipo, prioridade, oraculos, esperado, extra = {}) => ({ id, titulo, tipo, prioridade, oraculos, passos: [{ n: 1, acao: 'abrir o novo caso' }, { n: 2, acao: 'executar o cenário' }], esperado, ...extra });
const tv = (valor) => ({ tipo: 'texto-visivel', valor });
const CADERNO = { schema: '1.0', capacidade: CAP, casos: [
  caso('TC-001', 'Salvar caso mostra o número do caso', 'funcional', 'P1', [O.salvar], [{ texto: 'O número do caso aparece', verificacao: tv('Número do caso') }]),
  caso('TC-002', 'Salvar sem assunto mostra a mensagem', 'negativo', 'P1', [O.assunto], [{ texto: 'A tela mostra "Informe o assunto"', verificacao: tv('Informe o assunto') }]),
  caso('TC-003', 'Alta sem descrição é recusada', 'negativo', 'P1', [O.alta], [{ texto: 'A tela exige a descrição', verificacao: tv('Descrição obrigatória para prioridade Alta') }]),
  caso('TC-004', 'Assunto com 256 caracteres é recusado', 'limite', 'P2', [O.limite], [{ texto: 'A tela recusa o assunto longo', verificacao: tv('Assunto muito longo') }]),
  caso('TC-006', 'Prioridade vem preenchida pelo segmento do cliente', 'funcional', 'P3', [O.salvar], [{ texto: 'A prioridade é "Alta" para o cliente Premium', verificacao: { tipo: 'valor-campo', alvo: { rotulo: 'Prioridade' }, valor: 'Alta' } }], { gaps_relacionados: [O.gap] }),
  caso('TC-007', 'Nenhum banner inesperado após salvar', 'exploratorio', 'P3', [], [{ texto: 'Não aparece o banner "Atendimento marcado como VIP"', verificacao: { tipo: 'texto-ausente', valor: 'Atendimento marcado como VIP' } }]),
] };

async function motor(cwd, run) { const e = new Engine({ runDir: run, baseUrl: fx.url, cwd, limiteAssentarMs: 1500 }); await e.start(); return e; }
async function aprender(cwd, run, ids = Object.keys(ACTS), sufixo = '') {
  const e = await motor(cwd, run); const feitos = [];
  for (const id of ids) { const c = CADERNO.casos.find((x) => x.id === id); await e.begin(id); let n = 0; for (const a of ACTS[id]) { await e.act(a); n++; } feitos.push({ id, acts: n }); await concluirCaso({ motor: e, caso: c, capacidade: CAP, via: 'aprendizado', runPath: run, cwd, sufixo }); }
  await e.close(); return feitos;
}
const ler = (run, ext) => readdirSync(join(run, 'resultados')).filter((n) => (ext ? n.endsWith('.rerun.json') : n.endsWith('.json') && !n.includes('.rerun'))).map((n) => JSON.parse(readFileSync(join(run, 'resultados', n), 'utf8')));
const juizSimulado = (c) => (c.pacotes_juiz ?? []).reduce((m, p) => { m[p.caso] = { caso: p.caso, veredito: p.oraculos.some((o) => /Prioridade Alta exige/.test(o.texto)) ? 'BUG' : 'A_CONFIRMAR', motivo: 'a tela salvou sem exigir a descrição, contra o oráculo citado', pergunta: 'confirmar' }; return m; }, {});

test('o caderno de avaliação é válido e cobre os critérios da base', () => {
  const r = checkCaderno(CADERNO, basis); assert.deepEqual(r.errors.filter((e) => !/cobertura/.test(e)), []);
});

test('cenário A (bugs plantados): BUG de negócio, PREVISTO por gap, A_CONFIRMAR sem oráculo, e o resto passa', async () => {
  fx.setFlags({ bug: 'alta', odd: '1' }); const cwd = tmp(); const run = join(cwd, 'run'); mkdirSync(join(run, 'resultados'), { recursive: true });
  await aprender(cwd, run);
  let cls = classificar({ basis, caderno: CADERNO, resultados: ler(run) });
  assert.deepEqual(cls.precisa_rerun, ['TC-003']);                                          // bug candidato pede reprodução
  await aprender(cwd, run, ['TC-003'], '.rerun');                                           // reexecução de confirmação
  const reruns = Object.fromEntries(ler(run, true).map((r) => [r.caso, r]));
  cls = classificar({ basis, caderno: CADERNO, resultados: ler(run), reruns }); assert.equal(cls.casos.find((c) => c.caso === 'TC-003').veredito, 'A_CONFIRMAR');   // ainda falta o juiz
  cls = classificar({ basis, caderno: CADERNO, resultados: ler(run), reruns, juiz: juizSimulado(cls) });
  const v = Object.fromEntries(cls.casos.map((c) => [c.caso, c.veredito]));
  assert.deepEqual(v, { 'TC-001': 'PASSOU', 'TC-002': 'PASSOU', 'TC-003': 'BUG', 'TC-004': 'PASSOU', 'TC-006': 'PREVISTO', 'TC-007': 'A_CONFIRMAR' });
  const rel = montarRelatorio({ run: 'A', classificacao: cls, caderno: CADERNO, basis });
  assert.equal(rel.gate, 'REPROVADO'); assert.ok(rel.md.split('\n').length <= 40, `${rel.md.split('\n').length} linhas`); assert.match(rel.md, /BUG-001/); assert.match(rel.md, /ℹ️ Previstos.*TC-006/); assert.match(rel.md, /TC-007/);
  assert.equal(cls.tecnicos.filter((t) => t.veredito === 'BUG').length, 0);                // bug de negócio não vira defeito técnico
});

test('cenário B (erro Apex/Flow não tratado): defeito técnico confirmado por reexecução, mesmo com o caso verde', async () => {
  fx.setFlags({ bug: 'erro' }); const cwd = tmp(); const run = join(cwd, 'run'); mkdirSync(join(run, 'resultados'), { recursive: true });
  await aprender(cwd, run, ['TC-001']);
  let cls = classificar({ basis, caderno: CADERNO, resultados: ler(run) });
  assert.equal(cls.casos[0].veredito, 'PASSOU'); assert.equal(cls.tecnicos[0].inv, 'INV-001'); assert.equal(cls.tecnicos[0].veredito, 'A_CONFIRMAR'); assert.deepEqual(cls.precisa_rerun, ['TC-001']);
  const e = await motor(cwd, run); const rep = await executarReplay({ motor: e, caderno: CADERNO, capacidade: CAP, runPath: run, cwd, soCasos: ['TC-001'], sufixo: '.rerun' }); await e.close();
  assert.equal(rep.resultados[0].via, 'replay');                                            // a reexecução não precisou de agente
  cls = classificar({ basis, caderno: CADERNO, resultados: ler(run), reruns: Object.fromEntries(ler(run, true).map((r) => [r.caso, r])) });
  assert.equal(cls.tecnicos[0].veredito, 'BUG'); assert.equal(cls.tecnicos[0].severidade, 'alta'); assert.equal(montarRelatorio({ run: 'B', classificacao: cls, caderno: CADERNO, basis }).gate, 'REPROVADO');
});

test('cenário C (app correto): zero falso positivo, gate sem bug, e a 2ª execução roda por replay sem agente', async () => {
  fx.setFlags({}); const cwd = tmp(); const run = join(cwd, 'run'); mkdirSync(join(run, 'resultados'), { recursive: true });
  const feitos = await aprender(cwd, run); assert.ok(feitos.every((x) => x.acts > 0));        // 1ª vez: o agente age
  const cls1 = classificar({ basis, caderno: CADERNO, resultados: ler(run) });
  const v1 = Object.fromEntries(cls1.casos.map((c) => [c.caso, c.veredito]));
  assert.deepEqual(v1, { 'TC-001': 'PASSOU', 'TC-002': 'PASSOU', 'TC-003': 'PASSOU', 'TC-004': 'PASSOU', 'TC-006': 'PREVISTO', 'TC-007': 'PASSOU' });
  assert.equal(cls1.tecnicos.length, 0); assert.equal(montarRelatorio({ run: 'C', classificacao: cls1, caderno: CADERNO, basis }).gate, 'APROVADO');
  const e = await motor(cwd, run); const rep = await executarReplay({ motor: e, caderno: CADERNO, capacidade: CAP, runPath: run, cwd }); await e.close();
  assert.ok(rep.resultados.every((r) => r.via === 'replay')); assert.deepEqual(rep.pendentes.map((p) => p.caso), ['TC-006']);   // só o caso que nunca ficou verde precisa do agente
  assert.ok(rep.resultados.filter((r) => r.status === 'verde').length >= 5);
});

// ---- cenário D: a funcionalidade mudou e a especificação não acompanhou
const PR_TXT = `# Mensagem de assunto obrigatório mais clara

## O que mudou
- A mensagem de assunto vazio agora é "Assunto obrigatório"

## Plano de teste
- Salvar sem assunto mostra "Assunto obrigatório"
`;
const juizMudanca = (c) => (c.pacotes_juiz ?? []).reduce((m, p) => { m[p.caso] = p.evidencias_de_mudanca?.length ? { caso: p.caso, veredito: 'MUDANCA_NAO_DOCUMENTADA', motivo: `a tela segue ${p.evidencias_de_mudanca[0].id} (PR), não o oráculo da spec` } : { caso: p.caso, veredito: 'BUG', motivo: 'a tela contradiz o oráculo citado' }; return m; }, {});
const obs = (run) => Object.fromEntries(ler(run).map((r) => { let t = ''; try { t = readFileSync(r.evidencias.aria, 'utf8'); } catch { /* sem evidência */ } return [r.caso, t]; }));
async function rodarD(basisD) {
  fx.setFlags({ msg: 'Assunto obrigatório' }); const cwd = tmp(); const run = join(cwd, 'run'); mkdirSync(join(run, 'resultados'), { recursive: true });
  const cad = { ...CADERNO, casos: CADERNO.casos.filter((c) => c.id === 'TC-002') };
  await aprender(cwd, run, ['TC-002']); await aprender(cwd, run, ['TC-002'], '.rerun');
  const reruns = Object.fromEntries(ler(run, true).map((r) => [r.caso, r])); const observado = obs(run);
  let cls = classificar({ basis: basisD, caderno: cad, resultados: ler(run), reruns, observado });
  cls = classificar({ basis: basisD, caderno: cad, resultados: ler(run), reruns, observado, juiz: juizMudanca(cls) });
  fx.setFlags({}); return { cls, cad };
}

test('cenário D (spec desatualizada): a tela segue o PR, não a spec → MUDANCA_NAO_DOCUMENTADA, não bug; gate com pendência', async () => {
  const { basis: bPr } = buildBasis({ spec: join(ROOT, 'specs/atendimento', CAP), discovery: join(ROOT, 'discovery/R01/backlog.json'), prText: PR_TXT }, ROOT);
  const { cls, cad } = await rodarD(bPr); const c = cls.casos[0];
  assert.equal(c.veredito, 'MUDANCA_NAO_DOCUMENTADA', JSON.stringify(c)); assert.equal(c.evidencia_mudanca[0].origem, 'pr'); assert.match(c.spec_a_atualizar.fonte.arquivo, /spec\.md$/);
  const rel = montarRelatorio({ run: 'D', classificacao: cls, caderno: cad, basis: bPr }); assert.equal(rel.gate, 'APROVADO_COM_PENDENCIAS'); assert.equal(rel.bugs.length, 0); assert.match(rel.md, /Mudança não documentada/);
});

test('cenário D2 (mesma tela, sem PR nem outra evidência): continua sendo BUG — a mudança só é "não documentada" com evidência', async () => {
  const { cls, cad } = await rodarD(basis); assert.equal(cls.casos[0].veredito, 'BUG');
  assert.equal(montarRelatorio({ run: 'D2', classificacao: cls, caderno: cad, basis }).gate, 'REPROVADO');
});
