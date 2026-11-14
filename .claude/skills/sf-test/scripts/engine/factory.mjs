// Cria o Engine de uma execução (usado pelo daemon e pelo executar.mjs): lê o preflight, monta o login via CLI do Salesforce.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runDir, ensureDir, findOrgAlias } from '../lib/config.mjs';
import { Engine } from './engine.mjs';
import { makeSf } from '../massa.mjs';

export function criarEngine(run, { baseUrl = null, headless = true, cwd = process.cwd(), ...resto } = {}) {
  const dir = ensureDir(runDir(run, cwd)); const pre = existsSync(join(dir, 'preflight.json')) ? JSON.parse(readFileSync(join(dir, 'preflight.json'), 'utf8')) : {};
  const alias = findOrgAlias(cwd)?.alias; const sf = alias ? makeSf({ org: alias }) : null;
  return new Engine({ runDir: dir, instanceUrl: pre.org?.instanceUrl ?? null, baseUrl, headless, cwd,
    sfOpen: sf ? async () => sf(['org', 'open', '--target-org', alias, '--url-only', '--json'])?.result?.url : null, ...resto });
}
