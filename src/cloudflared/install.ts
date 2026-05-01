import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as tc from "@actions/tool-cache";
import * as log from "../util/log";
import type { PlatformDescriptor } from "./platform";

const TOOL_NAME = "cloudflared";
const RELEASE_BASE =
  "https://github.com/cloudflare/cloudflared/releases/download";

const sha256OfFile = async (file: string): Promise<string> => {
  const hash = crypto.createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve());
    stream.on("error", reject);
  });
  return hash.digest("hex");
};

// Parses the contents of a `.sha256` sidecar file. Cloudflare publishes them
// either as a bare 64-char hex digest or in the `<digest>  <filename>` format.
// Returns the lowercased digest on a clean parse, otherwise null.
export const parseSha256Sidecar = (raw: string): string | null => {
  const first = raw.trim().split(/\s+/)[0];
  if (first && /^[0-9a-f]{64}$/i.test(first)) {
    return first.toLowerCase();
  }
  return null;
};

const downloadChecksum = async (
  version: string,
  assetName: string,
): Promise<string | null> => {
  const url = `${RELEASE_BASE}/${version}/${assetName}.sha256`;
  try {
    const checksumPath = await tc.downloadTool(url);
    const raw = fs.readFileSync(checksumPath, "utf8");
    return parseSha256Sidecar(raw);
  } catch {
    return null;
  }
};

// Pure decision helper for the cache-hit reverify path. Centralizes the
// "use vs redownload" rule so it can be unit-tested without spinning up
// `@actions/tool-cache`.
//
//   expected   actual   → decision
//   <hash>     <match>  → "use"
//   <hash>     <miss>   → "redownload"
//   null       *        → "use" (cache reflects what we'd download anyway —
//                         upstream cloudflared does not publish per-asset
//                         .sha256 sidecars)
export const decideCacheUse = (
  expected: string | null,
  actual: string | null,
): "use" | "redownload" => {
  if (expected !== null) return actual === expected ? "use" : "redownload";
  return "use";
};

export const installCloudflared = async (
  version: string,
  platform: PlatformDescriptor,
): Promise<string> => {
  log.debug(
    `installCloudflared version=${version} arch=${platform.arch} asset=${platform.assetName}`,
  );

  const cached = tc.find(TOOL_NAME, version, platform.arch);
  if (cached.length > 0) {
    const cachedBinary = path.join(cached, `cloudflared${platform.exeSuffix}`);
    // Re-verify on cache hit when a sidecar IS available, so a poisoned cache
    // (persistent self-hosted shared cache, or an attacker-supplied earlier
    // download) cannot serve a tampered binary undetected. When no sidecar is
    // available — the default for cloudflared upstream today — we serve the
    // cache as-is, matching the download-path behavior.
    const expectedHash = await downloadChecksum(version, platform.assetName);
    const actualHash = expectedHash ? await sha256OfFile(cachedBinary) : null;
    if (decideCacheUse(expectedHash, actualHash) === "use") {
      log.info(
        expectedHash
          ? `cloudflared ${version} found in tool cache (sha256 verified): ${cached}`
          : `cloudflared ${version} found in tool cache: ${cached}`,
      );
      return cachedBinary;
    }
    log.warning(
      `Cached cloudflared ${version} fails sha256 verification (expected ${expectedHash}, got ${actualHash}); re-downloading.`,
    );
    // Fall through to the download path below.
  }

  const assetUrl = `${RELEASE_BASE}/${version}/${platform.assetName}`;
  log.info(`Downloading ${assetUrl}`);
  const downloaded = await tc.downloadTool(assetUrl);

  const expected = await downloadChecksum(version, platform.assetName);
  if (expected) {
    const actual = await sha256OfFile(downloaded);
    if (actual !== expected) {
      throw new Error(
        `cloudflared sha256 mismatch for ${platform.assetName}@${version}: expected ${expected}, got ${actual}`,
      );
    }
    log.info(`cloudflared sha256 verified (${expected.slice(0, 12)}…)`);
  } else {
    // cloudflared upstream does not currently publish per-asset .sha256
    // files (verified May 2026). The action proceeds without verification
    // in this case rather than failing — see SECURITY.md threat model.
    log.warning(
      `No sha256 sidecar published for ${platform.assetName}@${version}; proceeding without verification (cloudflared upstream does not publish per-asset hashes — see SECURITY.md).`,
    );
  }

  // Linux assets are a bare binary — rename in place so the cached file has
  // a stable filename. (macOS/Windows extraction paths will return when
  // those platforms are added in v1.1+.)
  const exeName = `cloudflared${platform.exeSuffix}`;
  const extractedDir = path.dirname(downloaded);
  fs.renameSync(downloaded, path.join(extractedDir, exeName));

  const binaryPath = path.join(extractedDir, exeName);
  fs.chmodSync(binaryPath, 0o755);

  const cachedDir = await tc.cacheFile(
    binaryPath,
    `cloudflared${platform.exeSuffix}`,
    TOOL_NAME,
    version,
    platform.arch,
  );
  return path.join(cachedDir, `cloudflared${platform.exeSuffix}`);
};
