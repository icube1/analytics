import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { appendSample, parseNginxTimingLine, type CollectorConfig } from "../observability/collector/collect";

describe("observability collector", () => {
  it("parses nginx JSON timing lines", () => {
    const parsed = parseNginxTimingLine('{"time":"2026-09-02T19:00:00+00:00","status":200,"request_time":0.052}');
    expect(parsed?.status).toBe(200);
    expect(parsed?.requestTimeMs).toBeCloseTo(52, 0);
  });

  it("stores bounded samples", () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "obs-"));
    const config: CollectorConfig = {
      dataDir,
      nginxLogPath: "/missing",
      financeApiUrl: "http://127.0.0.1:9/metrics",
      nodeHealthUrl: "http://127.0.0.1:9/health",
      maxSamples: 2,
      maxJsonlBytes: 4096,
      windowSecs: 300,
    };
    const sample = {
      schemaVersion: 1 as const,
      collectedAt: "2026-09-02T19:00:00.000Z",
      host: { cpuPercent: 1, memoryRssMb: 1, disk: { usedPercent: 1, freeMb: 1 } },
      services: {},
    };
    appendSample(config, sample);
    appendSample(config, { ...sample, collectedAt: "2026-09-02T19:01:00.000Z" });
    appendSample(config, { ...sample, collectedAt: "2026-09-02T19:02:00.000Z" });
    const lines = fs.readFileSync(path.join(dataDir, "samples-2026-09-02.jsonl"), "utf-8").trim().split("\n");
    expect(lines).toHaveLength(2);
  });
});
