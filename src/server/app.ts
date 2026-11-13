import path from 'node:path';
import express from 'express';
import type { DatabaseSync } from 'node:sqlite';
import {
  ENGINE_NAME,
  ENGINE_VERSION,
  LLM_CONFIGURED,
  PHASE,
  SERVICE_NAME,
  SERVICE_VERSION,
  SUPABASE_CONFIGURED,
} from './config.js';
import { getSchemaSnapshot } from './db/index.js';
import { COUNTRY_FORMATS, COUNTRIES, REGIONS, lookupCountry } from './engine/countries.js';
import { MAX_LINE_LENGTH, PARSER_VERSION, parseAddress } from './engine/parse.js';
import { normalizeKey } from './engine/text.js';
import type {
  ApiError,
  DataSourceInfo,
  HealthResponse,
  ParseResponse,
  RoadmapPhase,
  SystemInfoResponse,
} from '../shared/types.js';

const ADDRESS_LINE_FIELDS = ['addressLine1'] as const;

const DATA_SOURCES: DataSourceInfo[] = [
  {
    name: 'GeoNames postal code datasets',
    role: 'Bulk and local postcode ↔ place matching',
    access: 'Bundled dataset, no runtime API key',
    attribution: 'GeoNames, licensed CC BY 4.0 — attribution shown in the UI',
  },
  {
    name: 'OpenStreetMap Nominatim',
    role: 'Targeted verification evidence for individual lookups',
    access: 'Throttled to ≤1 request/second, identifying User-Agent, no bulk queries',
    attribution: '© OpenStreetMap contributors, ODbL',
  },
  {
    name: 'Photon (komoot)',
    role: 'Targeted search evidence and autocomplete',
    access: 'Public endpoint, fair use, cached responses',
    attribution: '© OpenStreetMap contributors, ODbL',
  },
  {
    name: 'ISO 3166-1 / CLDR',
    role: 'Country and subdivision reference data',
    access: 'Bundled static data',
    attribution: 'ISO 3166, Unicode CLDR',
  },
];

const ROADMAP: RoadmapPhase[] = [
  {
    phase: 0,
    title: 'Foundation, schema and deployment',
    summary: 'Single-line address model, health endpoint, schema, guard test, live deployment.',
    status: 'done',
  },
  {
    phase: 1,
    title: 'Parsing and standardization engine',
    summary: 'Tokenizer, abbreviation dictionary, per-country templates and a single-address API.',
    status: 'in_progress',
  },
  {
    phase: 2,
    title: 'Missing and misplaced component detection',
    summary: 'Diagnostics for absent, contradictory and misplaced components with confidence scoring.',
    status: 'planned',
  },
  {
    phase: 3,
    title: 'Evidence-based verification',
    summary: 'GeoNames matching plus throttled, cached public lookups with evidence URLs.',
    status: 'planned',
  },
  {
    phase: 4,
    title: 'Bulk CSV and Excel processing',
    summary: 'Upload, original row preservation and original-order export.',
    status: 'planned',
  },
  {
    phase: 5,
    title: 'Dashboard and processing history',
    summary: 'Run history, per-row results, filters and evidence review.',
    status: 'planned',
  },
  {
    phase: 6,
    title: 'Hardening and scale checks',
    summary: 'Rate limits, upload caps, fixtures per country and Free-plan performance checks.',
    status: 'planned',
  },
];

const GUARANTEES = [
  'Address Line 1 is the only address-line field in the database, API, UI and exports.',
  'Every original input row and its original order are preserved unchanged.',
  'Missing information is reported, never invented; evidence is only stored with a source URL.',
  'No paid API, subscription or mandatory key is required to run the system.',
];

export function createApp(db: DatabaseSync): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    const snapshot = getSchemaSnapshot(db);

    const body: HealthResponse = {
      status: 'ok',
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      phase: PHASE,
      engineVersion: ENGINE_VERSION,
      time: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      addressModel: {
        addressLineFields: [...ADDRESS_LINE_FIELDS],
        line2Supported: false,
        enforcedBy: 'schema + API contract + repository guard test',
      },
      storage: {
        backend: 'sqlite',
        ready: snapshot.tables.length > 0,
        schemaVersion: snapshot.schemaVersion,
        tables: snapshot.tables,
        durable: SUPABASE_CONFIGURED,
      },
      integrations: {
        supabase: {
          configured: SUPABASE_CONFIGURED,
          purpose: 'Durable processing history',
          required: false,
        },
        llm: {
          configured: LLM_CONFIGURED,
          purpose: 'Optional assist on top of the deterministic engine',
          required: false,
        },
      },
    };

    res.json(body);
  });

  app.post('/api/parse', (req, res) => {
    const body = (req.body ?? {}) as { line?: unknown; countryHint?: unknown };
    const line = typeof body.line === 'string' ? body.line.trim() : '';

    if (!line) {
      const error: ApiError = { ok: false, error: 'Provide the address line to parse.' };
      res.status(400).json(error);
      return;
    }

    if (line.length > MAX_LINE_LENGTH) {
      const error: ApiError = {
        ok: false,
        error: `The address line must be ${MAX_LINE_LENGTH} characters or fewer.`,
      };
      res.status(400).json(error);
      return;
    }

    let countryHint: string | null = null;
    if (body.countryHint !== undefined && body.countryHint !== null && body.countryHint !== '') {
      if (typeof body.countryHint !== 'string') {
        const error: ApiError = { ok: false, error: 'countryHint must be a country name or ISO code.' };
        res.status(400).json(error);
        return;
      }
      countryHint = body.countryHint.trim();
      if (!lookupCountry(normalizeKey(countryHint))) {
        const error: ApiError = {
          ok: false,
          error: `The country hint "${countryHint}" is not a recognised country name or ISO code.`,
        };
        res.status(400).json(error);
        return;
      }
    }

    const payload: ParseResponse = { ok: true, result: parseAddress(line, { countryHint }) };
    res.json(payload);
  });

  app.get('/api/engine/capabilities', (_req, res) => {
    res.json({
      ok: true,
      parserVersion: PARSER_VERSION,
      addressLineFields: [...ADDRESS_LINE_FIELDS],
      countries: COUNTRIES.length,
      postcodeFormats: Object.keys(COUNTRY_FORMATS).length,
      regionSets: Object.keys(REGIONS).map((code) => ({
        countryCode: code,
        regions: REGIONS[code].length,
      })),
      policy:
        'Deterministic extraction only: a component is returned only when the supplied text supports it, otherwise it stays empty and a note explains why.',
    });
  });

  app.get('/api/system', (_req, res) => {
    const body: SystemInfoResponse = {
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      phase: PHASE,
      engine: {
        name: ENGINE_NAME,
        version: ENGINE_VERSION,
        strategy:
          'Deterministic pipeline: normalization, country templates, gazetteer matching and rule-based diagnostics. No paid model is required.',
        llmRequired: false,
      },
      addressModel: {
        addressLineFields: [...ADDRESS_LINE_FIELDS],
        line2Supported: false,
        enforcement: [
          'SQLite and Supabase schemas contain address_line1 only',
          'API responses expose addressLine1 only',
          'Automated guard test scans the repository for any additional address line',
        ],
      },
      dataSources: DATA_SOURCES,
      roadmap: ROADMAP,
      guarantees: GUARANTEES,
    };

    res.json(body);
  });

  const clientDir = path.join(process.cwd(), 'dist', 'client');
  app.use(express.static(clientDir, { index: false, maxAge: '1h' }));

  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) {
      next();
      return;
    }
    res.sendFile(path.join(clientDir, 'index.html'));
  });

  app.use((req, res) => {
    res.status(404).json({ error: 'not_found', path: req.path });
  });

  return app;
}
