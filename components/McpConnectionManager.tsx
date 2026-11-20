'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';

const TINYFISH_MCP_ENDPOINT = 'https://agent.tinyfish.ai/mcp';

type McpTool = {
  name: string;
  description: string;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
  approved: boolean;
  access_level: 'read' | 'write';
  allowed_agent_ids: string[];
};
type McpAgentOption = { id: string; name: string };
type McpServer = {
  id: string;
  name: string;
  endpoint_url: string;
  enabled: boolean;
  tools: McpTool[];
};

function subscribeToBrowserOrigin() {
  return () => {};
}

function isTinyFishEndpoint(endpoint: string) {
  try {
    return new URL(endpoint).hostname.toLowerCase() === 'agent.tinyfish.ai';
  } catch {
    return false;
  }
}

export function McpConnectionManager({ configuredLeonardXMcpUrl }: { configuredLeonardXMcpUrl?: string }) {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [agentOptions, setAgentOptions] = useState<McpAgentOption[]>([]);
  const [name, setName] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [bearerToken, setBearerToken] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const browserOrigin = useSyncExternalStore(
    subscribeToBrowserOrigin,
    () => window.location.origin,
    () => '',
  );
  const leonardXMcpEndpoint = configuredLeonardXMcpUrl || (browserOrigin ? `${browserOrigin}/mcp` : '');
  const tinyFishConnection = servers.find(server => isTinyFishEndpoint(server.endpoint_url));
  const tinyFishConnected = Boolean(tinyFishConnection?.enabled);

  const fetchServers = useCallback(async () => {
    const response = await fetch('/api/mcp/servers', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'MCP connections could not be loaded.');
    return {
      servers: (data.servers || []) as McpServer[],
      agentOptions: (data.agent_options || []) as McpAgentOption[],
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await fetchServers();
      setServers(data.servers);
      setAgentOptions(data.agentOptions);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'MCP connections could not be loaded.');
    }
  }, [fetchServers]);

  useEffect(() => {
    void fetchServers().then(data => {
      setServers(data.servers);
      setAgentOptions(data.agentOptions);
    }).catch(cause => {
      setError(cause instanceof Error ? cause.message : 'MCP connections could not be loaded.');
    });
  }, [fetchServers]);

  async function mutate(url: string, method: string, body?: Record<string, unknown>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The MCP operation failed.');
      setNotice(data.message || 'MCP connection updated.');
      await load();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The MCP operation failed.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addServer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await mutate('/api/mcp/servers', 'POST', {
      name,
      endpoint_url: endpoint,
      ...(bearerToken ? { bearer_token: bearerToken } : {}),
    });
    if (ok) {
      setName('');
      setEndpoint('');
      setBearerToken('');
    }
  }

  function prepareTinyFishConnection() {
    setName('TinyFish Browser Automation');
    setEndpoint(TINYFISH_MCP_ENDPOINT);
    setNotice('TinyFish endpoint added to the form. Submit “Discover and add server” to connect this account and discover its tools.');
    setError('');
  }

  return (
    <section className="mt-8 rounded-2xl border border-white/10 bg-white/[.03] p-5">
      <div className="mb-5 rounded-xl border border-violet-300/20 bg-violet-300/[.05] p-4">
        <h3 className="font-semibold">Connect Bram to ChatGPT or Claude</h3>
        <p className="mt-1 text-sm leading-6 text-zinc-300">
          Add this Bram MCP endpoint in your AI assistant’s connector settings. Do not enter <code>chatgpt.com</code> or <code>claude.ai</code> in the remote-server form below; those are assistant websites, not MCP servers.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100">
            {leonardXMcpEndpoint || 'https://your-braverton-domain.example/mcp'}
          </code>
          <button
            type="button"
            disabled={!leonardXMcpEndpoint}
            onClick={() => void (async () => {
              try {
                await navigator.clipboard.writeText(leonardXMcpEndpoint);
                setNotice('Bram MCP endpoint copied. Add it in ChatGPT or Claude connector settings.');
              } catch {
                setError('Copy failed. Select and copy the Bram MCP endpoint manually.');
              }
            })()}
            className="rounded-lg border border-white/15 px-3 py-2 text-sm disabled:opacity-50"
          >
            Copy endpoint
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-500">New connections request project access so the assistant can create projects, save code, and build/deploy within your plan. Review and approve those permissions on the consent screen. If an existing connection is read-only, remove it from Claude or ChatGPT and connect again to refresh its permissions.</p>
      </div>

      <div className="mb-5 rounded-xl border border-sky-300/20 bg-sky-300/[.05] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Browser automation provider</h3>
            <p className="mt-1 text-sm leading-6 text-zinc-300">
              TinyFish is the configured remote MCP route for interactive website actions. Its hostname is allowlisted for outbound MCP requests, but that does not connect or authorize a user account.
            </p>
          </div>
          <span className={tinyFishConnected ? 'rounded-full border border-emerald-400/30 px-3 py-1 text-xs text-emerald-300' : 'rounded-full border border-amber-300/30 px-3 py-1 text-xs text-amber-200'}>
            {tinyFishConnected ? 'Account connection enabled' : 'Account connection required'}
          </span>
        </div>
        <ul className="mt-3 grid gap-2 text-xs leading-5 text-zinc-400">
          <li>• Hosted computer-use browser sessions are disabled. BramChat must use this connected TinyFish MCP server for browser actions; it must not silently fall back to the disabled hosted browser agent.</li>
          <li>• Connect the provider below to discover its tools. Each tool remains blocked until you approve it and choose read-only or write access.</li>
          <li>• Write-capable website actions require explicit confirmation when executed. If TinyFish requires a bearer credential, enter it below; credentials are encrypted at rest.</li>
        </ul>
        {tinyFishConnection && (
          <p className="mt-3 text-xs text-zinc-300">
            {tinyFishConnected ? 'This account has an enabled TinyFish connection.' : 'A TinyFish connection exists but is disabled. Enable it in the connection list below.'}
            {' '}{tinyFishConnection.tools.filter(tool => tool.approved).length} of {tinyFishConnection.tools.length} discovered tools are approved.
          </p>
        )}
        <button
          type="button"
          onClick={prepareTinyFishConnection}
          disabled={busy || tinyFishConnected}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-sky-300/30 px-3 py-2 text-sm text-sky-100 disabled:opacity-50"
        >
          <Plus size={15} /> {tinyFishConnected ? 'TinyFish connected' : 'Set up TinyFish connection'}
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Remote MCP connections</h2>
          <p className="mt-1 max-w-3xl text-sm text-zinc-400">
            Connect an operator-allowlisted HTTPS MCP server. Credentials are encrypted at rest.
            Approve read access for research tools, or explicitly grant write access to connected tools that can change websites. Write-capable tools are never delegated to specialist agents; confirm important actions in chat.
          </p>
        </div>
        <button type="button" onClick={() => { setError(''); setBusy(true); void load().finally(() => setBusy(false)); }} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm disabled:opacity-50">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Reload list
        </button>
      </div>

      <form onSubmit={addServer} className="mt-5 grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-xs text-zinc-400">
          Connection name
          <input required maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="Connection name" className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]" />
        </label>
        <label className="grid gap-1 text-xs text-zinc-400">
          Remote MCP server endpoint
          <input required type="url" value={endpoint} onChange={event => setEndpoint(event.target.value)} placeholder="https://mcp.example.com/endpoint" aria-describedby="mcp-remote-endpoint-help" className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]" />
          <span id="mcp-remote-endpoint-help" className="text-[11px] leading-5 text-zinc-500">Enter a URL supplied by an MCP server provider. It must use HTTPS and its hostname must be operator-allowlisted.</span>
        </label>
        <label className="grid gap-1 text-xs text-zinc-400 md:col-span-2">
          Optional bearer credential
          <input type="password" autoComplete="new-password" maxLength={8192} value={bearerToken} onChange={event => setBearerToken(event.target.value)} placeholder="Bearer credential (optional)" className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]" />
        </label>
        <button disabled={busy} className="inline-flex w-fit items-center gap-2 rounded-lg bg-[var(--gold)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">
          <Plus size={15} /> Discover and add server
        </button>
      </form>

      {error && <p role="alert" className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{notice}</p>}

      <div className="mt-5 grid gap-4">
        {servers.map(server => (
          <article key={server.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-medium">{server.name}</h3>
                <p className="mt-1 break-all text-xs text-zinc-500">{server.endpoint_url}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => void mutate(`/api/mcp/servers/${server.id}/refresh`, 'POST')} className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs disabled:opacity-50">
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Rediscover tools
                </button>
                <button type="button" disabled={busy} onClick={() => void mutate(`/api/mcp/servers/${server.id}`, 'PATCH', { enabled: !server.enabled })} className="rounded-lg border border-white/15 px-3 py-2 text-xs disabled:opacity-50">
                  {server.enabled ? 'Disable' : 'Enable'}
                </button>
                <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Remove ${server.name} and its approvals?`)) void mutate(`/api/mcp/servers/${server.id}`, 'DELETE'); }} aria-label={`Remove ${server.name}`} className="rounded-lg border border-red-500/30 p-2 text-red-200 disabled:opacity-50">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            <p className="mt-3 text-xs text-zinc-400">{server.enabled ? 'Enabled' : 'Disabled'} · {server.tools.length} discovered tools</p>
            {server.tools.length > 0 && (
              <ul className="mt-3 divide-y divide-white/10">
                {server.tools.map(tool => (
                  <li key={tool.name} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="break-all text-sm">{tool.name} {tool.annotations?.readOnlyHint === true && !tool.annotations.destructiveHint && <span className="text-emerald-300">· read-only</span>} {tool.approved && <span className={tool.access_level === 'write' ? 'text-amber-300' : 'text-emerald-300'}>· {tool.access_level} access</span>}</p>
                      <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-500">{tool.description}</p>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-zinc-300">
                      <input type="checkbox" checked={tool.approved} disabled={busy || !server.enabled} onChange={event => void mutate(`/api/mcp/servers/${server.id}/tools`, 'POST', { tool_name: tool.name, approved: event.target.checked, access_level: tool.access_level || 'read', agent_ids: event.target.checked && tool.access_level !== 'write' ? tool.allowed_agent_ids : [] })} />
                      Approve
                    </label>
                    <label className="flex items-center gap-2 text-xs text-zinc-300">
                      Access
                      <select value={tool.access_level || 'read'} disabled={busy || !server.enabled || tool.annotations?.readOnlyHint === true} onChange={event => void mutate(`/api/mcp/servers/${server.id}/tools`, 'POST', { tool_name: tool.name, approved: true, access_level: event.target.value, agent_ids: event.target.value === 'read' ? tool.allowed_agent_ids : [] })} className="rounded-md border border-white/15 bg-black/40 px-2 py-1 text-xs">
                        <option value="read">Read only</option>
                        <option value="write" disabled={tool.annotations?.readOnlyHint === true}>Write access</option>
                      </select>
                    </label>
                    {tool.approved && tool.access_level !== 'write' && tool.annotations?.readOnlyHint === true && !tool.annotations.destructiveHint && agentOptions.length > 0 && (
                      <details className="basis-full rounded-lg border border-white/10 px-3 py-2">
                        <summary className="cursor-pointer text-xs text-zinc-300">Grant to specialist agents ({tool.allowed_agent_ids.length})</summary>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          {agentOptions.map(agent => {
                            const checked = tool.allowed_agent_ids.includes(agent.id);
                            return (
                              <label key={agent.id} className="flex items-center gap-2 text-xs text-zinc-400">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={busy || !server.enabled}
                                  onChange={event => {
                                    const nextIds = event.target.checked
                                      ? [...tool.allowed_agent_ids, agent.id]
                                      : tool.allowed_agent_ids.filter(id => id !== agent.id);
                                    void mutate(`/api/mcp/servers/${server.id}/tools`, 'POST', {
                                      tool_name: tool.name,
                                      approved: true,
                                      agent_ids: nextIds,
                                    });
                                  }}
                                />
                                {agent.name}
                              </label>
                            );
                          })}
                        </div>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
        {!busy && servers.length === 0 && <p className="rounded-lg border border-dashed border-white/15 p-5 text-sm text-zinc-500">No remote MCP servers are connected.</p>}
      </div>
    </section>
  );
}
