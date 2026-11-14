import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { startFixture } from './fixture-app/server.mjs';
import { tmp } from './helpers.mjs';

process.env.SFT_ALLOW_LOCAL = '1';
const S = '.claude/skills/sf-test/scripts';
const { Engine } = await import(`../${S}/engine/engine.mjs`);
const J = await import(`../${S}/journeys.mjs`);
const { concluirCaso, executarReplay, montarResultado } = await import(`../${S}/executar.mjs`);
let fx; before(async () => { fx = await startFixture(); }); after(async () => { await fx.close(); });

const CAP = '001-intake-de-caso';
const casoFeliz = { id: 'TC-001', titulo: 'Salvar caso mostra o número', tipo: 'funcional', prioridade: 'P1', oraculos: ['O-001'], passos: [{ n: 1, acao: 'abrir' }], esperado: [{ texto: 'O número do caso aparece', verificacao: { tipo: 'texto-visivel', valor: 'Número do caso' } }] };
const casoAlta = { id: 'TC-003', titulo: 'Alta sem descrição é recusada', tipo: 'negativo', prioridade: 'P2', oraculos: ['O-003'], passos: [{ n: 1, acao: 'abrir' }], esperado: [{ texto: 'A tela exige a descrição', verificacao: { tipo: 'texto-visivel', valor: 'Descrição obrigatória para prioridade Alta' } }] };
const caderno = { schema: '1.0', capacidade: CAP, casos: [casoFeliz, casoAlta] };

const acts = (btn = 'Salvar', prio = 'Baixa') => [
  { acao: 'ir', url: '/' }, { acao: 'clicar', alvo: { papel: 'button', nome: 'Novo caso' } },
  { acao: 'preencher', alvo: { rotulo: 'Assunto' }, valor: 'Falha na fatura' }, { acao: 'selecionar', alvo: { rotulo: 'Prioridade' }, valor: prio },
  { acao: 'clicar', alvo: { papel: 'button', nome: btn } },
];
const motor = async (cwd) => { const e = new Engine({ runDir: join(cwd, 'run'), baseUrl: fx.url, cwd }); await e.start(); return e; };
async function aprender(e, caso, lista, cwd, via = 'aprendizado') {
  await e.begin(caso.id); for (const a of lista) { const r = await e.act(a); if (!r.ok) throw new Error(`${a.acao}: ${r.erro}`); }
  return concluirCaso({ motor: e, caso, capacidade: CAP, via, runPath: join(cwd, 'run'), cwd });
}

test('aprender: o agente executa uma vez, o resultado nasce das asserções e a jornada é compilada', async () => {
  fx.setFlags({}); const cwd = tmp(); const e = await motor(cwd);
  const r = await aprender(e, casoFeliz, acts(), cwd); await e.close();
  assert.equal(r.status, 'verde'); assert.equal(r.via, 'aprendizado'); assert.ok(r.jornada.hash);
  const c = J.carregarJornada(CAP, casoFeliz, cwd, 'local'); assert.equal(c.estado, 'ok'); assert.equal(c.jornada.passos.length, 5);
  assert.ok(existsSync(join(cwd, 'run', 'resultados', 'TC-001.json')));
});

test('replay: reproduz sem modelo, conta verdes seguidos e promove após 3', async () => {
  fx.setFlags({}); const cwd = tmp(); let e = await motor(cwd); await aprender(e, casoFeliz, acts(), cwd); await e.close();
  for (let i = 0; i < 3; i++) {
    e = await motor(cwd); const r = await executarReplay({ motor: e, caderno: { ...caderno, casos: [casoFeliz] }, capacidade: CAP, runPath: join(cwd, 'run'), cwd }); await e.close();
    assert.equal(r.resultados[0].status, 'verde'); assert.equal(r.resultados[0].via, 'replay'); assert.equal(r.pendentes.length, 0);
  }
  const est = J.lerEstabilidade(CAP, cwd, 'local')['TC-001']; assert.equal(est.promovida, true); assert.ok(est.verdes_seguidos >= 3);
});

test('bug de negócio: a jornada aprendida num app correto reprova no app com a regra quebrada (vermelho, não bloqueado)', async () => {
  fx.setFlags({}); const cwd = tmp(); let e = await motor(cwd);
  const r0 = await aprender(e, casoAlta, [{ acao: 'ir', url: '/' }, { acao: 'clicar', alvo: { papel: 'button', nome: 'Novo caso' } }, { acao: 'preencher', alvo: { rotulo: 'Assunto' }, valor: 'Falha' }, { acao: 'selecionar', alvo: { rotulo: 'Prioridade' }, valor: 'Alta' }, { acao: 'clicar', alvo: { papel: 'button', nome: 'Salvar' } }], cwd); await e.close();
  assert.equal(r0.status, 'verde');
  fx.setFlags({ bug: 'alta' }); e = await motor(cwd);
  const r = await executarReplay({ motor: e, caderno: { ...caderno, casos: [casoAlta] }, capacidade: CAP, runPath: join(cwd, 'run'), cwd }); await e.close();
  assert.equal(r.resultados[0].status, 'vermelho'); assert.equal(r.resultados[0].verificacoes[0].pass, false); assert.equal(J.lerEstabilidade(CAP, cwd, 'local')['TC-003'].verdes_seguidos, 0);
  fx.setFlags({});
});

test('cura: UI mudou (botão renomeado) → replay para no passo, agente continua da tela atual e a jornada é regravada', async () => {
  fx.setFlags({}); const cwd = tmp(); let e = await motor(cwd); await aprender(e, casoFeliz, acts(), cwd); await e.close();
  fx.setFlags({ drift: '1' }); e = await motor(cwd);
  const rep = await executarReplay({ motor: e, caderno: { ...caderno, casos: [casoFeliz] }, capacidade: CAP, runPath: join(cwd, 'run'), cwd }); await e.close();
  assert.equal(rep.resultados.length, 0); assert.equal(rep.pendentes[0].handoff.parou_no_passo, 5); assert.equal(rep.pendentes[0].handoff.codigo, 'alvo_nao_encontrado');
  // o agente: leva a tela até o passo 4 e termina com o rótulo novo
  e = await motor(cwd); const j = J.carregarJornada(CAP, casoFeliz, cwd, 'local').jornada; await e.begin('TC-001');
  for (const p of j.passos.slice(0, 4)) assert.equal((await e.act(p)).ok, true);
  assert.equal((await e.act({ acao: 'clicar', alvo: { papel: 'button', nome: 'Gravar' } })).ok, true);
  const r = await concluirCaso({ motor: e, caso: casoFeliz, capacidade: CAP, via: 'cura', runPath: join(cwd, 'run'), cwd }); await e.close();
  assert.equal(r.status, 'verde'); assert.equal(r.via, 'cura');
  e = await motor(cwd); const again = await executarReplay({ motor: e, caderno: { ...caderno, casos: [casoFeliz] }, capacidade: CAP, runPath: join(cwd, 'run'), cwd }); await e.close();
  assert.equal(again.resultados[0].status, 'verde');       // a jornada nova já usa "Gravar"
  fx.setFlags({});
});

test('jornada obsoleta: caso alterado invalida a jornada; jornada insegura é recusada', async () => {
  fx.setFlags({}); const cwd = tmp(); const e = await motor(cwd); await aprender(e, casoFeliz, acts(), cwd); await e.close();
  const alterado = { ...casoFeliz, esperado: [{ texto: 'outro', verificacao: { tipo: 'texto-visivel', valor: 'Caso criado' } }] };
  assert.equal(J.carregarJornada(CAP, alterado, cwd, 'local').estado, 'obsoleta');
  assert.throws(() => J.salvarJornada({ ...J.carregarJornada(CAP, casoFeliz, cwd, 'local').jornada, passos: [{ acao: 'clicar', alvo: { seletor: '//button' } }] }, cwd), /XPath/);
  assert.throws(() => J.salvarJornada({ ...J.carregarJornada(CAP, casoFeliz, cwd, 'local').jornada, passos: [{ acao: 'ir', url: 'https://evil.example.com' }] }, cwd), /caminho relativo/);
  const m2 = await motor(cwd); const sem = await executarReplay({ motor: m2, caderno: { ...caderno, casos: [alterado] }, capacidade: CAP, runPath: join(cwd, 'run'), cwd }); await m2.close();
  assert.match(sem.pendentes[0].motivo, /obsoleta/);
});

test('resultado bruto: semântica pendente, bloqueio por massa/política e verificação falsa', () => {
  const trace = (passos) => ({ passos, achados: [], evidencias: {}, duracao_ms: 1, spinner_ms: 0 });
  const ok = [{ n: 1, ok: true, acao: 'ir' }];
  const base = { caso: { ...casoFeliz, esperado: [casoFeliz.esperado[0]] } };
  assert.equal(montarResultado({ ...base, trace: trace(ok), verificacoes: [{ pass: true }], via: 'replay' }).status, 'verde');
  assert.equal(montarResultado({ ...base, trace: trace(ok), verificacoes: [{ pass: null }], via: 'replay' }).status, 'pendente_juiz');
  assert.equal(montarResultado({ ...base, trace: trace(ok), verificacoes: [{ pass: false }], via: 'replay' }).status, 'vermelho');
  assert.equal(montarResultado({ ...base, trace: trace([{ n: 1, ok: false, codigo: 'massa_ausente', acao: 'preencher' }]), verificacoes: [{ pass: false }], via: 'aprendizado' }).status, 'bloqueado');
  assert.equal(montarResultado({ ...base, trace: trace([...ok, { n: 2, ok: false, codigo: 'politica', acao: 'clicar' }]), verificacoes: [{ pass: false }], via: 'aprendizado' }).status, 'bloqueado');
});

// ---- ambiente (org): jornadas e sessão separadas; a de outro ambiente só vale como semente
const { ambienteDe, authDir } = await import(`../${S}/lib/config.mjs`);

test('ambiente: id derivado do host (loopback = local); sessão salva fica por ambiente', () => {
  assert.equal(ambienteDe('https://acme--sbx.sandbox.my.salesforce.com/lightning'), 'acme--sbx.sandbox.my.salesforce.com');
  assert.equal(ambienteDe('http://127.0.0.1:3000'), 'local'); assert.equal(ambienteDe('lixo'), 'default');
  assert.match(authDir('/p', 'acme--sbx.sandbox.my.salesforce.com'), /auth[\\/]acme--sbx/); assert.match(authDir('/p'), /auth$/);
});

test('ambiente: jornada é por ambiente; a de outro ambiente vira semente — reproduz, vale se passar e é regravada no novo ambiente', async () => {
  fx.setFlags({}); const cwd = tmp(); let e = await motor(cwd); await aprender(e, casoFeliz, acts(), cwd); await e.close();          // aprendida no ambiente "local"
  assert.equal(J.carregarJornada(CAP, casoFeliz, cwd, 'outra-sandbox').estado, 'ausente');                                      // outro ambiente não enxerga
  const sm = J.sementeDeOutroAmbiente(CAP, casoFeliz, cwd, 'outra-sandbox'); assert.equal(sm.derivada_de, 'local');
  e = await motor(cwd); e.ambiente = 'outra-sandbox';                                                                              // mesma tela, "outra org"
  const r = await executarReplay({ motor: e, caderno: { ...caderno, casos: [casoFeliz] }, capacidade: CAP, runPath: join(cwd, 'run'), cwd }); await e.close();
  assert.equal(r.resultados[0].via, 'replay-semente'); assert.equal(r.resultados[0].status, 'verde');
  const nova = J.carregarJornada(CAP, casoFeliz, cwd, 'outra-sandbox'); assert.equal(nova.estado, 'ok'); assert.equal(nova.jornada.semeada_de, 'local'); assert.equal(J.lerEstabilidade(CAP, cwd, 'outra-sandbox')['TC-001'].verdes_seguidos, 1);
  assert.equal(J.lerEstabilidade(CAP, cwd, 'local')['TC-001'].verdes_seguidos, 1);                                               // contagens independentes
});

test('ambiente: semente que não reproduz na outra org vira pendente (cura), sem marcar verde', async () => {
  fx.setFlags({}); const cwd = tmp(); let e = await motor(cwd); await aprender(e, casoFeliz, acts(), cwd); await e.close();
  fx.setFlags({ drift: '1' }); e = await motor(cwd); e.ambiente = 'outra-sandbox';
  const r = await executarReplay({ motor: e, caderno: { ...caderno, casos: [casoFeliz] }, capacidade: CAP, runPath: join(cwd, 'run'), cwd }); await e.close(); fx.setFlags({});
  assert.equal(r.resultados.length, 0); assert.match(r.pendentes[0].motivo, /outro ambiente \(local\) não reproduziu/); assert.equal(J.carregarJornada(CAP, casoFeliz, cwd, 'outra-sandbox').estado, 'ausente');
});
