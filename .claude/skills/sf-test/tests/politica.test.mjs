import { test } from 'node:test';
import assert from 'node:assert/strict';
import politica from '../scripts/politicas/sf-test.mjs';

const ev = (tool_name, tool_input) => ({ tool_name, tool_input, cwd: process.cwd() });
test('política do Odin: a sessão do navegador (.sf-test/auth) não é lida nem editada, nem por shell', () => {
  for (const e of [ev('Read', { file_path: '.sf-test/auth/state.json' }), ev('Edit', { file_path: '.sf-test\\auth\\state.json' }), ev('Bash', { command: 'cat .sf-test/auth/state.json' })])
    assert.equal(politica(e)?.decisao, 'negar');
});
test('política do Odin: leitura normal e shell sem sf passam; entrada vazia não quebra', () => {
  assert.equal(politica(ev('Read', { file_path: 'docs/sdd/BACKLOG.md' })), null);
  assert.equal(politica(ev('Bash', { command: 'node --version' })), null);
  assert.equal(politica(undefined), null);
});
test('política do Odin: sf de produção ou fora da lista é negado', () => {
  assert.equal(politica(ev('Bash', { command: 'sf project deploy start --target-org prod' }))?.decisao, 'negar');
});
