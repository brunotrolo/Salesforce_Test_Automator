#!/usr/bin/env node
// Daemon local do motor (127.0.0.1, token aleatório): mantém UM navegador aberto entre os comandos do executor.
// Uso interno: node server.mjs --run <id> --session <s> [--headed] [--base-url <url>]   (iniciado por cli.mjs start)
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { runDir, ensureDir } from '../lib/config.mjs';
import { criarEngine } from './factory.mjs';

const a = process.argv.slice(2); const v = (n) => { const i = a.indexOf(n); return i > -1 ? a[i + 1] : undefined; };
const run = v('--run'); const sess = v('--session') || 's1'; const dir = ensureDir(runDir(run));
const eng = criarEngine(run, { baseUrl: v('--base-url') ?? null, headless: !a.includes('--headed') });
const file = join(dir, `engine-${sess}.json`); const token = randomBytes(16).toString('hex');

const cmds = {
  begin: (b) => eng.begin(b.caso), observe: (b) => eng.observe(b), act: (b) => eng.act(b), assert: (b) => eng.assert(b),
  end: () => eng.end(), massa: (b) => { eng.setMassa(b); return { ok: true }; },
  close: async () => { setTimeout(async () => { await eng.close(); rmSync(file, { force: true }); process.exit(0); }, 50); return { ok: true }; },
};
try {
  const st = await eng.start();
  const srv = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => (body += c));
    req.on('end', async () => {
      const send = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.headers['x-sft-token'] !== token) return send(401, { ok: false, erro: 'token inválido' });
      const c = cmds[req.url.slice(1)]; if (!c) return send(404, { ok: false, erro: 'comando desconhecido' });
      try { send(200, await c(body ? JSON.parse(body) : {})); } catch (e) { send(200, { ok: false, codigo: e.codigo || 'erro', erro: String(e.message).slice(0, 300) }); }
    });
  });
  srv.listen(0, '127.0.0.1', () => { writeFileSync(file, JSON.stringify({ port: srv.address().port, token, pid: process.pid, via: st.via }), { mode: 0o600 }); });
  const sair = async () => { await eng.close(); rmSync(file, { force: true }); process.exit(0); };
  process.on('SIGTERM', sair); process.on('SIGINT', sair);
} catch (e) {
  writeFileSync(file, JSON.stringify({ erro: String(e.message).slice(0, 400), codigo: e.codigo || 'falha_ao_iniciar' }), { mode: 0o600 }); await eng.close(); process.exit(2);
}
