Braverton Bram isolated browser runtime
========================================

This is a separate Playwright/Chromium service. It is not part of the Next.js/Vercel process and does not share the app container filesystem or browser profile.

Runtime configuration
---------------------
Run this container on an isolated container host with HTTPS ingress and outbound network policy. Do not expose port 8787 directly to the public internet; place it behind an authenticated TLS reverse proxy or private service network. Restrict egress to public web destinations on ports 80/443 and explicitly deny loopback, RFC1918, link-local, cloud metadata, host networks, and internal service ranges at the host/network firewall. Application hostname checks are defense in depth, not a substitute for network egress controls.

Set a long, unique BRAM_BROWSER_RUNTIME_TOKEN in the container host secret manager. Configure these server-only variables in Braverton:
- BRAM_BROWSER_RUNTIME_URL: HTTPS base URL of this service.
- BRAM_BROWSER_RUNTIME_TOKEN: the same secret, never a NEXT_PUBLIC_ variable.
- BRAM_COMPUTER_USE_MAX_STEPS: optional, defaults to 12 and is capped at 20.
- LEO_COMPUTER_USE_MODEL: optional, defaults to gemini-3.8-flash.
- GEMINI_API_KEY: server-side Gemini API key. Configure Production separately from Preview.

Build and run
-------------
From this directory, build and run with Docker Compose. Supply the token through the host secret manager/environment, not a committed file. Terminate TLS at the ingress proxy and forward only to the private container port.

The Compose profile uses a read-only root filesystem, non-root runtime user, dropped Linux capabilities, no-new-privileges, process/memory/CPU limits, and bounded temporary files. Chromium runs headless inside the dedicated container. Keep the host kernel and container runtime patched.

Browser policy
--------------
- Each task gets a fresh incognito browser context; downloads, service workers, and browser permissions are disabled.
- Navigation and subresource requests are limited to the starting hostname and any additional hostnames explicitly passed by the owner.
- Private, loopback, link-local and metadata hostnames are blocked in application code; enforce the same at the network layer to mitigate DNS rebinding.
- Maximum three concurrent sessions, ten-minute session lifetime, thirty browser actions per session, bounded viewport, navigation and action timeouts.
- Only click, double-click, scroll, type, allowlisted keypress, navigation, back, and wait actions are implemented. File upload, download, arbitrary JavaScript, shell, clipboard, and desktop control are not exposed.
- Sensitive actions pause for a short-lived HMAC-signed approval token. Approval executes only the exact signed action and is account-bound; the owner must explicitly confirm in a later Bram turn.
- Sessions and screenshots are ephemeral and should not be used for high-risk decisions or highly sensitive personal information.

Health check
------------
GET /health returns capacity and active-session counts. It does not expose credentials or session contents.
