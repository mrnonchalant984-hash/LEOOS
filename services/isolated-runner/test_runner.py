import base64
import io
import os
import sys
import tempfile
import time
import unittest
import zipfile
from unittest import mock
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import server

class RunnerArchiveTests(unittest.TestCase):
    def make_zip(self, entries):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as archive:
            for name, data in entries.items(): archive.writestr(name, data)
        return buffer.getvalue()

    def extract(self, raw, dest):
        archive_path = dest.parent / 'input.zip'
        archive_path.write_bytes(raw)
        server.safe_extract(archive_path, dest)

    def test_safe_archive_extracts_regular_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); dest = root / 'workspace'; dest.mkdir()
            self.extract(self.make_zip({'src/index.ts': 'export const ok = true;'}), dest)
            self.assertEqual((dest / 'src/index.ts').read_text(), 'export const ok = true;')

    def test_environment_example_template_is_allowed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); dest = root / 'workspace'; dest.mkdir()
            self.extract(self.make_zip({'.env.example': 'OWNER_EMAIL=owner@example.invalid'}), dest)
            self.assertTrue((dest / '.env.example').exists())

    def test_archive_path_traversal_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); dest = root / 'workspace'; dest.mkdir()
            with self.assertRaises(server.RequestError): self.extract(self.make_zip({'../outside.txt': 'no'}), dest)
            self.assertFalse((root / 'outside.txt').exists())

    def test_secret_files_and_git_metadata_are_rejected(self):
        for name in ('.env.local', 'cert.pem', 'src/.git/config', 'node_modules/pkg/index.js'):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp); dest = root / 'workspace'; dest.mkdir()
                with self.assertRaises(server.RequestError): self.extract(self.make_zip({name: 'secret'}), dest)

    def test_operations_are_fixed_and_do_not_accept_arbitrary_commands(self):
        self.assertIn('install', server.OPERATIONS)
        self.assertIn('git_commit', server.OPERATIONS)
        self.assertNotIn('shell', server.OPERATIONS)
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(server.RequestError): server.run_container(Path(tmp), 'arbitrary_command')

    def test_workspace_roots_are_scoped_to_valid_tenant_ids(self):
        with mock.patch.object(server, 'WORKSPACE_ROOT', Path('/sandbox-root')):
            self.assertEqual(
                server.tenant_workspace_root('8b5a9c2e-6f7d-4c1b-8a3d-123456789abc'),
                Path('/sandbox-root/8b5a9c2e-6f7d-4c1b-8a3d-123456789abc'),
            )
        with self.assertRaises(server.RequestError):
            server.tenant_workspace_root('../other-tenant')

    def test_idle_workspace_cleanup_is_automatic_and_skips_active_workspaces(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            tenant = root / 'tenant'
            tenant.mkdir()
            expired = tenant / 'expired'
            active = tenant / 'active'
            expired.mkdir()
            active.mkdir()
            (active / '.lock').write_text('running')
            old = time.time() - server.WORKSPACE_TTL_SECONDS - 10
            os.utime(expired, (old, old))
            os.utime(active, (old, old))
            with mock.patch.object(server, 'WORKSPACE_ROOT', root):
                server.cleanup_expired_workspaces()
            self.assertFalse(expired.exists())
            self.assertTrue(active.exists())

    def test_idle_workspace_cleanup_recovers_stale_lock(self):
        with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                tenant = root / 'tenant'
                tenant.mkdir()
                workspace = tenant / 'workspace-id'
                workspace.mkdir()
                now = time.time()
                lock = workspace / '.lock'
                lock.write_text(str(now - server.WORKSPACE_LOCK_TTL_SECONDS - 1))
                with mock.patch.object(server, 'WORKSPACE_ROOT', root):
                    server.cleanup_expired_workspaces(now)
                self.assertTrue(workspace.exists())
                self.assertFalse(lock.exists())

    def test_workspace_deletion_is_tenant_scoped_and_refuses_active_jobs(self):
        with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                current_tenant = root / '11111111-1111-4111-8111-111111111111'
                other_tenant = root / '22222222-2222-4222-8222-222222222222'
                workspace_id = '33333333-3333-4333-8333-333333333333'
                current_workspace = current_tenant / workspace_id
                other_workspace = other_tenant / workspace_id
                current_workspace.mkdir(parents=True)
                other_workspace.mkdir(parents=True)
                (current_workspace / '.lock').write_text(str(time.time()))
                with mock.patch.object(server, 'WORKSPACE_ROOT', root):
                    with self.assertRaises(server.RequestError) as error:
                        server.delete_tenant_workspace(current_tenant.name, workspace_id)
                    self.assertEqual(str(error.exception), 'workspace_busy')
                    (current_workspace / '.lock').write_text(str(time.time() - server.WORKSPACE_LOCK_TTL_SECONDS - 1))
                    self.assertTrue(server.delete_tenant_workspace(current_tenant.name, workspace_id))
                self.assertFalse(current_workspace.exists())
                self.assertTrue(other_workspace.exists())

    def test_workspace_archive_never_follows_symlinks_outside_workspace(self):
        with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                workspace = root / 'workspace'
                workspace.mkdir()
                leak = workspace / 'leak.txt'
                leak.write_text('symlink target')
                is_symlink = Path.is_symlink
                output = root / 'result.zip'
                with mock.patch.object(Path, 'is_symlink', autospec=True, side_effect=lambda path: path == leak or is_symlink(path)):
                    encoded = server.create_workspace_archive(workspace, output)
                self.assertIsNotNone(encoded)
                with zipfile.ZipFile(io.BytesIO(base64.b64decode(encoded))) as archive:
                    self.assertNotIn('leak.txt', archive.namelist())

    def test_execution_requires_gvisor_and_applies_resource_and_network_limits(self):
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.object(server.subprocess, 'run', return_value=mock.Mock(returncode=0, stdout='ok', stderr='')) as run:
                result = server.run_container(Path(tmp), 'inspect')
            self.assertTrue(result['ok'])
            command = run.call_args.args[0]
            self.assertIn('--runtime=runsc', command)
            self.assertEqual(command[command.index('--network') + 1], 'none')
            self.assertIn('--read-only', command)
            self.assertIn('--cap-drop', command)
            self.assertIn('--memory', command)
            self.assertIn('--cpus', command)
            self.assertIn('--pids-limit', command)
            self.assertEqual(run.call_args.kwargs['timeout'], 270)

if __name__ == '__main__': unittest.main(verbosity=2)
