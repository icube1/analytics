import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("platform-stage finance-api startup", () => {
  it("embeds sqlx migrations instead of reading CARGO_MANIFEST_DIR at runtime", () => {
    const src = readFileSync(
      join(__dirname, "../crates/finance-api/src/db/pool.rs"),
      "utf8",
    );

    expect(src).toContain('sqlx::migrate!("./migrations")');
    expect(src).not.toContain('env!("CARGO_MANIFEST_DIR")');
  });

  it("dumps finance-api journal on smoke health timeout", () => {
    const src = readFileSync(
      join(__dirname, "../scripts/smoke-platform-release.sh"),
      "utf8",
    );

    expect(src).toContain('journalctl -u "$SERVICE_NAME" -n 80 --no-pager');
  });
});
