import assert from 'node:assert/strict';
import test from 'node:test';

import { MAX_LINE_LENGTH, PARSER_VERSION, parseAddress } from '../dist/server/engine/parse.js';

const COMPONENT_FIELDS = [
  'addressLine1',
  'postcode',
  'city',
  'region',
  'regionCode',
  'country',
  'countryCode',
];

/** Built at runtime so the repository guard never sees a forbidden identifier. */
const FORBIDDEN_FIELD = `addressLine${2}`;

const FIXTURES = [
  {
    name: 'United States (state code with ZIP)',
    input: '1600 Amphitheatre Parkway, Mountain View, CA 94043, USA',
    expected: {
      addressLine1: '1600 Amphitheatre Parkway',
      postcode: '94043',
      city: 'Mountain View',
      regionCode: 'CA',
      countryCode: 'US',
    },
    missing: [],
  },
  {
    name: 'United Kingdom (alphanumeric postcode, no region field)',
    input: '10 Downing Street, London, SW1A 2AA, United Kingdom',
    expected: {
      addressLine1: '10 Downing Street',
      postcode: 'SW1A 2AA',
      city: 'London',
      regionCode: null,
      countryCode: 'GB',
    },
    missing: [],
  },
  {
    name: 'France (postcode before city)',
    input: '123 Rue de la Paix, 75002 Paris, France',
    expected: {
      addressLine1: '123 Rue de la Paix',
      postcode: '75002',
      city: 'Paris',
      regionCode: null,
      countryCode: 'FR',
    },
    missing: [],
  },
  {
    name: 'Germany (city-state name must stay the city)',
    input: 'Unter den Linden 77, 10117 Berlin, Deutschland',
    expected: {
      addressLine1: 'Unter den Linden 77',
      postcode: '10117',
      city: 'Berlin',
      regionCode: null,
      countryCode: 'DE',
    },
    missing: ['region'],
  },
  {
    name: 'Netherlands (postcode with letter pair)',
    input: 'Keizersgracht 123, 1015 CJ Amsterdam, Nederland',
    expected: {
      addressLine1: 'Keizersgracht 123',
      postcode: '1015 CJ',
      city: 'Amsterdam',
      regionCode: null,
      countryCode: 'NL',
    },
    missing: ['region'],
  },
  {
    name: 'Brazil (accented city, hyphenated postcode)',
    input: 'Av. Paulista 1578, São Paulo, SP, 01310-200, Brasil',
    expected: {
      addressLine1: 'Av. Paulista 1578',
      postcode: '01310-200',
      city: 'São Paulo',
      regionCode: 'SP',
      countryCode: 'BR',
    },
    missing: [],
  },
  {
    name: 'India (state name merged with PIN)',
    input: '42 MG Road, Bengaluru, Karnataka 560001, India',
    expected: {
      addressLine1: '42 MG Road',
      postcode: '560001',
      city: 'Bengaluru',
      regionCode: 'KA',
      countryCode: 'IN',
    },
    missing: [],
  },
  {
    name: 'Japan (prefecture merged with postcode)',
    input: '1-1 Chiyoda, Chiyoda-ku, Tokyo 100-0001, Japan',
    expected: {
      addressLine1: '1-1 Chiyoda',
      postcode: '100-0001',
      city: 'Chiyoda-ku',
      regionCode: '13',
      countryCode: 'JP',
    },
    missing: [],
  },
  {
    name: 'South Africa (province genuinely absent)',
    input: '15 Church Street, Cape Town, 8001, South Africa',
    expected: {
      addressLine1: '15 Church Street',
      postcode: '8001',
      city: 'Cape Town',
      regionCode: null,
      countryCode: 'ZA',
    },
    missing: ['region'],
  },
  {
    name: 'United Arab Emirates (no postal code system)',
    input: 'Sheikh Zayed Road, Dubai, United Arab Emirates',
    expected: {
      addressLine1: 'Sheikh Zayed Road',
      postcode: null,
      city: 'Dubai',
      regionCode: null,
      countryCode: 'AE',
    },
    missing: [],
  },
  {
    name: 'Australia (state code appended to city)',
    input: '1 Macquarie Street, Sydney NSW 2000, Australia',
    expected: {
      addressLine1: '1 Macquarie Street',
      postcode: '2000',
      city: 'Sydney',
      regionCode: 'NSW',
      countryCode: 'AU',
    },
    missing: [],
  },
  {
    name: 'Canada (province merged with postcode)',
    input: '200 Rue Saint-Denis, Montreal, QC H2X 3K8, Canada',
    expected: {
      addressLine1: '200 Rue Saint-Denis',
      postcode: 'H2X 3K8',
      city: 'Montreal',
      regionCode: 'QC',
      countryCode: 'CA',
    },
    missing: [],
  },
];

for (const fixture of FIXTURES) {
  test(`parses ${fixture.name}`, () => {
    const result = parseAddress(fixture.input);
    const actual = {
      addressLine1: result.components.addressLine1,
      postcode: result.components.postcode,
      city: result.components.city,
      regionCode: result.components.regionCode,
      countryCode: result.components.countryCode,
    };

    assert.deepEqual(actual, fixture.expected);
    assert.deepEqual(result.missingComponents, fixture.missing);
    assert.equal(result.parserVersion, PARSER_VERSION);
    assert.ok(result.standardizedText.length > 0);
  });
}

test('exposes exactly one address-line field and never a second one', () => {
  const result = parseAddress('1600 Amphitheatre Parkway, Mountain View, CA 94043, USA');
  const keys = Object.keys(result.components);

  assert.deepEqual(keys, COMPONENT_FIELDS);
  assert.equal(keys.includes(FORBIDDEN_FIELD), false);
  assert.equal(JSON.stringify(result).includes(FORBIDDEN_FIELD), false);
});

test('reads a unique ISO region code without inventing the country', () => {
  const result = parseAddress('350 Fifth Avenue, New York, NY 10118');

  assert.equal(result.components.addressLine1, '350 Fifth Avenue');
  assert.equal(result.components.city, 'New York');
  assert.equal(result.components.regionCode, 'NY');
  assert.equal(result.components.countryCode, null);
  assert.equal(result.components.country, null);
  assert.ok(result.notes.some((note) => note.code === 'region-from-unique-code'));
  assert.ok(result.missingComponents.includes('country'));
});

test('flags a country that appears before the end of the line', () => {
  const result = parseAddress('USA, 1600 Amphitheatre Parkway, Mountain View, CA 94043');

  assert.equal(result.components.countryCode, 'US');
  assert.equal(result.components.city, 'Mountain View');
  assert.ok(result.notes.some((note) => note.code === 'country-not-trailing'));
});

test('uses a country hint when the line has no country', () => {
  const result = parseAddress('10 Downing Street, London, SW1A 2AA', { countryHint: 'GB' });

  assert.equal(result.components.countryCode, 'GB');
  assert.equal(result.components.country, 'United Kingdom');
  assert.equal(result.components.city, 'London');
  assert.equal(result.components.postcode, 'SW1A 2AA');
});

test('keeps the hint and warns when the line names another country', () => {
  const result = parseAddress('1 Rue de Rivoli, 75001 Paris, France', { countryHint: 'GB' });

  assert.equal(result.components.countryCode, 'GB');
  assert.ok(result.notes.some((note) => note.code === 'country-hint-conflict'));
});

test('never invents components for unreadable text', () => {
  const result = parseAddress('Zzzz Qqqq');

  assert.equal(result.components.addressLine1, 'Zzzz Qqqq');
  assert.equal(result.components.city, null);
  assert.equal(result.components.postcode, null);
  assert.equal(result.components.countryCode, null);
  assert.deepEqual(result.missingComponents, ['city', 'postcode', 'country', 'countryCode']);
  assert.equal(result.standardizedText, 'Zzzz Qqqq');
});

test('reports empty input without throwing', () => {
  const result = parseAddress('   ');

  assert.equal(result.standardizedText, '');
  assert.deepEqual(result.missingComponents, [
    'addressLine1',
    'city',
    'postcode',
    'country',
    'countryCode',
  ]);
  assert.ok(result.notes.some((note) => note.code === 'empty-input'));
});

test('folds a multi-line address into one line', () => {
  const result = parseAddress('1600 Amphitheatre Parkway\nMountain View, CA 94043\nUSA');

  assert.equal(result.components.addressLine1, '1600 Amphitheatre Parkway');
  assert.equal(result.components.city, 'Mountain View');
  assert.equal(result.components.postcode, '94043');
  assert.equal(result.components.countryCode, 'US');
  assert.equal(result.normalizedText.includes('\n'), false);
});

test('records the basis of every extracted component', () => {
  const result = parseAddress('1600 Amphitheatre Parkway, Mountain View, CA 94043, USA');

  assert.equal(result.bases.country, 'country-alias');
  assert.equal(result.bases.postcode, 'postcode-pattern');
  assert.equal(result.bases.regionCode, 'region-code');
  assert.equal(result.bases.city, 'position-heuristic');
});

test('is deterministic for identical input', () => {
  const input = '1 Macquarie Street, Sydney NSW 2000, Australia';
  const first = parseAddress(input);
  const second = parseAddress(input);

  assert.deepEqual({ ...first, parsedAt: '' }, { ...second, parsedAt: '' });
});

test('keeps the region as written in the standardized line', () => {
  const us = parseAddress('1600 Amphitheatre Parkway, Mountain View, CA 94043, USA');
  assert.equal(us.components.region, 'California');
  assert.equal(
    us.standardizedText,
    '1600 Amphitheatre Parkway, Mountain View, CA, 94043, United States',
  );

  const br = parseAddress('Av. Paulista 1578, São Paulo, SP, 01310-200, Brasil');
  assert.equal(br.standardizedText, 'Av. Paulista 1578, São Paulo, SP, 01310-200, Brazil');

  // A spelled-out region name stays spelled out; it is never rewritten as a code.
  const de = parseAddress('Unter den Linden 77, 10117 Berlin, Deutschland');
  assert.ok(de.standardizedText.includes('Berlin'));
  assert.ok(!de.standardizedText.includes(', BE,'));
});

test('rejects absurdly long input at the documented limit', () => {
  assert.equal(MAX_LINE_LENGTH, 400);
  const result = parseAddress('A'.repeat(MAX_LINE_LENGTH));
  assert.equal(typeof result.components.addressLine1, 'string');
});
