import { sanitizeBrokerFixture } from "../broker-fixture-sanitize";
import { BrokerImportErrorCode, brokerImportError } from "./errors";
import { assertContentWithinLimits } from "./limits";
import { ledgerToBrokerReport } from "./normalize";
import { BROKER_ADAPTERS } from "./registry";
import type {
  BrokerAdapter,
  BrokerDetectionResult,
  BrokerImportInput,
  BrokerImportResult,
} from "./types";

function prepareContent(input: BrokerImportInput): {
  content: string;
  sanitized: boolean;
} {
  if (!input.sanitizeFixture) {
    return { content: input.content, sanitized: false };
  }
  return {
    content: sanitizeBrokerFixture(input.content),
    sanitized: true,
  };
}

export function detectBrokerAdapters(
  input: BrokerImportInput,
): BrokerDetectionResult[] {
  const { content } = prepareContent(input);
  const prepared = { ...input, content };

  return BROKER_ADAPTERS.map((adapter) => adapter.detect(prepared))
    .filter((result): result is BrokerDetectionResult => result != null)
    .sort((a, b) => b.confidence - a.confidence);
}

function chooseAdapter(
  input: BrokerImportInput,
  detection: BrokerDetectionResult[],
): BrokerAdapter | null {
  if (detection.length === 0) return null;

  const extension = input.fileName
    ?.toLowerCase()
    .match(/(\.[^.]+)$/)?.[1];

  const preferred = detection.find((item) => {
    const adapter = BROKER_ADAPTERS.find((entry) => entry.id === item.adapterId);
    if (!adapter || !extension) return false;
    return adapter.supportedExtensions.includes(extension);
  });

  const chosen = preferred ?? detection[0];
  return BROKER_ADAPTERS.find((adapter) => adapter.id === chosen.adapterId) ?? null;
}

function isRecognized(ledger: ReturnType<BrokerAdapter["parse"]>["ledger"]): boolean {
  return ledger.securities.length > 0 || ledger.assetsEnd > 0;
}

export function importBrokerReport(
  input: BrokerImportInput,
): BrokerImportResult {
  const detectedAt = new Date().toISOString();
  const limit = assertContentWithinLimits(input.content);

  if (!input.content.trim()) {
    return {
      ok: false,
      report: null,
      ledger: null,
      provenance: {
        adapterId: "sber-html-v1",
        adapterVersion: "0",
        adapterLabel: "unresolved",
        fileName: input.fileName ?? null,
        mimeType: input.mimeType ?? null,
        contentBytes: 0,
        sanitized: false,
        detectedAt,
      },
      coverage: null,
      warnings: [],
      reconciliation: null,
      errors: [
        brokerImportError(
          BrokerImportErrorCode.CONTENT_EMPTY,
          "Broker import content is empty",
        ),
      ],
      detection: [],
    };
  }

  if (!limit.ok) {
    return {
      ok: false,
      report: null,
      ledger: null,
      provenance: {
        adapterId: "sber-html-v1",
        adapterVersion: "0",
        adapterLabel: "unresolved",
        fileName: input.fileName ?? null,
        mimeType: input.mimeType ?? null,
        contentBytes: limit.bytes,
        sanitized: false,
        detectedAt,
      },
      coverage: null,
      warnings: [],
      reconciliation: null,
      errors: [
        brokerImportError(
          BrokerImportErrorCode.FILE_TOO_LARGE,
          `Broker import exceeds ${limit.bytes} bytes`,
        ),
      ],
      detection: [],
    };
  }

  const { content, sanitized } = prepareContent(input);
  const preparedInput = { ...input, content };
  const detection = detectBrokerAdapters(preparedInput);
  const adapter = chooseAdapter(preparedInput, detection);

  if (!adapter) {
    return {
      ok: false,
      report: null,
      ledger: null,
      provenance: {
        adapterId: "sber-html-v1",
        adapterVersion: "0",
        adapterLabel: "unresolved",
        fileName: input.fileName ?? null,
        mimeType: input.mimeType ?? null,
        contentBytes: limit.bytes,
        sanitized,
        detectedAt,
      },
      coverage: null,
      warnings: [],
      reconciliation: null,
      errors: [
        brokerImportError(
          BrokerImportErrorCode.NO_ADAPTER_MATCH,
          "No broker adapter matched the uploaded file",
        ),
      ],
      detection,
    };
  }

  try {
    const parsed = adapter.parse(preparedInput);
    const warnings = [...parsed.warnings];
    if (sanitized) {
      warnings.push({
        code: "SANITIZED_INPUT",
        message: "Fixture sanitization was applied before parsing",
      });
    }

    const report = ledgerToBrokerReport(parsed.ledger);
    const ok = isRecognized(parsed.ledger);

    return {
      ok,
      report: ok ? report : null,
      ledger: parsed.ledger,
      provenance: {
        adapterId: adapter.id,
        adapterVersion: adapter.version,
        adapterLabel: adapter.label,
        fileName: input.fileName ?? null,
        mimeType: input.mimeType ?? null,
        contentBytes: limit.bytes,
        sanitized,
        detectedAt,
      },
      coverage: parsed.coverage,
      warnings,
      reconciliation: parsed.reconciliation,
      errors: ok
        ? []
        : [
            brokerImportError(
              BrokerImportErrorCode.RECOGNITION_FAILED,
              "Broker file was parsed but contains no recognizable portfolio data",
              { adapterId: adapter.id },
            ),
          ],
      detection,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const rowLimit = message.startsWith("ROW_LIMIT_EXCEEDED:");
    return {
      ok: false,
      report: null,
      ledger: null,
      provenance: {
        adapterId: adapter.id,
        adapterVersion: adapter.version,
        adapterLabel: adapter.label,
        fileName: input.fileName ?? null,
        mimeType: input.mimeType ?? null,
        contentBytes: limit.bytes,
        sanitized,
        detectedAt,
      },
      coverage: null,
      warnings: [],
      reconciliation: null,
      errors: [
        brokerImportError(
          rowLimit
            ? BrokerImportErrorCode.ROW_LIMIT_EXCEEDED
            : BrokerImportErrorCode.PARSE_FAILED,
          message,
          { adapterId: adapter.id },
        ),
      ],
      detection,
    };
  }
}
