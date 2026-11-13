import path from 'node:path';

export const SERVICE_NAME = 'address-intelligence';
export const SERVICE_VERSION = '0.1.0';
export const PHASE = 6;
export const ENGINE_NAME = 'deterministic-address-engine';
export const ENGINE_VERSION = '0.4.0-deterministic';

export const HOST = '0.0.0.0';
export const PORT = Number(process.env.PORT ?? 3000);

export const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
export const DB_FILE = path.join(DATA_DIR, 'address.db');

/** Supabase is used for durable processing history once connected. */
export const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
export const SUPABASE_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

/** Optional future LLM assist. Never required, never on the critical path. */
export const LLM_CONFIGURED = Boolean(process.env.LLM_PROVIDER_URL && process.env.LLM_API_KEY);

/* ------------------------------------------------ Phase 6: hardening caps -- */

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/**
 * Free-plan daily allowances, sized for 1 GB RAM / 1 vCPU. Overridable so a
 * deployment can tighten or relax them without a code change.
 */
export const DAILY_ROW_BUDGET = positiveInt(process.env.BULK_DAILY_ROW_BUDGET, 25_000);
export const DAILY_RUN_BUDGET = positiveInt(process.env.BULK_DAILY_RUN_BUDGET, 50);
