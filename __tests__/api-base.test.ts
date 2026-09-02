import { apiFetch, apiUrl, getApiBase } from "@/lib/api-base";

describe("api-base", () => {
  const originalWindow = global.window;
  const originalProcess = process.env.NEXT_PUBLIC_API_BASE;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_API_BASE;
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_BASE = originalProcess;
    if (originalWindow) {
      global.window = originalWindow;
    } else {
      // @ts-expect-error cleanup test shim
      delete global.window;
    }
  });

  it("returns empty base by default", () => {
    delete process.env.NEXT_PUBLIC_API_BASE;
    expect(getApiBase()).toBe("");
    expect(apiUrl("/api/portfolio")).toBe("/api/portfolio");
  });

  it("honors NEXT_PUBLIC_API_BASE", () => {
    process.env.NEXT_PUBLIC_API_BASE = "https://api.example.com/";
    expect(getApiBase()).toBe("https://api.example.com");
    expect(apiUrl("/api/backup")).toBe("https://api.example.com/api/backup");
  });

  it("honors runtime window override", () => {
    // @ts-expect-error test shim
    global.window = {
      __ANALYTICS_API_BASE__: "https://runtime.example.com",
    };
    expect(getApiBase()).toBe("https://runtime.example.com");
  });

  it("delegates to fetch with resolved url", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response("{}"));
    await apiFetch("/api/portfolio");
    expect(fetchMock).toHaveBeenCalledWith("/api/portfolio", undefined);
    fetchMock.mockRestore();
  });
});
