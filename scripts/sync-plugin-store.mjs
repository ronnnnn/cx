import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const marketplacePath = resolve(repoRoot, '.agents/plugins/marketplace.json');
const codexHome = process.env.CODEX_HOME || resolve(homedir(), '.codex');

const raw = await readFile(marketplacePath, 'utf8');
const marketplace = JSON.parse(raw);

const marketplaceName = marketplace.name;
if (!marketplaceName) {
  throw new Error(`Marketplace name is missing in ${marketplacePath}`);
}

for (const plugin of marketplace.plugins ?? []) {
  if (plugin?.source?.source !== 'local') {
    continue;
  }

  const relativePath = plugin.source.path;
  if (typeof relativePath !== 'string' || !relativePath.startsWith('./')) {
    throw new Error(
      `Expected local plugin path with ./ prefix for ${plugin.name}`,
    );
  }

  const sourceRoot = resolve(repoRoot, relativePath.slice(2));
  const targetRoot = resolve(
    codexHome,
    'plugins/cache',
    marketplaceName,
    plugin.name,
    'local',
  );

  await mkdir(dirname(targetRoot), { recursive: true });
  await rm(targetRoot, { recursive: true, force: true });
  await cp(sourceRoot, targetRoot, { recursive: true });

  console.log(`Synced ${plugin.name} -> ${targetRoot}`);
}
