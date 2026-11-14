import { createHash } from 'node:crypto';
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
/** JSON canônico (chaves ordenadas) para hash estável. */
export function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
export const hashOf = (v) => sha256(canon(v)).slice(0, 16);
export const ANCHOR_RE = /^(S\d{2,3}):L(\d+)(?:-(\d+))?$/;
export function parseAnchor(a) {
  const m = String(a).match(ANCHOR_RE);
  if (!m) return null;
  const from = Number(m[2]); const to = m[3] ? Number(m[3]) : from;
  return { source: m[1], from, to };
}
export const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
