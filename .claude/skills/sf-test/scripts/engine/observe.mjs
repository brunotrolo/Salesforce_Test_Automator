// Observação da tela: árvore de acessibilidade (atravessa shadow DOM aberto), texto visível e notificações (toasts, alertas).
import { maskText } from '../lib/pii.mjs';

export const LIMITE_ARIA = 6000;

// Roda dentro da página: percorre DOM e shadow roots abertos.
const COLETAR = () => {
  const seen = []; const notif = []; let spinner = false;
  const SEL_NOTIF = '[role="alert"],[role="status"],.slds-notify,.toastMessage,.slds-theme_error,.slds-has-error .slds-form-element__help,.error,[data-toast]';
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) walk(el.shadowRoot);
    }
    for (const el of root.querySelectorAll(SEL_NOTIF)) if (vis(el)) { const t = (el.innerText || el.textContent || '').trim(); if (t) notif.push(t.slice(0, 300)); }
    for (const el of root.querySelectorAll('[role="progressbar"],.slds-spinner,.slds-spinner_container,[data-spinner]')) if (vis(el)) spinner = true;
  };
  walk(document);
  const texts = []; const grab = (root) => { for (const el of root.querySelectorAll('*')) { if (el.shadowRoot) grab(el.shadowRoot); } texts.push(root === document ? document.body.innerText : (root.host && root.host.innerText) || ''); };
  grab(document);
  return { notificacoes: [...new Set(notif)], spinner, texto: [...new Set(texts)].join('\n').slice(0, 20000) };
};

export async function observar(page) {
  const url = page.url(); let titulo = ''; try { titulo = await page.title(); } catch { /* navegando */ }
  const dom = await page.evaluate(COLETAR).catch(() => ({ notificacoes: [], spinner: false, texto: '' }));
  let aria = await page.locator('body').ariaSnapshot({ timeout: 3000 }).catch(() => '');
  const m = maskText(aria.slice(0, LIMITE_ARIA)); const tx = maskText(dom.texto);
  return { url, titulo, aria: m.text, texto: tx.text, notificacoes: dom.notificacoes.map((n) => maskText(n).text), spinner: dom.spinner, pii_mascarada: { ...m.counts, ...tx.counts } };
}
