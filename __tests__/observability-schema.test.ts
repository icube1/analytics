import fs from "node:fs";
import path from "node:path";

describe("observability schema", () => {
  it("documents required top-level fields", () => {
    const schema = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "observability/schema/metrics-v1.schema.json"), "utf-8"),
    ) as { required: string[] };
    expect(schema.required).toEqual(expect.arrayContaining(["schemaVersion", "collectedAt", "host", "services"]));
  });
});
