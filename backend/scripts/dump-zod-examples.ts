/**
 * Dumps an example value for every exported Zod schema in
 * src/features/*\/*.validation.ts to scratch/zod-examples.json, keyed by the
 * export name (e.g. "budgetCreateSchema"). Used by
 * scripts/enrich-contracts-from-validation.mjs to fill contract request bodies
 * for endpoints not covered by the OpenAPI spec.
 *
 * Run (from backend/):  npx ts-node --transpile-only scripts/dump-zod-examples.ts
 */
import fs from 'fs';
import path from 'path';

const FEATURES = path.resolve(__dirname, '../src/features');

// ── walk a Zod schema → a representative example value ───────────────────────
function example(schema: any, depth = 0): any {
  if (!schema || !schema._def || depth > 8) return undefined;
  const def = schema._def;
  const tn = def.typeName;
  switch (tn) {
    case 'ZodObject': {
      const shape = typeof def.shape === 'function' ? def.shape() : def.shape;
      const o: any = {};
      for (const [k, v] of Object.entries(shape || {})) {
        const ex = example(v, depth + 1);
        if (ex !== undefined) o[k] = ex;
      }
      return o;
    }
    case 'ZodOptional':
    case 'ZodNullable':
    case 'ZodReadonly':
    case 'ZodBranded':
      return example(def.innerType, depth + 1);
    case 'ZodDefault':
      try { return def.defaultValue(); } catch { return example(def.innerType, depth + 1); }
    case 'ZodEffects': // .refine()/.transform()
      return example(def.schema, depth + 1);
    case 'ZodPipeline':
      return example(def.out || def.in, depth + 1);
    case 'ZodArray':
      { const e = example(def.type, depth + 1); return e === undefined ? [] : [e]; }
    case 'ZodTuple':
      return (def.items || []).map((i: any) => example(i, depth + 1));
    case 'ZodUnion':
    case 'ZodDiscriminatedUnion': {
      const opts = def.options ? (Array.isArray(def.options) ? def.options : [...def.options.values()]) : [];
      return example(opts[0], depth + 1);
    }
    case 'ZodEnum':
      return def.values?.[0];
    case 'ZodNativeEnum': {
      const vals = Object.values(def.values || {}).filter((v) => typeof v === 'string' || typeof v === 'number');
      return vals[0];
    }
    case 'ZodLiteral':
      return def.value;
    case 'ZodString': {
      const checks = def.checks || [];
      for (const c of checks) {
        if (c.kind === 'email') return 'user@example.com';
        if (c.kind === 'uuid') return '00000000-0000-0000-0000-000000000000';
        if (c.kind === 'url') return 'https://example.com';
        if (c.kind === 'datetime') return new Date().toISOString();
        if (c.kind === 'cuid') return 'clxxxxxxxxxxxxxxxxxxxxxxxx';
      }
      return 'string';
    }
    case 'ZodNumber': {
      const checks = def.checks || [];
      const min = checks.find((c: any) => c.kind === 'min');
      if (min) return min.value > 0 ? min.value : (checks.some((c: any) => c.kind === 'int') ? 1 : min.value);
      return checks.some((c: any) => c.kind === 'int') ? 1 : 0;
    }
    case 'ZodBoolean': return false;
    case 'ZodDate': return new Date().toISOString();
    case 'ZodBigInt': return 0;
    case 'ZodRecord': return {};
    case 'ZodAny':
    case 'ZodUnknown': return {};
    default: return undefined;
  }
}

const out: Record<string, any> = {};
let count = 0;
for (const dir of fs.readdirSync(FEATURES)) {
  const featDir = path.join(FEATURES, dir);
  if (!fs.statSync(featDir).isDirectory()) continue;
  for (const file of fs.readdirSync(featDir)) {
    if (!/\.validation\.ts$/.test(file)) continue;
    let mod: any;
    try { mod = require(path.join(featDir, file)); } catch (e: any) { console.error(`skip ${file}: ${e.message}`); continue; }
    for (const [name, val] of Object.entries(mod)) {
      if (val && (val as any)._def && (val as any)._def.typeName) {
        const ex = example(val);
        if (ex !== undefined) { out[name] = ex; count++; }
      }
    }
  }
}

const dest = path.resolve(__dirname, '../../scratch/zod-examples.json');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out, null, 2));
console.log(`written ${dest}: ${count} schema examples`);
