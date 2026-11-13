/**
 * Reference data for worldwide address parsing.
 *
 * Sources: ISO 3166-1 alpha-2 country codes and English short names (public
 * domain standard), plus subnational region codes for the countries where
 * addresses conventionally carry a region. All of this is static data bundled
 * with the application: no paid service, no runtime download.
 */
import { normalizeKey } from './text.js';

export interface CountryEntry {
  code: string;
  name: string;
  /** Common alternate spellings, ISO alpha-3 codes and local names. */
  aliases?: string[];
}

export const COUNTRIES: CountryEntry[] = [
  { code: 'AD', name: 'Andorra' },
  { code: 'AE', name: 'United Arab Emirates', aliases: ['uae', 'u a e', 'are', 'emirates'] },
  { code: 'AF', name: 'Afghanistan', aliases: ['afg'] },
  { code: 'AG', name: 'Antigua and Barbuda', aliases: ['atg'] },
  { code: 'AI', name: 'Anguilla' },
  { code: 'AL', name: 'Albania', aliases: ['alb'] },
  { code: 'AM', name: 'Armenia', aliases: ['arm'] },
  { code: 'AO', name: 'Angola', aliases: ['ago'] },
  { code: 'AQ', name: 'Antarctica' },
  { code: 'AR', name: 'Argentina', aliases: ['arg'] },
  { code: 'AS', name: 'American Samoa' },
  { code: 'AT', name: 'Austria', aliases: ['osterreich', 'aut', 'oesterreich'] },
  { code: 'AU', name: 'Australia', aliases: ['aus', 'australie'] },
  { code: 'AW', name: 'Aruba' },
  { code: 'AX', name: 'Aland Islands' },
  { code: 'AZ', name: 'Azerbaijan', aliases: ['aze'] },
  { code: 'BA', name: 'Bosnia and Herzegovina', aliases: ['bih', 'bosna i hercegovina'] },
  { code: 'BB', name: 'Barbados', aliases: ['brb'] },
  { code: 'BD', name: 'Bangladesh', aliases: ['bgd'] },
  { code: 'BE', name: 'Belgium', aliases: ['belgique', 'belgie', 'bel', 'belgien'] },
  { code: 'BF', name: 'Burkina Faso' },
  { code: 'BG', name: 'Bulgaria', aliases: ['bgr'] },
  { code: 'BH', name: 'Bahrain', aliases: ['bhr'] },
  { code: 'BI', name: 'Burundi' },
  { code: 'BJ', name: 'Benin' },
  { code: 'BL', name: 'Saint Barthelemy' },
  { code: 'BM', name: 'Bermuda' },
  { code: 'BN', name: 'Brunei', aliases: ['brunei darussalam', 'brn'] },
  { code: 'BO', name: 'Bolivia', aliases: ['bol'] },
  { code: 'BQ', name: 'Caribbean Netherlands' },
  { code: 'BR', name: 'Brazil', aliases: ['brasil', 'bra'] },
  { code: 'BS', name: 'Bahamas', aliases: ['bhs'] },
  { code: 'BT', name: 'Bhutan', aliases: ['btn'] },
  { code: 'BV', name: 'Bouvet Island' },
  { code: 'BW', name: 'Botswana', aliases: ['bwa'] },
  { code: 'BY', name: 'Belarus', aliases: ['blr'] },
  { code: 'BZ', name: 'Belize', aliases: ['blz'] },
  { code: 'CA', name: 'Canada', aliases: ['can'] },
  { code: 'CC', name: 'Cocos (Keeling) Islands' },
  { code: 'CD', name: 'Democratic Republic of the Congo', aliases: ['drc', 'congo kinshasa', 'cod'] },
  { code: 'CF', name: 'Central African Republic', aliases: ['caf'] },
  { code: 'CG', name: 'Congo', aliases: ['republic of the congo', 'congo brazzaville', 'cog'] },
  { code: 'CH', name: 'Switzerland', aliases: ['schweiz', 'suisse', 'svizzera', 'che', 'swiss'] },
  { code: 'CI', name: 'Cote d Ivoire', aliases: ['ivory coast', 'civ', 'cote divoire'] },
  { code: 'CK', name: 'Cook Islands' },
  { code: 'CL', name: 'Chile', aliases: ['chl'] },
  { code: 'CM', name: 'Cameroon', aliases: ['cmr'] },
  { code: 'CN', name: 'China', aliases: ['prc', 'chn', 'people s republic of china', 'mainland china'] },
  { code: 'CO', name: 'Colombia', aliases: ['col'] },
  { code: 'CR', name: 'Costa Rica', aliases: ['cri'] },
  { code: 'CU', name: 'Cuba', aliases: ['cub'] },
  { code: 'CV', name: 'Cabo Verde', aliases: ['cape verde', 'cpv'] },
  { code: 'CW', name: 'Curacao' },
  { code: 'CX', name: 'Christmas Island' },
  { code: 'CY', name: 'Cyprus', aliases: ['cyp'] },
  { code: 'CZ', name: 'Czechia', aliases: ['czech republic', 'ceska republika', 'cesko', 'cze'] },
  { code: 'DE', name: 'Germany', aliases: ['deutschland', 'deu', 'allemagne', 'germania'] },
  { code: 'DJ', name: 'Djibouti' },
  { code: 'DK', name: 'Denmark', aliases: ['danmark', 'dnk'] },
  { code: 'DM', name: 'Dominica' },
  { code: 'DO', name: 'Dominican Republic', aliases: ['dom'] },
  { code: 'DZ', name: 'Algeria', aliases: ['dza'] },
  { code: 'EC', name: 'Ecuador', aliases: ['ecu'] },
  { code: 'EE', name: 'Estonia', aliases: ['eesti', 'est'] },
  { code: 'EG', name: 'Egypt', aliases: ['egy', 'misr'] },
  { code: 'EH', name: 'Western Sahara' },
  { code: 'ER', name: 'Eritrea' },
  { code: 'ES', name: 'Spain', aliases: ['espana', 'esp', 'espagne', 'spanien'] },
  { code: 'ET', name: 'Ethiopia', aliases: ['eth'] },
  { code: 'FI', name: 'Finland', aliases: ['suomi', 'fin'] },
  { code: 'FJ', name: 'Fiji', aliases: ['fji'] },
  { code: 'FK', name: 'Falkland Islands' },
  { code: 'FM', name: 'Micronesia', aliases: ['fsm'] },
  { code: 'FO', name: 'Faroe Islands' },
  { code: 'FR', name: 'France', aliases: ['fra', 'frankreich', 'francia'] },
  { code: 'GA', name: 'Gabon' },
  { code: 'GB', name: 'United Kingdom', aliases: ['uk', 'u k', 'gbr', 'great britain', 'britain', 'england', 'scotland', 'wales', 'northern ireland', 'united kingdom of great britain and northern ireland'] },
  { code: 'GD', name: 'Grenada' },
  { code: 'GE', name: 'Georgia', aliases: ['geo', 'sakartvelo'] },
  { code: 'GF', name: 'French Guiana' },
  { code: 'GG', name: 'Guernsey' },
  { code: 'GH', name: 'Ghana', aliases: ['gha'] },
  { code: 'GI', name: 'Gibraltar' },
  { code: 'GL', name: 'Greenland' },
  { code: 'GM', name: 'Gambia', aliases: ['gmb'] },
  { code: 'GN', name: 'Guinea' },
  { code: 'GP', name: 'Guadeloupe' },
  { code: 'GQ', name: 'Equatorial Guinea' },
  { code: 'GR', name: 'Greece', aliases: ['grc', 'hellas', 'ellada'] },
  { code: 'GS', name: 'South Georgia and the South Sandwich Islands' },
  { code: 'GT', name: 'Guatemala', aliases: ['gtm'] },
  { code: 'GU', name: 'Guam' },
  { code: 'GW', name: 'Guinea-Bissau' },
  { code: 'GY', name: 'Guyana', aliases: ['guy'] },
  { code: 'HK', name: 'Hong Kong', aliases: ['hkg', 'hongkong', 'hong kong sar'] },
  { code: 'HM', name: 'Heard Island and McDonald Islands' },
  { code: 'HN', name: 'Honduras', aliases: ['hnd'] },
  { code: 'HR', name: 'Croatia', aliases: ['hrvatska', 'hrv'] },
  { code: 'HT', name: 'Haiti', aliases: ['hti'] },
  { code: 'HU', name: 'Hungary', aliases: ['magyarorszag', 'hun'] },
  { code: 'ID', name: 'Indonesia', aliases: ['idn'] },
  { code: 'IE', name: 'Ireland', aliases: ['eire', 'irl', 'republic of ireland'] },
  { code: 'IL', name: 'Israel', aliases: ['isr'] },
  { code: 'IM', name: 'Isle of Man' },
  { code: 'IN', name: 'India', aliases: ['ind', 'bharat'] },
  { code: 'IO', name: 'British Indian Ocean Territory' },
  { code: 'IQ', name: 'Iraq', aliases: ['irq'] },
  { code: 'IR', name: 'Iran', aliases: ['irn', 'islamic republic of iran'] },
  { code: 'IS', name: 'Iceland', aliases: ['isl', 'island'] },
  { code: 'IT', name: 'Italy', aliases: ['italia', 'ita', 'italien'] },
  { code: 'JE', name: 'Jersey' },
  { code: 'JM', name: 'Jamaica', aliases: ['jam'] },
  { code: 'JO', name: 'Jordan', aliases: ['jor'] },
  { code: 'JP', name: 'Japan', aliases: ['jpn', 'nippon', 'nihon'] },
  { code: 'KE', name: 'Kenya', aliases: ['ken'] },
  { code: 'KG', name: 'Kyrgyzstan', aliases: ['kgz'] },
  { code: 'KH', name: 'Cambodia', aliases: ['khm'] },
  { code: 'KI', name: 'Kiribati' },
  { code: 'KM', name: 'Comoros' },
  { code: 'KN', name: 'Saint Kitts and Nevis' },
  { code: 'KP', name: 'North Korea', aliases: ['prk', 'dprk'] },
  { code: 'KR', name: 'South Korea', aliases: ['kor', 'republic of korea', 'korea'] },
  { code: 'KW', name: 'Kuwait', aliases: ['kwt'] },
  { code: 'KY', name: 'Cayman Islands' },
  { code: 'KZ', name: 'Kazakhstan', aliases: ['kaz'] },
  { code: 'LA', name: 'Laos', aliases: ['lao', 'lao pdr'] },
  { code: 'LB', name: 'Lebanon', aliases: ['lbn'] },
  { code: 'LC', name: 'Saint Lucia' },
  { code: 'LI', name: 'Liechtenstein', aliases: ['lie'] },
  { code: 'LK', name: 'Sri Lanka', aliases: ['lka', 'ceylon'] },
  { code: 'LR', name: 'Liberia' },
  { code: 'LS', name: 'Lesotho' },
  { code: 'LT', name: 'Lithuania', aliases: ['ltu', 'lietuva'] },
  { code: 'LU', name: 'Luxembourg', aliases: ['lux', 'letzebuerg'] },
  { code: 'LV', name: 'Latvia', aliases: ['lva', 'latvija'] },
  { code: 'LY', name: 'Libya', aliases: ['lby'] },
  { code: 'MA', name: 'Morocco', aliases: ['mar', 'maroc'] },
  { code: 'MC', name: 'Monaco', aliases: ['mco'] },
  { code: 'MD', name: 'Moldova', aliases: ['mda'] },
  { code: 'ME', name: 'Montenegro', aliases: ['mne', 'crna gora'] },
  { code: 'MF', name: 'Saint Martin' },
  { code: 'MG', name: 'Madagascar', aliases: ['mdg'] },
  { code: 'MH', name: 'Marshall Islands' },
  { code: 'MK', name: 'North Macedonia', aliases: ['mkd', 'macedonia'] },
  { code: 'ML', name: 'Mali' },
  { code: 'MM', name: 'Myanmar', aliases: ['mmr', 'burma'] },
  { code: 'MN', name: 'Mongolia', aliases: ['mng'] },
  { code: 'MO', name: 'Macao', aliases: ['macau', 'mac'] },
  { code: 'MP', name: 'Northern Mariana Islands' },
  { code: 'MQ', name: 'Martinique' },
  { code: 'MR', name: 'Mauritania', aliases: ['mrt'] },
  { code: 'MS', name: 'Montserrat' },
  { code: 'MT', name: 'Malta', aliases: ['mlt'] },
  { code: 'MU', name: 'Mauritius', aliases: ['mus'] },
  { code: 'MV', name: 'Maldives', aliases: ['mdv'] },
  { code: 'MW', name: 'Malawi', aliases: ['mwi'] },
  { code: 'MX', name: 'Mexico', aliases: ['mex', 'mexico city? no'] },
  { code: 'MY', name: 'Malaysia', aliases: ['mys'] },
  { code: 'MZ', name: 'Mozambique', aliases: ['moz'] },
  { code: 'NA', name: 'Namibia', aliases: ['nam'] },
  { code: 'NC', name: 'New Caledonia' },
  { code: 'NE', name: 'Niger', aliases: ['ner'] },
  { code: 'NF', name: 'Norfolk Island' },
  { code: 'NG', name: 'Nigeria', aliases: ['nga'] },
  { code: 'NI', name: 'Nicaragua', aliases: ['nic'] },
  { code: 'NL', name: 'Netherlands', aliases: ['nederland', 'nld', 'holland', 'the netherlands'] },
  { code: 'NO', name: 'Norway', aliases: ['norge', 'nor', 'noreg'] },
  { code: 'NP', name: 'Nepal', aliases: ['npl'] },
  { code: 'NR', name: 'Nauru' },
  { code: 'NU', name: 'Niue' },
  { code: 'NZ', name: 'New Zealand', aliases: ['nzl', 'aotearoa'] },
  { code: 'OM', name: 'Oman', aliases: ['omn'] },
  { code: 'PA', name: 'Panama', aliases: ['pan'] },
  { code: 'PE', name: 'Peru', aliases: ['per'] },
  { code: 'PF', name: 'French Polynesia' },
  { code: 'PG', name: 'Papua New Guinea', aliases: ['png'] },
  { code: 'PH', name: 'Philippines', aliases: ['phl', 'pilipinas'] },
  { code: 'PK', name: 'Pakistan', aliases: ['pak'] },
  { code: 'PL', name: 'Poland', aliases: ['polska', 'pol'] },
  { code: 'PM', name: 'Saint Pierre and Miquelon' },
  { code: 'PN', name: 'Pitcairn Islands' },
  { code: 'PR', name: 'Puerto Rico', aliases: ['pri'] },
  { code: 'PS', name: 'Palestine', aliases: ['pse', 'palestinian territories'] },
  { code: 'PT', name: 'Portugal', aliases: ['prt'] },
  { code: 'PW', name: 'Palau' },
  { code: 'PY', name: 'Paraguay', aliases: ['pry'] },
  { code: 'QA', name: 'Qatar', aliases: ['qat'] },
  { code: 'RE', name: 'Reunion' },
  { code: 'RO', name: 'Romania', aliases: ['rou', 'romania? no'] },
  { code: 'RS', name: 'Serbia', aliases: ['srb', 'srbija'] },
  { code: 'RU', name: 'Russia', aliases: ['rus', 'russian federation', 'rossiya'] },
  { code: 'RW', name: 'Rwanda', aliases: ['rwa'] },
  { code: 'SA', name: 'Saudi Arabia', aliases: ['sau', 'ksa', 'kingdom of saudi arabia'] },
  { code: 'SB', name: 'Solomon Islands' },
  { code: 'SC', name: 'Seychelles', aliases: ['syc'] },
  { code: 'SD', name: 'Sudan', aliases: ['sdn'] },
  { code: 'SE', name: 'Sweden', aliases: ['sverige', 'swe'] },
  { code: 'SG', name: 'Singapore', aliases: ['sgp'] },
  { code: 'SH', name: 'Saint Helena' },
  { code: 'SI', name: 'Slovenia', aliases: ['svn', 'slovenija'] },
  { code: 'SJ', name: 'Svalbard and Jan Mayen' },
  { code: 'SK', name: 'Slovakia', aliases: ['svk', 'slovensko'] },
  { code: 'SL', name: 'Sierra Leone' },
  { code: 'SM', name: 'San Marino' },
  { code: 'SN', name: 'Senegal', aliases: ['sen'] },
  { code: 'SO', name: 'Somalia', aliases: ['som'] },
  { code: 'SR', name: 'Suriname', aliases: ['sur'] },
  { code: 'SS', name: 'South Sudan', aliases: ['ssd'] },
  { code: 'ST', name: 'Sao Tome and Principe' },
  { code: 'SV', name: 'El Salvador', aliases: ['slv'] },
  { code: 'SX', name: 'Sint Maarten' },
  { code: 'SY', name: 'Syria', aliases: ['syr'] },
  { code: 'SZ', name: 'Eswatini', aliases: ['swaziland', 'swz'] },
  { code: 'TC', name: 'Turks and Caicos Islands' },
  { code: 'TD', name: 'Chad' },
  { code: 'TF', name: 'French Southern Territories' },
  { code: 'TG', name: 'Togo' },
  { code: 'TH', name: 'Thailand', aliases: ['tha', 'siam'] },
  { code: 'TJ', name: 'Tajikistan', aliases: ['tjk'] },
  { code: 'TK', name: 'Tokelau' },
  { code: 'TL', name: 'Timor-Leste', aliases: ['east timor', 'tls'] },
  { code: 'TM', name: 'Turkmenistan', aliases: ['tkm'] },
  { code: 'TN', name: 'Tunisia', aliases: ['tun'] },
  { code: 'TO', name: 'Tonga' },
  { code: 'TR', name: 'Turkiye', aliases: ['turkey', 'tur', 'turkiye cumhuriyeti'] },
  { code: 'TT', name: 'Trinidad and Tobago', aliases: ['tto'] },
  { code: 'TV', name: 'Tuvalu' },
  { code: 'TW', name: 'Taiwan', aliases: ['twn', 'chinese taipei'] },
  { code: 'TZ', name: 'Tanzania', aliases: ['tza'] },
  { code: 'UA', name: 'Ukraine', aliases: ['ukr', 'ukraina'] },
  { code: 'UG', name: 'Uganda', aliases: ['uga'] },
  { code: 'UM', name: 'United States Minor Outlying Islands' },
  { code: 'US', name: 'United States', aliases: ['usa', 'u s a', 'us', 'united states of america', 'america', 'the united states'] },
  { code: 'UY', name: 'Uruguay', aliases: ['ury'] },
  { code: 'UZ', name: 'Uzbekistan', aliases: ['uzb'] },
  { code: 'VA', name: 'Vatican City', aliases: ['holy see', 'vat'] },
  { code: 'VC', name: 'Saint Vincent and the Grenadines' },
  { code: 'VE', name: 'Venezuela', aliases: ['ven'] },
  { code: 'VG', name: 'British Virgin Islands' },
  { code: 'VI', name: 'U.S. Virgin Islands' },
  { code: 'VN', name: 'Vietnam', aliases: ['vnm', 'viet nam'] },
  { code: 'VU', name: 'Vanuatu', aliases: ['vut'] },
  { code: 'WF', name: 'Wallis and Futuna' },
  { code: 'WS', name: 'Samoa', aliases: ['wsm'] },
  { code: 'YE', name: 'Yemen', aliases: ['yem'] },
  { code: 'YT', name: 'Mayotte' },
  { code: 'ZA', name: 'South Africa', aliases: ['zaf', 'rsa', 'republic of south africa'] },
  { code: 'ZM', name: 'Zambia', aliases: ['zmb'] },
  { code: 'ZW', name: 'Zimbabwe', aliases: ['zwe'] },
];

export interface CountryMatchEntry {
  code: string;
  name: string;
  basis: 'country-name' | 'country-code' | 'country-alias';
}

const COUNTRY_INDEX = new Map<string, CountryMatchEntry>();

for (const entry of COUNTRIES) {
  COUNTRY_INDEX.set(normalizeKey(entry.name), {
    code: entry.code,
    name: entry.name,
    basis: 'country-name',
  });
  COUNTRY_INDEX.set(normalizeKey(entry.code), {
    code: entry.code,
    name: entry.name,
    basis: 'country-code',
  });
  for (const alias of entry.aliases ?? []) {
    const key = normalizeKey(alias);
    if (!key) continue;
    if (!COUNTRY_INDEX.has(key)) {
      COUNTRY_INDEX.set(key, { code: entry.code, name: entry.name, basis: 'country-alias' });
    }
  }
}

export function lookupCountry(key: string): CountryMatchEntry | null {
  if (!key) return null;
  return COUNTRY_INDEX.get(key) ?? null;
}

export interface RegionEntry {
  code: string;
  name: string;
  aliases?: string[];
}

export const REGIONS: Record<string, RegionEntry[]> = {
  US: [
    { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
    { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
    { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'FL', name: 'Florida' },
    { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' },
    { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' }, { code: 'IA', name: 'Iowa' },
    { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' },
    { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' }, { code: 'MA', name: 'Massachusetts' },
    { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
    { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' }, { code: 'NE', name: 'Nebraska' },
    { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
    { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' }, { code: 'NC', name: 'North Carolina' },
    { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' },
    { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' }, { code: 'RI', name: 'Rhode Island' },
    { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' },
    { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' }, { code: 'VT', name: 'Vermont' },
    { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' },
    { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' }, { code: 'DC', name: 'District of Columbia' },
    { code: 'PR', name: 'Puerto Rico' },
  ],
  CA: [
    { code: 'AB', name: 'Alberta' }, { code: 'BC', name: 'British Columbia' }, { code: 'MB', name: 'Manitoba' },
    { code: 'NB', name: 'New Brunswick' }, { code: 'NL', name: 'Newfoundland and Labrador', aliases: ['newfoundland'] },
    { code: 'NS', name: 'Nova Scotia' }, { code: 'NT', name: 'Northwest Territories' }, { code: 'NU', name: 'Nunavut' },
    { code: 'ON', name: 'Ontario' }, { code: 'PE', name: 'Prince Edward Island' }, { code: 'QC', name: 'Quebec' },
    { code: 'SK', name: 'Saskatchewan' }, { code: 'YT', name: 'Yukon' },
  ],
  AU: [
    { code: 'NSW', name: 'New South Wales' }, { code: 'VIC', name: 'Victoria' }, { code: 'QLD', name: 'Queensland' },
    { code: 'WA', name: 'Western Australia' }, { code: 'SA', name: 'South Australia' }, { code: 'TAS', name: 'Tasmania' },
    { code: 'ACT', name: 'Australian Capital Territory' }, { code: 'NT', name: 'Northern Territory' },
  ],
  BR: [
    { code: 'AC', name: 'Acre' }, { code: 'AL', name: 'Alagoas' }, { code: 'AP', name: 'Amapa' },
    { code: 'AM', name: 'Amazonas' }, { code: 'BA', name: 'Bahia' }, { code: 'CE', name: 'Ceara' },
    { code: 'DF', name: 'Distrito Federal' }, { code: 'ES', name: 'Espirito Santo' }, { code: 'GO', name: 'Goias' },
    { code: 'MA', name: 'Maranhao' }, { code: 'MT', name: 'Mato Grosso' }, { code: 'MS', name: 'Mato Grosso do Sul' },
    { code: 'MG', name: 'Minas Gerais' }, { code: 'PA', name: 'Para' }, { code: 'PB', name: 'Paraiba' },
    { code: 'PR', name: 'Parana' }, { code: 'PE', name: 'Pernambuco' }, { code: 'PI', name: 'Piaui' },
    { code: 'RJ', name: 'Rio de Janeiro' }, { code: 'RN', name: 'Rio Grande do Norte' }, { code: 'RS', name: 'Rio Grande do Sul' },
    { code: 'RO', name: 'Rondonia' }, { code: 'RR', name: 'Roraima' }, { code: 'SC', name: 'Santa Catarina' },
    { code: 'SP', name: 'Sao Paulo' }, { code: 'SE', name: 'Sergipe' }, { code: 'TO', name: 'Tocantins' },
  ],
  IN: [
    { code: 'AP', name: 'Andhra Pradesh' }, { code: 'AR', name: 'Arunachal Pradesh' }, { code: 'AS', name: 'Assam' },
    { code: 'BR', name: 'Bihar' }, { code: 'CT', name: 'Chhattisgarh' }, { code: 'GA', name: 'Goa' },
    { code: 'GJ', name: 'Gujarat' }, { code: 'HR', name: 'Haryana' }, { code: 'HP', name: 'Himachal Pradesh' },
    { code: 'JH', name: 'Jharkhand' }, { code: 'KA', name: 'Karnataka' }, { code: 'KL', name: 'Kerala' },
    { code: 'MP', name: 'Madhya Pradesh' }, { code: 'MH', name: 'Maharashtra' }, { code: 'MN', name: 'Manipur' },
    { code: 'ML', name: 'Meghalaya' }, { code: 'MZ', name: 'Mizoram' }, { code: 'NL', name: 'Nagaland' },
    { code: 'OD', name: 'Odisha', aliases: ['orissa'] }, { code: 'PB', name: 'Punjab' }, { code: 'RJ', name: 'Rajasthan' },
    { code: 'SK', name: 'Sikkim' }, { code: 'TN', name: 'Tamil Nadu' }, { code: 'TG', name: 'Telangana' },
    { code: 'TR', name: 'Tripura' }, { code: 'UP', name: 'Uttar Pradesh' }, { code: 'UK', name: 'Uttarakhand' },
    { code: 'WB', name: 'West Bengal' }, { code: 'AN', name: 'Andaman and Nicobar Islands' }, { code: 'CH', name: 'Chandigarh' },
    { code: 'DL', name: 'Delhi' }, { code: 'JK', name: 'Jammu and Kashmir' }, { code: 'LA', name: 'Ladakh' },
    { code: 'LD', name: 'Lakshadweep' }, { code: 'PY', name: 'Puducherry' },
  ],
  DE: [
    { code: 'BW', name: 'Baden-Wurttemberg', aliases: ['baden wurttemberg'] },
    { code: 'BY', name: 'Bavaria', aliases: ['bayern'] },
    { code: 'BE', name: 'Berlin' }, { code: 'BB', name: 'Brandenburg' }, { code: 'HB', name: 'Bremen' },
    { code: 'HH', name: 'Hamburg' }, { code: 'HE', name: 'Hesse', aliases: ['hessen'] },
    { code: 'MV', name: 'Mecklenburg-Vorpommern', aliases: ['mecklenburg vorpommern'] },
    { code: 'NI', name: 'Lower Saxony', aliases: ['niedersachsen'] },
    { code: 'NW', name: 'North Rhine-Westphalia', aliases: ['nordrhein westfalen', 'nrw'] },
    { code: 'RP', name: 'Rhineland-Palatinate', aliases: ['rheinland pfalz'] },
    { code: 'SL', name: 'Saarland' }, { code: 'SN', name: 'Saxony', aliases: ['sachsen'] },
    { code: 'ST', name: 'Saxony-Anhalt', aliases: ['sachsen anhalt'] },
    { code: 'SH', name: 'Schleswig-Holstein', aliases: ['schleswig holstein'] },
    { code: 'TH', name: 'Thuringia', aliases: ['thuringen'] },
  ],
  MX: [
    { code: 'AGU', name: 'Aguascalientes' }, { code: 'BCN', name: 'Baja California' }, { code: 'BCS', name: 'Baja California Sur' },
    { code: 'CAM', name: 'Campeche' }, { code: 'CHP', name: 'Chiapas' }, { code: 'CHH', name: 'Chihuahua' },
    { code: 'CMX', name: 'Ciudad de Mexico', aliases: ['cdmx', 'mexico city'] }, { code: 'COA', name: 'Coahuila' },
    { code: 'COL', name: 'Colima' }, { code: 'DUR', name: 'Durango' }, { code: 'GUA', name: 'Guanajuato' },
    { code: 'GRO', name: 'Guerrero' }, { code: 'HID', name: 'Hidalgo' }, { code: 'JAL', name: 'Jalisco' },
    { code: 'MEX', name: 'Estado de Mexico' }, { code: 'MIC', name: 'Michoacan' }, { code: 'MOR', name: 'Morelos' },
    { code: 'NAY', name: 'Nayarit' }, { code: 'NLE', name: 'Nuevo Leon' }, { code: 'OAX', name: 'Oaxaca' },
    { code: 'PUE', name: 'Puebla' }, { code: 'QUE', name: 'Queretaro' }, { code: 'ROO', name: 'Quintana Roo' },
    { code: 'SLP', name: 'San Luis Potosi' }, { code: 'SIN', name: 'Sinaloa' }, { code: 'SON', name: 'Sonora' },
    { code: 'TAB', name: 'Tabasco' }, { code: 'TAM', name: 'Tamaulipas' }, { code: 'TLA', name: 'Tlaxcala' },
    { code: 'VER', name: 'Veracruz' }, { code: 'YUC', name: 'Yucatan' }, { code: 'ZAC', name: 'Zacatecas' },
  ],
  JP: [
    { code: '01', name: 'Hokkaido' }, { code: '02', name: 'Aomori' }, { code: '03', name: 'Iwate' },
    { code: '04', name: 'Miyagi' }, { code: '05', name: 'Akita' }, { code: '06', name: 'Yamagata' },
    { code: '07', name: 'Fukushima' }, { code: '08', name: 'Ibaraki' }, { code: '09', name: 'Tochigi' },
    { code: '10', name: 'Gunma' }, { code: '11', name: 'Saitama' }, { code: '12', name: 'Chiba' },
    { code: '13', name: 'Tokyo' }, { code: '14', name: 'Kanagawa' }, { code: '15', name: 'Niigata' },
    { code: '16', name: 'Toyama' }, { code: '17', name: 'Ishikawa' }, { code: '18', name: 'Fukui' },
    { code: '19', name: 'Yamanashi' }, { code: '20', name: 'Nagano' }, { code: '21', name: 'Gifu' },
    { code: '22', name: 'Shizuoka' }, { code: '23', name: 'Aichi' }, { code: '24', name: 'Mie' },
    { code: '25', name: 'Shiga' }, { code: '26', name: 'Kyoto' }, { code: '27', name: 'Osaka' },
    { code: '28', name: 'Hyogo' }, { code: '29', name: 'Nara' }, { code: '30', name: 'Wakayama' },
    { code: '31', name: 'Tottori' }, { code: '32', name: 'Shimane' }, { code: '33', name: 'Okayama' },
    { code: '34', name: 'Hiroshima' }, { code: '35', name: 'Yamaguchi' }, { code: '36', name: 'Tokushima' },
    { code: '37', name: 'Kagawa' }, { code: '38', name: 'Ehime' }, { code: '39', name: 'Kochi' },
    { code: '40', name: 'Fukuoka' }, { code: '41', name: 'Saga' }, { code: '42', name: 'Nagasaki' },
    { code: '43', name: 'Kumamoto' }, { code: '44', name: 'Oita' }, { code: '45', name: 'Miyazaki' },
    { code: '46', name: 'Kagoshima' }, { code: '47', name: 'Okinawa' },
  ],
  ZA: [
    { code: 'EC', name: 'Eastern Cape' }, { code: 'FS', name: 'Free State' }, { code: 'GP', name: 'Gauteng' },
    { code: 'KZN', name: 'KwaZulu-Natal', aliases: ['kwazulu natal'] }, { code: 'LP', name: 'Limpopo' },
    { code: 'MP', name: 'Mpumalanga' }, { code: 'NC', name: 'Northern Cape' }, { code: 'NW', name: 'North West' },
    { code: 'WC', name: 'Western Cape' },
  ],
  NL: [
    { code: 'DR', name: 'Drenthe' }, { code: 'FL', name: 'Flevoland' }, { code: 'FR', name: 'Friesland' },
    { code: 'GE', name: 'Gelderland' }, { code: 'GR', name: 'Groningen' }, { code: 'LI', name: 'Limburg' },
    { code: 'NB', name: 'Noord-Brabant', aliases: ['noord brabant'] }, { code: 'NH', name: 'Noord-Holland', aliases: ['noord holland'] },
    { code: 'OV', name: 'Overijssel' }, { code: 'UT', name: 'Utrecht' }, { code: 'ZE', name: 'Zeeland' },
    { code: 'ZH', name: 'Zuid-Holland', aliases: ['zuid holland'] },
  ],
};

export interface RegionMatch {
  code: string;
  name: string;
  matchedBy: 'code' | 'name';
}

const REGION_INDEX = new Map<string, Map<string, RegionMatch>>();

for (const [countryCode, entries] of Object.entries(REGIONS)) {
  const index = new Map<string, RegionMatch>();
  for (const entry of entries) {
    index.set(normalizeKey(entry.code), { code: entry.code, name: entry.name, matchedBy: 'code' });
    index.set(normalizeKey(entry.name), { code: entry.code, name: entry.name, matchedBy: 'name' });
    for (const alias of entry.aliases ?? []) {
      const key = normalizeKey(alias);
      if (key && !index.has(key)) {
        index.set(key, { code: entry.code, name: entry.name, matchedBy: 'name' });
      }
    }
  }
  REGION_INDEX.set(countryCode, index);
}

export function lookupRegion(countryCode: string, value: string): RegionMatch | null {
  const index = REGION_INDEX.get(countryCode);
  if (!index) return null;
  const key = normalizeKey(value);
  if (!key) return null;
  return index.get(key) ?? null;
}

/**
 * Subnational codes that collide with two-letter ISO country codes.
 * A bare token like "CA" or "IN" is ambiguous on its own, so the parser keeps
 * the country reading but records an informational note instead of guessing.
 */
export const AMBIGUOUS_CODES: Set<string> = new Set(
  Object.values(REGIONS)
    .flat()
    .filter((region) => region.code.length === 2)
    .map((region) => region.code.toUpperCase()),
);

export interface CountryFormat {
  /** Postcode pattern without anchors; matched against the uppercased segment. */
  postcodeCore: string | null;
  postcodeExample: string | null;
  postcodeExpected: boolean;
  regionSet?: string;
}

export const COUNTRY_FORMATS: Record<string, CountryFormat> = {
  US: { postcodeCore: '\\d{5}(?:-\\d{4})?', postcodeExample: '94043', postcodeExpected: true, regionSet: 'US' },
  CA: { postcodeCore: '[A-Z]\\d[A-Z][ -]?\\d[A-Z]\\d', postcodeExample: 'M5H 2N2', postcodeExpected: true, regionSet: 'CA' },
  GB: { postcodeCore: '[A-Z]{1,2}\\d[A-Z\\d]?\\s?\\d[A-Z]{2}', postcodeExample: 'SW1A 2AA', postcodeExpected: true },
  IE: { postcodeCore: '[A-Z]\\d{2}\\s?[A-Z0-9]{4}', postcodeExample: 'D02 X285', postcodeExpected: true },
  DE: { postcodeCore: '\\d{5}', postcodeExample: '10117', postcodeExpected: true, regionSet: 'DE' },
  FR: { postcodeCore: '\\d{5}', postcodeExample: '75007', postcodeExpected: true },
  NL: { postcodeCore: '\\d{4}\\s?[A-Z]{2}', postcodeExample: '1012 JS', postcodeExpected: true, regionSet: 'NL' },
  BE: { postcodeCore: '\\d{4}', postcodeExample: '1000', postcodeExpected: true },
  LU: { postcodeCore: '\\d{4}', postcodeExample: '1111', postcodeExpected: true },
  CH: { postcodeCore: '\\d{4}', postcodeExample: '8001', postcodeExpected: true },
  AT: { postcodeCore: '\\d{4}', postcodeExample: '1010', postcodeExpected: true },
  ES: { postcodeCore: '\\d{5}', postcodeExample: '28001', postcodeExpected: true },
  PT: { postcodeCore: '\\d{4}-\\d{3}', postcodeExample: '1000-001', postcodeExpected: true },
  IT: { postcodeCore: '\\d{5}', postcodeExample: '00184', postcodeExpected: true },
  GR: { postcodeCore: '\\d{3}\\s?\\d{2}', postcodeExample: '105 58', postcodeExpected: true },
  PL: { postcodeCore: '\\d{2}-\\d{3}', postcodeExample: '00-001', postcodeExpected: true },
  CZ: { postcodeCore: '\\d{3}\\s?\\d{2}', postcodeExample: '110 00', postcodeExpected: true },
  SK: { postcodeCore: '\\d{3}\\s?\\d{2}', postcodeExample: '811 01', postcodeExpected: true },
  HU: { postcodeCore: '\\d{4}', postcodeExample: '1011', postcodeExpected: true },
  RO: { postcodeCore: '\\d{6}', postcodeExample: '010011', postcodeExpected: true },
  BG: { postcodeCore: '\\d{4}', postcodeExample: '1000', postcodeExpected: true },
  HR: { postcodeCore: '\\d{5}', postcodeExample: '10000', postcodeExpected: true },
  SI: { postcodeCore: '\\d{4}', postcodeExample: '1000', postcodeExpected: true },
  RS: { postcodeCore: '\\d{5}', postcodeExample: '11000', postcodeExpected: true },
  UA: { postcodeCore: '\\d{5}', postcodeExample: '01001', postcodeExpected: true },
  SE: { postcodeCore: '\\d{3}\\s?\\d{2}', postcodeExample: '111 20', postcodeExpected: true },
  NO: { postcodeCore: '\\d{4}', postcodeExample: '0150', postcodeExpected: true },
  DK: { postcodeCore: '\\d{4}', postcodeExample: '1050', postcodeExpected: true },
  FI: { postcodeCore: '\\d{5}', postcodeExample: '00100', postcodeExpected: true },
  IS: { postcodeCore: '\\d{3}', postcodeExample: '101', postcodeExpected: true },
  EE: { postcodeCore: '\\d{5}', postcodeExample: '10111', postcodeExpected: true },
  LV: { postcodeCore: 'LV-?\\d{4}', postcodeExample: 'LV-1010', postcodeExpected: true },
  LT: { postcodeCore: 'LT-?\\d{5}', postcodeExample: 'LT-01100', postcodeExpected: true },
  AU: { postcodeCore: '\\d{4}', postcodeExample: '2000', postcodeExpected: true, regionSet: 'AU' },
  NZ: { postcodeCore: '\\d{4}', postcodeExample: '1010', postcodeExpected: true },
  JP: { postcodeCore: '\\d{3}-?\\d{4}', postcodeExample: '100-8111', postcodeExpected: true, regionSet: 'JP' },
  CN: { postcodeCore: '\\d{6}', postcodeExample: '100000', postcodeExpected: true },
  KR: { postcodeCore: '\\d{5}', postcodeExample: '03051', postcodeExpected: true },
  IN: { postcodeCore: '\\d{6}', postcodeExample: '560001', postcodeExpected: true, regionSet: 'IN' },
  SG: { postcodeCore: '\\d{6}', postcodeExample: '018956', postcodeExpected: true },
  MY: { postcodeCore: '\\d{5}', postcodeExample: '50450', postcodeExpected: true },
  TH: { postcodeCore: '\\d{5}', postcodeExample: '10330', postcodeExpected: true },
  ID: { postcodeCore: '\\d{5}', postcodeExample: '10110', postcodeExpected: true },
  PH: { postcodeCore: '\\d{4}', postcodeExample: '1000', postcodeExpected: true },
  VN: { postcodeCore: '\\d{6}', postcodeExample: '100000', postcodeExpected: true },
  PK: { postcodeCore: '\\d{5}', postcodeExample: '44000', postcodeExpected: true },
  BD: { postcodeCore: '\\d{4}', postcodeExample: '1000', postcodeExpected: true },
  LK: { postcodeCore: '\\d{5}', postcodeExample: '00100', postcodeExpected: true },
  NP: { postcodeCore: '\\d{5}', postcodeExample: '44600', postcodeExpected: true },
  BR: { postcodeCore: '\\d{5}-?\\d{3}', postcodeExample: '01310-200', postcodeExpected: true, regionSet: 'BR' },
  MX: { postcodeCore: '\\d{5}', postcodeExample: '06000', postcodeExpected: true, regionSet: 'MX' },
  AR: { postcodeCore: '[A-Z]?\\d{4}[A-Z]{0,3}', postcodeExample: 'C1002', postcodeExpected: true },
  CL: { postcodeCore: '\\d{7}', postcodeExample: '8320000', postcodeExpected: true },
  CO: { postcodeCore: '\\d{6}', postcodeExample: '110111', postcodeExpected: true },
  PE: { postcodeCore: '\\d{5}', postcodeExample: '15001', postcodeExpected: true },
  UY: { postcodeCore: '\\d{5}', postcodeExample: '11000', postcodeExpected: true },
  EC: { postcodeCore: '\\d{6}', postcodeExample: '170150', postcodeExpected: true },
  ZA: { postcodeCore: '\\d{4}', postcodeExample: '8001', postcodeExpected: true, regionSet: 'ZA' },
  NG: { postcodeCore: '\\d{6}', postcodeExample: '100001', postcodeExpected: true },
  KE: { postcodeCore: '\\d{5}', postcodeExample: '00100', postcodeExpected: true },
  EG: { postcodeCore: '\\d{5}', postcodeExample: '11511', postcodeExpected: true },
  MA: { postcodeCore: '\\d{5}', postcodeExample: '20250', postcodeExpected: true },
  TN: { postcodeCore: '\\d{4}', postcodeExample: '1000', postcodeExpected: true },
  DZ: { postcodeCore: '\\d{5}', postcodeExample: '16000', postcodeExpected: true },
  SA: { postcodeCore: '\\d{5}', postcodeExample: '11564', postcodeExpected: true },
  IL: { postcodeCore: '\\d{5,7}', postcodeExample: '9103401', postcodeExpected: true },
  TR: { postcodeCore: '\\d{5}', postcodeExample: '06100', postcodeExpected: true },
  RU: { postcodeCore: '\\d{6}', postcodeExample: '101000', postcodeExpected: true },
  AE: { postcodeCore: null, postcodeExample: null, postcodeExpected: false },
  HK: { postcodeCore: null, postcodeExample: null, postcodeExpected: false },
  QA: { postcodeCore: null, postcodeExample: null, postcodeExpected: false },
  MO: { postcodeCore: null, postcodeExample: null, postcodeExpected: false },
};

/** Patterns tried when the country is unknown, most specific first. */
export const GENERIC_POSTCODE_CORES: string[] = [
  '[A-Z]{1,2}\\d[A-Z\\d]?\\s?\\d[A-Z]{2}',
  '\\d{5}-\\d{4}',
  '\\d{4}-\\d{3}',
  '\\d{3}-\\d{4}',
  '\\d{5}-\\d{3}',
  '\\d{4}\\s?[A-Z]{2}',
  '\\d{3}\\s?\\d{2}',
  '\\d{4,6}',
];

export function getCountryFormat(code: string | null): CountryFormat | null {
  if (!code) return null;
  return COUNTRY_FORMATS[code] ?? null;
}
