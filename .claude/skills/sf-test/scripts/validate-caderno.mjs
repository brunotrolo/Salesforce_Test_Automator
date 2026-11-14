#!/usr/bin/env node
// Valida o caderno de teste: schema, rastreio aos oráculos, cobertura dos critérios de aceite/regras e qualidade do "esperado".
// Uso: node validate-caderno.mjs <caderno.json> --basis <test_basis.json> [--massa massa.json]
// Exit: 0 ok (avisos possíveis) | 2 reprovado | 1 uso
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from './lib/schema.mjs';
import { targetProblems } from './engine/policy.mjs';
import { SKILL_ROOT } from './lib/config.mjs';

const SCHEMA = JSON.parse(readFileSync(join(SKILL_ROOT, 'schemas/caderno.schema.json'), 'utf8'));
const VAGO = /\b(corretamente|adequadamente|apropriadamente|normalmente|funciona|sem problemas|como esperado|de forma correta)\b/i;

export function checkCaderno(cad, basis) {
  const errors = validate(cad, SCHEMA); const warnings = [];
  if (errors.length) return { ok: false, errors, warnings, cobertura: null };
  const orc = new Map(basis.oracles.map((o) => [o.id, o])); const ids = new Set(); const cobertos = new Set();
  for (const c of cad.casos) {
    const w = `${c.id}`;
    if (ids.has(c.id)) errors.push(`id duplicado: ${c.id}`); ids.add(c.id);
    for (const o of c.oraculos || []) { if (!orc.has(o)) errors.push(`${w}: oráculo ${o} não existe na base de teste`); else cobertos.add(o); }
    for (const g of c.gaps_relacionados || []) { if (orc.get(g)?.classe !== 'gap-conhecido') errors.push(`${w}: gaps_relacionados ${g} não é um gap-conhecido da base`); }
    if (c.tipo !== 'exploratorio' && !(c.oraculos || []).length) errors.push(`${w}: caso ${c.tipo} sem oráculo (rastreio obrigatório; só "exploratorio" pode não ter)`);
    c.passos.forEach((p, i) => { if (p.n !== i + 1) errors.push(`${w}: passos devem ser numerados em sequência (passo ${i + 1})`); });
    for (const e of c.esperado) {
      const v = e.verificacao;
      if (['texto-visivel', 'texto-ausente', 'url', 'valor-campo'].includes(v.tipo) && !String(v.valor ?? '').trim()) errors.push(`${w}: verificação "${v.tipo}" sem valor`);
      if (['elemento-visivel', 'elemento-ausente', 'valor-campo'].includes(v.tipo)) { const p = targetProblems(v.alvo); if (p.length) errors.push(`${w}: verificação com alvo inválido (${p.join('; ')})`); }
      if (v.tipo === 'semantica') warnings.push(`${w}: verificação "semantica" depende do juiz; prefira texto/elemento quando o esperado for exato`);
      if (VAGO.test(e.texto) && !/["“'«].+["”'»]/.test(e.texto)) warnings.push(`${w}: esperado vago ("${e.texto.slice(0, 50)}"): diga o que aparece na tela`);
    }
    if (c.tipo === 'limite' && !c.passos.some((p) => /\d/.test(p.acao))) warnings.push(`${w}: caso de limite sem valor numérico nos passos`);
  }
  const exigidos = basis.oracles.filter((o) => (o.classe === 'aceite' || o.classe === 'regra') && !o.incerto);
  const faltam = exigidos.filter((o) => !cobertos.has(o.id));
  for (const o of faltam) errors.push(`cobertura: ${o.id} (${o.classe}) sem caso: "${o.texto.slice(0, 70)}"`);
  const validacoes = basis.oracles.filter((o) => o.classe === 'validacao' && !cobertos.has(o.id));
  for (const o of validacoes) warnings.push(`cobertura: regra de validação ${o.id} sem caso negativo`);
  const cobertura = { exigidos: exigidos.length, cobertos: exigidos.length - faltam.length };
  return { ok: errors.length === 0, errors, warnings, cobertura };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = process.argv.slice(2); const bi = a.indexOf('--basis');
  if (!a[0] || bi < 0) { console.error('Uso: validate-caderno.mjs <caderno.json> --basis <test_basis.json>'); process.exit(1); }
  const r = checkCaderno(JSON.parse(readFileSync(a[0], 'utf8')), JSON.parse(readFileSync(a[bi + 1], 'utf8')));
  r.warnings.forEach((w) => console.log(`  AVISO: ${w}`)); r.errors.forEach((e) => console.error(`  ERRO:  ${e}`));
  console.log(r.ok ? `[validate-caderno] APROVADO — cobertura ${r.cobertura.cobertos}/${r.cobertura.exigidos}${r.warnings.length ? ` (${r.warnings.length} aviso(s))` : ''}` : `[validate-caderno] REPROVADO (${r.errors.length})`);
  process.exit(r.ok ? 0 : 2);
}
