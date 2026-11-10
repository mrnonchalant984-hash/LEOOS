import { spawnSync } from 'node:child_process';

const requestedHeapMb = 3072;
const heapFlag = `--max-old-space-size=${requestedHeapMb}`;
const existingNodeOptions = process.env.NODE_OPTIONS?.trim() ?? '';
const nodeOptions = existingNodeOptions.includes('--max-old-space-size')
  ? existingNodeOptions
  : [existingNodeOptions, heapFlag].filter(Boolean).join(' ');
const npmCli = process.env.npm_execpath;

for (const command of [
  ['run', 'typecheck'],
  ['run', 'clean'],
  ['exec', '--', 'next', 'build'],
]) {
  const executable = npmCli ? process.execPath : 'npm';
  const args = npmCli ? [npmCli, ...command] : command;
  const result = spawnSync(executable, args, {
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: nodeOptions },
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
