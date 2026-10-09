export type VisualIdentity = 'neural-orbit' | 'quantum-halo' | 'agent-network' | 'intelligence-portal';

const routeIdentities: Array<[string, VisualIdentity]> = [
  ['/leo-ai', 'quantum-halo'], ['/app', 'quantum-halo'],
  ['/agents', 'agent-network'], ['/admin/agents', 'agent-network'], ['/projects', 'intelligence-portal'],
  ['/setup', 'intelligence-portal'], ['/auth', 'intelligence-portal'], ['/dashboard', 'neural-orbit'],
];

export function resolveVisualIdentity(pathname: string | null): VisualIdentity {
  const route = pathname || '/';
  return routeIdentities.find(([prefix]) => route === prefix || route.startsWith(`${prefix}/`))?.[1] ?? 'neural-orbit';
}
