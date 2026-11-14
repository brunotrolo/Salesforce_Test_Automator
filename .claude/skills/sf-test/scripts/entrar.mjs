#!/usr/bin/env node
// Login manual UMA vez (fallback quando o Salesforce CLI não serve): abre a janela, você entra (inclusive segundo fator) e fecha com Enter.
// A sessão fica em .sf-test/auth/estado.json (0600, fora do git). Nada é lido ou gravado além do estado do navegador.
import { chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import readline from 'node:readline';
import { authDir, ensureDir, findOrgAlias } from './lib/config.mjs';
import { loadPlaywright } from './lib/pw.mjs';
import { runChecks } from './preflight.mjs';

const r = await runChecks({ browser: false });
const org = r.org; if (!org) { console.error('Org alvo indisponível: rode primeiro o preflight (node .claude/skills/sf-test/scripts/preflight.mjs).'); process.exit(2); }
if (r.checks.find((c) => c.id === 'sandbox')?.status !== 'ok') { console.error('A org não foi confirmada como sandbox/scratch: login manual recusado.'); process.exit(2); }
const { chromium } = loadPlaywright();
const b = await chromium.launch({ headless: false }); const ctx = await b.newContext(); const page = await ctx.newPage();
await page.goto(org.instanceUrl);
console.error('Faça o login na janela (inclusive o segundo fator). Quando a tela inicial abrir, volte aqui e aperte Enter.');
await new Promise((res) => readline.createInterface({ input: process.stdin }).once('line', res));
const dir = ensureDir(authDir(), 0o700); const f = join(dir, 'estado.json');
await ctx.storageState({ path: f }); chmodSync(f, 0o600); await b.close();
console.error(`Sessão guardada em ${f}`);
