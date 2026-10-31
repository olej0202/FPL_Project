import { build } from 'esbuild';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL('../../../../diagnostics/frontend-rebuild/', import.meta.url);
await mkdir(output, { recursive: true });
await build({
  entryPoints: ['scripts/browser/fixture.jsx'], jsx: 'automatic', bundle: true,
  outdir: fileURLToPath(output), format: 'esm', splitting: true,
  platform: 'browser', loader: { '.png': 'dataurl' }, define: { 'import.meta.env': '{}' },
});
const css = (await readdir('dist/assets')).find(name => name.startsWith('index-') && name.endsWith('.css'));
await writeFile(new URL('style.css', output), await readFile(`dist/assets/${css}`));
await writeFile(new URL('index.html', output), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script type="module" src="fixture.js"></script></body></html>`);
console.log('Offline application fixture built. All providers and pages use their real implementations.');
