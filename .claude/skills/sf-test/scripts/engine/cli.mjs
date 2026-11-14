#!/usr/bin/env node
// CLI do motor (é o que o executor chama): start | massa | begin | observe | act | assert | end | close
//   node cli.mjs start --run <id> [--session s1] [--base-url <url>] [--headed]
//   node cli.mjs act '{"acao":"clicar","alvo":{"papel":"button","nome":"Salvar"}}' --run <id> [--session s1]
// Saída: uma linha JSON no stdout. Exit: 0 ok | 1 comando falhou | 2 não iniciou/login indisponível.
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDir, ensureDir } from '../lib/config.mjs';
import { post } from './client.mjs';

const a = process.argv.slice(2); const cmd = a[0]; const v = (n) => { const i = a.indexOf(n); return i > -1 ? a[i + 1] : undefined; };
const run = v('--run'); const sess = v('--session') || 's1'; if (!cmd || !run) { console.error('Uso: cli.mjs <start|massa|begin|observe|act|assert|end|close> [json] --run <id> [--session s]'); process.exit(1); }
const file = join(runDir(run), `engine-${sess}.json`);
const out = (o, code = 0) => { console.log(JSON.stringify(o)); process.exit(code); };
if (cmd === 'start') {
  if (existsSync(file)) { try { const i = JSON.parse(readFileSync(file, 'utf8')); if (i.port) { await post(i, 'observe', { aria: false }); out({ ok: true, ja_iniciado: true, via: i.via }); } } catch { /* sessão antiga: reinicia */ } }
  ensureDir(runDir(run)); writeFileSync(file, '{}');
  const args = [join(dirname(fileURLToPath(import.meta.url)), 'server.mjs'), '--run', run, '--session', sess, ...(v('--base-url') ? ['--base-url', v('--base-url')] : []), ...(a.includes('--headed') ? ['--headed'] : [])];
  const p = spawn(process.execPath, args, { detached: true, stdio: 'ignore', env: process.env }); p.unref();
  for (let i = 0; i < 150; i++) {                      // até ~30 s
    await new Promise((r) => setTimeout(r, 200));
    try { const info = JSON.parse(readFileSync(file, 'utf8')); if (info.erro) out({ ok: false, codigo: info.codigo, erro: info.erro }, 2); if (info.port) out({ ok: true, via: info.via }); } catch { /* ainda subindo */ }
  }
  out({ ok: false, codigo: 'timeout_ao_iniciar', erro: 'o motor não ficou pronto em 30 s' }, 2);
}
if (!existsSync(file)) out({ ok: false, codigo: 'motor_nao_iniciado', erro: 'rode: cli.mjs start --run <id>' }, 2);
let info; try { info = JSON.parse(readFileSync(file, 'utf8')); } catch { out({ ok: false, codigo: 'motor_ilegivel' }, 2); }
let arg = {};
if (a[1] && !a[1].startsWith('--')) { try { arg = JSON.parse(a[1]); } catch { arg = cmd === 'begin' ? { caso: a[1] } : {}; } }
try { const r = await post(info, cmd, arg); out(r, r.ok === false ? 1 : 0); }
catch (e) { out({ ok: false, codigo: 'motor_indisponivel', erro: String(e.message) }, 2); }
