/**
 * Single-flight gate for bulk uploads.
 *
 * Parsing a full file is the most memory-hungry thing this app does, and the
 * Free plan gives one vCPU. Allowing one upload at a time keeps peak memory
 * predictable instead of letting concurrent files multiply it.
 */

export class UploadGate {
  private busy = false;

  /** True while a request holds the gate. */
  get isBusy(): boolean {
    return this.busy;
  }

  /**
   * Returns a release function, or null when another upload is in flight.
   * The returned function is idempotent, so `finally { release() }` is safe.
   */
  tryAcquire(): (() => void) | null {
    if (this.busy) return null;
    this.busy = true;

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.busy = false;
    };
  }
}
