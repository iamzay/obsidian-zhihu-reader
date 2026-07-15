const COOKIE_ATTRIBUTES = new Set([
  "domain",
  "path",
  "expires",
  "max-age",
  "httponly",
  "secure",
  "samesite",
]);

type ResponseHeaderValue = string | readonly string[];

export class CookieJar {
  private readonly cookies = new Map<string, string>();

  constructor(initial: Readonly<Record<string, string>> = {}) {
    for (const [name, value] of Object.entries(initial)) {
      if (name.length > 0 && value.length > 0) {
        this.cookies.set(name, value);
      }
    }
  }

  get(name: string): string | undefined {
    return this.cookies.get(name);
  }

  set(name: string, value: string): void {
    if (name.length === 0 || COOKIE_ATTRIBUTES.has(name.toLowerCase())) {
      return;
    }
    if (value.length === 0) {
      this.cookies.delete(name);
    } else {
      this.cookies.set(name, value);
    }
  }

  updateFromHeaders(
    headers: Readonly<Record<string, ResponseHeaderValue>>,
  ): void {
    const raw = Object.entries(headers).find(
      ([name]) => name.toLowerCase() === "set-cookie",
    )?.[1];
    if (raw === undefined) {
      return;
    }
    const headerValues = typeof raw === "string" ? [raw] : raw;
    for (const headerValue of headerValues) {
      for (const cookie of splitSetCookieHeader(headerValue)) {
        this.updateFromCookieAssignments(cookie);
      }
    }
  }

  updateFromCookieAssignments(raw: string): void {
    for (const item of raw.split(";")) {
      const separator = item.indexOf("=");
      if (separator <= 0) {
        continue;
      }
      const name = item.slice(0, separator).trim();
      const value = item.slice(separator + 1).trim();
      this.set(name, value);
    }
  }

  toHeader(): string | undefined {
    if (this.cookies.size === 0) {
      return undefined;
    }
    return [...this.cookies.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  toRecord(): Readonly<Record<string, string>> {
    return Object.fromEntries(this.cookies);
  }
}

function splitSetCookieHeader(raw: string): string[] {
  return raw
    .split(/\r?\n|,(?=\s*[^;,=\s]+=[^;,]*)/u)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}
