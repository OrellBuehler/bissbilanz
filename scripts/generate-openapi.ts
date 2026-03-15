import { writeFileSync } from 'fs';
import { generateSpec } from '../src/lib/server/openapi';

const spec = generateSpec();
const json = JSON.stringify(spec, null, '\t');
writeFileSync('docs/openapi.json', json);
console.log('Generated docs/openapi.json');
