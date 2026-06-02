// Bundles the Lambda handler to a single CJS file for the container image.
// The banner+define fixes ESM deps that call `createRequire(import.meta.url)` —
// in a CJS bundle import.meta.url is undefined, so we point it at the file URL.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/handlers/lambda.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['onnxruntime-node', 'fastembed'],
  outfile: 'build/query.js',
  banner: { js: "const import_meta_url = require('url').pathToFileURL(__filename).href;" },
  define: { 'import.meta.url': 'import_meta_url' },
  logLevel: 'info',
});
