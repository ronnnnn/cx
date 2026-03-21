import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const sourcePath = resolve(repoRoot, '.agents/plugins/marketplace.json');
const agentsHome = process.env.CX_AGENTS_HOME || homedir();
const targetPath = resolve(agentsHome, '.agents/plugins/marketplace.json');

const raw = await readFile(sourcePath, 'utf8');
const marketplace = JSON.parse(raw);

const normalized = {
  ...marketplace,
  plugins: marketplace.plugins.map((plugin) => {
    if (plugin?.source?.source !== 'local') {
      return plugin;
    }

    const relativePath = plugin.source.path;
    if (typeof relativePath !== 'string') {
      throw new Error(`Invalid local plugin path for ${plugin.name}`);
    }

    const pluginRoot = resolve(repoRoot, relativePath.replace(/^\.\//, ''));
    const relativeFromAgentsHome = relative(agentsHome, pluginRoot);

    if (
      !relativeFromAgentsHome ||
      relativeFromAgentsHome.startsWith('..') ||
      relativeFromAgentsHome.split(sep).includes('..')
    ) {
      throw new Error(
        `Cannot express ${pluginRoot} as a local marketplace path under ${agentsHome}.`,
      );
    }

    return {
      ...plugin,
      source: {
        ...plugin.source,
        path: `./${relativeFromAgentsHome.split(sep).join('/')}`,
      },
    };
  }),
};

await mkdir(dirname(targetPath), { recursive: true });
await writeFile(targetPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');

console.log(`Synced marketplace to ${targetPath}`);
