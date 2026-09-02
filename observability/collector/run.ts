#!/usr/bin/env tsx
import { appendSample, collectSnapshot, defaultCollectorConfig } from "./collect";

async function main(): Promise<void> {
  const config = defaultCollectorConfig();
  const snapshot = await collectSnapshot(config);
  const paths = appendSample(config, snapshot);
  process.stdout.write(
    `${JSON.stringify({ ok: true, collectedAt: snapshot.collectedAt, ...paths })}\n`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "collector failed";
  process.stderr.write(`${JSON.stringify({ ok: false, error: message })}\n`);
  process.exitCode = 1;
});
