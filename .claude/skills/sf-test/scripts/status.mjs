#!/usr/bin/env node
// Situação das execuções do QA em .sf-test/runs. Uso: node status.mjs
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { qaDir } from './lib/config.mjs';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(qaDir(), 'runs'); if (!existsSync(root)) { console.log('Nenhuma execução ainda (.sf-test/runs não existe).'); process.exit(0); }
  for (const r of readdirSync(root).sort()) {
    const p = join(root, r, 'resultado.json'); const has = (f) => existsSync(join(root, r, f));
    if (existsSync(p)) { const j = JSON.parse(readFileSync(p, 'utf8')); console.log(`${r}: ${j.gate} — ${j.capacidade} · ${j.resumo.passou} ok, ${j.bugs.length} bug(s), ${j.a_confirmar.length} a confirmar, ${j.bloqueados.length} bloqueados`); }
    else console.log(`${r}: em andamento (${['preflight.json', 'test_basis.json', 'caderno.json', 'massa.json', 'classificacao.json'].filter(has).map((f) => f.replace('.json', '')).join(' → ') || 'iniciada'})`);
  }
}
