'use client';

import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { sanitizeVercelPageEvent } from '@/lib/monitoring-utils';

export function ObservabilityScripts() {
  return <>
    <Analytics beforeSend={sanitizeVercelPageEvent}/>
    <SpeedInsights sampleRate={0.25} beforeSend={sanitizeVercelPageEvent}/>
  </>;
}
