import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function entitledPlans(variable: string) {
  const allowed = new Set(['pro', 'business']);
  return [...new Set((process.env[variable] || '').split(',').map(value => value.trim().toLowerCase()).filter(value => allowed.has(value)))];
}

export async function GET() {
  return NextResponse.json({
    mobileApp: { eligiblePlans: entitledPlans('LEONARDX_MOBILE_APP_PLANS'), provider: 'Expo/EAS', configured: Boolean(process.env.EXPO_TOKEN?.trim()), projectLinkRequired: true },
    browserGame: { eligiblePlans: entitledPlans('LEONARDX_GAME_PLANS'), provider: 'Browser-native Canvas/Three.js', configured: true, nativeBuildRequired: false },
    standardMonthlyExcluded: true,
    creditPolicy: 'Native mobile cloud builds consume the existing monthly build allowance. Browser games run in a sandboxed browser preview and do not use native build workers.',
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
