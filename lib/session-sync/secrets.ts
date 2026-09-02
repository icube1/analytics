const SECRET_FIELD_PATTERN =
  /^(password|bearerToken|csrfToken|sessionToken|token|authorization)$/i;

export function isSecretFieldName(key: string): boolean {
  return SECRET_FIELD_PATTERN.test(key);
}

export function redactSecrets<T>(value: T): T {
  return redactValue(value, new WeakSet()) as T;
}

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value == null || typeof value !== "object") return value;
  if (seen.has(value as object)) return "[Circular]";

  if (Array.isArray(value)) {
    seen.add(value);
    return value.map((item) => redactValue(item, seen));
  }

  seen.add(value as object);
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSecretFieldName(key) ? "[REDACTED]" : redactValue(child, seen);
  }
  return out;
}

export function assertNoSecretsInJson(json: string): void {
  const lower = json.toLowerCase();
  const forbidden = [
    '"password":',
    '"bearertoken":',
    '"csrf_token":',
    '"csrftoken":',
    '"sessiontoken":',
    '"authorization":',
  ];
  for (const needle of forbidden) {
    if (lower.includes(needle)) {
      throw new Error(`serialized payload must not include secret field: ${needle}`);
    }
  }
}

export function safeSerializeForPersistence<T>(value: T): string {
  const redacted = redactSecrets(value);
  const json = JSON.stringify(redacted);
  assertNoSecretsInJson(json);
  return json;
}
