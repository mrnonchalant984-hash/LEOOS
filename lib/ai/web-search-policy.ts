/** Conservative policy: use Gemini's grounded web search only when the user asks for it
 * or the answer depends on changing/current information. This avoids searching every chat turn.
 */
const SEARCH_REQUEST = /\b(search(\s+(the\s+)?(web|internet|online))?(\s+for)?|web\s+search|look\s+(it\s+)?up(\s+online)?|check\s+(online|the\s+web|the\s+internet)|google\s+(it|search)|find\s+(online|on\s+the\s+web|on\s+the\s+internet|current|recent|latest|today'?s?)|browse\s+(the\s+)?(web|internet)|research\s+(this|the|online)|sources?\s+and\s+citations?)\b/i;
const FRESHNESS_DEPENDENT = /\b(latest|current|currently|today|tonight|this week|this month|recent|right now|as of \d{4}|202[5-9]|news|price|pricing today|availability|release notes|newly released|updated recently)\b/i;

export function shouldUseWebSearch(message: string): boolean {
  const text = message.trim();
  if (!text || text.length > 12_000) return false;
  return SEARCH_REQUEST.test(text) || FRESHNESS_DEPENDENT.test(text);
}
