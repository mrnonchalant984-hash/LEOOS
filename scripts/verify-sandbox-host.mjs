/** Host-side isolated-runner preflight. Does not start the HTTP service or execute user code. */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });
const podman = spawnSync('podman', ['info', '--format', 'json'], { encoding: 'utf8' });
add('rootless_podman_available', podman.status === 0, podman.status === 0 ? 'podman info succeeded' : (podman.stderr || 'podman unavailable').slice(0, 200));
if (podman.status === 0) {
  try {
    const info = JSON.parse(podman.stdout);
    const rootless = info.host?.security?.rootless === true;
    const runtimes = info.host?.ociRuntime?.runtimes || {};
    add('podman_rootless', rootless, rootless ? 'rootless mode enabled' : 'Podman does not report rootless mode');
    add('gvisor_runsc_registered', Object.keys(runtimes).some(name => name === 'runsc'), `available runtimes: ${Object.keys(runtimes).join(', ') || 'none'}`);
  } catch { add('podman_info_parse', false, 'Could not parse podman info JSON'); }
}
add('runner_source_present', existsSync('services/isolated-runner/server.py'), 'runner server source exists');
add('runner_container_recipe_present', existsSync('services/isolated-runner/Dockerfile'), 'fixed runner image recipe exists');
if (process.env.LEONARDX_SANDBOX_RUN_SMOKE === 'true') {
  const image = process.env.RUNNER_IMAGE || 'localhost/leonardx-runner:node22';
  const result = spawnSync('podman', ['run', '--rm', '--runtime=runsc', '--network=none', '--read-only', '--cap-drop=all', '--security-opt=no-new-privileges', '--memory=256m', '--cpus=1', '--pids-limit=64', image, 'sh', '-lc', 'id -u; test ! -w /; if command -v curl >/dev/null 2>&1; then curl --max-time 2 https://example.com >/dev/null 2>&1 && exit 41 || true; fi'], { encoding: 'utf8', timeout: 45_000 });
  add('gvisor_container_smoke', result.status === 0, result.status === 0 ? 'runsc container completed with network disabled and read-only root' : (result.stderr || `exit=${result.status}`).slice(0, 240));
} else add('gvisor_container_smoke', false, 'Not run. Set LEONARDX_SANDBOX_RUN_SMOKE=true after building the fixed runner image.');
console.log(JSON.stringify({ mode: 'sandbox-host-preflight', checks, passed: checks.filter(x => x.ok).length, failed_or_not_run: checks.filter(x => !x.ok).length,
  note: 'A host smoke test is not a penetration test. Do not set LEO_SANDBOX_URL until the runner is on a dedicated isolated host with private ingress and service authentication.' }, null, 2));
if (checks.some(x => !x.ok)) process.exitCode = 1;
