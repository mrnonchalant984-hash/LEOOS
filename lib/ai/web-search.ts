export type WebSearchResult = { title: string; url: string; content: string };

export class WebSearchError extends Error {
  readonly status: number;
  constructor(message: string, status = 503) {
    super(message);
    this.name = 'WebSearchError';
    this.status = status;
  }
}

/**
 * Search the public web through Tavily's no-card Researcher tier.
 * Tavily hard-stops at the free monthly allowance unless pay-as-you-go is
 * explicitly enabled in the provider account. No paid fallback is attempted.
 */
export async function searchWeb(query: string): Promise<WebSearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) {
    throw new WebSearchError(
      'Web Research search is not configured. Add TAVILY_API_KEY to the server environment. You can still research specific URLs without a search key.',
      503,
    );
  }

  let response: Response;
  try {
    response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: query.slice(0, 4000),
        search_depth: 'basic',
        topic: 'general',
        max_results: 6,
        include_answer: false,
        include_raw_content: false,
      }),
      signal: AbortSignal.timeout(12_000),
      cache: 'no-store',
    });
  } catch {
    throw new WebSearchError('The web search provider could not be reached. Retry shortly.', 502);
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new WebSearchError('The configured web search credential was rejected. Check TAVILY_API_KEY.', 503);
    }
    if (response.status === 429) {
      throw new WebSearchError('The web search provider rate limit or free monthly allowance has been reached. No paid fallback was used.', 429);
    }
    throw new WebSearchError(`The web search provider returned HTTP ${response.status}.`, 502);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new WebSearchError('The web search provider returned an invalid response.', 502);
  }
  const results = payload && typeof payload === 'object' && Array.isArray((payload as { results?: unknown }).results)
    ? (payload as { results: unknown[] }).results : [];
  return results.flatMap((item): WebSearchResult[] => {
    if (!item || typeof item !== 'object') return [];
    const value = item as { title?: unknown; url?: unknown; content?: unknown };
    if (typeof value.url !== 'string' || typeof value.content !== 'string') return [];
    try {
      const url = new URL(value.url);
      if (!['http:', 'https:'].includes(url.protocol)) return [];
      return [{
        title: typeof value.title === 'string' && value.title.trim() ? value.title.trim().slice(0, 300) : url.hostname,
        url: url.toString(),
        content: value.content.trim().slice(0, 3500),
      }];
    } catch {
      return [];
    }
  }).filter((item, index, all) => all.findIndex(other => other.url === item.url) === index).slice(0, 6);
}
