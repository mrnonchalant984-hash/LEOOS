FROM debian:bookworm-slim

ARG GODOT_VERSION=4.7.2
ARG GODOT_ENGINE_SHA256
ARG GODOT_TEMPLATES_SHA256
RUN test -n "$GODOT_ENGINE_SHA256" && test -n "$GODOT_TEMPLATES_SHA256" \
 && apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl unzip python3 bubblewrap libfontconfig1 libx11-6 libxcursor1 libxinerama1 libxrandr2 libxi6 libasound2 \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /tmp/godot \
 && curl -fsSL "https://github.com/godotengine/godot/releases/download/${GODOT_VERSION}-stable/Godot_v${GODOT_VERSION}-stable_linux.x86_64.zip" -o /tmp/godot/engine.zip \
 && echo "${GODOT_ENGINE_SHA256}  /tmp/godot/engine.zip" | sha256sum -c - \
 && unzip -q /tmp/godot/engine.zip -d /tmp/godot \
 && mv /tmp/godot/Godot_v${GODOT_VERSION}-stable_linux.x86_64 /usr/local/bin/godot \
 && chmod 0755 /usr/local/bin/godot \
 && curl -fsSL --range 1243455810-1281346115 --max-filesize 37890306 \
      "https://downloads.godotengine.org/?flavor=stable&platform=templates&slug=export_templates.tpz&version=${GODOT_VERSION}" \
      -o /tmp/godot/windows-release-x86_64.deflate \
 && test "$(wc -c < /tmp/godot/windows-release-x86_64.deflate)" -eq 37890306 \
 && echo "${GODOT_TEMPLATES_SHA256}  /tmp/godot/windows-release-x86_64.deflate" | sha256sum -c - \
 && python3 -c 'import pathlib,zlib; p=pathlib.Path("/tmp/godot/windows-release-x86_64.deflate"); b=p.read_bytes(); d=zlib.decompressobj(-15); o=d.decompress(b)+d.flush(); assert len(b)==37890306 and len(o)==109268480 and (zlib.crc32(o)&0xffffffff)==0x1ee85628 and d.eof and not d.unused_data; pathlib.Path("/tmp/godot/windows_release_x86_64.exe").write_bytes(o)' \
 && useradd --system --uid 10001 --create-home godot \
 && mkdir -p /home/godot/.local/share/godot/export_templates/${GODOT_VERSION}.stable \
 && cp /tmp/godot/windows_release_x86_64.exe /home/godot/.local/share/godot/export_templates/${GODOT_VERSION}.stable/ \
 && printf '%s\n' "${GODOT_VERSION}.stable" > /home/godot/.local/share/godot/export_templates/${GODOT_VERSION}.stable/version.txt \
 && chown -R 10001:10001 /home/godot/.local \
 && rm -rf /tmp/godot \
 && mkdir -p /var/lib/leonardx-godot && chown -R 10001:10001 /var/lib/leonardx-godot

ENV HOME=/home/godot GODOT_BIN=/usr/local/bin/godot GODOT_DATA_DIR=/var/lib/leonardx-godot GODOT_HOST=0.0.0.0 GODOT_PORT=8788
WORKDIR /app
COPY --chown=10001:10001 server.py /app/server.py
USER 10001:10001
EXPOSE 8788
VOLUME ["/var/lib/leonardx-godot"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s CMD python3 -c "import json,urllib.request; d=json.load(urllib.request.urlopen('http://127.0.0.1:8788/healthz',timeout=2)); exit(0 if d.get('ready') else 1)"
CMD ["python3", "/app/server.py"]
