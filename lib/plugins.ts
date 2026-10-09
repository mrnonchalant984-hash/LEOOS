import { z } from 'zod';

export const pluginManifestSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{2,63}$/),
  name: z.string().trim().min(1).max(80),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  apiVersion: z.literal('1'),
  description: z.string().trim().min(1).max(240),
  permissions: z.array(z.enum(['projects:read', 'projects:write', 'webhooks:read'])).max(10),
  entrypoint: z.string().regex(/^https:\/\//),
});
export type PluginManifest = z.infer<typeof pluginManifestSchema>;

const trustedPlugins = new Map<string, PluginManifest>();

export function registerTrustedPlugin(input: unknown) {
  const manifest = pluginManifestSchema.parse(input);
  trustedPlugins.set(manifest.id, manifest);
  return manifest;
}
export function listTrustedPlugins() { return [...trustedPlugins.values()]; }
export function getTrustedPlugin(id: string) { return trustedPlugins.get(id) || null; }

// Plugins are metadata-only in this version. Never import, eval, or execute uploaded code.
