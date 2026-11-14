// Detectores passivos: defeitos técnicos objetivos (invariantes) que valem para QUALQUER tela, sem precisar de oráculo de negócio.
// São funções puras sobre o que o motor observou, para serem testáveis sem navegador.
import { maskText } from '../lib/pii.mjs';

const ERRO_NAO_TRATADO = /\b(an unexpected error occurred|unexpected error|error id:?\s*\d+|unknown_exception|system\.\w+exception|unhandled exception|internal server error|something went wrong|ocorreu um erro inesperado|erro interno)\b/i;
const TEXTO_CRU = /\[object Object\]|\bNaN\b|\bundefined\b|\{![\w.]+\}|\{\{[\w.]+\}\}/;
const CONSOLE_BENIGNO = [/favicon/i, /devtools/i, /Failed to load resource.*(404|403)/i, /third-party cookie/i, /Content Security Policy.*report-only/i, /ResizeObserver loop/i, /net::ERR_(BLOCKED_BY_CLIENT|ABORTED)/i];

const cut = (s, n = 220) => maskText(String(s).replace(/\s+/g, ' ').trim()).text.slice(0, n);

/** @param {{texto?:string, notificacoes?:string[], console?:string[], paginaErros?:string[], respostas?:{status:number,url:string}[], spinnerMs?:number, limiteSpinnerMs?:number}} o */
export function detectarInvariantes(o = {}) {
  const f = [];
  const add = (inv, evidencia) => { if (!f.some((x) => x.inv === inv && x.evidencia === evidencia)) f.push({ inv, evidencia }); };
  for (const n of o.notificacoes ?? []) if (ERRO_NAO_TRATADO.test(n)) add('INV-001', cut(n));
  if (!f.length && ERRO_NAO_TRATADO.test(o.texto ?? '') && !/\bvalida[cç][aã]o\b/i.test(o.texto)) { const m = (o.texto.match(ERRO_NAO_TRATADO) || [''])[0]; add('INV-001', cut(m)); }
  for (const r of o.respostas ?? []) if (r.status >= 500) add('INV-002', cut(`HTTP ${r.status} ${new URL(r.url, 'http://x').pathname}`));
  const t = o.texto ?? ''; const m = t.match(TEXTO_CRU); if (m) add('INV-003', cut(`texto técnico na tela: "${m[0]}"`));
  for (const c of o.console ?? []) if (!CONSOLE_BENIGNO.some((re) => re.test(c))) add('INV-004', cut(c));
  for (const c of o.paginaErros ?? []) add('INV-004', cut(c));
  if ((o.spinnerMs ?? 0) > (o.limiteSpinnerMs ?? 10000)) add('INV-005', `indicador de carregamento visível por ${Math.round(o.spinnerMs / 1000)} s`);
  return f;
}
