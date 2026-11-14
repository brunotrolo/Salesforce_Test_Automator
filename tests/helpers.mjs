import { mkdtempSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Cria um `sf` falso no PATH. cenario: ok | prod | naoauth | semsandboxinfo */
export function fakeSf(cenario = 'ok') {
  const dir = mkdtempSync(join(tmpdir(), 'fakesf-')); const bin = join(dir, 'bin'); mkdirSync(bin);
  const f = join(bin, 'sf');
  writeFileSync(f, `#!/usr/bin/env node
const a = process.argv.slice(2); const c = ${JSON.stringify(cenario)};
const out = (o, code = 0) => { console.log(JSON.stringify(o)); process.exit(code); };
if (a[0] === '--version') { console.log('@salesforce/cli/2.0.0'); process.exit(0); }
if (c === 'naoauth' && a[0] === 'org') out({ status: 1, name: 'NamedOrgNotFoundError' }, 1);
if (a[0] === 'org' && a[1] === 'display') out({ status: 0, result: { instanceUrl: c === 'prod' ? 'https://acme.my.salesforce.com' : 'https://acme--sbx.sandbox.my.salesforce.com', username: 'qa@example.test' } });
const fs = require('node:fs');
if (process.env.FAKE_SF_LOG) fs.appendFileSync(process.env.FAKE_SF_LOG, JSON.stringify(a) + '\\n');
if (a[0] === 'data' && a[1] === 'create') out({ status: 0, result: { id: '001' + require('node:crypto').createHash('md5').update(a.join(' ')).digest('hex').slice(0, 12), success: true } });
if (a[0] === 'data' && a[1] === 'delete') out({ status: 0, result: { id: a[a.indexOf('--record-id') + 1], success: true } });
if (a[0] === 'data' && a[1] === 'query' && /Name = 'Fila Padrao'/.test(a.join(' '))) out({ status: 0, result: { records: [{ Id: '00G000000001' }] } });
if (a[0] === 'data' && a[1] === 'query' && /Name = 'Fila Inexistente'/.test(a.join(' '))) out({ status: 0, result: { records: [] } });
if (a[0] === 'data' && a[1] === 'query') out({ status: 0, result: { records: c === 'semsandboxinfo' ? [] : [{ IsSandbox: c !== 'prod' }] } });
out({ status: 1, message: 'não simulado' }, 1);
`);
  chmodSync(f, 0o755);
  return { dir, bin, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } };
}
export const tmp = (p = 'sft-') => mkdtempSync(join(tmpdir(), p));
