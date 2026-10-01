import { google } from 'googleapis';

function credentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Google service account is not configured.');
  const parsed = JSON.parse(raw);
  return new google.auth.GoogleAuth({ credentials: parsed, scopes: [
    'https://www.googleapis.com/auth/webmasters',
    'https://www.googleapis.com/auth/analytics.readonly',
  ]});
}

export async function submitSitemap(siteUrl: string, sitemapUrl: string) {
  const auth = credentials();
  const searchconsole = google.searchconsole({ version: 'v1', auth });
  await searchconsole.sitemaps.submit({ siteUrl, feedpath: sitemapUrl });
  return { submitted: true, siteUrl, sitemapUrl };
}

export async function getSearchConsoleSitemaps(siteUrl: string) {
  const auth = credentials();
  const searchconsole = google.searchconsole({ version: 'v1', auth });
  const result = await searchconsole.sitemaps.list({ siteUrl });
  return result.data.sitemap || [];
}

export async function getAnalyticsReport(propertyId: string, startDate = '30daysAgo', endDate = 'today') {
  const auth = credentials();
  const analytics = google.analyticsdata({ version: 'v1beta', auth });
  const result = await analytics.properties.runReport({
    property: propertyId.startsWith('properties/') ? propertyId : `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }, { name: 'conversions' }],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    },
  });
  return result.data;
}
