// Compatibilidade entre navegadores: o MESMO caso (jornada determinística) roda em Chromium, Firefox e WebKit; o primeiro é a referência.
// Divergência = o caso passa na referência e falha (ou para, ou mostra defeito técnico) em outro navegador. Só é BUG se REPRODUZIR (2 de 2).
const ids = (a) => new Set((a ?? []).map((x) => `${x.inv}`));
/** @param {{referencia:string, ref:object[], outros:Record<string,object[]>}} p */
export function compararNavegadores({ referencia, ref, outros }) {
  const out = [];
  for (const [nav, lista] of Object.entries(outros)) for (const o of lista) {
    const r = ref.find((x) => x.caso === o.caso); if (!r) continue;
    const base = { caso: o.caso, titulo: r.titulo, navegador: nav, referencia, confirmada: o.reproduzida !== false };
    const refBom = r.status === 'verde' || r.status === 'pendente_juiz';
    if (o.status === 'interrompido') { if (!r.status || r.status !== 'interrompido') out.push({ ...base, tipo: 'passo', detalhe: `a jornada parou no passo ${o.parou_no_passo}/${o.de} (${o.codigo}): ${String(o.erro ?? '').slice(0, 100)}` }); continue; }
    if (refBom && o.status === 'vermelho') { const f = o.verificacoes.find((v) => v.pass === false); out.push({ ...base, tipo: 'asserção', detalhe: `falhou: ${f?.texto ?? 'verificação'} — ${String(f?.detalhe ?? '').slice(0, 100)}` }); continue; }
    const novos = [...ids(o.achados)].filter((i) => !ids(r.achados).has(i)); if (novos.length) out.push({ ...base, tipo: 'técnico', detalhe: `defeito técnico só neste navegador: ${novos.join(', ')}` });
  }
  return out.map((d) => ({ ...d, veredito: d.confirmada ? 'BUG' : 'INSTAVEL', severidade: 'media' }));
}
