// Copies Monaco's prebuilt AMD bundle into public/monaco so the editor loads from this origin.
// @monaco-editor/react otherwise fetches it from cdn.jsdelivr.net at runtime: a third-party
// script dependency for every editor session, and one a script CSP would have to allow.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const source = join(dirname(require.resolve('monaco-editor/package.json')), 'min', 'vs');
const target = join(process.cwd(), 'public', 'monaco', 'vs');

if (!existsSync(source)) {
  console.warn(`[copy-monaco] ${source} not found; the editor will not load`);
  process.exit(0);
}
rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
console.log('[copy-monaco] copied Monaco to public/monaco/vs');
