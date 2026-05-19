import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const baseConfig = {
  bundle: true,
  sourcemap: true,
  minify: !watch,
};

// Extension host — runs inside Electron (VSCode)
const extensionConfig = {
  ...baseConfig,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  // vscode and better-sqlite3 (native .node) must be external
  external: ['vscode', 'better-sqlite3'],
  format: 'cjs',
  platform: 'node',
  target: 'node20',
};

// Stop hook — runs as a plain Node subprocess (not Electron)
// Uses node:sqlite built-in — zero npm deps
const hookConfig = {
  ...baseConfig,
  entryPoints: ['src/hook.ts'],
  outfile: 'dist/hook.js',
  format: 'cjs',
  platform: 'node',
  target: 'node22',
  banner: { js: '#!/usr/bin/env node\n// Claude Token Tracker — Stop hook' },
};

// Webview — runs in the browser context inside VSCode's webview sandbox
const webviewConfig = {
  ...baseConfig,
  entryPoints: ['webview/main.ts'],
  outfile: 'dist/webview/main.js',
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
};

if (watch) {
  const [ctx1, ctx2, ctx3] = await Promise.all([
    esbuild.context(extensionConfig),
    esbuild.context(hookConfig),
    esbuild.context(webviewConfig),
  ]);
  await Promise.all([ctx1.watch(), ctx2.watch(), ctx3.watch()]);
  console.log('Watching for changes...');
} else {
  await Promise.all([
    esbuild.build(extensionConfig),
    esbuild.build(hookConfig),
    esbuild.build(webviewConfig),
  ]);
  console.log('Build complete.');
}
