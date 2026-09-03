import { assessBrokerImportCompleteness } from "@/lib/broker-adapters";
import type {
  BrokerImportCoverage,
  BrokerImportReconciliation,
  BrokerImportWarning,
} from "@/lib/broker-adapters";

const completeCoverage: BrokerImportCoverage = {
  meta: true,
  rating: true,
  securities: true,
  cash: true,
  cashFlows: true,
  trades: true,
  securitiesCount: 1,
  cashCount: 1,
  cashFlowCount: 1,
  tradeCount: 1,
};

const matchedReconciliation: BrokerImportReconciliation = {
  assetsEndReported: 1600,
  assetsEndComputed: 1600,
  securitiesEndReported: 1500,
  securitiesEndComputed: 1500,
  cashEndReported: 100,
  cashEndComputed: 100,
  assetsDelta: 0,
  securitiesDelta: 0,
  cashDelta: 0,
  withinTolerance: true,
};

describe("broker import completeness", () => {
  it("treats a matched empty-capable snapshot as complete", () => {
    const emptyCoverage: BrokerImportCoverage = {
      ...completeCoverage,
      securities: false,
      trades: false,
      cashFlows: false,
      securitiesCount: 0,
      tradeCount: 0,
      cashFlowCount: 0,
      rating: false,
    };
    expect(
      assessBrokerImportCompleteness({
        coverage: emptyCoverage,
        reconciliation: {
          ...matchedReconciliation,
          assetsEndReported: null,
          assetsDelta: null,
          securitiesEndReported: null,
          securitiesDelta: null,
          cashEndReported: null,
          cashDelta: null,
          assetsEndComputed: 0,
          securitiesEndComputed: 0,
          cashEndComputed: 0,
        },
        warnings: [],
      }).complete,
    ).toBe(true);
  });

  it("requires confirmation when totals disagree", () => {
    const assessment = assessBrokerImportCompleteness({
      coverage: completeCoverage,
      reconciliation: {
        ...matchedReconciliation,
        withinTolerance: false,
        assetsDelta: 40,
      },
      warnings: [],
    });
    expect(assessment.complete).toBe(false);
    expect(assessment.gaps.map((gap) => gap.code)).toContain(
      "RECONCILIATION_MISMATCH",
    );
  });

  it("does not treat sanitization notices as gaps", () => {
    const warnings: BrokerImportWarning[] = [
      {
        code: "SANITIZED_INPUT",
        message: "Fixture sanitization was applied before parsing",
      },
    ];
    expect(
      assessBrokerImportCompleteness({
        coverage: completeCoverage,
        reconciliation: matchedReconciliation,
        warnings,
      }).complete,
    ).toBe(true);
  });

  it("flags dropped rows instead of coercing them to zero", () => {
    const assessment = assessBrokerImportCompleteness({
      coverage: completeCoverage,
      reconciliation: matchedReconciliation,
      warnings: [
        {
          code: "INVALID_NUMBER",
          message: "Malformed quantity",
          path: "securities[0].quantity_end",
        },
        { code: "SKIPPED_ROW", message: "Row skipped" },
      ],
    });
    expect(assessment.complete).toBe(false);
    expect(assessment.gaps.map((gap) => gap.code)).toContain("DROPPED_ROWS");
  });
});
