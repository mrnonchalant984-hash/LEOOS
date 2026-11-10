export type VerifiedDeploymentResponse = {
  status: 'deployed';
  liveUrl: string;
};

export function isVerifiedDeploymentResponse(statusCode: number, body: unknown): body is VerifiedDeploymentResponse {
  if (statusCode !== 200 || !body || typeof body !== 'object' || Array.isArray(body)) return false;
  const candidate = body as Record<string, unknown>;
  if (candidate.status !== 'deployed' || (candidate.success !== undefined && candidate.success !== true) || typeof candidate.liveUrl !== 'string') return false;
  try {
    const liveUrl = new URL(candidate.liveUrl);
    return liveUrl.protocol === 'https:' && !liveUrl.username && !liveUrl.password;
  } catch {
    return false;
  }
}
