// Validador mínimo de JSON Schema (subconjunto: type, required, properties, items, enum, pattern, minLength, minItems, $ref local).
export function validate(data, schema, root = schema, path = '$') {
  const errs = [];
  const s = schema.$ref ? resolve(schema.$ref, root) : schema;
  const types = [].concat(s.type || []);
  const tOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
  if (types.length && !types.includes(tOf(data))) { errs.push(`${path}: tipo ${tOf(data)} (esperado ${types.join('|')})`); return errs; }
  if (s.enum && !s.enum.includes(data)) errs.push(`${path}: valor ${JSON.stringify(data)} fora de ${JSON.stringify(s.enum)}`);
  if (typeof data === 'string') {
    if (s.minLength != null && data.length < s.minLength) errs.push(`${path}: vazio`);
    if (s.pattern && !new RegExp(s.pattern).test(data)) errs.push(`${path}: "${data}" não casa /${s.pattern}/`);
  }
  if (Array.isArray(data)) {
    if (s.minItems != null && data.length < s.minItems) errs.push(`${path}: mínimo ${s.minItems} item(ns)`);
    if (s.items) data.forEach((x, i) => errs.push(...validate(x, s.items, root, `${path}[${i}]`)));
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    for (const r of s.required || []) if (!(r in data)) errs.push(`${path}: falta "${r}"`);
    for (const [k, sub] of Object.entries(s.properties || {})) if (k in data) errs.push(...validate(data[k], sub, root, `${path}.${k}`));
  }
  return errs;
}
function resolve(ref, root) { return ref.replace(/^#\//, '').split('/').reduce((o, k) => o[k], root); }
