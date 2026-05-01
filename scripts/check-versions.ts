import * as fs from "node:fs";
import * as path from "node:path";
import { USER_AGENT } from "../src/util/constants";

interface PackageJson {
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
}

const NPM_REGISTRY = "https://registry.npmjs.org";
const CLOUDFLARED_RELEASES =
  "https://api.github.com/repos/cloudflare/cloudflared/releases/latest";

const REQUEST_TIMEOUT_MS = 15_000;

const fetchLatestNpm = async (name: string): Promise<string> => {
  const response = await fetch(`${NPM_REGISTRY}/${encodeURIComponent(name)}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`npm ${name}: HTTP ${response.status}`);
  }
  const body = (await response.json()) as { "dist-tags"?: { latest?: string } };
  const latest = body["dist-tags"]?.latest;
  if (!latest) throw new Error(`npm ${name}: no dist-tags.latest`);
  return latest;
};

const fetchLatestCloudflared = async (): Promise<string> => {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": USER_AGENT,
  };
  const ghToken = process.env.GITHUB_TOKEN;
  if (ghToken) headers.Authorization = `Bearer ${ghToken}`;
  const response = await fetch(CLOUDFLARED_RELEASES, {
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`cloudflared releases: HTTP ${response.status}`);
  }
  const body = (await response.json()) as { tag_name?: string };
  if (!body.tag_name) throw new Error("cloudflared releases: no tag_name");
  return body.tag_name;
};

const splitSemver = (
  v: string,
): { major: number; minor: number; patch: number } => {
  const cleaned = v.replace(/^[v=~^]/, "");
  const parts = cleaned.split(".").map((p) => Number.parseInt(p, 10));
  return {
    major: parts[0] ?? 0,
    minor: parts[1] ?? 0,
    patch: parts[2] ?? 0,
  };
};

interface DriftReport {
  readonly name: string;
  readonly pinned: string;
  readonly latest: string;
  readonly severity: "major" | "minor" | "patch" | "ok";
}

const compare = (name: string, pinned: string, latest: string): DriftReport => {
  const p = splitSemver(pinned);
  const l = splitSemver(latest);
  let severity: DriftReport["severity"] = "ok";
  if (p.major !== l.major) severity = "major";
  else if (p.minor !== l.minor) severity = "minor";
  else if (p.patch !== l.patch) severity = "patch";
  return { name, pinned, latest, severity };
};

const checkActionYmlCloudflaredDefault = (): string => {
  const file = path.resolve(import.meta.dir, "..", "action.yml");
  const contents = fs.readFileSync(file, "utf8");
  const cloudflaredBlock = contents
    .split("\n")
    .findIndex((l) => /cloudflared-version:/.test(l));
  if (cloudflaredBlock < 0) {
    throw new Error("could not locate cloudflared-version block in action.yml");
  }
  // Look for `default: "X.Y.Z"` within the next ~10 lines.
  const window = contents
    .split("\n")
    .slice(cloudflaredBlock, cloudflaredBlock + 10);
  for (const line of window) {
    const m = line.match(/default:\s*"([^"]+)"/);
    if (m?.[1]) return m[1];
  }
  throw new Error("cloudflared-version block has no `default:` literal");
};

const main = async (): Promise<void> => {
  const pkgPath = path.resolve(import.meta.dir, "..", "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as PackageJson;
  const all = { ...pkg.dependencies, ...pkg.devDependencies };

  const reports: DriftReport[] = [];
  for (const [name, range] of Object.entries(all)) {
    try {
      const latest = await fetchLatestNpm(name);
      reports.push(compare(name, range, latest));
    } catch (e) {
      process.stdout.write(
        `warn ${name}: ${e instanceof Error ? e.message : String(e)}\n`,
      );
    }
  }

  // Also compare the cloudflared default in action.yml against the current
  // GitHub releases tag — the plan calls for the pinned binary version to
  // stay current, and Dependabot does not watch GH-released binaries.
  try {
    const pinned = checkActionYmlCloudflaredDefault();
    const latest = await fetchLatestCloudflared();
    reports.push(compare("cloudflared (action.yml default)", pinned, latest));
  } catch (e) {
    process.stdout.write(
      `warn cloudflared default: ${e instanceof Error ? e.message : String(e)}\n`,
    );
  }

  let majorDrift = 0;
  for (const r of reports) {
    const tag =
      r.severity === "major"
        ? "drift-major"
        : r.severity === "minor"
          ? "drift-minor"
          : r.severity === "patch"
            ? "drift-patch"
            : "ok";
    process.stdout.write(`${tag}\t${r.name}\t${r.pinned}\t${r.latest}\n`);
    if (r.severity === "major") majorDrift += 1;
  }

  if (majorDrift > 0) {
    process.stderr.write(
      `\nMajor-version drift detected on ${majorDrift} package(s).\n`,
    );
    process.exit(1);
  }
};

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
