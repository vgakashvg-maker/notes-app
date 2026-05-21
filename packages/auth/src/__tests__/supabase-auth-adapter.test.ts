import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SupabaseAuthAdapter,
  type AuthStateChangeEvent,
  type SupabaseAuthClient,
  type SupabaseAuthSession,
  type UserProfileFetcher,
  type UserProfileRow,
} from "../supabase-auth-adapter.js";
import { GOOGLE_SCOPES } from "../types.js";

const REFRESH_URL = "https://example.supabase.co/functions/v1/auth/refresh-provider-token";

const PROFILE_ROW: UserProfileRow = {
  user_id: "550e8400-e29b-41d4-a716-446655440000",
  display_name: "Vgaka",
  storage_provider: "GOOGLE_DRIVE",
  calendar_provider: "GOOGLE_CALENDAR",
  ai_prefs: {
    chatProvider: "OLLAMA",
    chatModel: "qwen2.5:7b",
    tagProvider: "OLLAMA",
    tagModel: "llama3.2:3b",
    embeddingProvider: "OLLAMA",
    embeddingModel: "nomic-embed-text",
  },
  analytics_optout: false,
};

const SESSION: SupabaseAuthSession = {
  user: { id: PROFILE_ROW.user_id },
  access_token: "jwt-abc",
};

interface FakeClient extends SupabaseAuthClient {
  fire(event: AuthStateChangeEvent, session: SupabaseAuthSession | null): Promise<void>;
  readonly signInCalls: Array<Parameters<SupabaseAuthClient["signInWithOAuth"]>[0]>;
  signInError: { message: string; name?: string } | null;
  sessionFromGetSession: SupabaseAuthSession | null;
  unsubscribeCalls: number;
}

function makeFakeClient(): FakeClient {
  let cb: ((event: AuthStateChangeEvent, session: SupabaseAuthSession | null) => void) | null =
    null;
  const client: FakeClient = {
    signInCalls: [],
    signInError: null,
    sessionFromGetSession: null,
    unsubscribeCalls: 0,
    async signInWithOAuth(opts) {
      client.signInCalls.push(opts);
      return { data: null, error: client.signInError };
    },
    async signOut() {
      return { error: null };
    },
    async getSession() {
      return { data: { session: client.sessionFromGetSession }, error: null };
    },
    onAuthStateChange(handler) {
      cb = handler;
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              client.unsubscribeCalls += 1;
            },
          },
        },
      };
    },
    async fire(event, session) {
      cb?.(event, session);
      // Let microtasks from the handler settle (it calls async profile fetcher).
      await Promise.resolve();
      await Promise.resolve();
    },
  };
  return client;
}

interface Harness {
  adapter: SupabaseAuthAdapter;
  client: FakeClient;
  profileFetcher: ReturnType<typeof vi.fn<UserProfileFetcher>>;
  fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
}

function makeHarness(): Harness {
  const client = makeFakeClient();
  const profileFetcher = vi.fn(async () => PROFILE_ROW);
  const fetcher = vi.fn(
    async () =>
      new Response(JSON.stringify({ ok: true, data: { access_token: "ya29.fresh" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  const adapter = new SupabaseAuthAdapter({
    client,
    userProfileFetcher: profileFetcher,
    refreshProviderTokenUrl: REFRESH_URL,
    redirectTo: "https://app.example.com/auth/callback",
    fetcher,
    signInTimeoutMs: 50,
  });
  return { adapter, client, profileFetcher, fetcher };
}

describe("SupabaseAuthAdapter.signInWithGoogle", () => {
  let harness: Harness;
  beforeEach(() => {
    harness = makeHarness();
  });
  afterEach(() => {
    harness.adapter.dispose();
  });

  it("requests the spec'd Google scopes via signInWithOAuth", async () => {
    const signIn = harness.adapter.signInWithGoogle();
    await harness.client.fire("SIGNED_IN", SESSION);
    const result = await signIn;
    expect(harness.client.signInCalls).toHaveLength(1);
    expect(harness.client.signInCalls[0]?.provider).toBe("google");
    expect(harness.client.signInCalls[0]?.options?.scopes).toBe(GOOGLE_SCOPES.join(" "));
    expect(harness.client.signInCalls[0]?.options?.redirectTo).toBe(
      "https://app.example.com/auth/callback",
    );
    expect(result.kind).toBe("Success");
  });

  it("resolves Success once the auth-state change carries a session", async () => {
    const signIn = harness.adapter.signInWithGoogle();
    await harness.client.fire("SIGNED_IN", SESSION);
    const result = await signIn;
    expect(result.kind).toBe("Success");
    if (result.kind === "Success") {
      expect(result.user.displayName).toBe("Vgaka");
    }
  });

  it("maps a user-cancelled provider response to AuthResult.Cancelled", async () => {
    harness.client.signInError = { message: "user_cancelled_login", name: "OAuthCancelled" };
    const result = await harness.adapter.signInWithGoogle();
    expect(result.kind).toBe("Cancelled");
  });

  it("maps any other provider error to AuthResult.Error", async () => {
    harness.client.signInError = { message: "redirect_uri_mismatch" };
    const result = await harness.adapter.signInWithGoogle();
    expect(result.kind).toBe("Error");
  });

  it("times out if no auth-state event arrives", async () => {
    const result = await harness.adapter.signInWithGoogle();
    expect(result.kind).toBe("Cancelled");
    if (result.kind === "Cancelled") {
      expect(result.reason).toMatch(/timed out/i);
    }
  });
});

describe("SupabaseAuthAdapter session lifecycle", () => {
  it("subscribers receive the initial null state and subsequent updates", async () => {
    const harness = makeHarness();
    const seen: Array<string | null> = [];
    harness.adapter.subscribeToUser((u) => seen.push(u?.displayName ?? null));
    await harness.client.fire("SIGNED_IN", SESSION);
    await harness.client.fire("SIGNED_OUT", null);
    expect(seen).toEqual([null, "Vgaka", null]);
    harness.adapter.dispose();
  });

  it("currentUser exposes the latest snapshot", async () => {
    const harness = makeHarness();
    expect(harness.adapter.currentUser()).toBeNull();
    await harness.client.fire("SIGNED_IN", SESSION);
    expect(harness.adapter.currentUser()?.displayName).toBe("Vgaka");
    harness.adapter.dispose();
  });

  it("signOut throws when Supabase reports a failure", async () => {
    const client = makeFakeClient();
    client.signOut = async () => ({ error: { message: "boom" } });
    const adapter = new SupabaseAuthAdapter({
      client,
      userProfileFetcher: async () => PROFILE_ROW,
      refreshProviderTokenUrl: REFRESH_URL,
    });
    await expect(adapter.signOut()).rejects.toThrow(/boom/);
    adapter.dispose();
  });

  it("dispose unsubscribes from the auth-state stream", () => {
    const harness = makeHarness();
    expect(harness.client.unsubscribeCalls).toBe(0);
    harness.adapter.dispose();
    expect(harness.client.unsubscribeCalls).toBe(1);
  });
});

describe("SupabaseAuthAdapter.providerAccessToken", () => {
  it("returns null when there is no Supabase session", async () => {
    const harness = makeHarness();
    const token = await harness.adapter.providerAccessToken("GOOGLE_DRIVE");
    expect(token).toBeNull();
    expect(harness.fetcher).not.toHaveBeenCalled();
    harness.adapter.dispose();
  });

  it("hits the Edge Function with the user JWT and unwraps the access_token", async () => {
    const harness = makeHarness();
    harness.client.sessionFromGetSession = SESSION;
    const token = await harness.adapter.providerAccessToken("GOOGLE_DRIVE");
    expect(token).toBe("ya29.fresh");
    expect(harness.fetcher).toHaveBeenCalledTimes(1);
    const call = harness.fetcher.mock.calls[0];
    if (!call) throw new Error("expected exactly one fetch call");
    const [url, init] = call;
    expect(url).toBe(REFRESH_URL);
    const reqInit = init as RequestInit;
    expect(reqInit.headers).toMatchObject({
      Authorization: "Bearer jwt-abc",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(reqInit.body))).toEqual({ provider: "GOOGLE_DRIVE" });
    harness.adapter.dispose();
  });

  it("returns null when the Edge Function returns a non-2xx", async () => {
    const harness = makeHarness();
    harness.client.sessionFromGetSession = SESSION;
    harness.fetcher.mockResolvedValueOnce(new Response("nope", { status: 500 }));
    const token = await harness.adapter.providerAccessToken("GOOGLE_DRIVE");
    expect(token).toBeNull();
    harness.adapter.dispose();
  });

  it("returns null when the Edge Function returns an error shape", async () => {
    const harness = makeHarness();
    harness.client.sessionFromGetSession = SESSION;
    harness.fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: { code: "X", message: "y" } }), {
        status: 200,
      }),
    );
    const token = await harness.adapter.providerAccessToken("GOOGLE_DRIVE");
    expect(token).toBeNull();
    harness.adapter.dispose();
  });
});

describe("SupabaseAuthAdapter.accessToken", () => {
  it("returns null when no session is available", async () => {
    const harness = makeHarness();
    expect(await harness.adapter.accessToken()).toBeNull();
    harness.adapter.dispose();
  });

  it("returns the JWT when the session is available", async () => {
    const harness = makeHarness();
    harness.client.sessionFromGetSession = SESSION;
    expect(await harness.adapter.accessToken()).toBe("jwt-abc");
    harness.adapter.dispose();
  });
});
