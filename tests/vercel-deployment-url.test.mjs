import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import {
  normalizeVercelDomain,
  resolveVerifiedVercelMainUrl,
  toVercelSubdomain,
} from "../lib/vercel-deployment-url.ts";

test("returns only a verified project domain, never a deployment-specific URL", () => {
  const domains = [
    { name: "leo-site-1792162163142.vercel.app", verified: true },
    { name: "larryvisionai.vercel.app", verified: true },
    { name: "pending.example.com", verified: false },
  ];

  assert.equal(
    resolveVerifiedVercelMainUrl(domains, [
      "larryvision-ai.vercel.app",
      "larryvisionai.vercel.app",
      "leo-site-1792162163142.vercel.app",
    ]),
    "https://larryvisionai.vercel.app",
  );
  assert.equal(resolveVerifiedVercelMainUrl(domains, ["preview-abc123.vercel.app"]), null);
  assert.equal(resolveVerifiedVercelMainUrl(domains, ["pending.example.com"]), null);
  assert.equal(resolveVerifiedVercelMainUrl([], ["https://preview-abc123.vercel.app"]), null);
});

test("normalizes safe domain inputs and rejects paths, credentials, and invalid hosts", () => {
  assert.equal(normalizeVercelDomain(" HTTPS://LarryVisionAI.Vercel.App/ "), "larryvisionai.vercel.app");
  assert.equal(normalizeVercelDomain("https://example.com/path"), null);
  assert.equal(normalizeVercelDomain("https://user:pass@example.com"), null);
  assert.equal(normalizeVercelDomain("localhost"), null);
});

test("creates a stable Vercel subdomain candidate from a business name", () => {
  assert.equal(toVercelSubdomain("LarryVision AI"), "larryvision-ai");
  assert.equal(toVercelSubdomain("  "), null);
});

test("build deploy route does not return a deployment-specific URL as the public link", async () => {
  const source = await readFile(new URL("../app/api/build-deploy/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /readyDeployment\.url\s*\|\|\s*deploy\.url/);
  assert.match(source, /const liveUrl = mainUrl;/);
  assert.match(source, /adminUrl: `\$\{liveUrl\}\/admin`/);
});