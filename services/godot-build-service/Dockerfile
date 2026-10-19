FROM debian:bookworm-slim

# Keep engine and export templates pinned to the same official Godot release.
ARG GODOT_VERSION=4.7.2
ARG GODOT_ENGINE_SHA256
ARG GODOT_TEMPLATES_SHA256

RUN set -eu; \
    if [ -z "${GODOT_ENGINE_SHA256:-}" ] || [ -z "${GODOT_TEMPLATES_SHA256:-}" ]; then \
      echo 'ERROR [godot-config]: GODOT_ENGINE_SHA256 and GODOT_TEMPLATES_SHA256 are required build arguments.' >&2; exit 1; \
    fi; \
    for digest in "$GODOT_ENGINE_SHA256" "$GODOT_TEMPLATES_SHA256"; do \
      case "$digest" in *[!0-9a-fA-F]*|'') echo 'ERROR [godot-config]: checksums must be 64 hexadecimal characters.' >&2; exit 1 ;; esac; \
      if [ "${#digest}" -ne 64 ]; then echo 'ERROR [godot-config]: checksums must be 64 hexadecimal characters.' >&2; exit 1; fi; \
    done; \
    echo '[godot-dependencies] Updating Debian package indexes'; \
    if ! apt-get update; then echo 'ERROR [godot-dependencies]: apt-get update failed; inspect the package-manager output above.' >&2; exit 1; fi; \
    echo '[godot-dependencies] Installing runtime, extraction, and sandbox packages'; \
    if ! apt-get install -y --no-install-recommends ca-certificates curl unzip python3 bubblewrap libfontconfig1 libx11-6 libxcursor1 libxinerama1 libxrandr2 libxi6 libasound2; then \
      echo 'ERROR [godot-dependencies]: required Debian packages could not be installed; check package availability for debian:bookworm-slim.' >&2; exit 1; \
    fi; \
    rm -rf /var/lib/apt/lists/*; \
    mkdir -p /tmp/godot

RUN set -eu; \
    engine_url="https://github.com/godotengine/godot-builds/releases/download/${GODOT_VERSION}-stable/Godot_v${GODOT_VERSION}-stable_linux.x86_64.zip"; \
    echo "[godot-engine] Downloading official Godot ${GODOT_VERSION} Linux x86_64 editor archive"; \
    if ! curl --fail --location --silent --show-error --retry 3 --retry-all-errors --connect-timeout 20 --max-time 600 --max-filesize 100000000 "$engine_url" -o /tmp/godot/engine.zip; then \
      echo 'ERROR [godot-engine-download]: official editor archive download failed or exceeded its size limit.' >&2; exit 1; \
    fi; \
    echo '[godot-engine] Verifying official archive SHA-256'; \
    if ! printf '%s  %s\n' "$GODOT_ENGINE_SHA256" /tmp/godot/engine.zip | sha256sum --check --status; then \
      echo 'ERROR [godot-engine-integrity]: official editor archive SHA-256 verification failed.' >&2; exit 1; \
    fi; \
    if ! unzip -tq /tmp/godot/engine.zip; then echo 'ERROR [godot-engine-archive]: the verified editor ZIP is structurally invalid.' >&2; exit 1; fi; \
    if ! unzip -q /tmp/godot/engine.zip -d /tmp/godot/engine; then echo 'ERROR [godot-engine-extract]: could not extract the verified editor ZIP.' >&2; exit 1; fi; \
    engine_path="/tmp/godot/engine/Godot_v${GODOT_VERSION}-stable_linux.x86_64"; \
    if [ ! -f "$engine_path" ]; then echo 'ERROR [godot-engine-extract]: the expected Godot executable was not found in the official archive.' >&2; exit 1; fi; \
    install -m 0755 "$engine_path" /usr/local/bin/godot; \
    if ldd /usr/local/bin/godot > /tmp/godot/ldd.txt 2>&1 && ! grep -Fq 'not found' /tmp/godot/ldd.txt; then :; else \
      cat /tmp/godot/ldd.txt >&2; echo 'ERROR [godot-engine-libraries]: one or more Godot shared-library dependencies are unavailable.' >&2; exit 1; \
    fi; \
    version_output="$(/usr/local/bin/godot --headless --version 2>&1)" || { printf '%s\n' "$version_output" >&2; echo 'ERROR [godot-engine-startup]: Godot could not start or report its version.' >&2; exit 1; }; \
    printf '%s\n' "$version_output"; \
    case "$version_output" in "${GODOT_VERSION}.stable."*) echo "[godot-engine] Version verified: ${GODOT_VERSION}.stable" ;; *) echo "ERROR [godot-engine-version]: expected ${GODOT_VERSION}.stable, received a different version." >&2; exit 1 ;; esac

# This downloads the complete official .tpz archive, not an undocumented byte range.
# The archive digest is published in the official Godot GitHub release metadata.
COPY install_templates.py /usr/local/bin/leonardx-install-godot-templates.py

RUN set -eu; \
    templates_url="https://github.com/godotengine/godot-builds/releases/download/${GODOT_VERSION}-stable/Godot_v${GODOT_VERSION}-stable_export_templates.tpz"; \
    echo "[godot-templates] Downloading the complete official Godot ${GODOT_VERSION} export-template archive"; \
    if ! curl --fail --location --silent --show-error --retry 3 --retry-all-errors --connect-timeout 20 --max-time 1800 --max-filesize 1400000000 "$templates_url" -o /tmp/godot/export_templates.tpz; then \
      echo 'ERROR [godot-template-download]: full official export-template archive download failed or exceeded the 1.4 GB safety limit.' >&2; exit 1; \
    fi; \
    echo '[godot-templates] Verifying SHA-256 and extracting only templates/windows_release_x86_64.exe'; \
    if ! python3 /usr/local/bin/leonardx-install-godot-templates.py --archive /tmp/godot/export_templates.tpz --destination /tmp/godot/windows_release_x86_64.exe --sha256 "$GODOT_TEMPLATES_SHA256" --version "$GODOT_VERSION"; then \
      echo 'ERROR [godot-template-install]: verified Windows x86_64 export template could not be installed.' >&2; exit 1; \
    fi; \
    useradd --system --uid 10001 --create-home godot; \
    install -d -o 10001 -g 10001 "/home/godot/.local/share/godot/export_templates/${GODOT_VERSION}.stable"; \
    install -m 0644 -o 10001 -g 10001 /tmp/godot/windows_release_x86_64.exe "/home/godot/.local/share/godot/export_templates/${GODOT_VERSION}.stable/windows_release_x86_64.exe"; \
    printf '%s\n' "${GODOT_VERSION}.stable" > "/home/godot/.local/share/godot/export_templates/${GODOT_VERSION}.stable/version.txt"; \
    chown -R 10001:10001 /home/godot/.local; \
    install -d -o 10001 -g 10001 /var/lib/leonardx-godot; \
    rm -rf /tmp/godot

ENV HOME=/home/godot GODOT_BIN=/usr/local/bin/godot GODOT_DATA_DIR=/var/lib/leonardx-godot GODOT_HOST=0.0.0.0 GODOT_PORT=8788
WORKDIR /app
COPY --chown=10001:10001 server.py /app/server.py
COPY --chown=10001:10001 tests/fixtures/minimal-project/ /tmp/godot-smoke/
USER 10001:10001

# Fail the image build if the pinned engine cannot run or the matching Windows
# template cannot produce a real executable using the supported export preset.
RUN set -eu; \
    echo '[godot-smoke] Checking the non-root runtime can launch the pinned engine'; \
    version_output="$(godot --headless --version 2>&1)" || { printf '%s\n' "$version_output" >&2; echo 'ERROR [godot-smoke-version]: Godot failed under the non-root runtime user.' >&2; exit 1; }; \
    case "$version_output" in "${GODOT_VERSION}.stable."*) : ;; *) echo 'ERROR [godot-smoke-version]: runtime engine version does not match the configured release.' >&2; exit 1 ;; esac; \
    echo '[godot-smoke] Importing the minimal fixture project'; \
    if ! godot --headless --path /tmp/godot-smoke --editor --quit > /tmp/godot-smoke-import.log 2>&1; then cat /tmp/godot-smoke-import.log >&2; echo 'ERROR [godot-smoke-import]: minimal Godot project import failed.' >&2; exit 1; fi; \
    echo '[godot-smoke] Exporting the Windows Desktop preset'; \
    if ! godot --headless --path /tmp/godot-smoke --export-release 'Windows Desktop' /tmp/godot-smoke/smoke.exe > /tmp/godot-smoke-export.log 2>&1; then cat /tmp/godot-smoke-export.log >&2; echo 'ERROR [godot-smoke-export]: minimal Windows Desktop export failed.' >&2; exit 1; fi; \
    if [ ! -s /tmp/godot-smoke/smoke.exe ] || ! python3 -c 'from pathlib import Path; import sys; p=Path(sys.argv[1]); sys.exit(0 if p.read_bytes()[:2] == b"MZ" else 1)' /tmp/godot-smoke/smoke.exe; then \
      echo 'ERROR [godot-smoke-artifact]: Godot did not produce a non-empty Windows PE executable.' >&2; exit 1; \
    fi; \
    echo '[godot-smoke] PASS: a non-empty Windows executable was produced by the supported export workflow'

EXPOSE 8788
VOLUME ["/var/lib/leonardx-godot"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s CMD python3 -c "import json,urllib.request; d=json.load(urllib.request.urlopen('http://127.0.0.1:8788/healthz',timeout=2)); exit(0 if d.get('ready') else 1)"
CMD ["python3", "/app/server.py"]
