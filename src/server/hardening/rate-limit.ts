/**
 * In-process request rate limiting.
 *
 * Deliberately dependency-free and per-instance: the app runs as a single
 * container on the Free plan (1 GB RAM / 1 vCPU), so an in-memory sliding
 * window is enough to keep one caller from exhausting the box, and it costs
 * no extra memory than a bounded map of timestamps.
 *
 * Rules are keyed by route family, so an expensive upload and a cheap parse do
 * not share a budget. `/api/health` is never limited: the platform health probe
 * must always be able to answer.
 */

export interface RateLimitRule {
  /** Sliding window length in milliseconds. */
  windowMs: number;
  /** Maximum requests allowed inside the window. */
  max: number;
}

export type RateLimitRules = Record<string, RateLimitRule>;

export interface RateLimitOutcome {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the caller may retry; 0 when the request was allowed. */
  retryAfterSeconds: number;
}

const FALLBACK_RULE: RateLimitRule = { windowMs: 60_000, max: 120 };

/** Defaults sized so normal dashboard use never hits a limit. */
export const DEFAULT_RATE_LIMITS: RateLimitRules = {
  default: { windowMs: 60_000, max: 120 },
  parse: { windowMs: 60_000, max: 60 },
  // Remote verification is throttled upstream too; keep the API surface tight.
  verify: { windowMs: 60_000, max: 20 },
  bulkUpload: { windowMs: 3_600_000, max: 30 },
  export: { windowMs: 60_000, max: 30 },
};

export class RateLimiter {
  private readonly buckets = new Map<string, number[]>();

  constructor(
    private readonly rules: RateLimitRules = DEFAULT_RATE_LIMITS,
    private readonly now: () => number = () => Date.now(),
    private readonly maxKeys = 5_000,
  ) {}

  /** The effective rule for a family, falling back to the default. */
  rule(name: string): RateLimitRule {
    return this.rules[name] ?? this.rules.default ?? FALLBACK_RULE;
  }

  /** Snapshot of the configured rules, for /api/usage. */
  configured(): RateLimitRules {
    return { ...this.rules };
  }

  check(key: string, ruleName = 'default'): RateLimitOutcome {
    const rule = this.rule(ruleName);
    const now = this.now();
    const cutoff = now - rule.windowMs;

    let hits = this.buckets.get(key);
    if (!hits) {
      // Bounded memory: drop expired keys before growing the map.
      if (this.buckets.size >= this.maxKeys) this.prune(cutoff);
      hits = [];
      this.buckets.set(key, hits);
    }

    while (hits.length > 0 && hits[0] <= cutoff) hits.shift();

    if (hits.length >= rule.max) {
      const oldest = hits[0] ?? now;
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + rule.windowMs - now) / 1000));
      return { allowed: false, limit: rule.max, remaining: 0, retryAfterSeconds };
    }

    hits.push(now);
    return {
      allowed: true,
      limit: rule.max,
      remaining: Math.max(0, rule.max - hits.length),
      retryAfterSeconds: 0,
    };
  }

  /** Removes timestamps that have left their window, and empty keys. */
  prune(cutoff: number): void {
    for (const [key, hits] of this.buckets) {
      while (hits.length > 0 && hits[0] <= cutoff) hits.shift();
      if (hits.length === 0) this.buckets.delete(key);
    }
  }

  reset(): void {
    this.buckets.clear();
  }
}

/**
 * Which rule family a request belongs to. `null` means "never limited".
 * `path` is the request path, with or without the `/api` mount prefix.
 */
export function rateLimitRuleFor(method: string, path: string): string | null {
  const route = path.split('?')[0]?.replace(/^\/api(?=\/|$)/, '') || '/';

  if (route === '/health') return null;
  if (method === 'POST' && route === '/bulk') return 'bulkUpload';
  if (/\/export\.(csv|xlsx)$/.test(route)) return 'export';
  if (method === 'POST' && route === '/parse') return 'parse';
  if (method === 'POST' && route === '/verify') return 'verify';
  return 'default';
}

/**
 * Caller identity for the bucket key. Behind the platform proxy the first
 * `x-forwarded-for` hop is the client; otherwise fall back to the socket
 * address. Never used for authorisation, only for rate-limit bucketing.
 */
export function clientAddress(headers: Record<string, unknown>, fallback: string): string {
  const forwarded = headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof raw === 'string') {
    const first = raw.split(',')[0]?.trim();
    if (first) return first;
  }
  return fallback || 'unknown';
}
