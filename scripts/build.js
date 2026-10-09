'use strict';

/**
 * Build da Vercel (npm run build).
 * Empacota src/script.js em public/script.js com esbuild.
 * Se o JavaScript do navegador tiver erro, o build falha aqui, antes de ir ao ar.
 */

const path = require('path');
const esbuild = require('esbuild');

async function main() {
  await esbuild.build({
    entryPoints: [path.join(__dirname, '..', 'src', 'script.js')],
    outfile: path.join(__dirname, '..', 'public', 'script.js'),
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: ['es2020'],
    sourcemap: false,
    minify: false,
    legalComments: 'none',
    logLevel: 'warning',
  });

  console.log('[BUILD] public/script.js gerado com sucesso.');
}

main().catch((erro) => {
  console.error('[BUILD] Falha ao empacotar src/script.js:', erro.message);
  process.exit(1);
});
