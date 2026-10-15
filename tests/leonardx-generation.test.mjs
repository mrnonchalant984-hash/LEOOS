import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getAllowedAgentIds, canUseManualAgents, agentAllowed } from '../lib/agents/entitlements.ts';
import { getPlanPriceNgn } from '../lib/pricing.ts';

const migration = await readFile(new URL('../supabase/migrations/20261013110000_leonardx_generation_credits.sql', import.meta.url), 'utf8');
const imageRoute = await readFile(new URL('../lib/generation/images.ts', import.meta.url), 'utf8');
const videoRoute = await readFile(new URL('../app/api/generate-video/route.ts', import.meta.url), 'utf8');
const runwayVideo = await readFile(new URL('../lib/agents/runway-video.ts', import.meta.url), 'utf8');
const studio = await readFile(new URL('../components/studio/StudioWorkspace.tsx', import.meta.url), 'utf8');
const envExample = await readFile(new URL('../.env.example', import.meta.url), 'utf8');

test('free users cannot manually invoke specialist agents', () => {
  assert.deepEqual(getAllowedAgentIds('free'), []);
  assert.equal(canUseManualAgents('free'), false);
  assert.equal(agentAllowed('code-review', 'free'), false);
});

test('Pro and Business expose only explicitly allowed non-generation agents', () => {
  assert.equal(canUseManualAgents('pro'), true);
  assert.equal(agentAllowed('code-review', 'pro'), true);
  assert.equal(agentAllowed('video', 'pro'), false);
  assert.equal(agentAllowed('browser', 'unlimited'), false);
  assert.equal(agentAllowed('developer', 'unlimited'), true);
});

test('owner registry access remains separate from customer entitlements', () => {
  assert.equal(getAllowedAgentIds('free', true), null);
  assert.equal(agentAllowed('browser', 'free', true), true);
});

test('verified subscription prices remain unchanged', () => {
  assert.equal(getPlanPriceNgn('standard', 'monthly'), 12500);
  assert.equal(getPlanPriceNgn('pro', 'monthly'), 31500);
  assert.equal(getPlanPriceNgn('business', 'monthly'), 63000);
});

test('signup bonus is one-time and recorded in an auditable ledger', () => {
  assert.match(migration, /values\(new\.id, 50, 50\)/i);
  assert.match(migration, /welcome-bonus-v1/);
  assert.match(migration, /unique\(user_id, idempotency_key\)/i);
  assert.match(migration, /create trigger leonardx_welcome_bonus_on_profile_created/i);
});

test('platform credit reservation and refunds are server-side atomic functions', () => {
  assert.match(migration, /function public\.reserve_platform_credits/i);
  assert.match(migration, /where user_id=p_user_id for update/i);
  assert.match(migration, /function public\.refund_platform_credits/i);
  assert.match(migration, /function public\.refund_user_feature_credit/i);
  assert.match(migration, /revoke all on function public\.reserve_platform_credits/i);
});

test('image generation supports base64 provider output and private persisted assets', () => {
  assert.match(imageRoute, /b64_json/);
  assert.match(imageRoute, /generated-images\//);
  assert.match(imageRoute, /createSignedUrl/);
  assert.match(imageRoute, /refund_platform_credits/);
  assert.match(imageRoute, /refund_user_feature_credit/);
  assert.match(imageRoute, /unique|request_key/);
});

test('video endpoint gates customers on plan and configured platform-credit conversion', () => {
  assert.match(videoRoute, /planAllows\(plan, 'video-generation'\)/);
  assert.match(videoRoute, /RUNWAY_GEN45_PLATFORM_CREDITS_PER_SECOND/);
  assert.match(videoRoute, /No credits were charged/);
  assert.match(videoRoute, /reserve_platform_credits/);
  assert.match(videoRoute, /provider_cost_estimate_usd/);
});

test('image-to-video uses an owned private image and the existing Runway image-to-video API', () => {
  assert.match(videoRoute, /body\?\.image_asset_id/);
  assert.match(videoRoute, /\.eq\('user_id', ctx\.user\.id\)/);
  assert.match(videoRoute, /createSignedUrl\(sourceAsset\.storage_path, 60 \* 10\)/);
  assert.match(videoRoute, /createRunwayVideo\(\{ prompt, imageUrl,/);
  assert.match(runwayVideo, /payload\.promptImage=opts\.imageUrl/);
  assert.match(runwayVideo, /runway\('\/image_to_video'/);
  assert.match(studio, /Source image/);
  assert.match(studio, /image_asset_id: sourceAssetId/);
});

test('environment template documents video credit conversion without secrets', () => {
  assert.match(envExample, /RUNWAY_GEN45_PLATFORM_CREDITS_PER_SECOND=/);
  assert.match(envExample, /This is NOT the same unit as Runway provider credits/);
  assert.doesNotMatch(envExample, /RUNWAY_GEN45_PLATFORM_CREDITS_PER_SECOND=\d+/);
});
