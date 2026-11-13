/**
 * Generic supplier webhook adapter. A supplier must implement the documented
 * LeonardX dispatch contract; supplier-specific adapters can replace this module.
 * Secrets are server-only environment configuration, never accepted from clients.
 */
export type SupplierConnectorConfig = { endpoint: string; token: string; provider: string };
export function getSupplierConnector(supplierId: string): SupplierConnectorConfig | null {
  const raw = process.env.STORE_SUPPLIER_CONNECTORS_JSON;
  if (!raw) return null;
  let config: Record<string, unknown>;
  try { config = JSON.parse(raw) as Record<string, unknown>; } catch { throw new Error('STORE_SUPPLIER_CONNECTORS_JSON is invalid JSON.'); }
  const entry = config[supplierId];
  if (!entry || typeof entry !== 'object') return null;
  const value = entry as Record<string, unknown>;
  if (typeof value.endpoint !== 'string' || typeof value.token !== 'string' || typeof value.provider !== 'string') throw new Error('Supplier connector configuration is incomplete.');
  const endpoint = new URL(value.endpoint);
  const allowedHosts = (process.env.STORE_SUPPLIER_CONNECTOR_ALLOWED_HOSTS || '').split(',').map(host => host.trim().toLowerCase()).filter(Boolean);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || (endpoint.port && endpoint.port !== '443') || !allowedHosts.includes(endpoint.hostname.toLowerCase())) throw new Error('Supplier connector endpoint must use HTTPS and a host explicitly listed in STORE_SUPPLIER_CONNECTOR_ALLOWED_HOSTS.');
  return { endpoint: endpoint.toString(), token: value.token, provider: value.provider.slice(0, 60) };
}

export async function dispatchSupplierFulfillment(input: {
  supplierId: string; fulfillmentId: string; orderId: string; sku: string; quantity: number; idempotencyKey: string;
}): Promise<{ accepted: boolean; reference?: string; statusCode: number }> {
  const connector = getSupplierConnector(input.supplierId);
  if (!connector) throw new Error('No external supplier connector is configured for this supplier.');
  const response = await fetch(connector.endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${connector.token}`, 'Content-Type': 'application/json', 'Idempotency-Key': input.idempotencyKey, 'X-LeonardX-Event': 'fulfillment.create' },
    body: JSON.stringify({ event: 'fulfillment.create', version: 1, fulfillment: { id: input.fulfillmentId, order_id: input.orderId, supplier_sku: input.sku, quantity: input.quantity } }),
    cache: 'no-store', signal: AbortSignal.timeout(12_000),
  });
  const result = await response.json().catch(() => null) as { accepted?: unknown; reference?: unknown } | null;
  if (!response.ok || result?.accepted !== true) return { accepted: false, statusCode: response.status };
  return { accepted: true, reference: typeof result.reference === 'string' ? result.reference.slice(0, 200) : undefined, statusCode: response.status };
}
