import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { enforceUserRateLimit } from "@/lib/rate-limit";
import { importWorkspaceZip, WorkspaceSourceError, WORKSPACE_SOURCE_MAX_ARCHIVE_BYTES } from "@/lib/workspace-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Context) {
  const auth = await getProfile(req);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const limited = await enforceUserRateLimit(auth.user.id, "project-github-import", 4, 60);
  if (limited) return limited;
  try {
    const body = await req.json().catch(() => null);
    if (typeof body?.repository_url !== "string" || body.repository_url.length > 500) {
      return NextResponse.json({ error: "Provide a public GitHub repository URL." }, { status: 400 });
    }
    const url = new URL(body.repository_url);
    if (url.protocol !== "https:" || url.hostname !== "github.com" || url.username || url.password || url.port) {
      return NextResponse.json({ error: "Only public github.com repository URLs are supported." }, { status: 400 });
    }
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 2 || !/^[A-Za-z0-9_.-]{1,100}$/.test(parts[0]) || !/^[A-Za-z0-9_.-]{1,100}$/.test(parts[1].replace(/\.git$/i, ""))) {
      return NextResponse.json({ error: "Use a repository URL such as https://github.com/owner/repository." }, { status: 400 });
    }
    const owner = parts[0], name = parts[1].replace(/\.git$/i, "");
    const api = await fetch("https://api.github.com/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(name), {
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "LeonardX-Workspace-Importer" },
      cache: "no-store", signal: AbortSignal.timeout(10000),
    });
    if (!api.ok) return NextResponse.json({ error: api.status === 404 ? "Repository not found or is private. This importer currently supports public repositories." : "GitHub repository metadata could not be loaded." }, { status: api.status === 404 ? 404 : 502 });
    const metadata = await api.json() as { default_branch?: string };
    if (!metadata.default_branch) return NextResponse.json({ error: "Repository default branch could not be determined." }, { status: 422 });
    const archiveResponse = await fetch("https://api.github.com/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(name) + "/zipball/" + encodeURIComponent(metadata.default_branch), {
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "LeonardX-Workspace-Importer" },
      cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(20000),
    });
    if (!archiveResponse.ok) return NextResponse.json({ error: "GitHub could not provide the repository archive." }, { status: 502 });
    const declared = Number(archiveResponse.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > WORKSPACE_SOURCE_MAX_ARCHIVE_BYTES) return NextResponse.json({ error: "Repository archive exceeds the 25 MB import limit." }, { status: 413 });
    const bytes = Buffer.from(await archiveResponse.arrayBuffer());
    if (!bytes.length || bytes.length > WORKSPACE_SOURCE_MAX_ARCHIVE_BYTES) return NextResponse.json({ error: "Repository archive is empty or exceeds the 25 MB import limit." }, { status: 413 });
    const { id } = await params;
    const result = await importWorkspaceZip(auth.user.id, id, bytes);
    return NextResponse.json({ data: result, source: "github", repository: owner + "/" + name }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof WorkspaceSourceError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof TypeError) return NextResponse.json({ error: "Provide a valid public GitHub repository URL." }, { status: 400 });
    return NextResponse.json({ error: "GitHub project import failed. Check that the repository is public and within the archive limits." }, { status: 502 });
  }
}
