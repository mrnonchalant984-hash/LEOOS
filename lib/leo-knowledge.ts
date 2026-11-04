import { adminSupabase } from '@/lib/auth';

export type LeoKnowledge = {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  source_type: string;
  source_url?: string | null;
  author?: string | null;
  version?: number;
  status?: string;
  reliability?: number;
  confidence?: number;
  created_at?: string;
  updated_at?: string;
};

const KNOWLEDGE_CACHE_TTL_MS = 30_000;
let activeKnowledgeCache: { rows: LeoKnowledge[]; loadedAt: number } | null = null;

export function getLeoKnowledgeCacheStatus(now = Date.now()) {
  return { enabled: true, ttlMs: KNOWLEDGE_CACHE_TTL_MS, populated: Boolean(activeKnowledgeCache), rows: activeKnowledgeCache?.rows.length || 0, ageMs: activeKnowledgeCache ? Math.max(0, now - activeKnowledgeCache.loadedAt) : null };
}

function terms(text: string) {
  return [...new Set((text.toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g) || []))];
}

function lexicalScore(query: string, row: any) {
  const q = terms(query);
  const hay = `${row.title || ''} ${row.content || ''} ${row.category || ''} ${(row.tags || []).join(' ')}`.toLowerCase();
  let score = 0;
  for (const t of q) {
    if (hay.includes(t)) score += row.title?.toLowerCase().includes(t) ? 3 : 1;
  }
  score += Number(row.reliability || 0) * 0.25 + Number(row.confidence || 0) * 0.25;
  return score;
}

export async function retrieveLeoKnowledge(query: string, limit = 6): Promise<LeoKnowledge[]> {
  if (!query.trim()) return [];
  let rows: LeoKnowledge[];
  const now = Date.now();
  if (activeKnowledgeCache && now - activeKnowledgeCache.loadedAt < KNOWLEDGE_CACHE_TTL_MS) {
    rows = activeKnowledgeCache.rows;
  } else {
    const db = adminSupabase();
    const { data, error } = await db.from('leo_knowledge')
      .select('id,title,content,category,tags,source_type,source_url,author,version,status,reliability,confidence,created_at,updated_at')
      .eq('status', 'active')
      .limit(250);
    if (error) return [];
    rows = (data || []).map((r:any) => ({...r, tags: Array.isArray(r.tags) ? r.tags : []}));
    activeKnowledgeCache = { rows, loadedAt: now };
  }
  return rows
    .map((r:any) => ({r, score: lexicalScore(query, r)}))
    .filter((x:any) => x.score > 0)
    .sort((a:any,b:any) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(10, Math.trunc(limit))))
    .map((x:any) => x.r);
}

export function formatKnowledgeContext(rows: LeoKnowledge[]) {
  if (!rows.length) return '';
  return `\n\nPERSISTENT LEO KNOWLEDGE (use only when relevant; cite uncertainty when sources conflict):\n${rows.map((r,i)=>`[${i+1}] ${r.title} (${r.category}; ${r.source_type}; confidence ${r.confidence ?? 'unknown'})\n${r.content.slice(0,5000)}`).join('\n\n')}`;
}
