#!/usr/bin/env node
// Instalador (Mac, Linux e Windows — só precisa do Node ≥ 20, que a skill já exige).
// Copia .claude/ deste repositório para o projeto SEM apagar nada seu, e MESCLA o settings.json (hooks e permissões),
// em vez de sobrescrevê-lo. Pode rodar de novo (idempotente).
// Uso, dentro da pasta do projeto:  node <pasta-deste-repo>/install.mjs [--dry-run] [pasta-do-projeto]
import { cpSync, existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIG = {
  nome: 'Salesforce Test Automator',
  gitignore: ['.sf-test/'],
  exige: [['specs', 'o Designer/Developer (pasta specs/)']],
  proximos: ['npm install playwright && npx playwright install chromium', 'sf org login web --alias <sua-sandbox>   (uma vez)', 'export SF_TARGET_ORG=<sua-sandbox>   (PowerShell: $env:SF_TARGET_ORG = "<sua-sandbox>")', 'No Claude Code: /sf-test <dominio>/<NNN-slug>'],
};

const uniq = (a) => [...new Set(a)];
/** Mescla settings.json: une listas de permissões e acrescenta só os hooks que ainda não existem (por comando). */
export function mergeSettings(dest = {}, src = {}) {
  const out = JSON.parse(JSON.stringify(dest)); let mudou = false;
  for (const [evento, grupos] of Object.entries(src.hooks ?? {})) {
    out.hooks ??= {}; out.hooks[evento] ??= [];
    const existentes = new Set(out.hooks[evento].flatMap((g) => (g.hooks ?? []).map((h) => h.command)));
    for (const g of grupos) {
      const novos = (g.hooks ?? []).filter((h) => !existentes.has(h.command));
      if (novos.length) { out.hooks[evento].push({ ...g, hooks: novos }); novos.forEach((h) => existentes.add(h.command)); mudou = true; }
    }
  }
  for (const k of ['allow', 'deny', 'ask']) {
    const s = src.permissions?.[k]; if (!s?.length) continue;
    out.permissions ??= {}; const antes = out.permissions[k] ?? []; const depois = uniq([...antes, ...s]);
    if (depois.length !== antes.length) { out.permissions[k] = depois; mudou = true; }
  }
  return { settings: out, mudou };
}

export function instalar({ origem, destino, dryRun = false, log = console.log }) {
  const src = join(origem, '.claude'); const dst = join(destino, '.claude');
  if (resolve(origem) === resolve(destino)) throw new Error('rode dentro da pasta do SEU projeto, não dentro deste repositório');
  if (!existsSync(src)) throw new Error(`não achei ${src}`);
  const acoes = { copiados: 0, settings: 'sem mudança', gitignore: [] };
  if (!dryRun) mkdirSync(dst, { recursive: true });
  const filtro = (p) => relative(src, p) !== 'settings.json';
  if (!dryRun) cpSync(src, dst, { recursive: true, force: true, filter: filtro });
  acoes.copiados = 1;
  const sSrc = join(src, 'settings.json'); const sDst = join(dst, 'settings.json');
  if (existsSync(sSrc)) {
    const novo = JSON.parse(readFileSync(sSrc, 'utf8'));
    if (!existsSync(sDst)) { acoes.settings = 'criado'; if (!dryRun) writeFileSync(sDst, JSON.stringify(novo, null, 2) + '\n'); }
    else {
      let atual; try { atual = JSON.parse(readFileSync(sDst, 'utf8')); } catch { atual = null; }
      if (!atual) { acoes.settings = 'ILEGÍVEL: salvei o nosso em settings.json.novo — junte à mão'; if (!dryRun) writeFileSync(`${sDst}.novo`, JSON.stringify(novo, null, 2) + '\n'); }
      else { const { settings, mudou } = mergeSettings(atual, novo); if (mudou) { acoes.settings = 'mesclado (cópia do original em settings.json.anterior)'; if (!dryRun) { copyFileSync(sDst, `${sDst}.anterior`); writeFileSync(sDst, JSON.stringify(settings, null, 2) + '\n'); } } }
    }
  }
  const gi = join(destino, '.gitignore'); const atual = existsSync(gi) ? readFileSync(gi, 'utf8').split(/\r?\n/).map((l) => l.trim()) : [];
  acoes.gitignore = CONFIG.gitignore.filter((l) => !atual.includes(l));
  if (acoes.gitignore.length && !dryRun) writeFileSync(gi, `${existsSync(gi) ? readFileSync(gi, 'utf8').replace(/\s*$/, '\n') : ''}${acoes.gitignore.join('\n')}\n`);
  const avisos = CONFIG.exige.filter(([p]) => !existsSync(join(destino, p))).map(([, d]) => `não achei ${d}: instale as skills irmãs antes de usar`);
  return { acoes, avisos };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = process.argv.slice(2); const destino = resolve(a.find((x) => !x.startsWith('--')) ?? process.cwd());
  try {
    const { acoes, avisos } = instalar({ origem: dirname(fileURLToPath(import.meta.url)), destino, dryRun: a.includes('--dry-run') });
    console.log(`${CONFIG.nome} ${a.includes('--dry-run') ? '(simulação)' : 'instalado'} em ${destino}\n  .claude/: copiado · settings.json: ${acoes.settings}${acoes.gitignore.length ? ` · .gitignore: +${acoes.gitignore.join(', ')}` : ''}`);
    avisos.forEach((x) => console.log(`  AVISO: ${x}`));
    console.log(`\nPróximos passos:\n${CONFIG.proximos.map((p) => `  ${p}`).join('\n')}`);
  } catch (e) { console.error(`Erro: ${e.message}`); process.exit(1); }
}
