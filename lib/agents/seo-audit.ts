import { fetchPublicHtml, fetchPublicText, PublicSiteFetchError } from '../public-site-fetch.ts';

type FetchResult = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  html: string;
  url: string;
};
type Fetchers = {
  fetchHtml: (url: string) => Promise<FetchResult>;
  fetchText: (url: string) => Promise<FetchResult>;
};
type Finding = { severity: 'critical' | 'high' | 'medium' | 'low' | 'info'; code: string; finding: string; evidence: string };

function cleanText(value: string) {
  return value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/\s+/g, ' ').trim();
}

function meta(html: string, key: string, attribute: 'name' | 'property' = 'name') {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<meta\\b(?=[^>]*\\b${attribute}\\s*=\\s*["']${escaped}["'])[^>]*\\bcontent\\s*=\\s*["']([^"']*)["'][^>]*>`, 'i');
  const match = html.match(pattern);
  return match ? cleanText(match[1]) : '';
}

function header(headers: FetchResult['headers'], name: string) {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value.join(', ') : value || '';
}

function urlsFromSitemap(xml: string) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map(match => cleanText(match[1])).slice(0, 5000);
}

export async function runSeoAudit(task: string, fetchers: Fetchers = {
  fetchHtml: fetchPublicHtml as Fetchers['fetchHtml'],
  fetchText: fetchPublicText as Fetchers['fetchText'],
}) {
  const candidates = [...task.matchAll(/https?:\/\/[^\s<>"')]+/gi)].map(match => match[0].replace(/[.,;]+$/, ''));
  const target = candidates.find(candidate => {
    try { return !/github\.com$/i.test(new URL(candidate).hostname) && !/github\.com\//i.test(candidate); }
    catch { return false; }
  });
  if (!target) {
    return { status: 'failed', error_code: 'seo_target_missing', message: 'Include a public website URL in the task.' };
  }

  try {
    const page = await fetchers.fetchHtml(target);
    const html = page.html;
    const title = cleanText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
    const description = meta(html, 'description');
    const canonical = html.match(/<link\b(?=[^>]*\brel\s*=\s*["'][^"']*canonical[^"']*["'])[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/i)?.[1] || '';
    const robotsMeta = meta(html, 'robots');
    const xRobotsTag = header(page.headers, 'x-robots-tag');
    const h1 = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(match => cleanText(match[1]));
    const h2Count = [...html.matchAll(/<h2\b/gi)].length;
    const images = [...html.matchAll(/<img\b[^>]*>/gi)].map(match => match[0]);
    const imagesMissingAlt = images.filter(image => !/\balt\s*=\s*["'][^"']*["']/i.test(image)).length;
    const internalLinks = [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)]
      .map(match => match[1]).filter(href => href.startsWith('/') || href.startsWith(new URL(page.url).origin));
    const jsonLdCount = [...html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>/gi)].length;
    const ogTitle = meta(html, 'og:title', 'property');
    const ogDescription = meta(html, 'og:description', 'property');
    const twitterCard = meta(html, 'twitter:card');
    const adsenseMeta = meta(html, 'google-adsense-account');
    const adsenseScript = /(?:pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js|adsbygoogle\.js)/i.test(html);
    const origin = new URL(page.url).origin;

    let robotsStatus: number | null = null;
    let robotsText = '';
    try {
      const robots = await fetchers.fetchText(new URL('/robots.txt', origin).toString());
      robotsStatus = robots.status;
      robotsText = robots.html;
    } catch (error) {
      robotsText = error instanceof PublicSiteFetchError ? error.message : 'Fetch failed';
    }

    const sitemapDirective = robotsText.match(/^\s*Sitemap:\s*(\S+)/im)?.[1];
    const sitemapUrl = sitemapDirective || new URL('/sitemap.xml', origin).toString();
    let sitemapStatus: number | null = null;
    let sitemapCount = 0;
    let sitemapError = '';
    try {
      const sitemap = await fetchers.fetchText(sitemapUrl);
      sitemapStatus = sitemap.status;
      sitemapCount = urlsFromSitemap(sitemap.html).length;
    } catch (error) {
      sitemapError = error instanceof PublicSiteFetchError ? error.message : 'Fetch failed';
    }

    const findings: Finding[] = [];
    if (page.status < 200 || page.status >= 300) findings.push({ severity: 'high', code: 'page_http_status', finding: 'The audited page did not return a successful HTTP status.', evidence: `HTTP ${page.status}` });
    if (!title) findings.push({ severity: 'high', code: 'missing_title', finding: 'The page has no HTML title.', evidence: 'No <title> element was found.' });
    else if (title.length > 60) findings.push({ severity: 'low', code: 'long_title', finding: 'The title may be truncated in search results.', evidence: `Title length: ${title.length} characters.` });
    if (!description) findings.push({ severity: 'high', code: 'missing_description', finding: 'The page has no meta description.', evidence: 'No meta description was found.' });
    else if (description.length < 70 || description.length > 160) findings.push({ severity: 'low', code: 'description_length', finding: 'The meta description length is outside a common preview target.', evidence: `Description length: ${description.length} characters.` });
    if (!canonical) findings.push({ severity: 'medium', code: 'missing_canonical', finding: 'The page has no canonical link.', evidence: 'No rel=canonical link was found.' });
    if (h1.length !== 1) findings.push({ severity: 'medium', code: 'h1_count', finding: 'The page should have one clear primary H1 heading.', evidence: `Found ${h1.length} H1 headings.` });
    if (!ogTitle || !ogDescription) findings.push({ severity: 'low', code: 'open_graph_metadata', finding: 'Open Graph title or description is missing.', evidence: `og:title=${Boolean(ogTitle)}; og:description=${Boolean(ogDescription)}.` });
    if (!twitterCard) findings.push({ severity: 'low', code: 'twitter_card', finding: 'Twitter card metadata is missing.', evidence: 'No twitter:card meta tag was found.' });
    if (imagesMissingAlt) findings.push({ severity: 'medium', code: 'image_alt', finding: 'Some images lack an explicit alt attribute.', evidence: `${imagesMissingAlt} of ${images.length} img elements lack alt.` });
    if (robotsMeta && /noindex/i.test(robotsMeta) || /noindex/i.test(xRobotsTag)) findings.push({ severity: 'critical', code: 'page_noindex', finding: 'The audited page has a noindex directive.', evidence: `meta robots=${robotsMeta || '(none)'}; X-Robots-Tag=${xRobotsTag || '(none)'}.` });
    if (robotsStatus === null) findings.push({ severity: 'medium', code: 'robots_unavailable', finding: 'robots.txt could not be read.', evidence: robotsText || 'No response received.' });
    if (sitemapStatus === null) findings.push({ severity: 'medium', code: 'sitemap_unavailable', finding: 'The sitemap could not be read.', evidence: sitemapError || 'No response received.' });
    else if (sitemapCount === 0) findings.push({ severity: 'medium', code: 'sitemap_empty', finding: 'The sitemap response contained no <loc> URLs.', evidence: `HTTP ${sitemapStatus}; 0 URLs parsed.` });
    if (!jsonLdCount) findings.push({ severity: 'low', code: 'structured_data', finding: 'No JSON-LD structured data script was found on this page.', evidence: '0 application/ld+json scripts.' });

    return {
      status: 'completed',
      audit_type: 'read_only_live_http_seo',
      audited_at: new Date().toISOString(),
      url: page.url,
      http_status: page.status,
      page: { title, title_length: title.length, description, description_length: description.length, canonical, robots_meta: robotsMeta || null, x_robots_tag: xRobotsTag || null, h1, h2_count: h2Count, internal_link_count: internalLinks.length, image_count: images.length, images_missing_alt: imagesMissingAlt, json_ld_scripts: jsonLdCount, og_title: ogTitle || null, og_description: ogDescription || null, twitter_card: twitterCard || null },
      crawl: { robots_url: new URL('/robots.txt', origin).toString(), robots_http_status: robotsStatus, robots_sitemap_directive: sitemapDirective || null, sitemap_url: sitemapUrl, sitemap_http_status: sitemapStatus, sitemap_url_count: sitemapCount },
      adsense: { publisher_meta_present: Boolean(adsenseMeta), ads_script_present: adsenseScript, status: adsenseMeta || adsenseScript ? 'tag_detected' : 'not_detected', note: 'No AdSense approval, account status, or monetization eligibility can be inferred from page tags alone.' },
      performance: { status: 'not_measured', reason: 'This read-only audit did not call Google PageSpeed Insights or a paid performance API.' },
      search_console: { status: 'not_accessible', reason: 'No authorized Search Console connector or exported report was supplied to this run.' },
      repository: { status: 'not_read', reason: 'This executor audits public HTTP resources only; it does not claim repository file access.' },
      findings,
      summary: { finding_count: findings.length, critical: findings.filter(f => f.severity === 'critical').length, high: findings.filter(f => f.severity === 'high').length, medium: findings.filter(f => f.severity === 'medium').length, low: findings.filter(f => f.severity === 'low').length },
    };
  } catch (error) {
    const message = error instanceof PublicSiteFetchError ? error.message : 'The public website audit could not be completed.';
    return { status: 'failed', error_code: error instanceof PublicSiteFetchError ? `http_${error.statusCode}` : 'seo_audit_failed', url: target, message };
  }
}
