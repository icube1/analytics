import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("deploy-test SSH script", () => {
  const yaml = readFileSync(
    join(__dirname, "../.github/workflows/deploy-test.yml"),
    "utf8",
  );

  it("does not use heredocs that appleboy script_stop injects into stdin", () => {
    expect(yaml).not.toMatch(/<<['"]?\w+/);
  });

  it("writes deploy-meta.json with a one-line python3 -c call", () => {
    expect(yaml).toContain("python3 -c");
    expect(yaml).toContain("deploy-meta.json");
    expect(yaml).toContain("TEST_REF");
    expect(yaml).toContain("TEST_SHA");
  });
});
