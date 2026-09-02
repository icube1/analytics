type LogLevel = "debug" | "info" | "warn" | "error";
type LogFields = Record<string, string | number | boolean | null | undefined>;

function serializeLog(level: LogLevel, message: string, fields: LogFields = {}): string {
  return `${JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg: message,
    service: process.env.ANALYTICS_SERVICE_NAME ?? "analytics-node",
    pid: process.pid,
    ...fields,
  })}\n`;
}

export function logInfo(message: string, fields?: LogFields): void {
  process.stdout.write(serializeLog("info", message, fields));
}

export function logWarn(message: string, fields?: LogFields): void {
  process.stdout.write(serializeLog("warn", message, fields));
}

export function logError(message: string, fields?: LogFields): void {
  process.stderr.write(serializeLog("error", message, fields));
}
