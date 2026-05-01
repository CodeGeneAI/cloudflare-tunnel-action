export interface PlatformDescriptor {
  readonly os: "linux";
  readonly arch: "x64" | "arm64";
  readonly assetName: string;
  readonly exeSuffix: "";
}

// v1 supports Linux x64 and arm64 only. macOS and Windows are explicit
// throws so a misconfigured workflow fails fast with a useful message
// instead of timing out on a binary download for an unsupported asset.
// macOS support is planned for v1.1; Windows for v1.2 (or later).
export const detectPlatform = (
  nodePlatform: NodeJS.Platform = process.platform,
  nodeArch: string = process.arch,
): PlatformDescriptor => {
  if (nodePlatform === "darwin") {
    throw new Error(
      "macOS runners are not supported in v1 of cloudflare-tunnel-action. Planned for v1.1. Use ubuntu-latest or ubuntu-24.04-arm.",
    );
  }
  if (nodePlatform === "win32") {
    throw new Error(
      "Windows runners are not supported in v1 of cloudflare-tunnel-action. Use ubuntu-latest or ubuntu-24.04-arm.",
    );
  }
  if (nodePlatform !== "linux") {
    throw new Error(`Unsupported runner OS: ${nodePlatform}`);
  }
  if (nodeArch !== "x64" && nodeArch !== "arm64") {
    throw new Error(`Unsupported runner architecture: ${nodeArch}`);
  }

  const archSlug = nodeArch === "x64" ? "amd64" : "arm64";
  return {
    os: "linux",
    arch: nodeArch,
    assetName: `cloudflared-linux-${archSlug}`,
    exeSuffix: "",
  };
};
