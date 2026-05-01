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

export const installCloudflared = async (
  version: string,
  platform: PlatformDescriptor,
): Promise<string> => {
  const cached = tc.find(TOOL_NAME, version, platform.arch);
  if (cached.length > 0) {
    log.info(`cloudflared ${version} found in tool cache: ${cached}`);
    return path.join(cached, `cloudflared${platform.exeSuffix}`);
  }

  const assetUrl = `${RELEASE_BASE}/${version}/${platform.assetName}`;
  log.info(`Downloading ${assetUrl}`);
  const downloaded = await tc.downloadTool(assetUrl);

  const expected = await downloadChecksum(version, platform.assetName);
  if (expected) {
    const actual = await sha256OfFile(downloaded);
    if (actual !== expected) {
      throw new Error(
        `cloudflared sha256 mismatch: expected ${expected}, got ${actual}`,
      );
    }
    log.info("cloudflared sha256 verified");
  } else {
    log.warning(
      `No sha256 sidecar published for ${platform.assetName}@${version}; proceeding without verification`,
    );
  }

  let extractedDir: string;
  let exeName = `cloudflared${platform.exeSuffix}`;

  if (platform.needsExtract) {
    extractedDir = await tc.extractTar(downloaded);
    const candidates = fs.readdirSync(extractedDir);
    const found = candidates.find((c) => c.startsWith("cloudflared"));
    if (!found) {
      throw new Error(
        `cloudflared binary not found after extracting ${platform.assetName}`,
      );
    }
    exeName = found;
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
