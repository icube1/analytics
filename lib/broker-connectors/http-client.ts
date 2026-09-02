import { BROKER_CONNECTOR_LIMITS } from "./limits";
import { BrokerConnectorErrorCode, brokerConnectorError, redactSecrets } from "./errors";

export interface InvestHttpClientOptions {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  appName?: string;
}

export interface InvestHttpRequest {
  path: string;
  body?: unknown;
}

export class InvestHttpClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly appName?: string;
  private lastRequestAt = 0;

  constructor(options: InvestHttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.appName = options.appName;
  }

  async post<T>(request: InvestHttpRequest): Promise<T> {
    await this.enforceRateLimit();

    let attempt = 0;
    while (true) {
      attempt += 1;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          BROKER_CONNECTOR_LIMITS.requestTimeoutMs,
        );

        const response = await this.fetchImpl(`${this.baseUrl}${request.path}`, {
          method: "POST",
          headers: this.buildHeaders(),
          body: JSON.stringify(request.body ?? {}),
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));

        if (response.status === 429 || response.status === 503 || response.status === 504) {
          if (attempt <= BROKER_CONNECTOR_LIMITS.maxRetries) {
            await this.sleep(BROKER_CONNECTOR_LIMITS.retryBaseDelayMs * attempt);
            continue;
          }
          throw brokerConnectorError(
            response.status === 429
              ? BrokerConnectorErrorCode.RATE_LIMITED
              : BrokerConnectorErrorCode.API_ERROR,
            `T-Invest API transient error (${response.status})`,
            { status: response.status },
          );
        }

        const text = await response.text();
        let payload: unknown = {};
        if (text.trim()) {
          try {
            payload = JSON.parse(text);
          } catch {
            throw brokerConnectorError(
              BrokerConnectorErrorCode.API_ERROR,
              redactSecrets("T-Invest API returned non-JSON response", this.token),
              { status: response.status },
            );
          }
        }

        if (!response.ok) {
          const message =
            typeof payload === "object" &&
            payload != null &&
            "message" in payload &&
            typeof (payload as { message?: unknown }).message === "string"
              ? (payload as { message: string }).message
              : `T-Invest API error (${response.status})`;

          const code =
            response.status === 401
              ? BrokerConnectorErrorCode.INVALID_TOKEN
              : BrokerConnectorErrorCode.API_ERROR;

          throw brokerConnectorError(
            code,
            redactSecrets(message, this.token),
            { status: response.status },
          );
        }

        return payload as T;
      } catch (error) {
        if (
          error instanceof Error &&
          error.name === "AbortError"
        ) {
          throw brokerConnectorError(
            BrokerConnectorErrorCode.REQUEST_TIMEOUT,
            `T-Invest API request timed out after ${BROKER_CONNECTOR_LIMITS.requestTimeoutMs}ms`,
          );
        }

        if (
          typeof error === "object" &&
          error != null &&
          "code" in error &&
          typeof (error as { code?: unknown }).code === "string"
        ) {
          throw error;
        }

        if (attempt <= BROKER_CONNECTOR_LIMITS.maxRetries) {
          await this.sleep(BROKER_CONNECTOR_LIMITS.retryBaseDelayMs * attempt);
          continue;
        }

        const message = error instanceof Error ? error.message : String(error);
        throw brokerConnectorError(
          BrokerConnectorErrorCode.NETWORK_ERROR,
          redactSecrets(message, this.token),
        );
      }
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.token}`,
    };
    if (this.appName) {
      headers["x-app-name"] = this.appName;
    }
    return headers;
  }

  private async enforceRateLimit(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestAt;
    const wait = BROKER_CONNECTOR_LIMITS.minRequestIntervalMs - elapsed;
    if (wait > 0) {
      await this.sleep(wait);
    }
    this.lastRequestAt = Date.now();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/** Prevent accidental token serialization in logs or JSON exports. */
export function sanitizeConnectorConfig<T extends { token?: string }>(
  config: T,
): Omit<T, "token"> & { token: "[runtime-only]" } {
  return { ...config, token: "[runtime-only]" };
}
