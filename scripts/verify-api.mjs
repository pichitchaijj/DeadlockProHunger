#!/usr/bin/env node
/**
 * Verifies every Deadlock API call in src/lib/deadlock/ against the live OpenAPI spec:
 *   - the path exists as a GET and is not deprecated (and is not an MMR endpoint)
 *   - every query parameter we send is declared for that path
 *   - every field our zod schema reads exists in that endpoint's response schema
 * Usage: npm run api:verify            (exit 1 on any problem)
 *        npm run api:verify -- --md    (also print the production endpoint table for docs/API.md)
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const SPEC_URL = 'https://api.deadlock-api.com/openapi.json'
const DIR = process.env.VERIFY_DIR ?? 'src/lib/deadlock'
const md = process.argv.includes('--md')

const spec = await (await fetch(SPEC_URL)).json()
const files = Object.fromEntries(readdirSync(DIR).filter((f) => f.endsWith('.ts')).map((f) => [f, readFileSync(join(DIR, f), 'utf8')]))
const all = Object.values(files).join('\n')

/** Text of the balanced {...} or (...) starting at `start` (which must point at the opener). */
function balanced(text, start) {
  const open = text[start]
  const close = open === '{' ? '}' : open === '(' ? ')' : ']'
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === open) depth++
    else if (text[i] === close && --depth === 0) return text.slice(start, i + 1)
  }
  return text.slice(start)
}

/** Keys at the top level of an object literal (plus spreads). A key only counts at the start of an entry. */
function topLevelKeys(obj) {
  const keys = []
  const spreads = []
  let depth = 0
  let expectKey = false
  for (let i = 0; i < obj.length; i++) {
    const c = obj[i]
    if ('{(['.includes(c)) { depth++; if (depth === 1) expectKey = true; continue }
    if ('})]'.includes(c)) { depth--; continue }
    if (depth !== 1) continue
    if (c === ',') { expectKey = true; continue }
    if (!expectKey || /\s/.test(c)) continue
    const rest = obj.slice(i)
    const spread = /^\.\.\.\s*([\w.]+)/.exec(rest)
    const key = /^([A-Za-z_]\w*)\s*(?=[:,}])/.exec(rest)
    if (spread) { spreads.push(spread[1]); i += spread[0].length - 1 }
    else if (key) { keys.push(key[1]); i += key[1].length - 1 }
    expectKey = false
  }
  return { keys, spreads }
}

const scopeKeys = topLevelKeys(balanced(all, all.indexOf('{', all.indexOf('return {', all.indexOf('export function scopeParams'))))).keys

/** All zod object keys reachable from a schema expression (resolving named schemas and spreads). */
function zodKeys(expr, seen = new Set()) {
  const keys = new Set()
  for (const m of expr.matchAll(/([A-Za-z_]\w*)\s*:\s*z\./g)) keys.add(m[1])
  for (const m of expr.matchAll(/(?:\.\.\.|schema:\s*|z\.array\(|\b)([a-z]\w*Schema|winLoss)\b/g)) {
    const name = m[1]
    if (seen.has(name)) continue
    seen.add(name)
    const def = new RegExp(`const ${name}\\s*=\\s*`).exec(all)
    if (!def) continue
    const from = def.index + def[0].length
    const body = all.slice(from, from + 4000)
    const open = body.search(/[({]/)
    for (const k of zodKeys(balanced(body, open), seen)) keys.add(k)
  }
  return keys
}

const paths = Object.entries(spec.paths)
const toRegex = (p) => new RegExp('^' + p.replace(/\{[^}]+\}/g, '[^/]+') + '$')
function resolve(schema, depth = 0, out = new Set()) {
  if (!schema || depth > 40) return out
  if (schema.$ref) return resolve(schema.$ref.split('/').reduce((o, k) => (k === '#' ? spec : o[k]), null), depth + 1, out)
  for (const k of ['allOf', 'oneOf', 'anyOf']) for (const s of schema[k] ?? []) resolve(s, depth + 1, out)
  if (schema.items) resolve(schema.items, depth + 1, out)
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') resolve(schema.additionalProperties, depth + 1, out)
  for (const [name, prop] of Object.entries(schema.properties ?? {})) { out.add(name); resolve(prop, depth + 1, out) }
  return out
}

const problems = []
const rows = []
for (const [file, src] of Object.entries(files)) {
  for (const m of src.matchAll(/deadlockGet\(\s*/g)) {
    const at = m.index + m[0].length
    const call = balanced(src, src.lastIndexOf('(', at))
    // Path: string literal, template, or ternary of templates.
    const pathExprs = [...call.slice(1).split(/,\s*\{/)[0].matchAll(/[`'"]([^`'"]+)[`'"]/g)].map((x) => x[1].replace(/\$\{[^}]+\}/g, '{x}'))
    // The options object is the second argument: first '{' after the first top-level comma.
    let depth = 0, comma = -1
    for (let i = 1; i < call.length; i++) {
      const c = call[i]
      if ('({['.includes(c) || (c === '`' && depth >= 0 && call.slice(i).startsWith('`') && false)) depth++
      else if (')}]'.includes(c)) depth--
      else if (c === ',' && depth === 0) { comma = i; break }
    }
    const optsStart = comma > 0 ? call.indexOf('{', comma) : -1
    const opts = optsStart > 0 ? balanced(call, optsStart) : '{}'
    const pIdx = opts.search(/\bparams\s*:/)
    let params = []
    if (pIdx >= 0 && /^params\s*:\s*scopeParams\(/.test(opts.slice(pIdx))) {
      params = scopeKeys
    } else if (pIdx >= 0) {
      const pObj = balanced(opts, opts.indexOf('{', pIdx))
      const { keys, spreads } = topLevelKeys(pObj)
      params = [...keys, ...spreads.flatMap((s) => (s.startsWith('scopeParams') || s === 'params' ? scopeKeys.filter((k) => !(s === 'params' && k === 'game_mode')) : []))]
    }
    const sIdx = opts.search(/\bschema\s*:/)
    const fields = sIdx >= 0 ? [...zodKeys(opts.slice(opts.indexOf(':', sIdx) + 1))] : []
    const line = src.slice(0, m.index).split('\n').length

    for (const path of pathExprs) {
      const hit = paths.find(([p]) => toRegex(p).test(path) || p.replace(/\{[^}]+\}/g, '{x}') === path)
      const where = `${file}:${line} ${path}`
      if (!hit) { problems.push(`${where}: path not in spec`); continue }
      const [specPath, item] = hit
      const op = item.get
      if (!op) { problems.push(`${where}: no GET operation`); continue }
      if (op.deprecated) problems.push(`${where}: DEPRECATED in spec`)
      if (/mmr/i.test(specPath)) problems.push(`${where}: MMR endpoint (use rank endpoints)`)
      const declared = new Set((op.parameters ?? []).map((p) => (p.$ref ? p.$ref.split('/').pop() : p.name)))
      for (const p of params) if (!declared.has(p)) problems.push(`${where}: query param "${p}" not declared`)
      const resp = op.responses?.['200']?.content?.['application/json']?.schema
      const respFields = resolve(resp)
      const unknown = respFields.size ? fields.filter((f) => !respFields.has(f)) : []
      for (const f of unknown) problems.push(`${where}: response field "${f}" not in schema`)
      const limit = (op.description ?? '').match(/\|\s*IP\s*\|\s*([^|]+)\|/)?.[1]?.trim() ?? '—'
      rows.push({ path: specPath, file: `${file}:${line}`, params: params.length, fields: fields.length, limit, tag: op.tags?.[0] ?? '' })
    }
  }
}

const unique = new Map(rows.map((r) => [r.path, r]))
console.log(`Spec ${spec.info?.version ?? ''}: ${Object.keys(spec.paths).length} paths. Checked ${rows.length} call sites → ${unique.size} endpoints.`)
if (process.argv.includes('--verbose')) for (const r of rows) console.log(`  ${r.path.padEnd(44)} params ${String(r.params).padStart(2)}  fields checked ${r.fields}`)
if (md) {
  console.log('\n| Endpoint | IP rate limit (spec) | Call site |\n|---|---|---|')
  for (const r of [...unique.values()].sort((a, b) => a.path.localeCompare(b.path))) console.log(`| \`${r.path}\` | ${r.limit} | \`${r.file}\` |`)
}
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`)
  for (const p of problems) console.log('  ✗ ' + p)
  process.exit(1)
}
console.log('✓ All paths current (none deprecated, no MMR), all query params declared, all schema fields present.')
