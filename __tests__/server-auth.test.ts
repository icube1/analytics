import {
  MAX_PRIVATE_REQUEST_BYTES,
  SESSION_COOKIE_NAME,
  acceptedAdminLogins,
  createSessionToken,
  rejectOversizedPrivateRequest,
  requireServerAuth,
  resolveOwnerSession,
  safeNextPath,
  verifyOwnerCredentials,
} from "@/lib/server-auth";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

function setNodeEnv(value: string): void {
  (process.env as unknown as Record<string, string>).NODE_ENV = value;
}

function request(init?: {
  authorization?: string;
  cookie?: string;
  accept?: string;
}): Request {
  const headers = new Headers();
  if (init?.authorization) headers.set("authorization", init.authorization);
  if (init?.cookie) headers.set("cookie", init.cookie);
  if (init?.accept) headers.set("accept", init.accept);
  return new Request("https://gala-soft.ru/api/portfolio", { headers });
}

function configureOwner(): void {
  process.env.ANALYTICS_AUTH_USER = "owner";
  process.env.ANALYTICS_AUTH_PASSWORD = "correct horse battery staple";
  process.env.ANALYTICS_SESSION_SECRET = "test-session-secret";
}

describe("owner session authentication", () => {
  it("allows local development when credentials are absent", () => {
    setNodeEnv("development");
    delete process.env.ANALYTICS_AUTH_USER;
    delete process.env.ANALYTICS_AUTH_PASSWORD;

    expect(requireServerAuth(request())).toBeNull();
  });

  it("fails closed in production when credentials are absent", () => {
    setNodeEnv("production");
    delete process.env.ANALYTICS_AUTH_USER;
    delete process.env.ANALYTICS_AUTH_PASSWORD;

    expect(requireServerAuth(request())?.status).toBe(503);
  });

  it("rejects invalid credentials without a browser Basic challenge", () => {
    setNodeEnv("production");
    configureOwner();

    const rejected = requireServerAuth(
      request({ authorization: "Basic bm90OnRoZS1wYXNzd29yZA==" }),
    );
    expect(rejected?.status).toBe(401);
    expect(rejected?.headers.get("www-authenticate")).toBeNull();
    expect(rejected?.headers.get("content-type")).toContain("json");
  });

  it("accepts valid Basic credentials for machine clients", () => {
    setNodeEnv("production");
    configureOwner();

    const valid = Buffer.from("owner:correct horse battery staple").toString(
      "base64",
    );
    expect(requireServerAuth(request({ authorization: `Basic ${valid}` }))).toBeNull();
    expect(
      resolveOwnerSession(request({ authorization: `Basic ${valid}` }))?.role,
    ).toBe("admin");
  });

  it("accepts admin login aliases and a signed session cookie", () => {
    setNodeEnv("production");
    configureOwner();

    expect(acceptedAdminLogins("owner")).toEqual(
      expect.arrayContaining(["owner", "admin", "admin@gala-soft.ru"]),
    );
    expect(
      verifyOwnerCredentials("admin", "correct horse battery staple")?.displayName,
    ).toBe("Администратор");
    expect(verifyOwnerCredentials("admin", "wrong")).toBeNull();

    const token = createSessionToken("owner");
    expect(token).toBeTruthy();
    const authed = requireServerAuth(
      request({ cookie: `${SESSION_COOKIE_NAME}=${token}` }),
    );
    expect(authed).toBeNull();
    expect(
      resolveOwnerSession(request({ cookie: `${SESSION_COOKIE_NAME}=${token}` }))
        ?.login,
    ).toBe("admin");
    expect(
      verifyOwnerCredentials("admin", "correct horse battery staple")?.login,
    ).toBe("admin");
  });

  it("rejects tampered session cookies", () => {
    setNodeEnv("production");
    configureOwner();

    const token = createSessionToken("owner");
    const tampered = `${token}x`;
    const rejected = requireServerAuth(
      request({ cookie: `${SESSION_COOKIE_NAME}=${tampered}` }),
    );
    expect(rejected?.status).toBe(401);
  });

  it("keeps redirect targets on-site", () => {
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/investments")).toBe("/investments");
    expect(safeNextPath("/login?next=/")).toBe("/");
  });

  it("rejects oversized private requests before reading the body", () => {
    const oversized = new Request("https://gala-soft.ru/api/backup", {
      method: "POST",
      headers: {
        "content-length": String(MAX_PRIVATE_REQUEST_BYTES + 1),
      },
    });

    expect(rejectOversizedPrivateRequest(oversized)?.status).toBe(413);
  });
});
