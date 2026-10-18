import tempfile
import threading
import unittest
import urllib.error
import urllib.request
import zipfile
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

import server


class GodotServiceTests(unittest.TestCase):
    def test_archive_requires_root_project_file(self):
        with tempfile.TemporaryDirectory() as root:
            archive = Path(root) / "empty.zip"
            with zipfile.ZipFile(archive, "w") as zf:
                zf.writestr("readme.txt", "no project")
            with self.assertRaisesRegex(ValueError, "project.godot"):
                server.extract_project(archive, Path(root) / "out")

    def test_archive_rejects_path_traversal_and_env_files(self):
        with tempfile.TemporaryDirectory() as root:
            archive = Path(root) / "unsafe.zip"
            with zipfile.ZipFile(archive, "w") as zf:
                zf.writestr("../escape", "bad")
            with self.assertRaisesRegex(ValueError, "unsafe path"):
                server.extract_project(archive, Path(root) / "out")
            with zipfile.ZipFile(archive, "w") as zf:
                zf.writestr(".env", "secret")
            with self.assertRaisesRegex(ValueError, "prohibited"):
                server.extract_project(archive, Path(root) / "out")

    def test_logs_redact_secret_like_assignments(self):
        self.assertEqual(server.clean_log("api_key=shhh output"), "api_key=[REDACTED] output")

    def test_private_api_requires_bearer_token(self):
        with patch.object(server, "TOKEN", "test-token-that-is-not-a-real-secret"):
            httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
            thread = threading.Thread(target=httpd.serve_forever, daemon=True)
            thread.start()
            try:
                request = urllib.request.Request(f"http://127.0.0.1:{httpd.server_port}/v1/capabilities")
                with self.assertRaises(urllib.error.HTTPError) as rejected:
                    urllib.request.urlopen(request, timeout=2)
                self.assertEqual(rejected.exception.code, 401)
                request.add_header("Authorization", "Bearer test-token-that-is-not-a-real-secret")
                with urllib.request.urlopen(request, timeout=2) as authenticated:
                    self.assertEqual(authenticated.status, 200)
            finally:
                httpd.shutdown()
                thread.join(timeout=2)
                httpd.server_close()


if __name__ == "__main__":
    unittest.main()
