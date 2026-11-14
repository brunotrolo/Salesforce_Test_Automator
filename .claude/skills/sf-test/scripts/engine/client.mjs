// Cliente do daemon do motor (usado pelo cli.mjs e pelo executar.mjs).
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runDir } from '../lib/config.mjs';

export const arquivoDoMotor = (run, sess = 's1') => join(runDir(run), `engine-${sess}.json`);
export function lerInfo(run, sess = 's1') {
  const f = arquivoDoMotor(run, sess); if (!existsSync(f)) return null;
  try { const i = JSON.parse(readFileSync(f, 'utf8')); return i.port ? i : null; } catch { return null; }
}
export const post = (info, path, body) => new Promise((res, rej) => {
  const req = http.request({ host: '127.0.0.1', port: info.port, path: `/${path}`, method: 'POST', headers: { 'x-sft-token': info.token, 'content-type': 'application/json' } }, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { res(JSON.parse(d)); } catch { rej(new Error('resposta inválida do motor')); } }); });
  req.on('error', rej); req.end(JSON.stringify(body ?? {}));
});
export function conectar(run, sess = 's1') {
  const info = lerInfo(run, sess); if (!info) throw Object.assign(new Error('motor não iniciado: node engine/cli.mjs start --run <id>'), { codigo: 'motor_nao_iniciado' });
  return { info, call: (cmd, body) => post(info, cmd, body) };
}
