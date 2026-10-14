export type OfflineEvent = { idempotency_key: string; kind: 'draft' | 'workforce_task'; payload: Record<string, unknown>; created_at: number };
const DB_NAME = 'leonardx-offline-outbox'; const STORE = 'events';
function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Offline storage is unavailable in this browser.'));
  return new Promise((resolve, reject) => { const request = indexedDB.open(DB_NAME, 1); request.onupgradeneeded = () => { const db = request.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'idempotency_key' }); }; request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error || new Error('Offline storage failed.')); });
}
export async function enqueueOfflineEvent(event: Omit<OfflineEvent, 'created_at'>): Promise<void> {
  const db = await openDb(); await new Promise<void>((resolve, reject) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put({ ...event, created_at: Date.now() }); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error || new Error('Offline queue write failed.')); }); db.close();
}
export async function listOfflineEvents(limit = 50): Promise<OfflineEvent[]> {
  const db = await openDb(); const rows = await new Promise<OfflineEvent[]>((resolve, reject) => { const tx = db.transaction(STORE, 'readonly'); const request = tx.objectStore(STORE).getAll(); request.onsuccess = () => resolve((request.result as OfflineEvent[]).sort((a,b) => a.created_at-b.created_at).slice(0, Math.max(1, Math.min(50, limit)))); request.onerror = () => reject(request.error); }); db.close(); return rows;
}
export async function acknowledgeOfflineEvents(keys: string[]): Promise<void> {
  const db = await openDb(); await new Promise<void>((resolve, reject) => { const tx = db.transaction(STORE, 'readwrite'); const store = tx.objectStore(STORE); for (const key of keys) store.delete(key); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error || new Error('Offline queue acknowledgement failed.')); }); db.close();
}
export async function synchronizeOfflineOutbox(): Promise<{ accepted: number; rejected: number }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('You are offline. Your queue remains saved on this device.');
  const events = await listOfflineEvents(50); if (!events.length) return { accepted: 0, rejected: 0 };
  const response = await fetch('/api/offline/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', cache: 'no-store', body: JSON.stringify({ events: events.map(({ idempotency_key, kind, payload }) => ({ idempotency_key, kind, payload })) }) });
  const data = await response.json().catch(() => ({})); if (!response.ok || !Array.isArray(data.results)) throw new Error(data.error || 'Offline synchronization failed.');
  const finished = data.results.filter((item: { status?: string }) => ['accepted', 'queued'].includes(String(item.status))).map((item: { idempotency_key: string }) => item.idempotency_key); await acknowledgeOfflineEvents(finished);
  return { accepted: Number(data.accepted || 0), rejected: Number(data.rejected || 0) };
}
