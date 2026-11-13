/**
 * Free-plan usage guard.
 *
 * The hosted app runs with 1 GB RAM and 1 vCPU, so bulk processing is capped
 * per UTC day as well as per file. The guard reports what is left before a
 * file is parsed and only charges usage once a run has actually been stored:
 * a rejected or failed upload never consumes allowance.
 */

export interface UsageLimits {
  maxRowsPerDay: number;
  maxRunsPerDay: number;
}

export interface UsageSnapshot {
  /** UTC day the counters belong to, `YYYY-MM-DD`. */
  day: string;
  limits: UsageLimits;
  rowsUsed: number;
  rowsRemaining: number;
  runsUsed: number;
  runsRemaining: number;
  /** When the counters roll over (next UTC midnight). */
  resetsAt: string;
}

export class UsageLimitError extends Error {
  readonly status = 429;
  readonly retryAfterSeconds: number;
  readonly details: UsageSnapshot;

  constructor(message: string, details: UsageSnapshot) {
    super(message);
    this.name = 'UsageLimitError';
    this.details = details;
    const untilReset = Date.parse(details.resetsAt) - Date.now();
    this.retryAfterSeconds = Math.max(1, Math.ceil(untilReset / 1000));
  }
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function nextUtcMidnight(date: Date): string {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1),
  ).toISOString();
}

function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

export class UsageGuard {
  private day: string;
  private rowsUsed = 0;
  private runsUsed = 0;

  constructor(
    private readonly limits: UsageLimits,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.day = dayKey(this.now());
  }

  private rollover(): void {
    const current = dayKey(this.now());
    if (current === this.day) return;
    this.day = current;
    this.rowsUsed = 0;
    this.runsUsed = 0;
  }

  status(): UsageSnapshot {
    this.rollover();
    return {
      day: this.day,
      limits: { ...this.limits },
      rowsUsed: this.rowsUsed,
      rowsRemaining: Math.max(0, this.limits.maxRowsPerDay - this.rowsUsed),
      runsUsed: this.runsUsed,
      runsRemaining: Math.max(0, this.limits.maxRunsPerDay - this.runsUsed),
      resetsAt: nextUtcMidnight(this.now()),
    };
  }

  /**
   * Throws a 429-ready error when this file would exceed the daily allowance.
   * The message states the limit, what is left and when it resets.
   */
  assertCanProcess(rows: number): void {
    this.rollover();
    const snapshot = this.status();

    if (this.runsUsed >= this.limits.maxRunsPerDay) {
      throw new UsageLimitError(
        `The Free-plan allowance of ${formatNumber(this.limits.maxRunsPerDay)} bulk runs per day is used up. ` +
          `It resets at ${snapshot.resetsAt}. Upload the remaining files after the reset.`,
        snapshot,
      );
    }

    if (rows > snapshot.rowsRemaining) {
      throw new UsageLimitError(
        `This file has ${formatNumber(rows)} rows, but only ${formatNumber(snapshot.rowsRemaining)} of ` +
          `today's ${formatNumber(this.limits.maxRowsPerDay)}-row Free-plan allowance is left. ` +
          `Split the file, or retry after the allowance resets at ${snapshot.resetsAt}.`,
        snapshot,
      );
    }
  }

  /** Charges a successful run against today's allowance. */
  commit(rows: number): void {
    this.rollover();
    this.rowsUsed += Math.max(0, rows);
    this.runsUsed += 1;
  }
}
