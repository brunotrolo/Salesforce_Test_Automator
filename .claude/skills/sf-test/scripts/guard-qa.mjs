#!/usr/bin/env node
// Hook PreToolUse do QA. Barreira por código: (1) só comandos `sf` da lista permitida, na org alvo, em sandbox;
// (2) a sessão do navegador (.sf-test/auth) nunca é lida nem editada pelo agente; (3) nada fora da org.
// Erro do próprio hook não bloqueia trabalho legítimo (sai 0 sem decisão).
import { qaDir } from './lib/config.mjs';
import { sfVerdict, sfSegments, createdIdsFrom, latestRunDir } from './engine/policy.mjs';

export function decide(toolName, input = {}, cwd = process.cwd()) {
  const AUTH = /(^|[\\/])\.sf-test[\\/]auth([\\/]|$)/;
  const text = JSON.stringify(input);
  if (['Read', 'Grep', 'Glob', 'Edit', 'Write', 'NotebookEdit'].includes(toolName) && AUTH.test(text.replace(/\\\\/g, '/').replace(/\\/g, '/')))
    return { allow: false, reason: 'A sessão do navegador (.sf-test/auth) contém credenciais: o agente não a lê nem edita.' };
  if (toolName === 'Bash') {
    const cmd = String(input.command ?? '');
    if (/\.sf-test[\\/]auth/.test(cmd) && !/\bnode\s+\S*\/?scripts\/(engine\/)?[\w-]+\.mjs/.test(cmd)) return { allow: false, reason: 'A sessão do navegador (.sf-test/auth) não pode ser lida por comando de shell.' };
    if (sfSegments(cmd).length) {
      const run = process.env.SFT_RUN_DIR || latestRunDir(qaDir(cwd));
      return sfVerdict(cmd, { createdIds: run ? createdIdsFrom(run) : new Set() });
    }
  }
  return { allow: true };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    try {
      const j = JSON.parse(raw);
      const d = decide(j.tool_name || '', j.tool_input || {}, j.cwd || process.cwd());
      if (!d.allow) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: d.reason } }));
    } catch { /* erro do próprio hook: não bloquear */ }
    process.exit(0);
  });
}
