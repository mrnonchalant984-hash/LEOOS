# Legacy runner retirement

The self-managed Linux / Podman / gVisor runner is not used by LeonardX Work, LeoCode sandbox jobs, skill-script execution, or repository operations. Those finite jobs now use the private `LEOOS-RUNTIME` GitHub Actions workflow through `lib/runtime/github-actions.ts`.

The old isolated-runner service and its Docker image workflow were removed from the Work runtime path. Do not reintroduce a persistent Linux host, Podman daemon, gVisor service, or Cloudflare Tunnel for these workloads.

Other product-specific build services must be reviewed independently before removal; this migration does not claim that every Linux-based build in the wider product has been replaced.
