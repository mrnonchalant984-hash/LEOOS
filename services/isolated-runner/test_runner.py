import io
import sys
import tempfile
import unittest
import zipfile
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

if __name__ == '__main__': unittest.main(verbosity=2)
