import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as me } from "@/app/api/auth/me/route";
import { SESSION_COOKIE_NAME } from "@/lib/server-auth";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

function configureOwner(): void {
  (process.env as unknown as Record<string, string>).NODE_ENV = "production";
  process.env.ANALYTICS_AUTH_USER = "owner";
  process.env.ANALYTICS_AUTH_PASSWORD = "correct horse battery staple";
  process.env.ANALYTICS_SESSION_SECRET = "test-session-secret";
}

describe("owner login API", () => {
  it("sets an httpOnly session cookie and serves /me without Basic", async () => {
    configureOwner();

    const rejected = await me(new Request("https://gala-soft.ru/api/auth/me"));
    expect(rejected.status).toBe(401);
    expect(rejected.headers.get("www-authenticate")).toBeNull();

    const loginResponse = await login(
      new Request("https://gala-soft.ru/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ login: "admin", password: "correct horse battery staple" }),
      }),
    );
    expect(loginResponse.status).toBe(200);
    const setCookie = loginResponse.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).not.toContain("www-authenticate");

    const cookieValue = setCookie.split(";")[0];
    const meResponse = await me(
      new Request("https://gala-soft.ru/api/auth/me", {
        headers: { cookie: cookieValue },
      }),
    );
    expect(meResponse.status).toBe(200);
    const body = (await meResponse.json()) as { user: { login: string; role: string } };
    expect(body.user).toEqual(expect.objectContaining({ login: "admin", role: "admin" }));

    const logoutResponse = await logout();
    expect(logoutResponse.status).toBe(200);
  });

  it("rejects a wrong password without a Basic challenge", async () => {
    configureOwner();
    const response = await login(
      new Request("https://gala-soft.ru/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ login: "admin", password: "nope" }),
      }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBeNull();
  });
});
