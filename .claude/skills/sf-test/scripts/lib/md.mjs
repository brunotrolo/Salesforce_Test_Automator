// Leitura tolerante de markdown: seções por título, com número de linha (1-based) para citação.
export function sections(text) {
  const lines = String(text).split(/\r?\n/); const out = []; let cur = { title: '', level: 0, from: 1, lines: [] };
  lines.forEach((l, i) => {
    const m = l.match(/^(#{1,4})\s+(.*?)\s*#*$/);
    if (m) { out.push(cur); cur = { title: m[2], level: m[1].length, from: i + 1, lines: [] }; }
    else cur.lines.push({ n: i + 1, t: l });
  });
  out.push(cur);
  return out.filter((s) => s.title || s.lines.some((x) => x.t.trim()));
}
export const strip = (s) => String(s).replace(/\*\*|__|`/g, '').replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').replace(/\s+/g, ' ').trim();
/** Itens de lista/tabela de uma seção: [{n, text, raw}] */
export function items(sec) {
  const out = [];
  for (const { n, t } of sec.lines) {
    if (/^\s*(?:[-*+]|\d+[.)])\s+\S/.test(t)) out.push({ n, text: strip(t), raw: t });
    else if (/^\s*\|/.test(t) && !/^\s*\|[\s:|-]+\|?\s*$/.test(t)) {
      const cells = t.split('|').map((c) => strip(c)).filter(Boolean);
      if (cells.length && !/^(id|cen[aá]rio|passo|artefato|etapa|step)$/i.test(cells[0])) out.push({ n, text: cells.join(' — '), raw: t });
    }
  }
  return out;
}
export const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
