import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeUsage } from '../lib/api-usage-core.ts';

const now = new Date('2026-10-08T12:00:00Z');
const ago = h => new Date(now.getTime() - h * 36e5).toISOString();

test('counts 24h and 7d windows and ignores older or future rows', () => {
  const s = summarizeUsage([
    { key_id: 'a', created_at: ago(1) }, { key_id: 'a', created_at: ago(30) },
    { key_id: 'b', created_at: ago(100) }, { key_id: 'b', created_at: ago(24 * 9) },
    { key_id: 'b', created_at: ago(-5) }, { key_id: 'b', created_at: 'garbage' },
  ], now);
  assert.equal(s.last24h, 1);
  assert.equal(s.last7d, 3);
  assert.deepEqual(s.perKey, { a: 2, b: 1 });
});
test('series has 7 consecutive UTC days ending today', () => {
  const s = summarizeUsage([{ key_id: 'a', created_at: ago(1) }], now);
  assert.equal(s.days.length, 7);
  assert.equal(s.days[6].date, '2026-10-08');
  assert.equal(s.days[6].count, 1);
  assert.equal(s.days[0].date, '2026-10-02');
});
