import { z } from 'zod';

export const pluginPermissionSchema = z.enum(['projects:read', 'projects:write', 'webhooks:read']);
export const pluginLifecycleSchema = z.enum(['registered', 'enabled', 'disabled', 'deprecated']);
export type PluginLifecycleStatus = z.infer<typeof pluginLifecycleSchema>;

function isSafePluginEntrypoint(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && (!url.port || url.port === '443')
      && hostname.includes('.')
      && hostname !== 'localhost'
      && !/\.(localhost|local|internal|lan|home)$/.test(hostname)
      && !/^\d+(?:\.\d+){3}$/.test(hostname)
      && !hostname.startsWith('[');
  } catch {
    return false;
  }
}

export const pluginManifestSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{2,63}$/),
  name: z.string().trim().min(1).max(80),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  apiVersion: z.literal('1'),
  description: z.string().trim().min(1).max(240),
  permissions: z.array(pluginPermissionSchema).max(10),
  entrypoint: z.string().max(2048).refine(isSafePluginEntrypoint, {
    message: 'Entrypoint must be a public HTTPS URL without credentials or a non-default port.',
  }),
}).superRefine((manifest, context) => {
  if (new Set(manifest.permissions).size !== manifest.permissions.length) {
    context.addIssue({ code: 'custom', path: ['permissions'], message: 'Permissions must not contain duplicates.' });
  }
});

export type PluginManifest = z.infer<typeof pluginManifestSchema>;

export function parsePluginManifest(input: unknown): PluginManifest {
  return pluginManifestSchema.parse(input);
}
