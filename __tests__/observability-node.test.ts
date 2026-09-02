import {
  buildNodeHealthSnapshot,
  recordBrokerImportOutcome,
  recordNodeHttpRequest,
  resetNodeRuntimeMetricsForTests,
} from "@/lib/observability/runtime-metrics";

describe("node observability runtime metrics", () => {
  beforeEach(() => resetNodeRuntimeMetricsForTests());

  it("tracks counters without financial payloads", () => {
    recordNodeHttpRequest(200, 12);
    recordBrokerImportOutcome(true);
    const snapshot = buildNodeHealthSnapshot();
    expect(snapshot.http.requests).toBe(1);
    expect(snapshot.imports?.brokerSuccess).toBe(1);
    expect(JSON.stringify(snapshot)).not.toMatch(/portfolio|uuid/i);
  });
});
