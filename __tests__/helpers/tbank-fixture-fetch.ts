import fs from "node:fs";
import path from "node:path";
import { TBANK_INVEST_REST_PATHS } from "@/lib/broker-connectors/tbank/endpoints";

const FIXTURE_DIR = path.join(
  process.cwd(),
  "__tests__",
  "fixtures",
  "tbank-invest-api",
);

function loadFixture(name: string): unknown {
  const file = path.join(FIXTURE_DIR, name);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * Deterministic fetch mock that serves contract fixtures for T-Invest REST paths.
 * Never logs or inspects the Authorization header value.
 */
export function createTbankFixtureFetch(): typeof fetch {
  return async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const body = init?.body ? JSON.parse(String(init.body)) : {};

    let payload: unknown = {};
    let status = 200;

    if (url.endsWith(TBANK_INVEST_REST_PATHS.getAccounts)) {
      payload = loadFixture("get-accounts-response.json");
    } else if (url.endsWith(TBANK_INVEST_REST_PATHS.getPortfolio)) {
      payload = loadFixture("get-portfolio-response.json");
    } else if (url.endsWith(TBANK_INVEST_REST_PATHS.getOperationsByCursor)) {
      payload = loadFixture("get-operations-by-cursor-page1.json");
    } else if (url.endsWith(TBANK_INVEST_REST_PATHS.getBrokerReport)) {
      if (body.generateBrokerReportRequest) {
        payload = loadFixture("generate-broker-report-response.json");
      } else {
        payload = loadFixture("get-broker-report-page1.json");
      }
    } else {
      status = 404;
      payload = { message: "fixture not found" };
    }

    return new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
}
