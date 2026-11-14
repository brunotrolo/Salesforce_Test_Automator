import test from 'node:test';
import assert from 'node:assert/strict';
import { tmp } from './helpers.mjs';

const S = '.claude/skills/sf-test/scripts';
const { classificar } = await import(`../${S}/classify.mjs`);
const K = await import(`../${S}/knowledge.mjs`);

const O = (id, classe, autoridade, extra = {}) => ({ id, classe, autoridade, texto: `texto ${id}`, fonte: { arquivo: 'spec.md', linha_de: 1, linha_ate: 1, citacao: 'x' }, ...extra });
const basis = { oracles: [O('O-001', 'aceite', 1), O('O-002', 'aceite', 1, { incerto: true }), O('O-003', 'decisao', 2), O('O-008', 'gap-conhecido', 3), O('O-009', 'decisao', 2)], questions: [{ id: 'Q-001', kind: 'negocio', texto: 'Quem vê o documento completo?' }] };
const caderno = { casos: [] };
const R = (caso, status, extra = {}) => ({ caso, titulo: `t ${caso}`, tipo: 'funcional', prioridade: 'P1', status, oraculos: ['O-001'], gaps_relacionados: [], verificacoes: [{ texto: `esperado ${caso}`, tipo: 'texto-visivel', pass: status === 'verde' ? true : status === 'pendente_juiz' ? null : false, detalhe: 'd' }], achados: [], evidencias: {}, falhas_de_passo: [], ...extra });
const v = (out, caso) => out.casos.find((c) => c.caso === caso);

test('regras: passou, bloqueado, previsto (gap), incerto, sem oráculo e oráculo fraco', () => {
  const out = classificar({ basis, caderno, resultados: [
    R('TC-001', 'verde'), R('TC-002', 'bloqueado', { falhas_de_passo: [{ n: 1, codigo: 'massa_ausente' }] }),
    R('TC-003', 'vermelho', { gaps_relacionados: ['O-008'] }), R('TC-004', 'vermelho', { oraculos: ['O-002'] }),
    R('TC-005', 'vermelho', { oraculos: [] }), R('TC-006', 'vermelho', { oraculos: ['O-008'] })] });
  assert.equal(v(out, 'TC-001').veredito, 'PASSOU'); assert.equal(v(out, 'TC-002').veredito, 'BLOQUEADO'); assert.match(v(out, 'TC-002').motivo, /massa/);
  assert.equal(v(out, 'TC-003').veredito, 'PREVISTO'); assert.match(v(out, 'TC-003').motivo, /O-008/);
  assert.equal(v(out, 'TC-004').veredito, 'A_CONFIRMAR'); assert.match(v(out, 'TC-004').pergunta, /documento completo/);
  assert.equal(v(out, 'TC-005').veredito, 'A_CONFIRMAR'); assert.match(v(out, 'TC-005').motivo, /nenhum oráculo/);
  assert.equal(v(out, 'TC-006').veredito, 'A_CONFIRMAR'); assert.match(v(out, 'TC-006').motivo, /baixa autoridade/);
});

test('bug: precisa reproduzir 2 de 2 e do juiz independente; sem isso nunca vira BUG nem PASSOU', () => {
  const r = [R('TC-010', 'vermelho')];
  let out = classificar({ basis, caderno, resultados: r });
  assert.equal(v(out, 'TC-010').veredito, 'A_CONFIRMAR'); assert.deepEqual(out.precisa_rerun, ['TC-010']);
  const rr = { 'TC-010': R('TC-010', 'vermelho') };
  out = classificar({ basis, caderno, resultados: r, reruns: rr });
  assert.equal(v(out, 'TC-010').veredito, 'A_CONFIRMAR'); assert.match(v(out, 'TC-010').motivo, /juiz/); assert.equal(out.pacotes_juiz.length, 1); assert.equal(out.pacotes_juiz[0].oraculos[0].id, 'O-001');
  out = classificar({ basis, caderno, resultados: r, reruns: rr, juiz: { 'TC-010': { caso: 'TC-010', veredito: 'BUG', motivo: 'a tela contradiz o critério' } } });
  assert.equal(v(out, 'TC-010').veredito, 'BUG'); assert.equal(v(out, 'TC-010').severidade, 'alta'); assert.equal(v(out, 'TC-010').reproduzido, true);
  out = classificar({ basis, caderno, resultados: r, reruns: rr, juiz: { 'TC-010': { caso: 'TC-010', veredito: 'A_CONFIRMAR', motivo: 'ambíguo', pergunta: 'Qual é o certo?' } } });
  assert.equal(v(out, 'TC-010').veredito, 'A_CONFIRMAR'); assert.equal(v(out, 'TC-010').pergunta, 'Qual é o certo?');
  out = classificar({ basis, caderno, resultados: r, reruns: rr, juiz: { 'TC-010': { caso: 'TC-010', veredito: 'PASSOU', motivo: 'ok' } } });
  assert.equal(v(out, 'TC-010').veredito, 'A_CONFIRMAR'); assert.match(v(out, 'TC-010').motivo, /mal formulado/);
  out = classificar({ basis, caderno, resultados: r, reruns: { 'TC-010': R('TC-010', 'verde') } });
  assert.equal(v(out, 'TC-010').veredito, 'INSTAVEL');
});

test('semântica: sem juiz fica A_CONFIRMAR (not run); com juiz vale o juiz', () => {
  const r = [R('TC-020', 'pendente_juiz')];
  let out = classificar({ basis, caderno, resultados: r }); assert.equal(v(out, 'TC-020').veredito, 'A_CONFIRMAR'); assert.match(v(out, 'TC-020').motivo, /not run/); assert.equal(out.pacotes_juiz.length, 1);
  out = classificar({ basis, caderno, resultados: r, juiz: { 'TC-020': { caso: 'TC-020', veredito: 'PASSOU', motivo: 'a tela mostra o esperado' } } }); assert.equal(v(out, 'TC-020').veredito, 'PASSOU');
});

test('decisão do dev é a única forma de virar previsto/bug por conta própria; precedentes só anotam', () => {
  const cwd = tmp(); process.env.SFT_DIR = cwd;
  try {
    const r = [R('TC-030', 'vermelho')]; const base = classificar({ basis, caderno, resultados: r }); const imp = v(base, 'TC-030').impressao;
    K.decidir(imp, 'previsto', { motivo: 'limitação aceita' });
    let out = classificar({ basis, caderno, resultados: r, decisoes: K.lerDecisoes() }); assert.equal(v(out, 'TC-030').veredito, 'PREVISTO'); assert.match(v(out, 'TC-030').motivo, /decisão registrada/);
    K.decidir(imp, 'bug'); out = classificar({ basis, caderno, resultados: r, decisoes: K.lerDecisoes() }); assert.equal(v(out, 'TC-030').veredito, 'BUG');
    assert.throws(() => K.decidir(imp, 'talvez'), /bug, previsto ou mudanca/);
    K.registrarPrecedentes('r1', [{ impressao: imp, veredito: 'BUG' }]); assert.equal(K.lerPrecedentes()[imp].vezes, 1);
  } finally { delete process.env.SFT_DIR; }
});

test('invariantes técnicas: uma ocorrência pede reexecução; repetida (casos ou reexecução) é BUG com severidade', () => {
  const ach = [{ inv: 'INV-001', evidencia: 'An unexpected error occurred. Error ID: 4711', passo: 5 }];
  let out = classificar({ basis, caderno, resultados: [R('TC-040', 'verde', { achados: ach })] });
  assert.equal(out.tecnicos[0].veredito, 'A_CONFIRMAR'); assert.deepEqual(out.precisa_rerun, ['TC-040']);
  out = classificar({ basis, caderno, resultados: [R('TC-040', 'verde', { achados: ach }), R('TC-041', 'verde', { achados: [{ ...ach[0], evidencia: 'An unexpected error occurred. Error ID: 9999' }] })] });
  assert.equal(out.tecnicos.length, 1); assert.equal(out.tecnicos[0].veredito, 'BUG'); assert.equal(out.tecnicos[0].severidade, 'alta'); assert.deepEqual(out.tecnicos[0].casos.sort(), ['TC-040', 'TC-041']);
  out = classificar({ basis, caderno, resultados: [R('TC-040', 'verde', { achados: ach })], reruns: { 'TC-040': R('TC-040', 'verde', { achados: ach }) } });
  assert.equal(out.tecnicos[0].veredito, 'BUG'); assert.equal(out.tecnicos[0].reproduzido, true);
});

// ---- relatório e gate
const { montarRelatorio, bugMd } = await import(`../${S}/report.mjs`);
const caderno2 = { capacidade: '001-intake', casos: [{ id: 'TC-010', passos: [{ n: 1, acao: 'abrir' }, { n: 2, acao: 'salvar' }], esperado: [{ texto: 'A tela exige a descrição' }] }] };
const cls = (extra) => ({ casos: [], tecnicos: [], resumo: { total: 0 }, precisa_rerun: [], ...extra });
const basis2 = { base_forte: true, oracles: [O('O-001', 'aceite', 1), O('O-005', 'aceite', 1)] };

test('relatório: cabe numa tela, destaca bug com fonte, e a pergunta de negócio aparece', () => {
  const casos = [{ caso: 'TC-010', titulo: 'Alta sem descrição', prioridade: 'P1', veredito: 'BUG', severidade: 'alta', motivo: 'a tela salvou sem exigir a descrição', oraculos: ['O-001'], evidencias: { png: 'evidence/TC-010.png' } },
    { caso: 'TC-011', veredito: 'A_CONFIRMAR', prioridade: 'P2', pergunta: 'Quem pode ver o documento completo?', oraculos: [] }, { caso: 'TC-012', veredito: 'PASSOU', prioridade: 'P1', oraculos: ['O-005'] },
    { caso: 'TC-013', veredito: 'PREVISTO', prioridade: 'P2', oraculos: [] }];
  const r = montarRelatorio({ run: 'r1', classificacao: cls({ casos, resumo: { total: 4, passou: 1 }, tecnicos: [{ inv: 'INV-001', evidencia: 'An unexpected error occurred', veredito: 'BUG', severidade: 'alta', casos: ['TC-012'], motivo: 'invariante INV-001 violada (vista 2×)' }] }), caderno: caderno2, basis: basis2, data: '2026-11-14' });
  assert.ok(r.md.split('\n').length <= 40); assert.match(r.md, /REPROVADO/); assert.match(r.md, /BUG-001/); assert.match(r.md, /BUG-002/); assert.match(r.md, /spec\.md:1/); assert.match(r.md, /Quem pode ver o documento completo/);
  assert.equal(r.json.cobertura.resolvidos, 1); assert.equal(r.json.cobertura.exigidos, 2);
  const md = bugMd(r.bugs[0], { caderno: caderno2, basis: basis2 }); assert.match(md, /Como reproduzir/); assert.match(md, /1\. abrir/); assert.match(md, /A tela exige a descrição/);
});

test('gate: aprovado, aprovado com pendências, não concluído (P1 bloqueado ou nada executado) e reprovado', () => {
  const g = (casos, tecnicos = []) => montarRelatorio({ run: 'r', classificacao: cls({ casos, tecnicos }), caderno: caderno2, basis: basis2 }).gate;
  const P = (id, veredito, prioridade = 'P1') => ({ caso: id, veredito, prioridade, oraculos: [] });
  assert.equal(g([P('a', 'PASSOU'), P('b', 'PREVISTO')]), 'APROVADO');
  assert.equal(g([P('a', 'PASSOU'), P('b', 'A_CONFIRMAR', 'P2')]), 'APROVADO_COM_PENDENCIAS');
  assert.equal(g([P('a', 'PASSOU'), P('b', 'BLOQUEADO')]), 'NAO_CONCLUIDO'); assert.equal(g([]), 'NAO_CONCLUIDO');
  assert.equal(g([P('a', 'PASSOU')], [{ inv: 'INV-004', evidencia: 'x', veredito: 'BUG', severidade: 'media', casos: ['a'], motivo: 'm' }]), 'REPROVADO');
});

// ---- mudança não documentada
const { candidatosMudanca } = await import(`../${S}/classify.mjs`);
const basisM = { oracles: [O('O-001', 'aceite', 1, { origem: 'spec', texto: 'A tela mostra a mensagem "Informe o assunto"' }),
  O('O-020', 'pr', 2, { origem: 'pr', texto: 'A mensagem de assunto vazio agora é "Assunto obrigatório"' }),
  O('O-021', 'validacao', 2, { origem: 'metadados', texto: 'Regra de validação X', mensagem: 'Campo descrição é exigido' }),
  O('O-022', 'commit', 3, { origem: 'commit', texto: 'ajusta o cálculo do limite' }), O('O-023', 'gap-conhecido', 3, { origem: 'build-report', texto: 'Assunto obrigatório não tratado' })], questions: [] };
const RM = (extra) => R('TC-050', 'vermelho', { oraculos: ['O-001'], ...extra });

test('candidatos de mudança: citação literal, mensagem da regra de validação; ignora spec, gap e o que não aparece na tela', () => {
  const c1 = candidatosMudanca(basisM, 'Assunto obrigatório', ['O-001']); assert.deepEqual(c1.map((x) => x.id), ['O-020']);
  assert.equal(candidatosMudanca(basisM, 'Campo descrição é exigido para prioridade Alta', ['O-001'])[0].id, 'O-021');
  assert.deepEqual(candidatosMudanca({ oracles: [O('O-030', 'campo', 2, { origem: 'metadados', texto: 'Campo "Prioridade" é obrigatório' }), O('O-031', 'pr', 2, { origem: 'pr', texto: 'O campo "Prioridade" passa a ser a primeira coluna' })] }, 'Prioridade Assunto Salvar', []), []);   // nome de campo não é evidência
  assert.deepEqual(candidatosMudanca(basisM, 'Informe o assunto', ['O-001']), []);
  assert.deepEqual(candidatosMudanca(basisM, '', []), []);
});

test('mudança não documentada: só com reprodução + evidência recente + juiz; sem evidência o juiz não consegue alegar', () => {
  const r = [RM()]; const rr = { 'TC-050': RM() }; const obs = { 'TC-050': 'Assunto obrigatório' };
  let out = classificar({ basis: basisM, caderno, resultados: r, reruns: rr, observado: obs });
  assert.equal(v(out, 'TC-050').veredito, 'A_CONFIRMAR'); assert.match(v(out, 'TC-050').motivo, /possível mudança não documentada \(O-020\)/);
  assert.equal(out.pacotes_juiz[0].evidencias_de_mudanca[0].id, 'O-020');
  const j = { 'TC-050': { caso: 'TC-050', veredito: 'MUDANCA_NAO_DOCUMENTADA', motivo: 'a tela segue o PR (O-020), não a spec (O-001)' } };
  out = classificar({ basis: basisM, caderno, resultados: r, reruns: rr, observado: obs, juiz: j });
  const c = v(out, 'TC-050'); assert.equal(c.veredito, 'MUDANCA_NAO_DOCUMENTADA'); assert.equal(c.evidencia_mudanca[0].id, 'O-020'); assert.equal(c.spec_a_atualizar.oraculo, 'O-001'); assert.equal(out.resumo.mudanca_nao_documentada, 1);
  out = classificar({ basis: basisM, caderno, resultados: r, reruns: rr, observado: { 'TC-050': 'qualquer outra coisa' }, juiz: j });
  assert.equal(v(out, 'TC-050').veredito, 'A_CONFIRMAR'); assert.match(v(out, 'TC-050').motivo, /não há evidência mais recente/);
  out = classificar({ basis: basisM, caderno, resultados: r, reruns: rr, observado: { 'TC-050': 'qualquer outra coisa' }, juiz: { 'TC-050': { caso: 'TC-050', veredito: 'BUG', motivo: 'contradiz O-001' } } });
  assert.equal(v(out, 'TC-050').veredito, 'BUG');                                               // sem evidência de mudança segue sendo bug
});

test('decisão do dev "mudanca" e o relatório: gate com pendência, seção própria e próximo passo', () => {
  const cwd = tmp(); process.env.SFT_DIR = cwd;
  try {
    const base = classificar({ basis: basisM, caderno, resultados: [RM()] }); const imp = v(base, 'TC-050').impressao;
    K.decidir(imp, 'mudanca'); const out = classificar({ basis: basisM, caderno, resultados: [RM()], decisoes: K.lerDecisoes() });
    assert.equal(v(out, 'TC-050').veredito, 'MUDANCA_NAO_DOCUMENTADA');
    const casos = [{ caso: 'TC-050', titulo: 't', prioridade: 'P2', veredito: 'MUDANCA_NAO_DOCUMENTADA', oraculos: ['O-001'], evidencia_mudanca: [{ id: 'O-020', origem: 'pr' }], spec_a_atualizar: { oraculo: 'O-001', fonte: { arquivo: 'spec.md', linha_de: 7 } } }, { caso: 'TC-051', veredito: 'PASSOU', prioridade: 'P1', oraculos: [] }];
    const rel = montarRelatorio({ run: 'm', classificacao: cls({ casos, resumo: { total: 2 } }), caderno: caderno2, basis: basis2 });
    assert.equal(rel.gate, 'APROVADO_COM_PENDENCIAS'); assert.match(rel.md, /Mudança não documentada/); assert.match(rel.md, /O-020/); assert.match(rel.md, /spec\.md:7/); assert.match(rel.md, /Atualizar a especificação/); assert.equal(rel.json.mudancas_nao_documentadas.length, 1);
  } finally { delete process.env.SFT_DIR; }
});
