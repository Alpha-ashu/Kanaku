import { generateOpenApiDocument } from '../src/docs/api-docs';
import fs from 'fs';
import path from 'path';

const doc: any = generateOpenApiDocument('https://api.example.com');
const out = path.resolve(__dirname, '../../scratch/openapi.json');
fs.writeFileSync(out, JSON.stringify(doc, null, 2));
const paths = Object.keys(doc.paths || {});
let ops = 0;
for (const p of paths) for (const m of Object.keys(doc.paths[p])) if (['get', 'post', 'put', 'patch', 'delete'].includes(m)) ops++;
console.log(`written ${out}: ${paths.length} paths, ${ops} operations`);
