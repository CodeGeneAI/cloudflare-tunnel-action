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

const downloadChecksum = async (
  version: string,
  assetName: string,
): Promise<string | null> => {
  const url = `${RELEASE_BASE}/${version}/${assetName}.sha256`;
  try {
    const checksumPath = await tc.downloadTool(url);
    const raw = fs.readFileSync(checksumPath, "utf8").trim();
    const first = raw.split(/\s+/)[0];
    if (first && /^[0-9a-f]{64}$/i.test(first)) {
      return first.toLowerCase();
    }
    return null;
  } catch {
    return null;
  }
};

export interface InstallOptions {
  // When false (the default for pinned versions), a missing or unreadable
  // .sha256 sidecar is a hard error. Set to true only for "latest" or when
  // the user explicitly opts out of verification.
  readonly allowMissingSidecar: boolean;
}

export const installCloudflared = async (
  version: string,
  platform: PlatformDescriptor,
  options: InstallOptions,
): Promise<string> => {
  log.debug(
    `installCloudflared version=${version} arch=${platform.arch} asset=${platform.assetName} allowMissingSidecar=${options.allowMissingSidecar}`,
  );

  const cached = tc.find(TOOL_NAME, version, platform.arch);
  if (cached.length > 0) {
    const cachedBinary = path.join(cached, `cloudflared${platform.exeSuffix}`);
    // Re-verify on cache hit so a poisoned tool-cache (persistent self-hosted
    // runners with shared caches, or a previous run that bypassed sha256
    // verification via `latest` mode) cannot serve an unverified binary.
    const expectedHash = await downloadChecksum(version, platform.assetName);
    if (expectedHash) {
      const actualHash = await sha256OfFile(cachedBinary);
      if (actualHash !== expectedHash) {
        log.warning(
          `Cached cloudflared ${version} fails sha256 verification (expected ${expectedHash}, got ${actualHash}); re-downloading.`,
        );
        // Fall through to the download path below by skipping the early return.
      } else {
        log.info(
          `cloudflared ${version} found in tool cache (sha256 verified): ${cached}`,
        );
        return cachedBinary;
      }
    } else if (options.allowMissingSidecar) {
      log.info(
        `cloudflared ${version} found in tool cache: ${cached} (sidecar unavailable, cache served as-is in latest mode).`,
      );
      return cachedBinary;
    } else {
      log.warning(
        `Cached cloudflared ${version} cannot be re-verified (no sidecar); re-downloading to fail-closed.`,
      );
    }
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
  } else if (!options.allowMissingSidecar) {
    throw new Error(
      `No sha256 sidecar published for ${platform.assetName}@${version} and binary verification is required for pinned versions. Pass cloudflared-version: "latest" to opt out, or report the missing sidecar to cloudflare/cloudflared.`,
    );
  } else {
    log.warning(
      `No sha256 sidecar published for ${platform.assetName}@${version}; proceeding without verification (allow-missing-sidecar mode).`,
    );
  }

  let extractedDir: string;
  let exeName = `cloudflared${platform.exeSuffix}`;

  if (platform.needsExtract) {
    extractedDir = await tc.extractTar(downloaded);
    const candidates = fs.readdirSync(extractedDir);
    const matches = candidates.filter((c) => c.startsWith("cloudflared"));
    if (matches.length === 0) {
      throw new Error(
        `cloudflared binary not found after extracting ${platform.assetName}. Directory contents: ${candidates.join(", ") || "(empty)"}`,
      );
    }
    if (matches.length > 1) {
      throw new Error(
        `Ambiguous cloudflared binary after extracting ${platform.assetName}; matched ${matches.length} candidates: ${matches.join(", ")}`,
      );
    }
    const onlyMatch = matches[0];
    if (!onlyMatch) {
      throw new Error("unreachable: matches.length === 1 guaranteed above");
    }
    exeName = onlyMatch;
  } else {
    extractedDir = path.dirname(downloaded);
    fs.renameSync(downloaded, path.join(extractedDir, exeName));
  }

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
