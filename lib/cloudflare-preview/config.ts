import { isCloudflarePagesProjectName } from './static-assets';

export const CLOUDFLARE_PREVIEW_REQUIRED_ENV = [
  'LEONARDX_CLOUDFLARE_PREVIEWS_ENABLED',
  'CLOUDFLARE_PAGES_PROJECT',
  'CRON_SECRET',
] as const;

export function getCloudflarePreviewConfig(env: Record<string, string | undefined> = process.env) {
  const projectName = env.CLOUDFLARE_PAGES_PROJECT?.trim() || '';
  const enabled = env.LEONARDX_CLOUDFLARE_PREVIEWS_ENABLED === 'true'
    && Boolean(env.CRON_SECRET?.trim())
    && isCloudflarePagesProjectName(projectName);

  return {
    enabled,
    projectName: isCloudflarePagesProjectName(projectName) ? projectName : null,
    requiredEnvironment: CLOUDFLARE_PREVIEW_REQUIRED_ENV,
  };
}
