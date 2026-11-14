#!/usr/bin/env node
// Preflight: confere ambiente, CLI do Salesforce e org alvo ANTES de qualquer teste, e RECUSA produção.
// Zero interação: falha vira "BLOQUEADO" com a correção exata; nunca pergunta nada.
// Uso: node preflight.mjs [--run <runId>] [--no-browser]   Exit: 0 ok | 2 configuração/bloqueio
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findOrgAlias, authDir, runDir, ensureDir, newRunId, EXIT } from './lib/config.mjs';
import { looksProduction } from './engine/policy.mjs';

const sfRun = (args, spawn) => {
  const r = spawn('sf', args, { encoding: 'utf8', shell: process.platform === 'win32', timeout: 60000 });
  let json = null; try { json = JSON.parse(r.stdout || 'null'); } catch { /* saída não-JSON */ }
  return { status: r.status, json, error: r.error };
};

export async function runChecks({ cwd = process.cwd(), env = process.env, spawn = spawnSync, browser = true } = {}) {
  const checks = []; const add = (id, status, msg, fix) => checks.push({ id, status, msg, ...(fix ? { fix } : {}) });
  const major = Number(process.versions.node.split('.')[0]);
  add('node', major >= 20 ? 'ok' : 'falha', `Node ${process.versions.node}`, major >= 20 ? undefined : 'Instale o Node 20 ou superior.');

  let pw = null;
  try { pw = createRequire(join(cwd, 'x.js'))('playwright'); } catch { try { pw = createRequire(import.meta.url)('playwright'); } catch { /* ausente */ } }
  if (!pw) add('playwright', 'falha', 'Playwright não instalado', 'npm install playwright && npx playwright install chromium');
  else if (!browser) add('playwright', 'ok', 'Playwright encontrado (navegador não testado)');
  else {
    try { const b = await pw.chromium.launch({ headless: true }); const v = b.version(); await b.close(); add('playwright', 'ok', `Chromium ${v} abre sem janela`); }
    catch (e) { add('playwright', 'falha', `Chromium não abriu: ${String(e.message).split('\n')[0]}`, 'npx playwright install chromium'); }
  }

  const ver = sfRun(['--version'], spawn);
  const sfOk = ver.status === 0;
  add('sf-cli', sfOk ? 'ok' : 'falha', sfOk ? 'Salesforce CLI encontrado' : 'Salesforce CLI (sf) não encontrado', sfOk ? undefined : 'npm install -g @salesforce/cli');

  const found = findOrgAlias(cwd, env);
  let org = null;
  if (!found) add('org', 'falha', 'Org alvo não definida', 'export SF_TARGET_ORG=<alias da sandbox> (ou defina target-org no projeto com `sf config set target-org <alias>`)');
  else if (sfOk) {
    const d = sfRun(['org', 'display', '--target-org', found.alias, '--json'], spawn);
    const instanceUrl = d.json?.result?.instanceUrl;
    if (d.status !== 0 || !instanceUrl) add('org', 'falha', 'A org alvo não está autenticada no Salesforce CLI', 'sf org login web --alias <alias da sandbox>   (uma vez; depois o QA roda sem interação)');
    else {
      org = { instanceUrl, host: new URL(instanceUrl).hostname };
      const q = sfRun(['data', 'query', '--target-org', found.alias, '--query', 'SELECT IsSandbox FROM Organization', '--json'], spawn);
      const isSandbox = q.json?.result?.records?.[0]?.IsSandbox;
      if (isSandbox !== true) add('sandbox', 'falha', isSandbox === false ? 'A org alvo é PRODUÇÃO: o QA recusa' : 'Não consegui confirmar que a org é sandbox/scratch: o QA recusa (fail-closed)', 'Aponte SF_TARGET_ORG para uma sandbox ou scratch org.');
      else if (looksProduction(instanceUrl)) add('sandbox', 'falha', 'IsSandbox=true mas o endereço parece de produção: conflito, o QA recusa', 'Confira a org alvo.');
      else add('sandbox', 'ok', 'Org confirmada como sandbox/scratch');
      add('org', 'ok', `Org autenticada (${org.host})`);
    }
  }

  const via = [];
  if (org && checks.find((c) => c.id === 'sandbox')?.status === 'ok') via.push('sf-cli');
  const sessao = join(authDir(cwd), 'estado.json');
  if (existsSync(sessao)) via.push('sessao-salva');
  add('login', via.length ? 'ok' : 'falha', via.length ? `Login possível por: ${via.join(', ')}` : 'Nenhum caminho de login disponível', via.length ? undefined : 'Autentique a org no CLI (sf org login web) ou rode: node .claude/skills/sf-test/scripts/entrar.mjs (uma vez)');
  const ok = !checks.some((c) => c.status === 'falha');
  return { ok, checks, org: org ? { host: org.host, instanceUrl: org.instanceUrl } : null, login: via, alias: found?.alias ?? null };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = process.argv.slice(2); const ri = a.indexOf('--run');
  const r = await runChecks({ browser: !a.includes('--no-browser') });
  for (const c of r.checks) console.log(`[${c.status === 'ok' ? 'OK' : 'FALHA'}] ${c.msg}${c.fix ? `\n       → ${c.fix}` : ''}`);
  const id = ri > -1 ? a[ri + 1] : newRunId();
  const dir = ensureDir(runDir(id));
  const { alias, ...publico } = r;                       // o alias nunca é gravado em arquivo
  writeFileSync(join(dir, 'preflight.json'), JSON.stringify({ ...publico, run: id }, null, 2));
  console.log(r.ok ? `[preflight] pronto (execução ${id})` : '[preflight] BLOQUEADO: corrija os itens acima');
  process.exit(r.ok ? EXIT.OK : EXIT.CONFIG);
}
