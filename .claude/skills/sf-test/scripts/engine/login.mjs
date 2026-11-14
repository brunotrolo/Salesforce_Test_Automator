// Login híbrido, sem interação sempre que possível:
//  1) Salesforce CLI: `sf org open --url-only` na org alvo (URL de acesso direto; nunca gravada nem impressa);
//  2) sessão salva em .sf-test/auth/estado.json (criada uma vez por entrar.mjs);
//  3) janela do navegador, só se permitido e houver terminal; senão BLOQUEADO.
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { authDir, ambienteDe } from '../lib/config.mjs';
import { urlAllowed } from './policy.mjs';

const naTelaDeLogin = (u) => /\/login|login\.salesforce\.com|\/secur\/|identity\/saml/i.test(u);
export class LoginErro extends Error { constructor(m, codigo = 'login_falhou') { super(m); this.codigo = codigo; } }

export async function entrarNaOrg({ browser, instanceUrl, sfOpen, cwd = process.cwd(), permitirJanela = false, headless = true }) {
  const tentativas = [];
  const sessaoPath = join(authDir(cwd, ambienteDe(instanceUrl)), 'estado.json');
  const ir = async (ctx, alvo) => { const page = await ctx.newPage(); await page.goto(alvo, { timeout: 30000, waitUntil: 'domcontentloaded' }); await page.waitForLoadState('load', { timeout: 15000 }).catch(() => {}); return page; };
  const ok = (page) => !naTelaDeLogin(page.url()) && urlAllowed(page.url(), { instanceUrl });

  if (sfOpen) {
    try {
      const url = await sfOpen();
      if (!url || !urlAllowed(url, { instanceUrl })) throw new Error('URL de acesso fora da org');
      const ctx = await browser.newContext(); const page = await ir(ctx, url);
      if (ok(page)) return { context: ctx, page, via: 'sf-cli' };
      await ctx.close(); tentativas.push('sf-cli: a URL de acesso não abriu a org');
    } catch (e) { tentativas.push(`sf-cli: ${String(e.message).split('\n')[0].slice(0, 120)}`); }
  }
  if (existsSync(sessaoPath)) {
    if ((statSync(sessaoPath).mode & 0o077) !== 0 && process.platform !== 'win32') tentativas.push('sessão salva com permissões abertas (chmod 600)');
    else {
      try {
        const ctx = await browser.newContext({ storageState: sessaoPath }); const page = await ir(ctx, `${instanceUrl.replace(/\/$/, '')}/lightning/page/home`);
        if (ok(page)) return { context: ctx, page, via: 'sessao-salva' };
        await ctx.close(); tentativas.push('sessão salva expirada');
      } catch (e) { tentativas.push(`sessão salva: ${String(e.message).split('\n')[0].slice(0, 120)}`); }
    }
  } else tentativas.push('sessão salva: não existe');
  if (permitirJanela && process.stdin.isTTY && !headless) tentativas.push('janela: rode entrar.mjs (login manual, uma vez)');
  throw new LoginErro(`Sem login possível. ${tentativas.join(' | ')}. Corrija: sf org login web --alias <alias> (preferido) ou node .claude/skills/sf-test/scripts/entrar.mjs`, 'login_indisponivel');
}
