import {
  MAX_PRIVATE_REQUEST_BYTES,
  rejectOversizedPrivateRequest,
  requireServerAuth,
} from "@/lib/server-auth";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

function setNodeEnv(value: string): void {
  (process.env as unknown as Record<string, string>).NODE_ENV = value;
}

function request(authorization?: string): Request {
  return new Request("https://gala-soft.ru/api/portfolio", {
    headers: authorization ? { authorization } : undefined,
  });
}

describe("temporary server authentication", () => {
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

  it("challenges invalid credentials and accepts valid credentials", () => {
    setNodeEnv("production");
    process.env.ANALYTICS_AUTH_USER = "owner";
    process.env.ANALYTICS_AUTH_PASSWORD = "correct horse battery staple";

    const rejected = requireServerAuth(request("Basic bm90OnRoZS1wYXNzd29yZA=="));
    expect(rejected?.status).toBe(401);
    expect(rejected?.headers.get("www-authenticate")).toContain("Basic");

    const valid = Buffer.from("owner:correct horse battery staple").toString(
      "base64",
    );
    expect(requireServerAuth(request(`Basic ${valid}`))).toBeNull();
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
