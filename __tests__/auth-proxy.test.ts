import { NextRequest } from "next/server";
import { proxy } from "../proxy";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("auth proxy", () => {
  it("lets curl fetch /login without a session or HTML Accept header", async () => {
    const request = new NextRequest("http://127.0.0.1:3000/login", {
      headers: { accept: "*/*" },
    });
    const response = proxy(request);
    expect(response.status).not.toBe(401);
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects HTML navigations to /login instead of returning JSON 401", () => {
    (process.env as unknown as Record<string, string>).NODE_ENV = "production";
    process.env.ANALYTICS_AUTH_USER = "owner";
    process.env.ANALYTICS_AUTH_PASSWORD = "secret";
    process.env.ANALYTICS_SESSION_SECRET = "test-session-secret";

    const request = new NextRequest("http://127.0.0.1:3000/investments", {
      headers: { accept: "text/html" },
    });
    const response = proxy(request);
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    expect(
      new URL(response.headers.get("location") ?? "", request.url).pathname,
    ).toBe("/login");
  });
});
