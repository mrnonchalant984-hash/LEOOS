import 'server-only';

import type { EnvTarget } from '@/lib/env-config-catalog';
import { findCatalogEntry, validateEnvSubmission } from '@/lib/env-config-catalog';

type VercelEnvTarget = 'development' | 'preview' | 'production';

function mapTarget(target: EnvTarget): VercelEnvTarget {
  return target;
}

async function vercelFetch(path: string, init: RequestInit = {}) {
  const token = process.env.VERCEL_TOKEN?.trim();
  if (!token) {
    return { ok: false as const, status: 503, error: 'VERCEL_TOKEN is not configured. Use the manual configuration route.' };
  }
  const team = process.env.VERCEL_TEAM_ID?.trim();
  const separator = path.includes('?') ? '&' : '?';
  const url = `https://api.vercel.com${path}${team ? `${separator}teamId=${encodeURIComponent(team)}` : ''}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  const raw = await response.text();
  let data: unknown = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    return {
      ok: false as const,
      status: response.status,
      error: 'Vercel rejected the environment configuration request.',
    };
  }
  return { ok: true as const, status: response.status, data };
}

/**
 * Submit a catalogued environment variable to Vercel.
 * Never logs or returns the secret value.
 */
export async function submitSecureEnvVariable(input: {
  projectId: string;
  name: string;
  value: string;
  target: EnvTarget;
  actorUserId: string;
}): Promise<{
  ok: boolean;
  status: number;
  message: string;
  metadata?: {
    name: string;
    service: string;
    target: EnvTarget;
    configured: true;
    restartRequired: boolean;
    vercelEnvId?: string;
  };
  audit: {
    actorUserId: string;
    name: string;
    target: EnvTarget;
    result: 'success' | 'failed';
    at: string;
  };
}> {
  const at = new Date().toISOString();
  const validated = validateEnvSubmission({
    name: input.name,
    value: input.value,
    target: input.target,
  });
  if (!validated.ok) {
    return {
      ok: false,
      status: 400,
      message: validated.error,
      audit: { actorUserId: input.actorUserId, name: input.name, target: input.target, result: 'failed', at },
    };
  }

  if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.projectId)) {
    return {
      ok: false,
      status: 400,
      message: 'Vercel project id is invalid.',
      audit: { actorUserId: input.actorUserId, name: input.name, target: input.target, result: 'failed', at },
    };
  }

  const entry = validated.entry;
  const body = {
    key: entry.name,
    value: input.value,
    type: entry.public ? 'plain' : 'encrypted',
    target: [mapTarget(input.target)],
  };

  // Create-or-update without reading back secret values.
  const created = await vercelFetch(`/v10/projects/${encodeURIComponent(input.projectId)}/env`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!created.ok) {
    // Attempt update of an existing variable by listing metadata only, then PATCH.
    const listed = await vercelFetch(`/v9/projects/${encodeURIComponent(input.projectId)}/env`);
    if (!listed.ok || !listed.data || typeof listed.data !== 'object') {
      return {
        ok: false,
        status: created.status,
        message: created.error,
        audit: { actorUserId: input.actorUserId, name: entry.name, target: input.target, result: 'failed', at },
      };
    }
    const envs = Array.isArray((listed.data as { envs?: unknown }).envs)
      ? (listed.data as { envs: Array<{ id?: string; key?: string; target?: string[] }> }).envs
      : [];
    const existing = envs.find(
      (item) => item.key === entry.name && Array.isArray(item.target) && item.target.includes(mapTarget(input.target)),
    );
    if (!existing?.id) {
      return {
        ok: false,
        status: created.status,
        message: created.error,
        audit: { actorUserId: input.actorUserId, name: entry.name, target: input.target, result: 'failed', at },
      };
    }
    const updated = await vercelFetch(
      `/v9/projects/${encodeURIComponent(input.projectId)}/env/${encodeURIComponent(existing.id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          value: input.value,
          type: entry.public ? 'plain' : 'encrypted',
          target: [mapTarget(input.target)],
        }),
      },
    );
    if (!updated.ok) {
      return {
        ok: false,
        status: updated.status,
        message: updated.error,
        audit: { actorUserId: input.actorUserId, name: entry.name, target: input.target, result: 'failed', at },
      };
    }
    return {
      ok: true,
      status: 200,
      message: 'Environment variable updated. Value is not returned.',
      metadata: {
        name: entry.name,
        service: entry.service,
        target: input.target,
        configured: true,
        restartRequired: entry.restartRequired,
        vercelEnvId: existing.id,
      },
      audit: { actorUserId: input.actorUserId, name: entry.name, target: input.target, result: 'success', at },
    };
  }

  const createdId =
    created.data && typeof created.data === 'object' && 'id' in created.data
      ? String((created.data as { id: unknown }).id || '')
      : undefined;

  return {
    ok: true,
    status: 201,
    message: 'Environment variable configured. Value is not returned.',
    metadata: {
      name: entry.name,
      service: entry.service,
      target: input.target,
      configured: true,
      restartRequired: entry.restartRequired,
      vercelEnvId: createdId || undefined,
    },
    audit: { actorUserId: input.actorUserId, name: entry.name, target: input.target, result: 'success', at },
  };
}

export async function listVercelEnvMetadata(projectId: string): Promise<{
  ok: boolean;
  message: string;
  variables: Array<{ name: string; targets: string[]; type: string; id: string; service: string | null }>;
}> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(projectId)) {
    return { ok: false, message: 'Vercel project id is invalid.', variables: [] };
  }
  const listed = await vercelFetch(`/v9/projects/${encodeURIComponent(projectId)}/env`);
  if (!listed.ok || !listed.data || typeof listed.data !== 'object') {
    return { ok: false, message: listed.ok === false ? listed.error : 'Unable to list environment metadata.', variables: [] };
  }
  const envs = Array.isArray((listed.data as { envs?: unknown }).envs)
    ? (listed.data as { envs: Array<{ id?: string; key?: string; target?: string[]; type?: string }> }).envs
    : [];
  return {
    ok: true,
    message: 'Environment metadata loaded (values hidden).',
    variables: envs
      .filter((item) => item.id && item.key)
      .map((item) => ({
        id: String(item.id),
        name: String(item.key),
        targets: Array.isArray(item.target) ? item.target.map(String) : [],
        type: String(item.type || 'encrypted'),
        service: findCatalogEntry(String(item.key))?.service || null,
      })),
  };
}
