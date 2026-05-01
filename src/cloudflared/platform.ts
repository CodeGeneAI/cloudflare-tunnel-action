export interface PlatformDescriptor {
  readonly os: "linux" | "darwin";
  readonly arch: "x64" | "arm64";
  readonly assetName: string;
  readonly needsExtract: boolean;
  readonly exeSuffix: "" | ".exe";
}

export const detectPlatform = (
  nodePlatform: NodeJS.Platform = process.platform,
  nodeArch: string = process.arch,
): PlatformDescriptor => {
  if (nodePlatform === "win32") {
    throw new Error(
      "Windows runners are not supported in v1 of cloudflare-tunnel-action. Planned for v1.1. Use ubuntu-latest or macos-latest.",
    );
  }

  if (nodePlatform !== "linux" && nodePlatform !== "darwin") {
    throw new Error(`Unsupported runner OS: ${nodePlatform}`);
  }

  if (nodeArch !== "x64" && nodeArch !== "arm64") {
    throw new Error(`Unsupported runner architecture: ${nodeArch}`);
  }

  const archSlug = nodeArch === "x64" ? "amd64" : "arm64";

  if (nodePlatform === "linux") {
    return {
      os: "linux",
      arch: nodeArch,
      assetName: `cloudflared-linux-${archSlug}`,
      needsExtract: false,
      exeSuffix: "",
    };
  }

  return {
    os: "darwin",
    arch: nodeArch,
    assetName: `cloudflared-darwin-${archSlug}.tgz`,
    needsExtract: true,
    exeSuffix: "",
  };
};
