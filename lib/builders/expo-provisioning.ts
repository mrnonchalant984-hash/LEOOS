export type EasCommandResult = { code: number | null; stdout: string; stderr: string };
export type EasCommand = (files: Record<string, string>, args: string[], timeoutMs?: number) => Promise<EasCommandResult>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function expoConfig(appConfig: Record<string, unknown>) {
  return appConfig.expo && typeof appConfig.expo === 'object'
    ? appConfig.expo as Record<string, unknown>
    : appConfig;
}

function parseJsonOutput(output: string): unknown {
  const lines = output.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try { return JSON.parse(lines[index]); } catch { /* EAS may print progress before JSON output. */ }
  }
  try { return JSON.parse(output); } catch { return null; }
}

function projectIdFromOutput(value: unknown): string | null {
  if (Array.isArray(value)) return value.map(projectIdFromOutput).find(Boolean) || null;
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const candidate = item.projectId ?? item.id;
  if (typeof candidate === 'string' && uuidPattern.test(candidate)) return candidate;
  for (const key of ['project', 'data', 'app']) {
    const nested = projectIdFromOutput(item[key]);
    if (nested) return nested;
  }
  return null;
}

function accountFromOutput(output: string): string | null {
  const parsed = parseJsonOutput(output);
  const candidate = typeof parsed === 'string' ? parsed
    : parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>).username ?? (parsed as Record<string, unknown>).name
      : output.trim();
  return typeof candidate === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,62}$/.test(candidate)
    ? candidate
    : null;
}

function withExpoConfig(appConfig: Record<string, unknown>, expo: Record<string, unknown>) {
  return appConfig.expo && typeof appConfig.expo === 'object'
    ? { ...appConfig, expo }
    : expo;
}

function metadata(files: Record<string, string>) {
  return Object.fromEntries(['package.json', 'app.json', 'eas.json']
    .filter(file => typeof files[file] === 'string')
    .map(file => [file, files[file]]));
}

export async function provisionExpoProject(
  sourceFiles: Record<string, string>,
  leonardxProjectId: string,
  runCommand: EasCommand,
  configuredAccount?: string,
  knownProviderProjectId?: string,
) {
  if (!uuidPattern.test(leonardxProjectId)) throw new Error('A valid LeonardX project ID is required for Expo provisioning.');
  let appConfig: Record<string, unknown>;
  try { appConfig = JSON.parse(sourceFiles['app.json'] || ''); }
  catch { throw new Error('Expo project provisioning requires a valid static app.json.'); }
  const files = { ...sourceFiles };
  let expo = expoConfig(appConfig);
  const extra = expo.extra && typeof expo.extra === 'object' ? expo.extra as Record<string, unknown> : {};
  const eas = extra.eas && typeof extra.eas === 'object' ? extra.eas as Record<string, unknown> : {};
  if (knownProviderProjectId && !uuidPattern.test(knownProviderProjectId)) throw new Error('The persisted Expo project mapping is invalid.');
  const projectSuffix = leonardxProjectId.replace(/-/g, '').toLowerCase();
  const identity = await runCommand(metadata(files), ['whoami', '--json', '--non-interactive'], 30_000);
  if (identity.code !== 0) throw new Error('EXPO_TOKEN could not authenticate with Expo. Configure a valid server-side token with project-creation permission.');
  const account = configuredAccount?.trim() || accountFromOutput(identity.stdout);
  if (!account || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,62}$/.test(account)) {
    throw new Error('Expo project provisioning needs a valid authenticated Expo account. Set EXPO_ACCOUNT_NAME to an account the configured EXPO_TOKEN can manage.');
  }
  if (expo.owner && expo.owner !== account) {
    throw new Error('The Expo owner in app.json does not match the server-selected Expo account. Remove the owner field or align EXPO_ACCOUNT_NAME before building.');
  }
  const linkedExtra = expo.extra && typeof expo.extra === 'object' ? expo.extra as Record<string, unknown> : {};
  const linkedEas = linkedExtra.eas && typeof linkedExtra.eas === 'object' ? linkedExtra.eas as Record<string, unknown> : {};
  const safeEas = Object.fromEntries(Object.entries(linkedEas).filter(([key]) => key !== 'projectId'));
  const linkedId = knownProviderProjectId || null;
  let provisioningStatus = linkedId ? 'reused' : 'created-or-reused';
  expo = {
    ...expo,
    owner: account,
    slug: `leonardx-${projectSuffix.slice(0, 24)}`,
    extra: { ...linkedExtra, eas: { ...safeEas, ...(linkedId ? { projectId: linkedId } : {}) } },
  };
  appConfig = withExpoConfig(appConfig, expo);
  files['app.json'] = `${JSON.stringify(appConfig, null, 2)}\n`;

  let resolvedProjectId = linkedId;
  if (!resolvedProjectId) {
    const initialized = await runCommand(metadata(files), ['project:init', '--account', account, '--json', '--non-interactive'], 60_000);
    const initializedData = parseJsonOutput(initialized.stdout);
    resolvedProjectId = projectIdFromOutput(initializedData);
    if (initialized.code !== 0 || !resolvedProjectId) {
      throw new Error('Expo could not create or reuse a project for this app. Confirm the configured Expo account can create projects, then retry with the same build request.');
    }
    provisioningStatus = initializedData && typeof initializedData === 'object' && typeof (initializedData as Record<string, unknown>).status === 'string'
      ? String((initializedData as Record<string, unknown>).status)
      : 'created-or-reused';
  }

  expo = expoConfig(appConfig);
  const android = expo.android && typeof expo.android === 'object' ? expo.android as Record<string, unknown> : {};
  const ios = expo.ios && typeof expo.ios === 'object' ? expo.ios as Record<string, unknown> : {};
  const identifier = `com.leonardx.app.p${projectSuffix.slice(0, 16)}`;
  expo = {
    ...expo,
    android: { ...android, package: android.package || identifier },
    ios: { ...ios, bundleIdentifier: ios.bundleIdentifier || identifier },
  };
  appConfig = withExpoConfig(appConfig, expo);
  files['app.json'] = `${JSON.stringify(appConfig, null, 2)}\n`;

  if (!resolvedProjectId || !uuidPattern.test(resolvedProjectId)) throw new Error('Expo project provisioning did not return a valid project UUID.');
  const finalExtra = expo.extra && typeof expo.extra === 'object' ? expo.extra as Record<string, unknown> : {};
  const finalEas = finalExtra.eas && typeof finalExtra.eas === 'object' ? finalExtra.eas as Record<string, unknown> : {};
  expo = { ...expo, extra: { ...finalExtra, eas: { ...finalEas, projectId: resolvedProjectId } } };
  appConfig = withExpoConfig(appConfig, expo);
  files['app.json'] = `${JSON.stringify(appConfig, null, 2)}\n`;
  const verified = await runCommand(metadata(files), ['project:info', '--json', '--non-interactive'], 30_000);
  const verifiedId = projectIdFromOutput(parseJsonOutput(verified.stdout));
  if (verified.code !== 0 || verifiedId !== resolvedProjectId) {
    throw new Error('Expo created or linked a project, but its identity could not be verified. No build was submitted; retry after checking Expo access.');
  }
  return { files, expoProjectId: resolvedProjectId, provisioningStatus };
}

export function withExpoProjectId(sourceFiles: Record<string, string>, providerProjectId: string) {
  if (!uuidPattern.test(providerProjectId)) throw new Error('The persisted Expo project mapping is invalid.');
  let appConfig: Record<string, unknown>;
  try { appConfig = JSON.parse(sourceFiles['app.json'] || ''); }
  catch { throw new Error('The Expo app configuration is invalid.'); }
  const expo = expoConfig(appConfig);
  const extra = expo.extra && typeof expo.extra === 'object' ? expo.extra as Record<string, unknown> : {};
  const eas = extra.eas && typeof extra.eas === 'object' ? extra.eas as Record<string, unknown> : {};
  const updatedExpo = { ...expo, extra: { ...extra, eas: { ...eas, projectId: providerProjectId } } };
  const updatedConfig = withExpoConfig(appConfig, updatedExpo);
  return { ...sourceFiles, 'app.json': JSON.stringify(updatedConfig) };
}