import { lookup } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";
import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici";
import ipaddr from "ipaddr.js";

export type VercelProjectDomain = {
  name?: unknown;
  verified?: unknown;
};

type ResolvedAddress = { address: string; family: number };

export function normalizeVercelDomain(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const input = value.trim().includes("://") ? value.trim() : `https://${value.trim()}`;
    const url = new URL(input);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443") ||
      (url.pathname !== "/" && url.pathname !== "") ||
      url.search ||
      url.hash ||
      isIP(hostname) ||
      !/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(hostname)
    ) {
      return null;
    }
    return hostname;
  } catch {
    return null;
  }
}

export function toVercelSubdomain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "");
  return slug || null;
}

export function resolveVerifiedVercelMainUrl(
  projectDomains: unknown,
  preferredDomains: readonly unknown[],
): string | null {
  if (!Array.isArray(projectDomains)) return null;

  const verifiedDomains = new Set(
    projectDomains.flatMap((entry: VercelProjectDomain) => {
      if (entry.verified !== true && entry.verified !== "true") return [];
      const domain = normalizeVercelDomain(entry.name);
      return domain ? [domain] : [];
    }),
  );

  for (const preferred of preferredDomains) {
    const domain = normalizeVercelDomain(preferred);
    if (domain && verifiedDomains.has(domain)) return `https://${domain}`;
  }
  return null;
}

function pinnedLookup(hostname: string, addresses: ResolvedAddress[]): LookupFunction {
  return (requestedHost, options, callback) => {
    if (requestedHost.toLowerCase() !== hostname) {
      callback(Object.assign(new Error("Unexpected deployment-domain hostname."), { code: "EACCES" }), "", 0);
      return;
    }
    const family = options.family || 0;
    const eligible = addresses.filter((address) => !family || address.family === family);
    const selected = eligible[0];
    if (!selected) {
      callback(Object.assign(new Error("No public deployment-domain address is available."), { code: "ENOTFOUND" }), "", 0);
      return;
    }
    if (options.all) callback(null, eligible);
    else callback(null, selected.address, selected.family);
  };
}

async function fetchVerifiedDomain(url: URL) {
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (
    !addresses.length ||
    addresses.some(({ address }) => {
      try {
        return ipaddr.parse(address).range() !== "unicast";
      } catch {
        return true;
      }
    })
  ) {
    throw new Error("The verified production domain does not resolve to a public address.");
  }

  const dispatcher = new Agent({
    connect: { lookup: pinnedLookup(url.hostname, addresses), maxCachedSessions: 0 },
    headersTimeout: 10_000,
    bodyTimeout: 10_000,
    maxResponseSize: 64 * 1024,
    pipelining: 0,
    maxOrigins: 1,
  });
  try {
    const response = await undiciFetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      dispatcher,
    } as UndiciRequestInit);
    const result = { status: response.status, location: response.headers.get("location") };
    await response.body?.cancel();
    return result;
  } finally {
    await dispatcher.destroy();
  }
}

export async function verifyPublicMainDomain(url: string, verifiedHosts: ReadonlySet<string>) {
  let current = new URL(url);
  if (current.protocol !== "https:" || !verifiedHosts.has(current.hostname)) {
    throw new Error("The main deployment URL is not a verified HTTPS project domain.");
  }

  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetchVerifiedDomain(current);
    if (response.status >= 300 && response.status < 400) {
      if (!response.location) throw new Error("The main deployment domain returned an incomplete redirect.");
      const next = new URL(response.location, current);
      if (next.hostname === "vercel.com" || next.hostname.endsWith(".vercel.com")) {
        throw new Error("VERCEL_DEPLOYMENT_PROTECTION");
      }
      if (next.protocol !== "https:" || !verifiedHosts.has(next.hostname)) {
        throw new Error("The main deployment domain redirects outside the verified project domains.");
      }
      current = next;
      continue;
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error("The main deployment domain requires authentication.");
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`The main deployment domain returned HTTP ${response.status}.`);
    }
    return;
  }

  throw new Error("The main deployment domain has too many redirects.");
}