// Máscara determinística de PII FORMATADA em texto livre (CPF, CNPJ, e-mail, telefone).
// Só padrões formatados: 11/14 dígitos soltos colidem com protocolos e ids, então ficam de fora.
export const maskCpf = (v) => { const d = String(v).replace(/\D/g, ''); return d.length < 2 ? '***' : `***.***.**${d.slice(-2)}`; };
export const maskEmail = (v) => { const s = String(v); const at = s.indexOf('@'); return at < 0 ? '***' : `${s.slice(0, Math.min(2, at))}***${s.slice(at)}`; };
export const maskPhone = (v) => { const d = String(v).replace(/\D/g, ''); if (d.length < 2) return '***'; return d.length >= 10 ? `(${d.slice(0, 2)}) ****-**${d.slice(-2)}` : `****-**${d.slice(-2)}`; };

const PATTERNS = [
  { kind: 'cnpj', re: /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, mask: maskCpf },
  { kind: 'cpf', re: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, mask: maskCpf },
  { kind: 'email', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g, mask: maskEmail },
  { kind: 'phone', re: /(?:\+55\s?)?\(?\b\d{2}\)?\s?9?\d{4}-\d{4}\b/g, mask: maskPhone },
];

export function findPii(text) {
  const s = String(text ?? '');
  return PATTERNS.filter(({ re }) => { re.lastIndex = 0; return re.test(s); }).map((p) => p.kind);
}

/** @returns {{text:string, counts:Record<string,number>}} */
export function maskText(text) {
  let out = String(text); const counts = {};
  for (const { kind, re, mask } of PATTERNS) {
    out = out.replace(re, (m) => { counts[kind] = (counts[kind] || 0) + 1; return mask(m); });
  }
  return { text: out, counts };
}
