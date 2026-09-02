import {
  createProductEvent,
  isProductEvent,
  normalizeProductEvents,
  PRODUCT_EVENT_SCHEMA_VERSION,
} from "@/lib/product-events/schema";
import {
  configureTelemetrySink,
  emitProductEvent,
  getTelemetrySinkConfig,
  resetTelemetrySink,
} from "@/lib/product-events/telemetry";

describe("product events schema", () => {
  it("creates versioned events without financial fields", () => {
    const event = createProductEvent("milestone_completed", {
      milestoneId: "operational-buffer",
    });
    expect(event.schemaVersion).toBe(PRODUCT_EVENT_SCHEMA_VERSION);
    expect(event.milestoneId).toBe("operational-buffer");
    expect(event.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Object.keys(event)).not.toContain("amount");
    expect(Object.keys(event)).not.toContain("balance");
  });

  it("validates and normalizes event arrays", () => {
    const valid = createProductEvent("journey_started");
    const events = normalizeProductEvents([
      valid,
      { schemaVersion: 99, kind: "bad", occurredAt: "x" },
      null,
    ]);
    expect(events).toHaveLength(1);
    expect(isProductEvent(valid)).toBe(true);
  });
});

describe("product events telemetry", () => {
  afterEach(() => {
    resetTelemetrySink();
  });

  it("keeps telemetry sink disabled by default", () => {
    expect(getTelemetrySinkConfig().enabled).toBe(false);
  });

  it("drops events when sink is disabled", async () => {
    const received: unknown[] = [];
    configureTelemetrySink({ enabled: false }, (event) => {
      received.push(event);
    });
    await emitProductEvent(createProductEvent("journey_started"));
    expect(received).toHaveLength(0);
  });

  it("forwards events only when explicitly enabled", async () => {
    const received: unknown[] = [];
    configureTelemetrySink({ enabled: true }, (event) => {
      received.push(event);
    });
    await emitProductEvent(
      createProductEvent("baby_step_completed", {
        milestoneId: "cash-flow-control",
        babyStepId: "surplus-positive",
      }),
    );
    expect(received).toHaveLength(1);
    expect((received[0] as { milestoneId?: string }).milestoneId).toBe(
      "cash-flow-control",
    );
  });
});
