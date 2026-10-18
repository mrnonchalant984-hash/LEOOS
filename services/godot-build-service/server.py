#!/usr/bin/env python3
"""Private, single-process Godot build API. Deploy behind an HTTPS reverse proxy."""
from __future__ import annotations

import hmac
import json
import os
import re
import shutil
import sqlite3
import subprocess
import tempfile
import threading
import time
import uuid
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlparse

ROOT = Path(os.environ.get("GODOT_DATA_DIR", "/var/lib/leonardx-godot"))
DB_PATH = ROOT / "jobs.sqlite3"
ARTIFACTS = ROOT / "artifacts"
WORK = ROOT / "work"
TOKEN = os.environ.get("GODOT_BUILD_SERVICE_TOKEN", "")
HOST = os.environ.get("GODOT_HOST", "127.0.0.1")
PORT = int(os.environ.get("GODOT_PORT", "8788"))
GODOT = os.environ.get("GODOT_BIN", "godot")
TIMEOUT_SECONDS = min(max(int(os.environ.get("GODOT_BUILD_TIMEOUT_SECONDS", "1800")), 60), 3600)
MAX_ARCHIVE_BYTES = 50 * 1024 * 1024
MAX_EXPANDED_BYTES = 250 * 1024 * 1024
MAX_FILES = 4000
MAX_LOG_BYTES = 100_000
ARTIFACT_TTL_DAYS = min(max(int(os.environ.get("GODOT_ARTIFACT_TTL_DAYS", "7")), 1), 30)
PRESETS = {x.strip() for x in os.environ.get("GODOT_EXPORT_PRESETS", "").split(",") if x.strip()}
SAFE_PRESET = re.compile(r"^[A-Za-z0-9 _.-]{1,80}$")
SANDBOX_READY = False


def db():
    con = sqlite3.connect(DB_PATH, timeout=30)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    return con


def init():
    ROOT.mkdir(parents=True, exist_ok=True)
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    WORK.mkdir(parents=True, exist_ok=True)
    with db() as con:
        con.execute("""CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, project_id TEXT NOT NULL,
            status TEXT NOT NULL, preset TEXT NOT NULL, created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL, error TEXT, log TEXT NOT NULL DEFAULT '', artifact TEXT,
            idempotency_key TEXT NOT NULL, UNIQUE(owner_id,idempotency_key))""")
        con.execute("CREATE TABLE IF NOT EXISTS job_sources(id TEXT PRIMARY KEY,source_path TEXT NOT NULL)")
        con.execute("UPDATE jobs SET status='queued',updated_at=? WHERE status IN ('validating','building','packaging')", (int(time.time()),))
    global SANDBOX_READY
    probe = shutil.which("bwrap")
    try:
        SANDBOX_READY = bool(probe and subprocess.run(
            [probe, "--unshare-all", "--die-with-parent", "--ro-bind", "/usr", "/usr", "/usr/bin/true"],
            capture_output=True, timeout=5, check=False).returncode == 0)
    except Exception:
        SANDBOX_READY = False


def cleanup_expired():
    cutoff = int(time.time()) - ARTIFACT_TTL_DAYS * 86400
    with db() as con:
        old = con.execute("SELECT id,artifact FROM jobs WHERE status='completed' AND created_at<? AND artifact IS NOT NULL", (cutoff,)).fetchall()
        for row in old:
            Path(row["artifact"]).unlink(missing_ok=True)
            con.execute("UPDATE jobs SET artifact=NULL,updated_at=? WHERE id=?", (int(time.time()), row["id"]))
        expired = con.execute("SELECT id FROM jobs WHERE status IN ('failed','cancelled') AND created_at<?", (cutoff,)).fetchall()
        for row in expired:
            source = con.execute("SELECT source_path FROM job_sources WHERE id=?", (row["id"],)).fetchone()
            if source:
                Path(source["source_path"]).unlink(missing_ok=True)
                con.execute("DELETE FROM job_sources WHERE id=?", (row["id"],))


def clean_log(text: str) -> str:
    text = re.sub(r"(?i)(token|password|secret|api[_-]?key)(\s*[:=]\s*)\S+", r"\1\2[REDACTED]", text)
    return text[-MAX_LOG_BYTES:]


def update(job_id: str, status: str, *, log: str | None = None, error: str | None = None, artifact: str | None = None):
    with db() as con:
        row = con.execute("SELECT log FROM jobs WHERE id=?", (job_id,)).fetchone()
        prior = row["log"] if row else ""
        con.execute("UPDATE jobs SET status=?,updated_at=?,log=?,error=?,artifact=COALESCE(?,artifact) WHERE id=?",
                    (status, int(time.time()), clean_log((prior + "\n" + log) if log else prior), error, artifact, job_id))


def extract_project(archive: Path, destination: Path):
    expanded = 0
    files = 0
    with zipfile.ZipFile(archive) as zf:
        for info in zf.infolist():
            p = PurePosixPath(info.filename)
            mode = info.external_attr >> 16
            if p.is_absolute() or ".." in p.parts or not p.parts or (mode & 0o170000) == 0o120000:
                raise ValueError("Archive contains an unsafe path or symlink.")
            if "\\" in info.filename or re.match(r"^[A-Za-z]:", info.filename):
                raise ValueError("Archive contains an unsafe path.")
            if any(part.lower().startswith(".env") or part.lower() in {".git", "node_modules", ".godot"} or part.lower().endswith((".pem", ".key")) for part in p.parts):
                raise ValueError("Archive contains a prohibited environment or generated directory.")
            if info.is_dir():
                continue
            files += 1
            expanded += info.file_size
            if files > MAX_FILES or expanded > MAX_EXPANDED_BYTES:
                raise ValueError("Project archive exceeds file-count or expanded-size limits.")
            target = (destination / Path(*p.parts)).resolve()
            if not target.is_relative_to(destination.resolve()):
                raise ValueError("Archive path escapes its workspace.")
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(info) as source, target.open("wb") as output:
                shutil.copyfileobj(source, output, 1024 * 1024)
    if not (destination / "project.godot").is_file():
        raise ValueError("Project archive must contain project.godot at its root.")


def run_job(job):
    job_id = job["id"]
    update(job_id, "validating", log="Validating the uploaded Godot project.")
    with tempfile.TemporaryDirectory(prefix=f"{job_id}-", dir=WORK) as temporary:
        base = Path(temporary)
        archive = base / "source.zip"
        project = base / "project"
        output = base / "output"
        project.mkdir()
        output.mkdir()
        with db() as con:
            row = con.execute("SELECT source_path FROM job_sources WHERE id=?", (job_id,)).fetchone()
        if not row:
            update(job_id, "failed", error="The source archive is unavailable.")
            return
        shutil.copy2(row["source_path"], archive)
        if archive.stat().st_size > MAX_ARCHIVE_BYTES:
            raise ValueError("Project archive exceeds the 50 MB upload limit.")
        extract_project(archive, project)
        update(job_id, "building", log=f"Running the configured Godot export preset: {job['preset']}.")
        command = sandbox_command(project, output, [GODOT, "--headless", "--path", "/workspace", "--editor", "--quit"])
        imported = subprocess.run(command, capture_output=True, text=True, timeout=min(TIMEOUT_SECONDS, 300), check=False)
        logs = clean_log((imported.stdout or "") + "\n" + (imported.stderr or ""))
        if imported.returncode:
            update(job_id, "failed", log=logs, error="Godot project validation/import failed.")
            return
        name = job["preset"].lower()
        ext = ".apk" if "android" in name and "aab" not in name else ".aab" if "android" in name else ".html" if "web" in name else ".exe" if "windows" in name else ".x86_64"
        artifact = output / ("game" + ext)
        exported = subprocess.run(sandbox_command(project, output, [GODOT, "--headless", "--path", "/workspace", "--export-release", job["preset"], f"/output/{artifact.name}"]),
                                  capture_output=True, text=True, timeout=TIMEOUT_SECONDS, check=False)
        logs = clean_log(logs + "\n" + (exported.stdout or "") + "\n" + (exported.stderr or ""))
        if exported.returncode or not artifact.is_file() or artifact.stat().st_size == 0:
            update(job_id, "failed", log=logs, error="Godot export failed or did not create a non-empty artifact.")
            return
        if artifact.stat().st_size > MAX_EXPANDED_BYTES:
            update(job_id, "failed", log=logs, error="Exported artifact exceeds the configured 250 MB limit.")
            return
        destination = ARTIFACTS / f"{job_id}.zip"
        with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
            for produced in output.rglob("*"):
                if produced.is_file(): bundle.write(produced, produced.relative_to(output).as_posix())
        if destination.stat().st_size == 0 or destination.stat().st_size > MAX_EXPANDED_BYTES:
            destination.unlink(missing_ok=True)
            update(job_id, "failed", log=logs, error="Artifact bundle is empty or exceeds the 250 MB limit.")
            return
        update(job_id, "completed", log=logs + "\nArtifact created and size-checked.", artifact=str(destination))
        with db() as con:
            con.execute("DELETE FROM job_sources WHERE id=?", (job_id,))
        Path(row["source_path"]).unlink(missing_ok=True)


def sandbox_command(project: Path, output: Path, command: list[str]) -> list[str]:
    bwrap = shutil.which("bwrap")
    if not bwrap:
        raise RuntimeError("The isolated bubblewrap sandbox is not installed.")
    templates = Path.home() / ".local/share/godot/export_templates"
    if not templates.is_dir():
        raise RuntimeError("Godot export templates are unavailable.")
    args = [bwrap, "--unshare-all", "--die-with-parent", "--clearenv", "--ro-bind", "/usr", "/usr"]
    for directory in ("/lib", "/lib64", "/bin", "/etc"):
        if Path(directory).exists(): args += ["--ro-bind", directory, directory]
    args += ["--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp", "--dir", "/home", "--dir", "/home/godot",
             "--dir", "/home/godot/.local", "--dir", "/home/godot/.local/share", "--dir", "/home/godot/.local/share/godot",
             "--ro-bind", str(templates), "/home/godot/.local/share/godot/export_templates",
             "--bind", str(project), "/workspace", "--bind", str(output), "/output", "--chdir", "/workspace",
             "--setenv", "HOME", "/home/godot", "--setenv", "PATH", "/usr/local/bin:/usr/bin:/bin",
             "--setenv", "LANG", "C.UTF-8", "--"]
    return args + command


def worker_loop():
    last_cleanup = 0
    while True:
        if time.time() - last_cleanup > 3600:
            cleanup_expired()
            last_cleanup = time.time()
        with db() as con:
            job = con.execute("SELECT * FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1").fetchone()
            if job:
                con.execute("UPDATE jobs SET status='validating',updated_at=? WHERE id=? AND status='queued'", (int(time.time()), job["id"]))
        if not job:
            time.sleep(1)
            continue
        try:
            run_job(dict(job))
        except subprocess.TimeoutExpired:
            update(job["id"], "failed", error=f"Godot build exceeded the {TIMEOUT_SECONDS}-second timeout.")
        except Exception as exc:
            update(job["id"], "failed", error=str(exc)[:500])


class Handler(BaseHTTPRequestHandler):
    server_version = "LeonardXGodot/1"

    def log_message(self, fmt, *args):
        # Avoid logging headers, request bodies, bearer tokens, or uploaded project data.
        print(f"{self.log_date_time_string()} {self.command} {self.path.split('?')[0]} {args[1] if len(args)>1 else ''}")

    def send_json(self, status, data):
        body = json.dumps(data, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def authorized(self):
        value = self.headers.get("Authorization", "")
        return bool(TOKEN) and value.startswith("Bearer ") and hmac.compare_digest(value[7:], TOKEN)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/healthz":
            self.send_json(200, {"status": "ok", "ready": bool(TOKEN and shutil.which(GODOT) and SANDBOX_READY)})
            return
        if not self.authorized(): return self.send_json(401, {"error": "Authentication required."})
        if parsed.path == "/v1/capabilities":
            self.send_json(200, {"service": "godot", "ready": bool(shutil.which(GODOT) and SANDBOX_READY), "presets": sorted(PRESETS), "maxArchiveBytes": MAX_ARCHIVE_BYTES})
            return
        match = re.fullmatch(r"/v1/jobs/([0-9a-f-]{36})(?:/(logs|artifact))?", parsed.path)
        if not match: return self.send_json(404, {"error": "Not found."})
        job_id, action = match.groups()
        with db() as con: row = con.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
        if not row: return self.send_json(404, {"error": "Build job not found."})
        if action == "artifact":
            file = Path(row["artifact"] or "")
            if row["status"] != "completed" or not file.is_file() or not file.resolve().is_relative_to(ARTIFACTS.resolve()):
                return self.send_json(404, {"error": "Artifact is not available."})
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Disposition", f'attachment; filename="{job_id}{file.suffix}"')
            self.send_header("Content-Length", str(file.stat().st_size))
            self.send_header("Cache-Control", "private, no-store")
            self.end_headers()
            with file.open("rb") as f: shutil.copyfileobj(f, self.wfile)
            return
        if action == "logs": return self.send_json(200, {"jobId": job_id, "status": row["status"], "logs": row["log"]})
        self.send_json(200, {"jobId": job_id, "projectId": row["project_id"], "status": row["status"], "preset": row["preset"], "error": row["error"], "createdAt": row["created_at"], "updatedAt": row["updated_at"], "artifactAvailable": bool(row["artifact"] and Path(row["artifact"]).is_file())})

    def do_POST(self):
        if not self.authorized(): return self.send_json(401, {"error": "Authentication required."})
        parsed = urlparse(self.path)
        if parsed.path != "/v1/jobs": return self.send_json(404, {"error": "Not found."})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > (MAX_ARCHIVE_BYTES * 4 // 3) + 16_384: return self.send_json(413, {"error": "Request exceeds upload limit."})
            body = json.loads(self.rfile.read(length))
            owner = body.get("ownerId")
            project_id = body.get("projectId")
            preset = body.get("preset")
            encoded = body.get("sourceZipBase64")
            key = body.get("idempotencyKey")
            if not all(isinstance(v, str) and 1 <= len(v) <= 128 for v in (owner, project_id, preset, key)):
                return self.send_json(400, {"error": "ownerId, projectId, preset, and idempotencyKey are required."})
            if preset not in PRESETS or not SAFE_PRESET.fullmatch(preset): return self.send_json(400, {"error": "Export preset is not enabled on this service."})
            if not isinstance(encoded, str) or len(encoded) > (MAX_ARCHIVE_BYTES * 4 // 3) + 16: return self.send_json(413, {"error": "Project archive is missing or too large."})
            import base64
            source = base64.b64decode(encoded, validate=True)
            if not source or len(source) > MAX_ARCHIVE_BYTES: return self.send_json(413, {"error": "Project archive exceeds the 50 MB limit."})
            with db() as con:
                existing = con.execute("SELECT * FROM jobs WHERE owner_id=? AND idempotency_key=?", (owner, key)).fetchone()
                if existing: return self.send_json(200, {"jobId": existing["id"], "status": existing["status"], "deduplicated": True})
                queued_total = con.execute("SELECT count(*) FROM jobs WHERE status IN ('queued','validating','building','packaging')").fetchone()[0]
                queued_owner = con.execute("SELECT count(*) FROM jobs WHERE owner_id=? AND status IN ('queued','validating','building','packaging')", (owner,)).fetchone()[0]
                if queued_total >= 20 or queued_owner >= 2:
                    return self.send_json(429, {"error": "The build queue is full for this account. Retry after a current job completes."})
                job_id, now = str(uuid.uuid4()), int(time.time())
                con.execute("INSERT INTO jobs(id,owner_id,project_id,status,preset,created_at,updated_at,idempotency_key) VALUES(?,?,?,?,?,?,?,?)", (job_id, owner, project_id, "queued", preset, now, now, key))
                source_file = WORK / f"{job_id}.zip"
                source_file.write_bytes(source)
                con.execute("INSERT INTO job_sources(id,source_path) VALUES(?,?)", (job_id, str(source_file)))
            self.send_json(202, {"jobId": job_id, "status": "queued", "deduplicated": False})
        except (ValueError, json.JSONDecodeError): self.send_json(400, {"error": "Invalid build request or archive encoding."})
        except Exception: self.send_json(500, {"error": "Build request could not be queued."})

    def do_DELETE(self):
        if not self.authorized(): return self.send_json(401, {"error": "Authentication required."})
        match = re.fullmatch(r"/v1/jobs/([0-9a-f-]{36})", urlparse(self.path).path)
        if not match: return self.send_json(404, {"error": "Not found."})
        with db() as con:
            cur = con.execute("UPDATE jobs SET status='cancelled',updated_at=? WHERE id=? AND status='queued'", (int(time.time()), match.group(1)))
        if cur.rowcount: self.send_json(200, {"jobId": match.group(1), "status": "cancelled"})
        else: self.send_json(409, {"error": "Only queued jobs can be cancelled."})


if __name__ == "__main__":
    init()
    if not TOKEN or len(TOKEN) < 32: raise SystemExit("GODOT_BUILD_SERVICE_TOKEN must be a securely generated value of at least 32 characters")
    if not PRESETS: raise SystemExit("Configure at least one tested GODOT_EXPORT_PRESETS value.")
    threading.Thread(target=worker_loop, daemon=True).start()
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
