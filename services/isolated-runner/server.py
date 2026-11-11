#!/usr/bin/env python3
"""Authenticated, bounded repository runner. Deploy only on a dedicated disposable VM.
The host must provide a rootless Podman-compatible CLI; never expose a privileged Docker socket
from the production web application. Every task gets a fresh no-network container.
"""
from __future__ import annotations
import base64, hashlib, hmac, json, os, re, shutil, subprocess, tempfile, time, zipfile, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path, PurePosixPath

HOST = os.getenv('RUNNER_HOST', '127.0.0.1')
PORT = int(os.getenv('RUNNER_PORT', '8787'))
TOKEN = os.getenv('RUNNER_HMAC_SECRET', '')
ENGINE = os.getenv('RUNNER_CONTAINER_ENGINE', 'podman')
CONTAINER_RUNTIME = 'runsc'
IMAGE = os.getenv('RUNNER_IMAGE', 'localhost/leonardx-runner:node22')
MAX_BODY = 6 * 1024 * 1024
MAX_ARCHIVE = 4 * 1024 * 1024
MAX_FILES = 1200
WORKSPACE_ROOT = Path(os.getenv('RUNNER_WORKSPACE_ROOT', '/var/lib/leonardx-runner/workspaces'))
WORKSPACE_TTL_SECONDS = 6 * 60 * 60
WORKSPACE_LOCK_TTL_SECONDS = 10 * 60
MAX_FILE_SIZE = 2 * 1024 * 1024
ID_RE = re.compile(r'^[a-zA-Z0-9_-]{8,80}$')
WORKSPACE_ID_RE = re.compile(r'^[a-f0-9-]{36}$')
TENANT_ID_RE = re.compile(r'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$', re.I)
OPERATIONS = {'inspect', 'apply_patch', 'install', 'test', 'typecheck', 'lint', 'build', 'git_status', 'git_diff', 'git_log', 'git_branch', 'git_commit', 'run_skill_script'}

class RequestError(Exception): pass

def safe_extract(archive_path: Path, dest: Path) -> None:
    total = 0
    with zipfile.ZipFile(archive_path) as zf:
        infos = zf.infolist()
        if len(infos) > MAX_FILES: raise RequestError('archive_file_limit')
        for info in infos:
            name = info.filename.replace('\\', '/')
            p = PurePosixPath(name)
            if p.is_absolute() or not p.parts or any(part in ('..', '') for part in p.parts):
                raise RequestError('unsafe_archive_path')
            if info.is_dir(): continue
            if info.file_size > MAX_FILE_SIZE: raise RequestError('archive_file_too_large')
            total += info.file_size
            if total > MAX_ARCHIVE: raise RequestError('archive_expanded_size_limit')
            if any(part in {'.git', 'node_modules', '.next'} for part in p.parts): raise RequestError('archive_contains_forbidden_directory')
            if (p.name.startswith('.env') and p.name != '.env.example') or p.suffix in ('.pem', '.key') or 'credentials' in p.name.lower(): raise RequestError('archive_contains_secret_like_file')
            target = dest.joinpath(*p.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(info) as src, target.open('wb') as out: shutil.copyfileobj(src, out)

def tenant_workspace_root(tenant_id: str) -> Path:
    if not TENANT_ID_RE.fullmatch(tenant_id):
        raise RequestError('invalid_tenant_id')
    return WORKSPACE_ROOT / tenant_id.lower()

def workspace_lock_is_active(root: Path, now: float | None = None) -> bool:
    lock_path = root / '.lock'
    if not lock_path.exists():
        return False
    current_time = now if now is not None else time.time()
    try:
        try:
            lock_time = float(lock_path.read_text(encoding='ascii').strip())
        except (ValueError, UnicodeDecodeError):
            lock_time = lock_path.stat().st_mtime
        if current_time - lock_time <= WORKSPACE_LOCK_TTL_SECONDS:
            return True
        lock_path.unlink()
        return False
    except OSError as error:
        print(f'runner_workspace_lock_cleanup_failed:{root.name}:{type(error).__name__}', file=sys.stderr)
        return True

def delete_tenant_workspace(tenant_id: str, workspace_id: str, now: float | None = None) -> bool:
    if not WORKSPACE_ID_RE.fullmatch(workspace_id):
        raise RequestError('invalid_workspace_id')
    tenant_root = tenant_workspace_root(tenant_id)
    if tenant_root.is_symlink():
        raise RequestError('invalid_tenant_workspace_root')
    root = tenant_root / workspace_id
    if root.is_symlink():
        raise RequestError('invalid_workspace_root')
    if not root.is_dir():
        return False
    if workspace_lock_is_active(root, now):
        raise RequestError('workspace_busy')
    shutil.rmtree(root)
    return True

def cleanup_expired_workspaces(now: float | None = None) -> None:
    if not WORKSPACE_ROOT.is_dir():
        return
    current_time = now if now is not None else time.time()
    for tenant_root in WORKSPACE_ROOT.iterdir():
        if not tenant_root.is_dir() or tenant_root.is_symlink():
            continue
        for root in tenant_root.iterdir():
            if not root.is_dir() or root.is_symlink():
                continue
            if workspace_lock_is_active(root, current_time):
                continue
            try:
                if current_time - root.stat().st_mtime > WORKSPACE_TTL_SECONDS:
                    shutil.rmtree(root)
            except OSError as error:
                print(f'runner_workspace_cleanup_failed:{root.name}:{type(error).__name__}', file=sys.stderr)

def create_workspace_archive(workspace: Path, output: Path) -> str | None:
    files = []
    total_size = 0
    workspace_root = workspace.resolve()
    for path in workspace.rglob('*'):
        if path.is_symlink() or not path.is_file():
            continue
        relative = path.relative_to(workspace)
        if '.git' in relative.parts or 'node_modules' in relative.parts or '.next' in relative.parts or '.runner-npm-cache' in relative.parts:
            continue
        if (path.name.startswith('.env') and path.name != '.env.example') or path.suffix in ('.pem', '.key') or 'credentials' in path.name.lower():
            continue
        resolved = path.resolve()
        try:
            resolved.relative_to(workspace_root)
        except ValueError:
            continue
        total_size += resolved.stat().st_size
        if len(files) >= MAX_FILES or total_size > MAX_ARCHIVE:
            return None
        files.append((path, relative.as_posix()))
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path, relative in files:
            archive.write(path, relative)
    if output.stat().st_size > MAX_ARCHIVE:
        return None
    return base64.b64encode(output.read_bytes()).decode()

def validate_skill_script(workspace: Path, script_path: str) -> str:
    if not isinstance(script_path, str) or '\\' in script_path:
        raise RequestError('invalid_skill_script_path')
    relative = PurePosixPath(script_path)
    if relative.is_absolute() or not relative.parts or relative.parts[0] != 'scripts' or any(part in ('', '.', '..') for part in relative.parts):
        raise RequestError('invalid_skill_script_path')
    if relative.suffix.lower() not in ('.js', '.mjs', '.cjs'):
        raise RequestError('unsupported_skill_script_language')
    target = workspace.joinpath(*relative.parts)
    if target.is_symlink() or not target.is_file():
        raise RequestError('skill_script_not_found')
    resolved_workspace = workspace.resolve()
    resolved_target = target.resolve()
    try:
        resolved_target.relative_to(resolved_workspace)
    except ValueError:
        raise RequestError('invalid_skill_script_path')
    if resolved_target.stat().st_size > 256 * 1024:
        raise RequestError('skill_script_too_large')
    return relative.as_posix()

def run_container(workspace: Path, operation: str, patch: str = '', branch: str = '', message: str = '', script_path: str = '', script_input_json: str = '') -> dict:
    if operation not in OPERATIONS: raise RequestError('unsupported_operation')
    if operation == 'apply_patch' and (not patch or len(patch.encode()) > 128_000): raise RequestError('invalid_patch')
    if operation == 'git_branch' and not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9._/-]{0,90}', branch): raise RequestError('invalid_branch')
    if operation == 'git_commit' and (not message or len(message) > 180 or '\n' in message or '\r' in message): raise RequestError('invalid_commit_message')
    if operation == 'run_skill_script':
        script_path = validate_skill_script(workspace, script_path)
        if len(script_input_json.encode()) > 16 * 1024: raise RequestError('skill_script_input_too_large')
        try: json.loads(script_input_json)
        except (ValueError, json.JSONDecodeError): raise RequestError('invalid_skill_script_input')
    commands = {
        'inspect': ['sh', '-lc', 'find . -maxdepth 3 -type f -not -path "./.git/*" -not -path "./node_modules/*" | sort | head -500'],
        'apply_patch': ['sh', '-lc', 'git apply --check /tmp/task.patch && git apply /tmp/task.patch'],
        'install': ['sh', '-lc', 'test -d /opt/runner-npm-cache || { echo dependency_cache_not_configured >&2; exit 44; }; mkdir -p .runner-npm-cache && cp -a /opt/runner-npm-cache/. .runner-npm-cache/ && npm ci --offline --cache .runner-npm-cache --no-audit --no-fund'],
        'test': ['npm', 'test'],
        'typecheck': ['npm', 'run', 'typecheck', '--', '--pretty', 'false'],
        'lint': ['npm', 'run', 'lint', '--', '--no-warn-ignored'],
        'build': ['npm', 'run', 'build'],
        'git_status': ['git', 'status', '--short', '--branch'],
        'git_diff': ['git', 'diff', '--no-ext-diff', '--', '.', ':!.env*', ':!*.pem', ':!*.key'],
        'git_log': ['git', 'log', '-8', '--oneline', '--decorate'],
        'git_branch': ['git', 'switch', '-c', branch],
        'git_commit': ['sh', '-lc', "git add --all -- . ':!.env*' ':!**/.env*' ':!*.pem' ':!*.key' ':!**/*credentials*' && if git diff --cached --quiet; then exit 3; else git -c user.name='LeonardX Worker' -c user.email='worker@invalid.local' commit -m \"$COMMIT_MESSAGE\"; fi"],
        'run_skill_script': ['node', '--disable-proto=throw', script_path],
    }
    if operation == 'apply_patch': (workspace / '.runner-task.patch').write_text(patch, encoding='utf-8'); commands[operation] = ['sh', '-lc', 'git apply --check .runner-task.patch && git apply .runner-task.patch']
    env = os.environ.copy()
    env['COMMIT_MESSAGE'] = message
    cmd = [ENGINE, 'run', '--rm', f'--runtime={CONTAINER_RUNTIME}', '--network', 'none', '--read-only', '--userns=keep-id:uid=10001,gid=10001', '--user', '10001:10001', '--cap-drop', 'all', '--security-opt', 'no-new-privileges', '--pids-limit', '128', '--memory', '1536m', '--cpus', '2', '--tmpfs', '/tmp:rw,noexec,nosuid,size=256m', '-v', f'{workspace}:/workspace:rw,Z']
    if operation == 'run_skill_script': cmd.append('-i')
    npm_cache = os.getenv('RUNNER_NPM_CACHE', '').strip()
    if npm_cache and Path(npm_cache).is_dir(): cmd += ['-v', f'{Path(npm_cache).resolve()}:/opt/runner-npm-cache:ro,Z']
    cmd += ['-w', '/workspace']
    if operation == 'git_commit': cmd += ['--env', 'COMMIT_MESSAGE']
    cmd += [IMAGE, *commands[operation]]
    try:
        result = subprocess.run(cmd, env=env, input=script_input_json if operation == 'run_skill_script' else None,
                                capture_output=True, text=True, timeout=60 if operation == 'run_skill_script' else 270, check=False)
    except subprocess.TimeoutExpired:
        return {'ok': False, 'exit_code': 124, 'stdout': '', 'stderr': 'skill_execution_timeout' if operation == 'run_skill_script' else 'runner_timeout'}
    return {'ok': result.returncode == 0, 'exit_code': result.returncode, 'stdout': result.stdout[-24000:], 'stderr': result.stderr[-12000:]}

class Handler(BaseHTTPRequestHandler):
    server_version = 'LeonardXRunner/1.0'
    def log_message(self, *_): return
    def send_json(self, status: int, data: dict):
        raw = json.dumps(data, separators=(',', ':')).encode()
        self.send_response(status); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(raw))); self.send_header('Cache-Control', 'no-store'); self.end_headers(); self.wfile.write(raw)
    def do_GET(self):
        if self.path == '/health': return self.send_json(200, {'ok': True, 'engine_configured': shutil.which(ENGINE) is not None, 'runtime_required': CONTAINER_RUNTIME, 'image': IMAGE})
        return self.send_json(404, {'error': 'not_found'})
    def do_DELETE(self):
        match = re.fullmatch(r'/v1/workspaces/([a-f0-9-]{36})', self.path, re.I)
        if not match: return self.send_json(404, {'error': 'not_found'})
        if not TOKEN or len(TOKEN) < 32: return self.send_json(503, {'error': 'runner_secret_not_configured'})
        try:
            if not self.headers.get('Content-Length', '').isdigit() or int(self.headers['Content-Length']) > 16_384:
                return self.send_json(413, {'error': 'request_size_limit'})
            length = int(self.headers['Content-Length'])
            if length <= 0: return self.send_json(413, {'error': 'request_size_limit'})
            raw = self.rfile.read(length)
            timestamp = self.headers.get('X-Runner-Timestamp', '')
            signature = self.headers.get('X-Runner-Signature', '')
            if not timestamp.isdigit() or abs(int(time.time()) - int(timestamp)) > 60:
                return self.send_json(401, {'error': 'stale_request'})
            expected = hmac.new(TOKEN.encode(), timestamp.encode() + b'.' + raw, hashlib.sha256).hexdigest()
            if not hmac.compare_digest(expected, signature):
                return self.send_json(401, {'error': 'invalid_signature'})
            body = json.loads(raw)
            if not isinstance(body, dict) or set(body) != {'tenant_id'} or not isinstance(body.get('tenant_id'), str):
                raise RequestError('invalid_request')
            deleted = delete_tenant_workspace(body['tenant_id'], match.group(1))
            if not deleted: return self.send_json(404, {'error': 'workspace_not_found'})
            return self.send_json(200, {'workspace_id': match.group(1), 'deleted': True})
        except RequestError as exc:
            status = 409 if str(exc) == 'workspace_busy' else 400
            return self.send_json(status, {'error': str(exc)[:100] or 'invalid_request'})
        except (ValueError, json.JSONDecodeError):
            return self.send_json(400, {'error': 'invalid_request'})
        except Exception:
            return self.send_json(500, {'error': 'runner_internal_error'})
    def do_POST(self):
        if self.path != '/v1/jobs': return self.send_json(404, {'error': 'not_found'})
        if not TOKEN or len(TOKEN) < 32: return self.send_json(503, {'error': 'runner_secret_not_configured'})
        try:
            if self.headers.get('Content-Length', '').isdigit() and int(self.headers['Content-Length']) > MAX_BODY:
                return self.send_json(413, {'error': 'request_size_limit'})
            length = int(self.headers.get('Content-Length', '0'))
            if length <= 0 or length > MAX_BODY: return self.send_json(413, {'error': 'request_size_limit'})
            raw = self.rfile.read(length)
            timestamp = self.headers.get('X-Runner-Timestamp', '')
            signature = self.headers.get('X-Runner-Signature', '')
            if not timestamp.isdigit() or abs(int(time.time()) - int(timestamp)) > 60: return self.send_json(401, {'error': 'stale_request'})
            expected = hmac.new(TOKEN.encode(), timestamp.encode() + b'.' + raw, hashlib.sha256).hexdigest()
            if not hmac.compare_digest(expected, signature): return self.send_json(401, {'error': 'invalid_signature'})
            body = json.loads(raw)
            if not isinstance(body, dict) or not ID_RE.fullmatch(str(body.get('job_id', ''))): raise RequestError('invalid_job_id')
            tenant_id = body.get('tenant_id')
            if not isinstance(tenant_id, str): raise RequestError('invalid_tenant_id')
            tenant_root = tenant_workspace_root(tenant_id)
            op = body.get('operation')
            if op not in OPERATIONS: raise RequestError('unsupported_operation')
            script_path = body.get('script_path', '')
            script_input_json = body.get('script_input_json', '{}')
            if op == 'run_skill_script':
                if set(body) - {'job_id', 'tenant_id', 'operation', 'workspace_id', 'workspace_zip_base64', 'script_path', 'script_input_json'}:
                    raise RequestError('invalid_skill_script_request')
                if not isinstance(script_path, str) or not isinstance(script_input_json, str): raise RequestError('invalid_skill_script_request')
            tenant_root.mkdir(parents=True, exist_ok=True, mode=0o700)
            workspace_id = str(body.get('workspace_id') or '')
            created_workspace = False
            if workspace_id:
                if not WORKSPACE_ID_RE.fullmatch(workspace_id): raise RequestError('invalid_workspace_id')
                root = tenant_root / workspace_id
                workspace = root / 'workspace'
                if not workspace.is_dir(): raise RequestError('workspace_not_found_or_expired')
            else:
                workspace_id = str(uuid.uuid4()); root = tenant_root / workspace_id; workspace = root / 'workspace'
                root.mkdir(mode=0o700); workspace.mkdir(mode=0o700); created_workspace = True
                repository = body.get('repository')
                if repository:
                    allowed = {item.strip() for item in os.getenv('RUNNER_ALLOWED_REPOSITORIES', '').split(',') if item.strip()}
                    if not isinstance(repository, str) or repository not in allowed or not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repository):
                        shutil.rmtree(root, ignore_errors=True); raise RequestError('repository_not_allowlisted')
                    url = f'https://github.com/{repository}.git'
                    cloned = subprocess.run(['git', 'clone', '--depth=1', '--no-tags', '--', url, str(workspace)], capture_output=True, text=True, timeout=120, check=False, env={**os.environ, 'GIT_CONFIG_NOSYSTEM':'1', 'GIT_TERMINAL_PROMPT':'0'})
                    if cloned.returncode != 0:
                        shutil.rmtree(root, ignore_errors=True); raise RequestError('repository_clone_failed')
                    for p in workspace.rglob('*'):
                        if p.is_file() and ((p.name.startswith('.env') and p.name != '.env.example') or p.suffix in ('.pem','.key') or 'credentials' in p.name.lower()):
                            shutil.rmtree(root, ignore_errors=True); raise RequestError('repository_contains_secret_like_file')
                else:
                    archive = body.get('workspace_zip_base64', '')
                    if not isinstance(archive, str) or len(archive) > MAX_BODY: shutil.rmtree(root, ignore_errors=True); raise RequestError('invalid_workspace_archive')
                    decoded = base64.b64decode(archive, validate=True)
                    if len(decoded) > MAX_ARCHIVE: shutil.rmtree(root, ignore_errors=True); raise RequestError('workspace_archive_too_large')
                    archive_path = root / 'workspace.zip'; archive_path.write_bytes(decoded)
                    safe_extract(archive_path, workspace); archive_path.unlink(missing_ok=True)
                    # Create a baseline commit so Git diff/branch/commit operations work on imported snapshots.
                    env = {**os.environ, 'GIT_CONFIG_NOSYSTEM':'1', 'GIT_TERMINAL_PROMPT':'0', 'GIT_AUTHOR_NAME':'LeonardX Worker', 'GIT_AUTHOR_EMAIL':'worker@invalid.local', 'GIT_COMMITTER_NAME':'LeonardX Worker', 'GIT_COMMITTER_EMAIL':'worker@invalid.local'}
                    subprocess.run(['git','init','-q',str(workspace)], capture_output=True, timeout=10, check=True, env=env)
                    subprocess.run(['git','-C',str(workspace),'add','--all'], capture_output=True, timeout=30, check=True, env=env)
                    subprocess.run(['git','-C',str(workspace),'commit','--allow-empty','-m','Imported workspace baseline'], capture_output=True, timeout=30, check=True, env=env)
            lock_path = root / '.lock'
            try: lock_fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            except FileExistsError: raise RequestError('workspace_busy')
            try:
                os.write(lock_fd, str(time.time()).encode()); os.close(lock_fd)
                result = run_container(workspace, op, str(body.get('patch', '')), str(body.get('branch', '')), str(body.get('commit_message', '')), script_path, script_input_json)
                (workspace / '.runner-task.patch').unlink(missing_ok=True)
                out = root / 'result.zip'
                zipped = create_workspace_archive(workspace, out)
                out.unlink(missing_ok=True)
                # Remove inactive workspaces opportunistically; active locks are never removed.
                now = time.time()
                cleanup_expired_workspaces(now)
                return self.send_json(200, {'job_id': body['job_id'], 'workspace_id': workspace_id, **result, 'workspace_zip_base64': zipped, 'workspace_artifact_omitted': zipped is None, 'git_remote_push_supported': False})
            finally:
                try: os.close(lock_fd)
                except OSError: pass
                lock_path.unlink(missing_ok=True)
        except (RequestError, ValueError, zipfile.BadZipFile, json.JSONDecodeError) as exc:
            if locals().get('created_workspace') and locals().get('root'): shutil.rmtree(root, ignore_errors=True)
            return self.send_json(400, {'error': str(exc)[:100] or 'invalid_request'})
        except Exception:
            if locals().get('created_workspace') and locals().get('root'): shutil.rmtree(root, ignore_errors=True)
            return self.send_json(500, {'error': 'runner_internal_error'})

if __name__ == '__main__':
    if len(TOKEN) < 32: raise SystemExit('RUNNER_HMAC_SECRET must contain at least 32 characters')
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
