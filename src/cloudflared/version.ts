import type { FetchLike } from "../cloudflare/api";

const RELEASES_API =
  "https://api.github.com/repos/cloudflare/cloudflared/releases/latest";

export const resolveVersion = async (
  requested: string,
  fetchImpl: FetchLike = (url, init) => fetch(url, init),
): Promise<string> => {
  const trimmed = requested.trim();
  if (trimmed.length > 0 && trimmed !== "latest") {
    return trimmed;
  }

  const response = await fetchImpl(RELEASES_API, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "codegeneai/cloudflare-tunnel-action",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to resolve cloudflared latest version: ${response.status} ${response.statusText}`,
    );
  }
  const body = (await response.json()) as { tag_name?: unknown };
  if (typeof body.tag_name !== "string" || body.tag_name.length === 0) {
    throw new Error("cloudflared latest release missing tag_name");
  }
  return body.tag_name;
};
