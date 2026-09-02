import * as mobileRuntime from "@/lib/mobile/runtime";
import {
  CSRF_HEADER,
  enqueueOfflineSync,
  listOfflineQueue,
  clearOfflineQueue,
  loginWithPassword,
  logoutSession,
  parseFeatureFlag,
  redactSecrets,
  replayOfflineQueue,
  resetTokenStorageForTests,
  safeSerializeForPersistence,
  authenticatedFetch,
  getTokenStorage,
  pushPortfolio,
  SessionApiError,
} from "@/lib/session-sync";

describe("session-sync feature flags", () => {
  it("parses truthy env values", () => {
    expect(parseFeatureFlag("1")).toBe(true);
    expect(parseFeatureFlag("true")).toBe(true);
    expect(parseFeatureFlag("yes")).toBe(true);
    expect(parseFeatureFlag("0")).toBe(false);
    expect(parseFeatureFlag(undefined)).toBe(false);
  });
});

describe("session-sync secrets", () => {
  it("redacts sensitive fields for persistence", () => {
    const redacted = redactSecrets({
      email: "user@example.com",
      password: "secret",
      nested: { bearerToken: "abc", csrfToken: "xyz" },
    });
    expect(redacted).toEqual({
      email: "user@example.com",
      password: "[REDACTED]",
      nested: { bearerToken: "[REDACTED]", csrfToken: "[REDACTED]" },
    });
  });

  it("serializes queue snapshots without secrets", () => {
    const json = safeSerializeForPersistence({
      items: [{ id: "q1", baseRevision: 2, enqueuedAt: "2026-01-01T00:00:00.000Z" }],
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(json).not.toMatch(/password|bearerToken|csrfToken/i);
  });
});

describe("session-sync auth transport", () => {
  const originalFetch = global.fetch;
  let session: Map<string, string>;

  beforeEach(() => {
    resetTokenStorageForTests();
    session = new Map<string, string>();
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => session.get(key) ?? null,
        setItem: (key: string, value: string) => {
          session.set(key, value);
        },
        removeItem: (key: string) => {
          session.delete(key);
        },
        clear: () => session.clear(),
      },
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    resetTokenStorageForTests();
  });

  it("attaches CSRF header for web cookie mutations", async () => {
    getTokenStorage("web").setCsrfToken("csrf-123");
    const headers = new Headers();

    global.fetch = jest.fn(async (_input, init) => {
      const reqHeaders = new Headers(init?.headers);
      headers.set(CSRF_HEADER, reqHeaders.get(CSRF_HEADER) ?? "");
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    const storage = getTokenStorage("web");
    storage.setCsrfToken("csrf-123");

    await authenticatedFetch("/portfolio", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    expect(headers.get(CSRF_HEADER)).toBe("csrf-123");
  });

  it("uses bearer authorization for mobile transport", async () => {
    jest.spyOn(mobileRuntime, "isCapacitorNative").mockReturnValue(true);
    resetTokenStorageForTests();

    let authHeader = "";
    global.fetch = jest.fn(async (_input, init) => {
      authHeader = new Headers(init?.headers).get("authorization") ?? "";
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    getTokenStorage("mobile").setBearerToken("mobile-token");

    await authenticatedFetch("/auth/me");

    expect(authHeader).toBe("Bearer mobile-token");
    jest.restoreAllMocks();
  });

  it("logs in without persisting password and stores csrf for web", async () => {
    jest.spyOn(mobileRuntime, "isCapacitorNative").mockReturnValue(false);
    resetTokenStorageForTests();

    global.fetch = jest.fn(async () =>
      new Response(
        JSON.stringify({
          userId: "u1",
          householdId: "h1",
          csrfToken: "csrf-login",
          expiresAt: "2026-12-31T00:00:00.000Z",
        }),
        { status: 200 },
      ),
    ) as typeof fetch;

    const result = await loginWithPassword("user@example.com", "pw-once");
    expect(result.csrfToken).toBe("csrf-login");
    expect(globalThis.sessionStorage.getItem("analytics.session.csrf.v1")).toBe(
      "csrf-login",
    );
    expect(globalThis.sessionStorage.getItem("analytics.session.bearer.v1")).toBeNull();
    expect(JSON.stringify(session)).not.toContain("pw-once");
    jest.restoreAllMocks();
  });

  it("clears tokens on logout", async () => {
    resetTokenStorageForTests();
    getTokenStorage("web").setCsrfToken("csrf-logout");

    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ) as typeof fetch;

    await logoutSession();

    expect(globalThis.sessionStorage.getItem("analytics.session.csrf.v1")).toBeNull();
  });

  it("clears mobile bearer on logout", async () => {
    jest.spyOn(mobileRuntime, "isCapacitorNative").mockReturnValue(true);
    resetTokenStorageForTests();
    getTokenStorage("mobile").setBearerToken("bearer-logout");

    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ) as typeof fetch;

    await logoutSession();

    expect(globalThis.sessionStorage.getItem("analytics.session.bearer.v1")).toBeNull();
    jest.restoreAllMocks();
  });
});

describe("session-sync portfolio conflicts and offline replay", () => {
  const originalFetch = global.fetch;
  let local: Map<string, string>;

  beforeEach(() => {
    resetTokenStorageForTests();
    clearOfflineQueue();
    const session = new Map<string, string>();
    local = new Map<string, string>();
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => session.get(key) ?? null,
        setItem: (key: string, value: string) => session.set(key, value),
        removeItem: (key: string) => session.delete(key),
        clear: () => session.clear(),
      },
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => local.get(key) ?? null,
        setItem: (key: string, value: string) => {
          local.set(key, value);
        },
        removeItem: (key: string) => local.delete(key),
        clear: () => local.clear(),
      },
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    clearOfflineQueue();
  });

  it("surfaces revision conflict details", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "revision_conflict",
              message: "revision conflict: expected 1, found 2",
              details: { expectedRevision: 1, actualRevision: 2 },
            },
          }),
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            schemaVersion: 1,
            revision: 2,
            householdId: "h1",
            document: { version: 1 },
            updatedAt: "2026-01-01T00:00:00.000Z",
          }),
          { status: 200 },
        ),
      ) as typeof fetch;

    const outcome = await pushPortfolio(
      {
        version: 1,
        customAssets: { items: [], otherDebts: [] },
        compoundParams: {} as never,
        brokerReport: null,
        brokerSnapshots: [],
        debtBalanceHistory: [],
        forecastPlans: [],
        lastBrokerFileName: "portfolio.html",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      { baseRevision: 1 },
    );

    expect(outcome.conflict).toBe(true);
    if (outcome.conflict) {
      expect(outcome.remoteRevision).toBe(2);
      expect(outcome.localRevision).toBe(1);
    }
  });

  it("replays offline queue items", async () => {
    enqueueOfflineSync({
      id: "offline-1",
      baseRevision: 0,
      enqueuedAt: "2026-01-01T00:00:00.000Z",
      documentFingerprint: "fp",
    });
    expect(listOfflineQueue()).toHaveLength(1);

    const result = await replayOfflineQueue(async () => true);
    expect(result.replayed).toBe(1);
    expect(result.remaining).toBe(0);
  });
});

describe("session-sync api errors", () => {
  it("maps forbidden responses", async () => {
    const err = new SessionApiError(403, "forbidden", "forbidden");
    expect(err.code).toBe("forbidden");
    expect(err.status).toBe(403);
  });
});
