import { CloudflareApiError } from "./errors";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface CloudflareTunnel {
  readonly id: string;
  readonly name: string;
  readonly status?: string;
}

export interface CloudflareTunnelsClientOptions {
  readonly accountId: string;
  readonly managementToken: string;
  readonly baseUrl?: string;
  readonly fetchImpl?: FetchLike;
}

interface CloudflareEnvelope<T> {
  readonly success: boolean;
  readonly errors?: readonly { code?: number; message?: string }[];
  readonly result?: T;
}

const DEFAULT_BASE_URL = "https://api.cloudflare.com/client/v4";

const asRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Cloudflare API response is not an object");
  }
  return value as Record<string, unknown>;
};

const asString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Cloudflare API response is missing ${label}`);
  }
  return value;
};

const mapTunnel = (value: unknown): CloudflareTunnel => {
  const r = asRecord(value);
  return {
    id: asString(r.id, "tunnel.id"),
    name: asString(r.name, "tunnel.name"),
    ...(typeof r.status === "string" ? { status: r.status } : {}),
  };
};

const extractErrors = (envelope: CloudflareEnvelope<unknown>) => ({
  codes: (envelope.errors ?? [])
    .map((e) => e.code)
    .filter((c): c is number => typeof c === "number"),
  messages: (envelope.errors ?? [])
    .map((e) => e.message)
    .filter((m): m is string => typeof m === "string"),
});

export class CloudflareTunnelsClient {
  private readonly accountId: string;
  private readonly managementToken: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: CloudflareTunnelsClientOptions) {
    this.accountId = options.accountId;
    this.managementToken = options.managementToken;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
  }

  private async call<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.managementToken}`,
        "Content-Type": "application/json",
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    const contentType = response.headers.get("content-type") ?? "";
    const parsed = contentType.includes("application/json")
      ? ((await response.json()) as CloudflareEnvelope<T>)
      : ({
          success: response.ok,
          errors: [{ code: response.status, message: await response.text() }],
        } satisfies CloudflareEnvelope<T>);

    if (!response.ok || !parsed.success) {
      const details = extractErrors(parsed);
      throw new CloudflareApiError({
        status: response.status,
        method,
        path,
        codes: details.codes,
        messages: details.messages,
      });
    }

    return parsed.result as T;
  }

  async list(): Promise<readonly CloudflareTunnel[]> {
    const result = await this.call<unknown>(
      "GET",
      `/accounts/${this.accountId}/cfd_tunnel?is_deleted=false`,
    );
    if (!Array.isArray(result)) {
      throw new Error("Cloudflare tunnel list returned non-array result");
    }
    return result.map(mapTunnel);
  }

  async create(name: string): Promise<CloudflareTunnel> {
    const result = await this.call<unknown>(
      "POST",
      `/accounts/${this.accountId}/cfd_tunnel`,
      { name, config_src: "cloudflare" },
    );
    return mapTunnel(result);
  }

  async delete(tunnelId: string): Promise<void> {
    await this.call<unknown>(
      "DELETE",
      `/accounts/${this.accountId}/cfd_tunnel/${encodeURIComponent(tunnelId)}`,
    );
  }

  async getToken(tunnelId: string): Promise<string> {
    const result = await this.call<unknown>(
      "GET",
      `/accounts/${this.accountId}/cfd_tunnel/${encodeURIComponent(tunnelId)}/token`,
    );
    return asString(result, "tunnel.token");
  }

  async cleanupConnections(tunnelId: string): Promise<void> {
    await this.call<unknown>(
      "DELETE",
      `/accounts/${this.accountId}/cfd_tunnel/${encodeURIComponent(tunnelId)}/connections`,
    );
  }
}
