import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const present = (value?: string | null) => Boolean(value?.trim());

export async function GET(req: NextRequest) {
  const context = await requireOwner(req);
  if (!context || !context.profile.twofa_verified) {
    return NextResponse.json({ error: 'Owner access and a trusted 2FA device are required. Open /admin to complete device verification, then reload this page.' }, { status: 403 });
  }

  // Report presence only. Never return credential values or imply that a configured
  // integration has passed a live health, permission, or isolation test.
  const environment = {
    supabaseUrl: present(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseServiceRole: present(process.env.SUPABASE_SERVICE_ROLE_KEY),
    geminiKey: present(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    vercelToken: present(process.env.VERCEL_TOKEN),
    githubCredential: present(process.env.GITHUB_TOKEN) || present(process.env.GITHUB_APP_ID) && present(process.env.GITHUB_APP_PRIVATE_KEY),
    workflowWorkerEnabled: process.env.WORKFLOW_WORKER_ENABLED === 'true',
    workflowWorkerSecret: present(process.env.WORKFLOW_WORKER_SECRET),
    workspaceRuntimeProvider: (process.env.LEO_WORKSPACE_RUNTIME_PROVIDER || 'github_actions').trim(),
    workspaceRuntimeRepository: present(process.env.LEO_WORKSPACE_GITHUB_REPOSITORY),
    imageModel: process.env.LEO_GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image',
    audioModel: process.env.LEO_GEMINI_AUDIO_MODEL || 'gemini-3.5-flash-lite',
  };

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    environment,
    note: 'Environment presence is not a live integration or production-readiness result.',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
