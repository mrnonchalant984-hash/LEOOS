#!/usr/bin/env python3
"""Verify the official Godot template archive and extract only Windows x86_64."""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import sys
import tempfile
import zipfile
import zlib
from pathlib import Path

TEMPLATE_MEMBER = "templates/windows_release_x86_64.exe"
MAX_TEMPLATE_BYTES = 256 * 1024 * 1024
CHUNK_SIZE = 1024 * 1024


class TemplateInstallError(Exception):
    """A sanitized, actionable template installation failure."""


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(CHUNK_SIZE), b""):
            digest.update(chunk)
    return digest.hexdigest()


def install_windows_template(archive: Path, destination: Path, expected_sha256: str, version: str) -> int:
    if not re.fullmatch(r"[0-9a-fA-F]{64}", expected_sha256):
        raise TemplateInstallError("GODOT_TEMPLATES_SHA256 must be exactly 64 hexadecimal characters.")
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise TemplateInstallError("GODOT_VERSION must use the pinned numeric X.Y.Z format.")
    if not archive.is_file():
        raise TemplateInstallError("The downloaded export-template archive is missing.")

    try:
        actual_sha256 = sha256_file(archive)
    except OSError as exc:
        raise TemplateInstallError("Could not read the downloaded export-template archive for checksum verification.") from exc
    if actual_sha256.lower() != expected_sha256.lower():
        raise TemplateInstallError(
            f"SHA-256 mismatch for the Godot {version} export-template archive "
            f"(expected {expected_sha256.lower()}, received {actual_sha256})."
        )

    try:
        with zipfile.ZipFile(archive, "r") as bundle:
            matches = [info for info in bundle.infolist() if info.filename == TEMPLATE_MEMBER]
            if len(matches) != 1:
                raise TemplateInstallError(
                    f"The verified Godot {version} archive must contain exactly one {TEMPLATE_MEMBER} entry."
                )
            info = matches[0]
            if info.is_dir() or info.file_size <= 2 or info.file_size > MAX_TEMPLATE_BYTES:
                raise TemplateInstallError("The Windows x86_64 template has an invalid or excessive uncompressed size.")

            destination.parent.mkdir(parents=True, exist_ok=True)
            fd, temporary_name = tempfile.mkstemp(prefix=f".{destination.name}.", suffix=".tmp", dir=destination.parent)
            os.close(fd)
            temporary = Path(temporary_name)
            try:
                with bundle.open(info, "r") as source, temporary.open("wb") as target:
                    header = source.read(2)
                    if header != b"MZ":
                        raise TemplateInstallError("The Windows x86_64 template does not have a valid PE executable header.")
                    target.write(header)
                    total = len(header)
                    while True:
                        chunk = source.read(CHUNK_SIZE)
                        if not chunk:
                            break
                        total += len(chunk)
                        if total > MAX_TEMPLATE_BYTES:
                            raise TemplateInstallError("The extracted Windows template exceeds the configured size limit.")
                        target.write(chunk)
                if total != info.file_size:
                    raise TemplateInstallError("The extracted Windows template size does not match the archive metadata.")
                os.chmod(temporary, 0o644)
                os.replace(temporary, destination)
                return total
            finally:
                temporary.unlink(missing_ok=True)
    except TemplateInstallError:
        raise
    except (OSError, zipfile.BadZipFile, RuntimeError, EOFError, ValueError, zlib.error) as exc:
        raise TemplateInstallError(
            f"Could not safely read the verified Godot {version} template archive ({type(exc).__name__})."
        ) from exc


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", required=True, type=Path)
    parser.add_argument("--destination", required=True, type=Path)
    parser.add_argument("--sha256", required=True)
    parser.add_argument("--version", required=True)
    args = parser.parse_args()
    try:
        size = install_windows_template(args.archive, args.destination, args.sha256, args.version)
    except TemplateInstallError as exc:
        print(f"ERROR [godot-template-install]: {exc}", file=sys.stderr)
        return 1
    print(f"Verified Godot {args.version} export-template archive; extracted Windows x86_64 template ({size} bytes).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
