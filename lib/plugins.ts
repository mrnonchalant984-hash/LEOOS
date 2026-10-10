import 'server-only';

import { adminSupabase } from '@/lib/auth';
import {
  parsePluginManifest,
  pluginLifecycleSchema,
  type PluginLifecycleStatus,
} from '@/lib/plugins-core';

const pluginColumns = 'plugin_id,version,api_version,manifest,status,created_at,updated_at';

export async function listTrustedPlugins(includeAll = false) {
  let query = adminSupabase().from('plugin_manifests')
    .select(pluginColumns)
    .order('plugin_id', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(500);
  if (!includeAll) query = query.eq('status', 'enabled');
  const { data, error } = await query;
  if (error) throw new Error('Plugin registry storage is unavailable.');
  return data || [];
}

export async function registerTrustedPlugin(input: unknown, registeredBy: string) {
  const manifest = parsePluginManifest(input);
  const { data, error } = await adminSupabase().from('plugin_manifests')
    .insert({
      plugin_id: manifest.id,
      version: manifest.version,
      api_version: manifest.apiVersion,
      manifest,
      status: 'registered',
      registered_by: registeredBy,
    })
    .select(pluginColumns)
    .single();
  if (error?.code === '23505') throw new Error('This plugin ID and version are already registered.');
  if (error || !data) throw new Error('Plugin registration could not be saved.');
  return data;
}

export async function updatePluginLifecycle(pluginId: string, version: string, input: unknown) {
  const parsed = pluginLifecycleSchema.safeParse(input);
  if (!parsed.success || parsed.data === 'registered') throw new Error('Choose enabled, disabled, or deprecated.');
  const status: PluginLifecycleStatus = parsed.data;
  const { data, error } = await adminSupabase().from('plugin_manifests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('plugin_id', pluginId)
    .eq('version', version)
    .select(pluginColumns)
    .maybeSingle();
  if (error?.code === '23505') throw new Error('Disable the currently enabled version before enabling another version.');
  if (error) throw new Error('Plugin lifecycle could not be updated.');
  return data;
}
