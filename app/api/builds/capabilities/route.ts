import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function entitledPlans(variable: string) {
  const allowed = new Set(['pro', 'business']);
  return [...new Set((process.env[variable] || '').split(',').map(value => value.trim().toLowerCase()).filter(value => allowed.has(value)))];
}

export async function GET() {
  const token = process.env.GODOT_BUILD_SERVICE_TOKEN?.trim();
  const endpoint = process.env.GODOT_BUILD_SERVICE_URL?.trim();
  let godotReady = false;
  let presets: string[] = [];
  if (endpoint && token) {
    try {
      const url = new URL(endpoint);
      if ((url.protocol === 'https:' || process.env.NODE_ENV !== 'production') && !url.username && !url.password && !url.search && !url.hash) {
        const response = await fetch(`${url.toString().replace(/\/$/, '')}/v1/capabilities`, {
          headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(2500), cache: 'no-store',
        });
        if (response.ok) {
          const body = await response.json().catch(() => null);
          presets = Array.isArray(body?.presets) ? body.presets.filter((preset: unknown): preset is string => typeof preset === 'string' && /^[A-Za-z0-9 _.-]{1,80}$/.test(preset)) : [];
          godotReady = body?.ready === true && presets.length > 0;
        }
      }
    } catch { /* Report setup required without returning service error details. */ }
  }
  return NextResponse.json({
    mobileApp: { eligiblePlans: entitledPlans('LEONARDX_MOBILE_APP_PLANS'), provider: 'Expo/EAS', configured: Boolean(process.env.EXPO_TOKEN?.trim()), projectLinkRequired: true },
    game: { eligiblePlans: entitledPlans('LEONARDX_GAME_PLANS'), provider: 'Godot', configured: godotReady, presets: godotReady ? presets : [] },
    standardMonthlyExcluded: true,
    creditPolicy: 'Cloud builds consume the existing monthly build allowance. No separate LeonardX credit prices are configured.',
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
