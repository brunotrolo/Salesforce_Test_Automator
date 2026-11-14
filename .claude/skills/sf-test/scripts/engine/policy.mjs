// Política do motor e do hook: o que o agente pode tocar. Valem por código, não por lembrete.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PLATFORM = [/\.salesforce\.com$/, /\.force\.com$/, /\.salesforce-setup\.com$/];
const LOCAL = new Set(['127.0.0.1', 'localhost', '[::1]']);
const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase(); } catch { return null; } };

/** Navegação só para a org alvo e domínios da plataforma. file:/localhost só nos testes (SFT_ALLOW_LOCAL=1). */
export function urlAllowed(url, { instanceUrl = null, allowLocal = process.env.SFT_ALLOW_LOCAL === '1' } = {}) {
  let u; try { u = new URL(url); } catch { return false; }
  if (u.protocol === 'about:') return u.href === 'about:blank';
  if (u.protocol === 'file:') return allowLocal;
  if (allowLocal && u.protocol === 'http:' && LOCAL.has(u.hostname)) return true;
  if (u.protocol !== 'https:') return false;
  const own = instanceUrl ? hostOf(instanceUrl) : null;
  return u.hostname === own || PLATFORM.some((re) => re.test(u.hostname));
}

/** Heurística de produção pelo host. Sozinha NÃO autoriza nada: a autorização vem de IsSandbox=true. */
export function looksProduction(instanceUrl) {
  const h = hostOf(instanceUrl); if (!h) return true;
  if (!/\.salesforce\.com$|\.force\.com$/.test(h)) return false;
  if (/\.(sandbox|scratch|develop|demo|trailblaze)\./.test(h) || /--/.test(h.split('.')[0])) return false;
  return /\.my\.salesforce\.com$|\.lightning\.force\.com$/.test(h);
}

export const isXpath = (v) => typeof v === 'string' && /^\s*(\/\/|\.\/\/|\(\/\/|xpath=)/i.test(v);
const CHAVES = new Set(['papel', 'nome', 'rotulo', 'texto', 'seletor', 'exato', 'indice', 'moldura']);
export function targetProblems(alvo) {
  if (!alvo || typeof alvo !== 'object') return ['alvo ausente'];
  const p = [];
  for (const k of Object.keys(alvo)) if (!CHAVES.has(k)) p.push(`chave de alvo desconhecida: ${k}`);
  if (['papel', 'rotulo', 'texto', 'seletor'].filter((k) => alvo[k] !== undefined).length !== 1) p.push('alvo deve ter exatamente um entre papel, rotulo, texto e seletor');
  if (isXpath(alvo.seletor) || isXpath(alvo.moldura)) p.push('XPath não é permitido');
  return p;
}

const DESTRUTIVO = /\b(delete|excluir|apagar|remover|remove|merge|mesclar|deactivate|desativar|purge)\b/i;
export const isDestructiveLabel = (nome) => DESTRUTIVO.test(String(nome ?? ''));

/** Ação destrutiva na tela só vale em registro criado por esta execução (presente em massa_log). */
export function actionAllowed({ acao, alvo, recordId = null }, { createdIds = new Set() } = {}) {
  const nome = alvo?.nome ?? alvo?.rotulo ?? alvo?.texto ?? '';
  if (acao === 'clicar' && isDestructiveLabel(nome)) {
    if (recordId && createdIds.has(recordId)) return { allow: true };
    return { allow: false, reason: `Ação destrutiva ("${nome}") só é permitida em registro criado por esta execução (massa_log).` };
  }
  return { allow: true };
}

export function createdIdsFrom(runDir) {
  try { return new Set((JSON.parse(readFileSync(join(runDir, 'massa_log.json'), 'utf8')).criados || []).map((r) => r.id)); } catch { return new Set(); }
}
export function latestRunDir(qaDir) {
  const root = join(qaDir, 'runs'); if (!existsSync(root)) return null;
  const r = readdirSync(root).sort().pop(); return r ? join(root, r) : null;
}

// ---- Salesforce CLI (hook) ----
const tokens = (s) => s.match(/"[^"]*"|'[^']*'|\S+/g)?.map((t) => t.replace(/^["']|["']$/g, '')) ?? [];
const flag = (t, names) => { for (let i = 0; i < t.length; i++) { for (const n of names) { if (t[i] === n) return t[i + 1] ?? ''; if (t[i].startsWith(`${n}=`)) return t[i].slice(n.length + 1); } } return undefined; };
export const sfSegments = (cmd) => String(cmd).split(/&&|\|\||[|;&\n]/).map((s) => s.replace(/#.*$/, '').trim()).filter((s) => /^(?:[A-Za-z_]+=\S*\s+)*(sf|sfdx)(\s|$)/.test(s));

const LEITURA = ['org display', 'org list', 'data query', 'data get record', 'sobject describe', 'sobject list', '--version', 'version'];
const ESCRITA_TESTE = ['data create record', 'data update record', 'data delete record'];

/** Veredito para uma linha de comando que contém `sf`. */
export function sfVerdict(command, { targetOrg = process.env.SF_TARGET_ORG, createdIds = new Set() } = {}) {
  for (const seg of sfSegments(command)) {
    const t = tokens(seg.replace(/^(?:[A-Za-z_]+=\S*\s+)*/, '')).slice(1);
    const sub = t.filter((x) => !x.startsWith('-')).slice(0, 3).join(' ');
    const id = [...LEITURA, ...ESCRITA_TESTE, 'org open'].find((c) => sub === c || sub.startsWith(`${c} `) || (c.startsWith('--') && t[0] === c));
    if (!id) return { allow: false, reason: `Comando sf fora da lista permitida do QA ("${sub || t[0] || ''}"): só consulta, criação de massa de teste e abertura de sessão.` };
    if (id === '--version' || id === 'version') continue;
    if (!targetOrg) return { allow: false, reason: 'SF_TARGET_ORG não está definida: nenhuma org está autorizada para o QA (fail-closed).' };
    const org = flag(t, ['-o', '--target-org']);
    if (org === undefined) return { allow: false, reason: `Comando sf sem --target-org explícito (use --target-org ${'<SF_TARGET_ORG>'}).` };
    if (org !== targetOrg) return { allow: false, reason: 'A org do comando não é a org alvo do QA (SF_TARGET_ORG).' };
    if (id === 'org open' && !t.includes('--url-only')) return { allow: false, reason: '`sf org open` só com --url-only (o navegador é aberto pelo Playwright).' };
    if (id === 'data update record' || id === 'data delete record') {
      const rid = flag(t, ['-i', '--record-id']);
      if (!rid || !createdIds.has(rid)) return { allow: false, reason: 'Alterar/excluir registro só é permitido para ids criados por esta execução (massa_log).' };
    }
    if (id === 'data query' && /\b(delete|update|insert)\b/i.test(flag(t, ['-q', '--query']) ?? '')) return { allow: false, reason: 'Consulta com verbo de escrita.' };
  }
  return { allow: true };
}
