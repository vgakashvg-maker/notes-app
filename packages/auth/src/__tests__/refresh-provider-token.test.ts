import { describe, expect, it, vi } from "vitest";
import {
  parseRequest,
  refreshProviderToken,
  type RefreshProviderTokenDeps,
} from "../refresh-provider-token.js";

const VALID_RECORD = {
  refreshToken: "1//refresh",
  clientId: "client.apps.googleusercontent.com",
  clientSecret: "GOCSPX-...",
};

function makeDeps(overrides: Partial<RefreshProviderTokenDeps> = {}): RefreshProviderTokenDeps {
  return {
    lookupRefreshToken: async () => VALID_RECORD,
    fetcher: vi.fn(
      async () =>
        new Response(JSON.stringify({ access_token: "ya29.fresh", expires_in: 3599 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ),
    ...overrides,
  };
}

describe("parseRequest", () => {
  it("accepts the V1 provider names", () => {
    expect(parseRequest({ provider: "GOOGLE_DRIVE" })?.provider).toBe("GOOGLE_DRIVE");
    expect(parseRequest({ provider: "GOOGLE_CALENDAR" })?.provider).toBe("GOOGLE_CALENDAR");
  });

  it("rejects unknown providers", () => {
    expect(parseRequest({ provider: "DROPBOX" })).toBeNull();
  });

  it("rejects non-string providers", () => {
    expect(parseRequest({ provider: 123 })).toBeNull();
  });

  it("rejects non-object bodies", () => {
    expect(parseRequest(null)).toBeNull();
    expect(parseRequest("oops")).toBeNull();
  });
});

describe("refreshProviderToken", () => {
  it("rejects callers without a userId", async () => {
    const result = await refreshProviderToken("", { provider: "GOOGLE_DRIVE" }, makeDeps());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ERR_UNAUTHENTICATED");
  });

  it("returns ERR_NO_REFRESH_TOKEN when the user has no stored token", async () => {
    const result = await refreshProviderToken(
      "user-1",
      { provider: "GOOGLE_DRIVE" },
      makeDeps({ lookupRefreshToken: async () => null }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ERR_NO_REFRESH_TOKEN");
  });

  it("exchanges the refresh token at Google and returns the new access_token", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ access_token: "ya29.fresh", expires_in: 3599 }), {
          status: 200,
        }),
    );
    const result = await refreshProviderToken(
      "user-1",
      { provider: "GOOGLE_DRIVE" },
      makeDeps({ fetcher }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.access_token).toBe("ya29.fresh");
      expect(result.data.expires_in).toBe(3599);
    }
    expect(fetcher).toHaveBeenCalledTimes(1);
    const call = fetcher.mock.calls[0];
    if (!call) throw new Error("expected exactly one fetch call");
    const [url, init] = call;
    expect(url).toBe("https://oauth2.googleapis.com/token");
    const reqInit = init as RequestInit;
    expect(reqInit.method).toBe("POST");
    const body = reqInit.body as string;
    expect(body).toContain("grant_type=refresh_token");
    expect(body).toContain("refresh_token=1%2F%2Frefresh");
  });

  it("maps an upstream HTTP error to ERR_UPSTREAM_REJECTED", async () => {
    const fetcher = vi.fn(async () => new Response("invalid_grant", { status: 400 }));
    const result = await refreshProviderToken(
      "user-1",
      { provider: "GOOGLE_DRIVE" },
      makeDeps({ fetcher }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ERR_UPSTREAM_REJECTED");
  });

  it("maps a thrown fetch error to ERR_UPSTREAM_NETWORK", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    const result = await refreshProviderToken(
      "user-1",
      { provider: "GOOGLE_DRIVE" },
      makeDeps({ fetcher }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ERR_UPSTREAM_NETWORK");
  });

  it("maps a malformed upstream response to ERR_UPSTREAM_SHAPE", async () => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ surprise: true }), { status: 200 }),
    );
    const result = await refreshProviderToken(
      "user-1",
      { provider: "GOOGLE_DRIVE" },
      makeDeps({ fetcher }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ERR_UPSTREAM_SHAPE");
  });
});
