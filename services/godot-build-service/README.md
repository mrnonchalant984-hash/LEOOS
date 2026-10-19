# LeonardX Godot build service

This is an implemented, private asynchronous Godot build service. It is not deployed by this repository change, and there is no assigned public URL yet. Deploy one instance with a durable volume and a private HTTPS reverse proxy before setting the LeonardX application environment variables.

## Runtime contract

- Pinned editor: Godot 4.7.2. The image installs only the Windows x86_64 release template required by the verified `Windows Desktop` preset. The Docker build downloads the complete official version-matched `.tpz` archive, verifies its SHA-256 against the official Godot GitHub release asset digest, and extracts only `templates/windows_release_x86_64.exe`. It does not depend on a ranged request, assumed `Content-Range`, raw-DEFLATE byte offsets, or hand-maintained decompression sizes.
- The official 4.7.2 release asset digests are `cadd3204e728a35d3f13adb7fd0d7902636b79f6b95c40c265eb73b6c35329e4` for `Godot_v4.7.2-stable_linux.x86_64.zip` and `f298490b8d44d934be425a5a65a51bf15f422428b229a06a6e11d9ffea248011` for `Godot_v4.7.2-stable_export_templates.tpz`. They are public integrity values, not secrets, and are provided in `.env.example`. The helper checks the archive hash before opening it, requires exactly one expected template entry, validates the PE `MZ` header and extracted size, and relies on ZIP CRC verification while reading the selected member.
- Image build checks the editor's runtime libraries and version, then runs a minimal project import and real Windows Desktop export as a non-root user. The build fails with a named diagnostic if a download, checksum, archive, runtime, or export step fails.
- SQLite WAL job queue and artifacts live under `/var/lib/leonardx-godot`. Keep the volume persistent and private. Run exactly one service process/replica because the queue worker is single-process.
- The API uses `Authorization: Bearer <GODOT_BUILD_SERVICE_TOKEN>` for every `/v1/*` route. Use a randomly generated secret of at least 32 characters. `/healthz` is unauthenticated and returns readiness only.
- Build submission accepts a ZIP with root `project.godot`, a configured `export_presets.cfg`, and files for the requested configured preset. ZIP limits: 50 MiB compressed, 250 MiB expanded, 4,000 files. Path traversal, symlinks, `.env*`, `.git`, generated dependency caches, and private-key files are rejected.
- Exports run with fixed Godot CLI arguments, a bounded execution time, a 250 MiB output cap, persisted status/logs, owner-scoped idempotency keys, and private artifact retrieval. No request-provided shell command is executed. Only queued jobs can be cancelled.
- API: `GET /healthz`, `GET /v1/capabilities`, `POST /v1/jobs`, `GET /v1/jobs/{id}`, `GET /v1/jobs/{id}/logs`, `GET /v1/jobs/{id}/artifact`, `DELETE /v1/jobs/{id}`.
- Only configured export presets are advertised. This image supports `Windows Desktop` only; do not advertise `Linux/X11`, Android, or other presets without adding and verifying their matching templates/toolchains. The supplied project must contain its own export preset definitions. The service does not claim physical-device/gameplay testing.

## Build and verify

1. Copy `.env.example` to an untracked `.env`. The pinned Godot 4.7.2 checksums are already filled in; if you intentionally change `GODOT_VERSION`, obtain the matching official asset digests from the same release and update both hashes together. Do not copy a checksum from an unrelated release or bypass validation.
2. Build from a clean image state and run the service tests:

   ```sh
   docker compose build --no-cache
   (cd services/godot-build-service && python3 -m unittest discover -v -p 'test_*.py')
   ```

   The image build itself verifies the Godot version, dynamic libraries, installed template path, non-root runtime, and a real minimal Windows export. The path-filtered `Godot Build Service Image` GitHub Actions workflow runs the focused tests and performs a clean image build. A successful image build is required before deployment.
3. Generate `GODOT_BUILD_SERVICE_TOKEN` with a cryptographically secure random generator (for example, `openssl rand -hex 32`). Store it in the worker host's secret manager and set the same secret in LeonardX's server-side Vercel environment. Do not add it to Git.
4. Deploy a single container with a persistent private volume mounted at `/var/lib/leonardx-godot`, CPU 2, memory 4 GiB, PID limit 256, and a 35-minute reverse-proxy timeout. Keep port 8788 private; terminate TLS at the proxy and restrict access to the LeonardX backend network. Configure backups and volume encryption.
5. Set `GODOT_EXPORT_PRESETS=Windows Desktop` on the worker host. After it assigns an HTTPS origin, set that exact origin as `GODOT_BUILD_SERVICE_URL` and set the matching token as `GODOT_BUILD_SERVICE_TOKEN` in LeonardX's Vercel server environment. Do not use localhost for production.
6. Verify `GET <actual-url>/healthz` reports `ready:true`, then call `/v1/capabilities` with the bearer token. Test a minimal valid project and retrieve its artifact using a private authenticated request before exposing the provider as ready.

Operational follow-up: configure artifact expiry/cleanup and SQLite backups for the hosting platform, monitor disk usage, and rotate the bearer token in both services together. The service does not provide cloud object storage; its persistent volume is the artifact store. It is suitable for one isolated worker initially; add a separate durable queue/worker and object storage before horizontal scaling.
