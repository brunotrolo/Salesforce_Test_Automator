// Caminhos e constantes. A pasta de trabalho (.sf-test) fica no projeto Salesforce do dev e NUNCA vai para o git.
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';

export const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const qaDir = (cwd = process.cwd()) => process.env.SFT_DIR || join(cwd, '.sf-test');
export const runDir = (runId, cwd = process.cwd()) => join(qaDir(cwd), 'runs', runId);
/** Ambiente = a org (host). Sessão e jornadas são separadas por ambiente; loopback (testes) vira "local". */
export function ambienteDe(url) {
  try { const h = new URL(url).hostname.toLowerCase(); return /^(127\.0\.0\.1|localhost|\[::1\])$/.test(h) ? 'local' : h.replace(/[^a-z0-9.-]/g, '_'); } catch { return 'default'; }
}
export const authDir = (cwd = process.cwd(), ambiente = null) => (ambiente ? join(qaDir(cwd), 'auth', ambiente) : join(qaDir(cwd), 'auth'));
export const knowledgeDir = (cwd = process.cwd()) => join(qaDir(cwd), 'knowledge');
export const newRunId = (now = new Date()) => now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace('T', '-');
export function ensureDir(p, mode) { mkdirSync(p, { recursive: true, ...(mode ? { mode } : {}) }); return p; }

/** Alias da org: nunca fica gravado na skill. Ordem: SF_TARGET_ORG, .sf/config.json, .sfdx/sfdx-config.json. */
export function findOrgAlias(cwd = process.cwd(), env = process.env) {
  if (env.SF_TARGET_ORG && String(env.SF_TARGET_ORG).trim()) return { alias: String(env.SF_TARGET_ORG).trim(), from: 'SF_TARGET_ORG' };
  for (const [file, key] of [['.sf/config.json', 'target-org'], ['.sfdx/sfdx-config.json', 'defaultusername']]) {
    const p = join(cwd, file);
    if (!existsSync(p)) continue;
    try { const v = JSON.parse(readFileSync(p, 'utf8'))[key]; if (v) return { alias: String(v), from: file }; } catch { /* arquivo ilegível */ }
  }
  return null;
}
export const EXIT = { OK: 0, BUG: 1, CONFIG: 2, AMBIENTE: 3 };
