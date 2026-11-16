import { GoogleGenAI } from '@google/genai';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { google } from 'googleapis';
import { adminSupabase } from '@/lib/auth';

type GoogleVideoOptions = {
  prompt: string;
  duration: 4 | 6 | 8;
  aspectRatio: '16:9' | '9:16';
  resolution: '720p' | '1080p';
};
type GoogleOperation = { name?: string; done?: boolean; error?: { message?: string }; response?: { generatedVideos?: Array<{ video?: { uri?: string; mimeType?: string } }> } };

function config() {
  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  const location = process.env.GOOGLE_CLOUD_LOCATION?.trim() || 'us-central1';
  const outputUri = process.env.GOOGLE_VIDEO_OUTPUT_GCS_URI?.trim();
  const rawCredentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!project || !outputUri || !/^gs:\/\/[a-z0-9._-]+(?:\/.+)?$/i.test(outputUri) || !rawCredentials) {
    throw new Error('Google Veo is not configured. Set GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION, GOOGLE_VIDEO_OUTPUT_GCS_URI and GOOGLE_SERVICE_ACCOUNT_JSON on the server.');
  }
  let credentials: Record<string, unknown>;
  try { credentials = JSON.parse(rawCredentials); } catch { throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON must contain valid service-account JSON.'); }
  if (credentials.type !== 'service_account' || typeof credentials.client_email !== 'string' || typeof credentials.private_key !== 'string') {
    throw new Error('Google video credentials must be a service-account credential object.');
  }
  return { project, location, outputUri, credentials };
}

function clients() {
  const c = config();
  // Vercel environment variables are strings, while the Google SDK's Enterprise
  // backend uses Application Default Credentials. Materialize the secret only in
  // the function's ephemeral /tmp directory with owner-only permissions.
  const credentialPath = join(tmpdir(), `leonardx-google-video-${c.project}.json`);
  writeFileSync(credentialPath, JSON.stringify(c.credentials), { mode: 0o600 });
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialPath;
  const ai = new GoogleGenAI({ enterprise: true, project: c.project, location: c.location });
  const auth = new google.auth.GoogleAuth({ credentials: c.credentials as any, projectId: c.project, scopes: ['https://www.googleapis.com/auth/devstorage.read_only'] });
  return { ai, auth, c };
}

export function googleVideoCapabilities() {
  try {
    const c = config();
    return { available: true, configured: true, connectivity_verified: false, provider: 'google', model: process.env.LEO_GOOGLE_VIDEO_MODEL || 'veo-3.1-generate-001', durations: [4, 6, 8], aspect_ratios: ['16:9', '9:16'], resolutions: ['720p', '1080p'], image_to_video: false, audio_generation: true, location: c.location };
  } catch (error) {
    return { available: false, provider: 'google', error: error instanceof Error ? error.message : 'Google video provider is not configured.' };
  }
}

export async function createGoogleVideo(opts: GoogleVideoOptions) {
  const { ai, c } = clients();
  const model = process.env.LEO_GOOGLE_VIDEO_MODEL || 'veo-3.1-generate-001';
  const operation = await ai.models.generateVideos({
    model,
    source: { prompt: opts.prompt },
    config: {
      numberOfVideos: 1,
      durationSeconds: opts.duration,
      aspectRatio: opts.aspectRatio,
      resolution: opts.resolution,
      generateAudio: true,
      outputGcsUri: c.outputUri,
      personGeneration: 'allow_adult',
    },
  });
  if (!operation.name) throw new Error('Google accepted no trackable video operation. No completed video is available.');
  return { provider: 'google', model, task_id: operation.name, status: operation.done ? 'completed' : 'processing' };
}

async function downloadGcsVideo(uri: string, auth: InstanceType<typeof google.auth.GoogleAuth>) {
  const match = /^gs:\/\/([^/]+)\/(.+)$/.exec(uri);
  if (!match) throw new Error('Google returned an unsupported video output URI.');
  const storage = google.storage({ version: 'v1', auth });
  const response = await storage.objects.get({ bucket: match[1], object: match[2], alt: 'media' }, { responseType: 'arraybuffer' });
  const bytes = Buffer.from(response.data as ArrayBuffer);
  if (!bytes.length || bytes.length > 500 * 1024 * 1024) throw new Error('Google returned an invalid video file size.');
  return bytes;
}

export async function getGoogleVideo(taskId: string, userId: string) {
  if (!/^projects\/[a-z0-9-]+\/locations\/[a-z0-9-]+\/publishers\/google\/models\/[^/]+\/operations\/[a-zA-Z0-9_-]+$/.test(taskId) && !/^operations\/[a-zA-Z0-9_-]+$/.test(taskId)) {
    // The SDK operation resource may use a provider-specific opaque name. Reject URL-like or oversized values.
    if (!taskId || taskId.length > 512 || /[\r\n]/.test(taskId)) throw new Error('Invalid Google video operation ID.');
  }
  const { ai, auth } = clients();
  const operation = await ai.operations.getVideosOperation({ operation: { name: taskId } as never }) as GoogleOperation;
  if (operation.error) return { status: 'failed' as const, error: operation.error.message || 'Google video generation failed.' };
  if (!operation.done) return { status: 'processing' as const, task_id: taskId };
  const video = operation.response?.generatedVideos?.[0]?.video;
  if (!video?.uri) throw new Error('Google marked the operation complete but returned no video output URI.');
  const bytes = await downloadGcsVideo(video.uri, auth);
  const db = adminSupabase();
  const storagePath = `agent-videos/${userId}/google-${Buffer.from(taskId).toString('base64url').slice(0, 48)}.mp4`;
  const uploaded = await db.storage.from('leo-files').upload(storagePath, bytes, { contentType: video.mimeType || 'video/mp4', upsert: true });
  if (uploaded.error) throw new Error('Google generated the video, but private media storage failed.');
  const signed = await db.storage.from('leo-files').createSignedUrl(storagePath, 3600);
  if (signed.error || !signed.data?.signedUrl) throw new Error('Google generated the video, but a secure preview URL could not be issued.');
  return { status: 'completed' as const, task_id: taskId, video_url: signed.data.signedUrl, storage_path: storagePath, size_bytes: bytes.length };
}
