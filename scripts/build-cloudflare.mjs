import { spawnSync } from 'node:child_process';

// The standard production build now creates both .next and .open-next output.
// Reuse it here rather than running the OpenNext adapter twice.
const npmCli = process.env.npm_execpath;
const executable = npmCli ? process.execPath : 'npm';
const args = npmCli ? [npmCli, 'run', 'build'] : ['run', 'build'];
const result = spawnSync(executable, args, { stdio: 'inherit' });

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
