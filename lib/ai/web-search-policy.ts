/** Conservative policy: use Gemini's grounded web search only when the user asks for it
 * or the answer depends on changing/current information. This avoids searching every chat turn.
 */
const SEARCH_REQUEST = /\b(search (the )?web|web search|look (it )?up online|google (it|search)|find (current|recent|latest|today'?s?) (news|information|price|updates?)|browse (the )?web|research (this|the|online)|sources? and citations?)\b/i;
const FRESHNESS_DEPENDENT = /\b(latest|current|currently|today|tonight|this week|this month|recent|right now|as of \d{4}|202[5-9]|news|price|pricing today|availability|release notes|newly released|updated recently)\b/i;

export function shouldUseWebSearch(message: string): boolean {
  const text = message.trim();
  if (!text || text.length > 12_000) return false;
  return SEARCH_REQUEST.test(text) || FRESHNESS_DEPENDENT.test(text);
}
