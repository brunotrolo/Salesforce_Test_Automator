import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fakeSf, tmp } from './helpers.mjs';

const S = '.claude/skills/sf-test/scripts';
const { urlAllowed, looksProduction, targetProblems, actionAllowed, sfVerdict } = await import(`../${S}/engine/policy.mjs`);
const { runChecks } = await import(`../${S}/preflight.mjs`);
const { decide } = await import(`../${S}/guard-qa.mjs`);
const { findOrgAlias } = await import(`../${S}/lib/config.mjs`);

test('política: só navega para a org e domínios da plataforma; local só nos testes', () => {
  const o = { instanceUrl: 'https://acme--sbx.sandbox.my.salesforce.com', allowLocal: false };
  assert.equal(urlAllowed('https://acme--sbx.sandbox.my.salesforce.com/lightning/page/home', o), true);
  assert.equal(urlAllowed('https://acme--sbx.lightning.force.com/x', o), true);
  assert.equal(urlAllowed('https://evil.example.com/', o), false);
  assert.equal(urlAllowed('http://acme.my.salesforce.com/', o), false);
  assert.equal(urlAllowed('file:///etc/passwd', o), false);
  assert.equal(urlAllowed('http://127.0.0.1:3000/', o), false);
  assert.equal(urlAllowed('http://127.0.0.1:3000/', { ...o, allowLocal: true }), true);
});

test('política: heurística de produção e alvo sem XPath', () => {
  assert.equal(looksProduction('https://acme.my.salesforce.com'), true);
  assert.equal(looksProduction('https://acme--sbx.sandbox.my.salesforce.com'), false);
  assert.equal(looksProduction('https://x.scratch.my.salesforce.com'), false);
  assert.ok(targetProblems({ seletor: '//div' }).some((p) => /XPath/.test(p)));
  assert.ok(targetProblems({ papel: 'button', texto: 'x' }).length > 0);
  assert.deepEqual(targetProblems({ papel: 'button', nome: 'Salvar' }), []);
});

test('política: ação destrutiva só em registro criado pela execução', () => {
  const alvo = { papel: 'button', nome: 'Excluir' };
  assert.equal(actionAllowed({ acao: 'clicar', alvo, recordId: '500AAA' }, { createdIds: new Set() }).allow, false);
  assert.equal(actionAllowed({ acao: 'clicar', alvo, recordId: '500AAA' }, { createdIds: new Set(['500AAA']) }).allow, true);
  assert.equal(actionAllowed({ acao: 'clicar', alvo: { papel: 'button', nome: 'Salvar' } }).allow, true);
});

test('hook sf: lista permitida, org alvo, sem deploy, escrita só em ids criados', () => {
  const o = { targetOrg: 'orgx', createdIds: new Set(['001AAA']) };
  const v = (c) => sfVerdict(c, o).allow;
  assert.equal(v('sf data query --target-org orgx --query "SELECT Id FROM Case" --json'), true);
  assert.equal(v('sf data create record --target-org orgx --sobject Account --values "Name=ZZ_TEST_1"'), true);
  assert.equal(v('sf data query -o outra --query "SELECT Id FROM Case"'), false);
  assert.equal(v('sf data query --query "SELECT Id FROM Case"'), false);
  assert.equal(v('sf project deploy start --target-org orgx'), false);
  assert.equal(v('sf apex run --target-org orgx -f x.apex'), false);
  assert.equal(v('sf data delete record --target-org orgx --sobject Account --record-id 001ZZZ'), false);
  assert.equal(v('sf data delete record --target-org orgx --sobject Account --record-id 001AAA'), true);
  assert.equal(v('sf org open --target-org orgx'), false);
  assert.equal(v('sf org open --target-org orgx --url-only --json'), true);
  assert.equal(v('sf org login web'), false);
  assert.equal(v('echo ok && sf project deploy start -o orgx'), false);
  assert.equal(sfVerdict('sf data query --target-org orgx --query "x"', { targetOrg: '' }).allow, false);
});

test('preflight: org sandbox autenticada passa; produção, sem auth e sem info são recusadas', async () => {
  const run = async (cenario, extra = {}) => {
    const f = fakeSf(cenario); const cwd = tmp();
    return runChecks({ cwd, env: { ...f.env, SF_TARGET_ORG: 'orgx', ...extra }, browser: false, spawn: (c, a, op) => spawnSync(c, a, { ...op, env: f.env }) });
  };
  const ok = await run('ok');
  assert.equal(ok.checks.find((c) => c.id === 'sandbox').status, 'ok'); assert.ok(ok.login.includes('sf-cli'));
  const prod = await run('prod'); assert.equal(prod.ok, false); assert.match(prod.checks.find((c) => c.id === 'sandbox').msg, /PRODUÇÃO/);
  const na = await run('naoauth'); assert.equal(na.ok, false); assert.match(na.checks.find((c) => c.id === 'org').fix, /sf org login/);
  const si = await run('semsandboxinfo'); assert.match(si.checks.find((c) => c.id === 'sandbox').msg, /fail-closed/);
  const sem = await (async () => { const f = fakeSf('ok'); const env = { ...f.env }; delete env.SF_TARGET_ORG; return runChecks({ cwd: tmp(), env, browser: false, spawn: (c, a, op) => spawnSync(c, a, { ...op, env: f.env }) }); })();
  assert.equal(sem.ok, false); assert.match(sem.checks.find((c) => c.id === 'org').msg, /não definida/);
});

test('preflight: login por sessão salva quando o CLI não serve; alias do projeto é lido sem hardcode', async () => {
  const f = fakeSf('naoauth'); const cwd = tmp();
  mkdirSync(join(cwd, '.sf-test', 'auth'), { recursive: true }); writeFileSync(join(cwd, '.sf-test', 'auth', 'estado.json'), '{}');
  mkdirSync(join(cwd, '.sf'), { recursive: true }); writeFileSync(join(cwd, '.sf', 'config.json'), JSON.stringify({ 'target-org': 'doprojeto' }));
  assert.equal(findOrgAlias(cwd, {}).alias, 'doprojeto');
  const r = await runChecks({ cwd, env: f.env, browser: false, spawn: (c, a, op) => spawnSync(c, a, { ...op, env: f.env }) });
  assert.ok(r.login.includes('sessao-salva'));
});

test('hook guard-qa: nega sessão do navegador, sf fora da lista; deixa o resto passar', () => {
  process.env.SF_TARGET_ORG = 'orgx';
  assert.equal(decide('Read', { file_path: '/p/.sf-test/auth/estado.json' }).allow, false);
  assert.equal(decide('Bash', { command: 'cat .sf-test/auth/estado.json' }).allow, false);
  assert.equal(decide('Bash', { command: 'sf project deploy start -o orgx' }, tmp()).allow, false);
  assert.equal(decide('Bash', { command: 'ls -la' }).allow, true);
  assert.equal(decide('Read', { file_path: '/p/specs/x/spec.md' }).allow, true);
  delete process.env.SF_TARGET_ORG;
});

test('hook via stdin: devolve decisão de negação em JSON; JSON inválido não quebra', () => {
  const run = (input) => spawnSync('node', [`${S}/guard-qa.mjs`], { input, encoding: 'utf8', env: { ...process.env, SF_TARGET_ORG: 'orgx' } });
  const r = run(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'sf org login web' }, cwd: tmp() }));
  assert.match(r.stdout, /"permissionDecision":"deny"/);
  assert.equal(run('{nao json').stdout, '');
});
