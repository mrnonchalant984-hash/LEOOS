export type UsageRow = { key_id: string; created_at: string };

/** Summarises raw api_usage rows into 24h/7d totals, per-key counts and a 7-day (UTC) series. */
export function summarizeUsage(rows: UsageRow[], now = new Date()) {
  const dayMs = 864e5;
  const days: { date: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) days.push({ date: new Date(now.getTime() - i * dayMs).toISOString().slice(0, 10), count: 0 });
  const byDay = new Map(days.map(d => [d.date, d]));
  const perKey: Record<string, number> = {};
  let last24h = 0, last7d = 0;
  for (const r of rows) {
    const t = new Date(r.created_at).getTime();
    if (!Number.isFinite(t) || t > now.getTime() || now.getTime() - t > 7 * dayMs) continue;
    last7d++;
    if (now.getTime() - t <= dayMs) last24h++;
    perKey[r.key_id] = (perKey[r.key_id] || 0) + 1;
    const bucket = byDay.get(new Date(t).toISOString().slice(0, 10));
    if (bucket) bucket.count++;
  }
  return { last24h, last7d, perKey, days };
}
