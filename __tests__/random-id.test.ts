import { randomId } from "../lib/random-id";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("randomId", () => {
  it("returns a UUID v4 string", () => {
    expect(randomId()).toMatch(UUID_RE);
  });

  it("falls back when crypto.randomUUID is unavailable", () => {
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", {
      value: { getRandomValues: undefined, randomUUID: undefined },
      configurable: true,
    });

    try {
      expect(randomId()).toMatch(UUID_RE);
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        value: original,
        configurable: true,
      });
    }
  });
});
