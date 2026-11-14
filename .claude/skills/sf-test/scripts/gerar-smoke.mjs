#!/usr/bin/env node
// Smoke tests automáticos: casos curtos e baratos que pegam a regressão que mais incomoda — a tela não abre, falta aba/campo, erro técnico ao carregar.
// Derivados por CÓDIGO (sem modelo) do caderno e da base: caminho de navegação (navegacao_base) e rótulos dos campos (oráculos de metadados).
// Uso: node gerar-smoke.mjs --run <id>        (acrescenta TC-901/TC-902 ao caderno.json; idempotente)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDir } from './lib/config.mjs';

export function gerarSmoke(caderno, basis) {
  const nav = caderno.navegacao_base; const casos = []; const avisos = [];
  if (!nav?.caminho?.length) return { casos, avisos: ['navegacao_base.caminho ausente: sem como derivar o smoke de navegação'] };
  const inv = basis.oracles.filter((o) => o.classe === 'invariante').map((o) => o.id);
  const caminho = nav.caminho; const abrir = [`Abrir o app ${nav.app ?? 'do projeto'}`, `Navegar até ${caminho.join(' › ')}`];
  casos.push({ id: 'TC-901', origem: 'smoke', titulo: `Abrir ${caminho.join(' › ')} e carregar sem erro`, tipo: 'fumaca', prioridade: 'P1', oraculos: inv,
    passos: abrir.map((acao, i) => ({ n: i + 1, acao })), esperado: caminho.map((item) => ({ texto: `Aparece "${item}"`, verificacao: { tipo: 'texto-visivel', valor: item } })) });
  const campos = basis.oracles.filter((o) => o.classe === 'campo');
  const rotulos = [...new Map(campos.map((o) => [(o.texto.match(/Campo "([^"]+)"/) ?? [])[1], o]).filter(([r]) => r)).entries()].slice(0, 12);
  if (nav.formulario?.length && rotulos.length) {
    const passos = [...abrir, ...nav.formulario.map((x) => (typeof x === 'string' ? x : x.acao))];
    casos.push({ id: 'TC-902', origem: 'smoke', titulo: `Os campos da capacidade aparecem em ${caminho[caminho.length - 1]}`, tipo: 'fumaca', prioridade: 'P2', oraculos: rotulos.map(([, o]) => o.id),
      passos: passos.map((acao, i) => ({ n: i + 1, acao })), esperado: rotulos.map(([r]) => ({ texto: `O campo "${r}" aparece`, verificacao: { tipo: 'elemento-visivel', alvo: { rotulo: r } } })) });
  } else if (rotulos.length) avisos.push('há campos nos metadados, mas navegacao_base.formulario não diz como abrir o formulário: smoke de campos não gerado');
  return { casos, avisos };
}

export function acrescentarSmoke(caderno, basis) {
  const { casos, avisos } = gerarSmoke(caderno, basis); const antes = caderno.casos.filter((c) => c.origem === 'smoke').length;
  return { caderno: { ...caderno, casos: [...caderno.casos.filter((c) => c.origem !== 'smoke'), ...casos] }, novos: casos.length - antes, avisos };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = process.argv.slice(2); const i = a.indexOf('--run'); if (i < 0) { console.error('Uso: gerar-smoke.mjs --run <id>'); process.exit(1); }
  const dir = runDir(a[i + 1]); const cad = JSON.parse(readFileSync(join(dir, 'caderno.json'), 'utf8')); const basis = JSON.parse(readFileSync(join(dir, 'test_basis.json'), 'utf8'));
  const r = acrescentarSmoke(cad, basis); writeFileSync(join(dir, 'caderno.json'), JSON.stringify(r.caderno, null, 2));
  console.log(`[gerar-smoke] ${r.caderno.casos.filter((c) => c.origem === 'smoke').length} caso(s) de smoke no caderno`); r.avisos.forEach((x) => console.log(`  AVISO: ${x}`));
}
