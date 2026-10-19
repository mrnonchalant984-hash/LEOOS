import hashlib
import tempfile
import unittest
import zipfile
from pathlib import Path

from install_templates import TemplateInstallError, install_windows_template


class GodotTemplateInstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.archive = self.root / "templates.tpz"
        self.destination = self.root / "installed" / "windows_release_x86_64.exe"
        self.payload = b"MZ" + (b"godot-windows-template-fixture" * 16)
        with zipfile.ZipFile(self.archive, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
            bundle.writestr("templates/windows_release_x86_64.exe", self.payload)
            bundle.writestr("templates/linux_release.x86_64", b"not selected")
        self.digest = hashlib.sha256(self.archive.read_bytes()).hexdigest()

    def tearDown(self):
        self.temp.cleanup()

    def test_extracts_only_the_expected_windows_template_after_hash_verification(self):
        size = install_windows_template(self.archive, self.destination, self.digest, "4.7.2")
        self.assertEqual(size, len(self.payload))
        self.assertEqual(self.destination.read_bytes(), self.payload)
        self.assertEqual(self.destination.stat().st_mode & 0o777, 0o644)

    def test_rejects_checksum_mismatch_without_creating_destination(self):
        with self.assertRaisesRegex(TemplateInstallError, "SHA-256 mismatch"):
            install_windows_template(self.archive, self.destination, "0" * 64, "4.7.2")
        self.assertFalse(self.destination.exists())

    def test_rejects_archive_without_expected_template(self):
        with zipfile.ZipFile(self.archive, "w") as bundle:
            bundle.writestr("templates/windows_debug_x86_64.exe", b"MZdebug")
        digest = hashlib.sha256(self.archive.read_bytes()).hexdigest()
        with self.assertRaisesRegex(TemplateInstallError, "must contain exactly one"):
            install_windows_template(self.archive, self.destination, digest, "4.7.2")

    def test_rejects_duplicate_expected_template_entries(self):
        with zipfile.ZipFile(self.archive, "w") as bundle:
            bundle.writestr("templates/windows_release_x86_64.exe", b"MZone")
            bundle.writestr("templates/windows_release_x86_64.exe", b"MZtwo")
        digest = hashlib.sha256(self.archive.read_bytes()).hexdigest()
        with self.assertRaisesRegex(TemplateInstallError, "must contain exactly one"):
            install_windows_template(self.archive, self.destination, digest, "4.7.2")

    def test_rejects_non_executable_template_payload(self):
        with zipfile.ZipFile(self.archive, "w") as bundle:
            bundle.writestr("templates/windows_release_x86_64.exe", b"not-pe")
        digest = hashlib.sha256(self.archive.read_bytes()).hexdigest()
        with self.assertRaisesRegex(TemplateInstallError, "PE executable header"):
            install_windows_template(self.archive, self.destination, digest, "4.7.2")

    def test_rejects_invalid_version_or_checksum_configuration(self):
        with self.assertRaisesRegex(TemplateInstallError, "64 hexadecimal"):
            install_windows_template(self.archive, self.destination, "not-a-hash", "4.7.2")
        with self.assertRaisesRegex(TemplateInstallError, "numeric X.Y.Z"):
            install_windows_template(self.archive, self.destination, self.digest, "4.7.2-stable")


if __name__ == "__main__":
    unittest.main()
