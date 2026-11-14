// Motor de tela: um navegador, um contexto, uma página. Cada ação passa pela política ANTES de tocar na tela.
// Registra o que aconteceu (trace) e os defeitos técnicos observados (detectores), para a jornada compilada e o relatório.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadPlaywright } from '../lib/pw.mjs';
import { ensureDir, ambienteDe } from '../lib/config.mjs';
import { maskText } from '../lib/pii.mjs';
import { urlAllowed, targetProblems, actionAllowed, createdIdsFrom } from './policy.mjs';
import { observar } from './observe.mjs';
import { detectarInvariantes } from './detectors.mjs';
import { entrarNaOrg } from './login.mjs';

export const NAVEGADORES = ['chromium', 'firefox', 'webkit'];
const TIMEOUT_PADRAO = 8000; const TIMEOUT_MAX = 20000;
export class EngineErro extends Error { constructor(m, codigo) { super(m); this.codigo = codigo; } }
const ID_NA_URL = /\/([0-9a-zA-Z]{15}(?:[0-9a-zA-Z]{3})?)(?=[/?#]|$)/;

export function localizar(page, alvo) {
  const base = alvo.moldura ? page.frameLocator(alvo.moldura) : page; const exact = alvo.exato === true;
  let l;
  if (alvo.papel) l = base.getByRole(alvo.papel, alvo.nome !== undefined ? { name: alvo.nome, exact } : {});
  else if (alvo.rotulo) l = base.getByLabel(alvo.rotulo, { exact });
  else if (alvo.texto) l = base.getByText(alvo.texto, { exact });
  else l = base.locator(alvo.seletor);
  return Number.isInteger(alvo.indice) ? l.nth(alvo.indice) : l;
}

export class Engine {
  constructor({ runDir, instanceUrl = null, baseUrl = null, headless = true, sfOpen = null, cwd = process.cwd(), permitirJanela = false, limiteAssentarMs = 12000, limiteSpinnerMs = 10000, navegador = 'chromium', lancador = null } = {}) {
    Object.assign(this, { runDir, instanceUrl, baseUrl, headless, sfOpen, cwd, permitirJanela, limiteAssentarMs, limiteSpinnerMs, navegador, lancador });
    this.massa = {}; this.caso = null; this.via = null; this.ambiente = ambienteDe(instanceUrl ?? baseUrl ?? '');
  }
  get origem() { return this.baseUrl ?? this.instanceUrl; }

  async start() {
    if (!NAVEGADORES.includes(this.navegador)) throw new EngineErro(`navegador inválido: ${this.navegador} (use ${NAVEGADORES.join(', ')})`, 'navegador_invalido');
    try { this.browser = this.lancador ? await this.lancador(this.navegador) : await loadPlaywright(this.cwd)[this.navegador].launch({ headless: this.headless }); }
    catch (e) { if (e.codigo) throw e; throw new EngineErro(`${this.navegador} não abriu: ${String(e.message).split('\n')[0].slice(0, 140)}. Corrija: npx playwright install ${this.navegador}${process.platform === 'linux' ? ` && npx playwright install-deps ${this.navegador}` : ''}`, 'navegador_indisponivel'); }
    if (this.baseUrl && process.env.SFT_ALLOW_LOCAL === '1') { this.context = await this.browser.newContext(); this.page = await this.context.newPage(); this.via = 'local'; }
    else { const r = await entrarNaOrg({ browser: this.browser, instanceUrl: this.instanceUrl, sfOpen: this.sfOpen, cwd: this.cwd, permitirJanela: this.permitirJanela, headless: this.headless }); Object.assign(this, { context: r.context, page: r.page, via: r.via }); }
    this.page.on('console', (m) => { if (m.type() === 'error') this.buf?.console.push(m.text()); });
    this.page.on('pageerror', (e) => this.buf?.paginaErros.push(String(e.message || e)));
    this.page.on('response', (r) => { if (r.status() >= 500) this.buf?.respostas.push({ status: r.status(), url: r.url() }); });
    this.page.on('dialog', async (d) => { this.buf?.notificacoes.push(`${d.type()}: ${d.message()}`); await d.accept().catch(() => {}); });
    ensureDir(join(this.runDir, 'evidence'));
    return { via: this.via, navegador: this.navegador };
  }
  setMassa(m) { this.massa = m || {}; }

  async begin(casoId) {
    const mf = join(this.runDir, 'massa_resolvida.json'); if (existsSync(mf)) { try { this.massa = JSON.parse(readFileSync(mf, 'utf8')); } catch { /* massa ilegível: segue com a atual */ } }
    this.caso = { id: casoId, inicio: Date.now(), passos: [], achados: [] };
    this.buf = { console: [], paginaErros: [], respostas: [], notificacoes: [] };
    this.spinnerMs = 0; return { caso: casoId, via: this.via };
  }

  resolver(valor) {
    return String(valor).replace(/\{\{\s*([a-z][a-z0-9_]*)\.(id|nome|documento)\s*\}\}/g, (_, ref, campo) => {
      const v = this.massa?.[this.caso?.id]?.[ref]?.[campo];
      if (v === undefined) throw new EngineErro(`massa ausente para {{${ref}.${campo}}}`, 'massa_ausente'); return v;
    });
  }
  createdIds() { return createdIdsFrom(this.runDir); }
  recordId() { const m = this.page.url().match(ID_NA_URL); return m && /\d/.test(m[1]) ? m[1] : null; }

  async assentar(limite = 12000) {            // espera indicadores de carregamento sumirem; mede quanto demorou
    const t0 = Date.now(); let ultimo = Date.now();
    for (;;) {
      const girando = await this.page.evaluate(() => !!document.querySelector('.slds-spinner,[role="progressbar"],[data-spinner]')).catch(() => false);
      if (!girando) { this.spinnerMs = Math.max(this.spinnerMs, ultimo - t0 > 0 ? ultimo - t0 : 0); return; }
      ultimo = Date.now(); if (ultimo - t0 > limite) { this.spinnerMs = Math.max(this.spinnerMs, ultimo - t0); return; }
      await this.page.waitForTimeout(200);
    }
  }

  async observe({ aria = true } = {}) { return observar(this.page).then((o) => (aria ? o : { ...o, aria: '' })); }

  async act(a) {
    const n = (this.caso?.passos.length ?? 0) + 1; const t0 = Date.now();
    const passo = { n, acao: a.acao, ...(a.alvo ? { alvo: a.alvo } : {}), ...(a.valor !== undefined ? { valor: a.valor } : {}), ...(a.tecla ? { tecla: a.tecla } : {}), ...(a.url ? { url: a.url } : {}) };
    const falha = (codigo, msg) => { this.caso?.passos.push({ ...passo, ok: false, codigo, ms: Date.now() - t0 }); return { ok: false, codigo, erro: msg }; };
    try {
      if (!['ir', 'clicar', 'preencher', 'selecionar', 'marcar', 'pressionar', 'esperar', 'ler'].includes(a.acao)) return falha('acao_invalida', `ação desconhecida: ${a.acao}`);
      const timeout = Math.min(a.timeout ?? TIMEOUT_PADRAO, TIMEOUT_MAX);
      if (a.alvo) { const p = targetProblems(a.alvo); if (p.length) return falha('politica', p.join('; ')); }
      const rid = this.recordId();
      const perm = actionAllowed({ acao: a.acao, alvo: a.alvo, recordId: rid ? rid.slice(0, 15) : null }, { createdIds: new Set([...this.createdIds()].map((i) => i.slice(0, 15))) });
      if (!perm.allow) return falha('politica', perm.reason);
      const val = a.valor !== undefined ? this.resolver(a.valor) : undefined;
      if (a.acao === 'ir') {
        const alvoUrl = String(a.url ?? '').startsWith('/') ? new URL(a.url, this.origem).href : a.url;
        if (!urlAllowed(alvoUrl, { instanceUrl: this.instanceUrl })) return falha('politica', 'endereço fora da org alvo');
        await this.page.goto(alvoUrl, { timeout: Math.max(timeout, 15000), waitUntil: 'domcontentloaded' });
      } else {
        const l = localizar(this.page, a.alvo ?? {});
        if (a.acao === 'preencher') await l.fill(val, { timeout });
        else if (a.acao === 'selecionar') await l.selectOption({ label: val }, { timeout });
        else if (a.acao === 'marcar') await l.setChecked(a.valor === true || a.valor === 'true', { timeout });
        else if (a.acao === 'clicar') await l.click({ timeout });
        else if (a.acao === 'pressionar') { if (a.alvo) await l.press(a.tecla, { timeout }); else await this.page.keyboard.press(a.tecla); }
        else if (a.acao === 'esperar') await l.waitFor({ state: 'visible', timeout });
        else if (a.acao === 'ler') { const t = maskText((await l.first().innerText({ timeout })).replace(/\s+/g, ' ').trim()).text.slice(0, 200); this.caso.passos.push({ ...passo, ok: true, ms: Date.now() - t0 }); return { ok: true, texto: t }; }
      }
      await this.assentar(this.limiteAssentarMs); await this.coletar(n);
      this.caso?.passos.push({ ...passo, ok: true, ms: Date.now() - t0, url: this.page.url() });
      return { ok: true, url: this.page.url(), notificacoes: (await this.observe({ aria: false })).notificacoes };
    } catch (e) {
      const m = String(e.message || e); const codigo = e.codigo || (/strict mode violation/.test(m) ? 'alvo_ambiguo' : /Timeout|waiting for/.test(m) ? 'alvo_nao_encontrado' : 'passo_falhou');
      await this.coletar(n).catch(() => {}); return falha(codigo, m.split('\n')[0].slice(0, 240));
    }
  }

  async coletar(passo) {                     // roda os detectores sobre o estado atual e acumula os achados com o passo
    const o = await this.observe({ aria: false }); const b = this.buf ?? { console: [], paginaErros: [], respostas: [], notificacoes: [] };
    for (const f of detectarInvariantes({ texto: o.texto, notificacoes: [...o.notificacoes, ...b.notificacoes], console: b.console, paginaErros: b.paginaErros, respostas: b.respostas, spinnerMs: this.spinnerMs, limiteSpinnerMs: this.limiteSpinnerMs }))
      if (!this.caso.achados.some((x) => x.inv === f.inv && x.evidencia === f.evidencia)) this.caso.achados.push({ ...f, passo });
  }

  async assert(v) {
    const t = Math.min(v.timeout ?? 5000, TIMEOUT_MAX);
    try {
      const val = v.valor !== undefined ? this.resolver(v.valor) : undefined; const page = this.page;
      switch (v.tipo) {
        case 'texto-visivel': { const l = page.getByText(val).first(); await l.waitFor({ state: 'visible', timeout: t }); return { pass: true, detalhe: `texto "${val.slice(0, 60)}" visível` }; }
        case 'texto-ausente': { await page.waitForTimeout(150); const n = await page.getByText(val).count(); const visivel = n > 0 && (await page.getByText(val).first().isVisible().catch(() => false)); return visivel ? { pass: false, detalhe: `texto "${val.slice(0, 60)}" aparece na tela` } : { pass: true, detalhe: 'texto ausente' }; }
        case 'url': { const ok = page.url().includes(val); return { pass: ok, detalhe: ok ? 'url confere' : `url atual não contém "${val}"` }; }
        case 'elemento-visivel': { const p = targetProblems(v.alvo); if (p.length) return { pass: false, bloqueado: true, detalhe: p.join('; ') }; await localizar(page, v.alvo).first().waitFor({ state: 'visible', timeout: t }); return { pass: true, detalhe: 'elemento visível' }; }
        case 'elemento-ausente': { const p = targetProblems(v.alvo); if (p.length) return { pass: false, bloqueado: true, detalhe: p.join('; ') }; const vis = await localizar(page, v.alvo).first().isVisible().catch(() => false); return { pass: !vis, detalhe: vis ? 'elemento aparece' : 'elemento ausente' }; }
        case 'valor-campo': { const atual = await localizar(page, v.alvo).first().inputValue({ timeout: t }); return { pass: atual === val, detalhe: atual === val ? 'valor confere' : `valor atual "${maskText(atual).text.slice(0, 60)}"` }; }
        case 'semantica': return { pass: null, precisa_juiz: true, detalhe: 'avaliação semântica pendente do juiz' };
        default: return { pass: false, bloqueado: true, detalhe: `tipo de verificação desconhecido: ${v.tipo}` };
      }
    } catch (e) { return { pass: false, detalhe: String(e.message).split('\n')[0].slice(0, 200), codigo: /Timeout/.test(String(e.message)) ? 'nao_apareceu' : 'erro' }; }
  }

  async end() {
    await this.coletar('fim').catch(() => {});
    const id = this.caso.id; const dir = join(this.runDir, 'evidence');
    const png = join(dir, `${id}.png`); await this.page.screenshot({ path: png }).catch(() => {});
    const o = await this.observe().catch(() => null); const aria = join(dir, `${id}.aria.txt`); if (o) writeFileSync(aria, `${o.url}\n${o.aria}\n--- texto ---\n${o.texto.slice(0, 4000)}\n`);
    const r = { caso: id, navegador: this.navegador, passos: this.caso.passos, achados: this.caso.achados, spinner_ms: this.spinnerMs, console_erros: this.buf.console.length, evidencias: { png: existsSync(png) ? png : null, aria: o ? aria : null }, duracao_ms: Date.now() - this.caso.inicio, url_final: this.page.url() };
    writeFileSync(join(dir, `${id}.trace.json`), JSON.stringify(r, null, 2)); this.caso = null; return r;
  }
  async close() { await this.browser?.close().catch(() => {}); }
}
