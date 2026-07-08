/*
 * Launches wrangler pages dev with a MINIFLARE_WORKERD_PATH override.
 * Why: some antivirus setups block workerd.exe inside node_modules
 * (path-specific rule), so we keep a copy at frontend/.workerd/ and
 * point miniflare at it. Harmless everywhere else.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const local = path.join(here, '..', '.workerd', 'workerd.exe');

const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' };
if (process.platform === 'win32' && existsSync(local)) {
  env.MINIFLARE_WORKERD_PATH = local;
}

const child = spawn(
  'npx',
  ['wrangler', 'pages', 'dev', 'dist', '--port', '8788', '--kv', 'OBS_KV'],
  { stdio: 'inherit', env, shell: true, cwd: path.join(here, '..') }
);
child.on('exit', (code) => process.exit(code ?? 0));
