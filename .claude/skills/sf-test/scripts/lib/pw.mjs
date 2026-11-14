// Localiza o Playwright instalado no projeto do dev, na skill ou globalmente (NODE_PATH). Nunca baixa nada.
import { createRequire } from 'node:module';
import { join, delimiter } from 'node:path';
import { SKILL_ROOT } from './config.mjs';

let cache = null;
export function loadPlaywright(cwd = process.cwd()) {
  if (cache) return cache;
  const bases = [join(cwd, 'x.js'), join(SKILL_ROOT, 'x.js'), ...(process.env.NODE_PATH || '').split(delimiter).filter(Boolean).map((p) => join(p, 'x.js'))];
  for (const b of bases) { try { return (cache = createRequire(b)('playwright')); } catch { /* tenta o próximo */ } }
  throw Object.assign(new Error('Playwright não instalado: npm install playwright && npx playwright install chromium'), { codigo: 'playwright_ausente' });
}
