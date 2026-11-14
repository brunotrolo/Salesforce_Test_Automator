import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmp } from './helpers.mjs';

const { mergeSettings, instalar } = await import('../install.mjs');
const ORIGEM = resolve('.');
const rd = (p) => JSON.parse(readFileSync(p, 'utf8'));

test('mescla: mantém os hooks e permissões do projeto, acrescenta os nossos e não duplica', () => {
  const dest = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node guard-deploy.mjs' }] }] }, permissions: { allow: ['Bash(sf data query:*)'], deny: ['Read(./.env)'] } };
  const src = rd(join(ORIGEM, '.claude/settings.json'));
  const { settings, mudou } = mergeSettings(dest, src); assert.equal(mudou, true);
  const cmds = settings.hooks.PreToolUse.flatMap((g) => g.hooks.map((h) => h.command));
  assert.ok(cmds.includes('node guard-deploy.mjs')); assert.ok(cmds.some((c) => /guard-qa\.mjs/.test(c)));
  assert.equal(settings.permissions.allow.filter((x) => x === 'Bash(sf data query:*)').length, 1);
  assert.equal(mergeSettings(settings, src).mudou, false);                 // 2ª vez: nada muda
});

test('instalar: copia .claude, cria settings, acrescenta .gitignore, é idempotente e não toca em arquivos seus', () => {
  const proj = tmp('proj-'); mkdirSync(join(proj, '.claude/agents'), { recursive: true }); writeFileSync(join(proj, '.claude/agents/meu-agente.md'), 'meu');
  writeFileSync(join(proj, '.gitignore'), 'node_modules/\n');
  const r1 = instalar({ origem: ORIGEM, destino: proj, log: () => {} });
  assert.ok(existsSync(join(proj, '.claude/skills/sf-test/SKILL.md'))); assert.ok(existsSync(join(proj, '.claude/agents/sf-qa-judge.md')));
  assert.equal(readFileSync(join(proj, '.claude/agents/meu-agente.md'), 'utf8'), 'meu');
  assert.equal(r1.acoes.settings, 'criado'); assert.match(readFileSync(join(proj, '.gitignore'), 'utf8'), /node_modules\/\n\.sf-test\//);
  assert.ok(r1.avisos.some((a) => /specs/.test(a)));
  const r2 = instalar({ origem: ORIGEM, destino: proj, log: () => {} });
  assert.equal(r2.acoes.settings, 'sem mudança'); assert.deepEqual(r2.acoes.gitignore, []);
});

test('instalar: settings existente é mesclado com cópia .anterior; ilegível vira settings.json.novo', () => {
  const proj = tmp('proj-'); mkdirSync(join(proj, '.claude'), { recursive: true });
  writeFileSync(join(proj, '.claude/settings.json'), JSON.stringify({ permissions: { deny: ['Bash(rm -rf:*)'] } }));
  const r = instalar({ origem: ORIGEM, destino: proj, log: () => {} }); assert.match(r.acoes.settings, /mesclado/);
  assert.ok(existsSync(join(proj, '.claude/settings.json.anterior'))); assert.ok(rd(join(proj, '.claude/settings.json')).permissions.deny.includes('Bash(rm -rf:*)'));
  const p2 = tmp('proj-'); mkdirSync(join(p2, '.claude'), { recursive: true }); writeFileSync(join(p2, '.claude/settings.json'), '{ quebrado');
  const r2 = instalar({ origem: ORIGEM, destino: p2, log: () => {} }); assert.match(r2.acoes.settings, /ILEGÍVEL/); assert.ok(existsSync(join(p2, '.claude/settings.json.novo')));
  assert.equal(readFileSync(join(p2, '.claude/settings.json'), 'utf8'), '{ quebrado');
});

test('instalar: recusa rodar dentro do próprio repositório; CLI e --dry-run funcionam', () => {
  assert.throws(() => instalar({ origem: ORIGEM, destino: ORIGEM }), /SEU projeto/);
  const proj = tmp('proj-');
  const r = spawnSync('node', [join(ORIGEM, 'install.mjs'), '--dry-run', proj], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /simulação/); assert.ok(!existsSync(join(proj, '.claude')));
  const r2 = spawnSync('node', [join(ORIGEM, 'install.mjs'), proj], { encoding: 'utf8' }); assert.equal(r2.status, 0, r2.stderr); assert.match(r2.stdout, /Próximos passos/); assert.ok(existsSync(join(proj, '.claude/skills/sf-test/scripts/guard-qa.mjs')));
});
