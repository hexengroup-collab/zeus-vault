export interface Country {
  name: string
  iso2: string
  iso3: string
  dial: string
  region: string
}

export const COUNTRIES: Country[] = [
  { name: 'Afghanistan', iso2: 'AF', iso3: 'AFG', dial: '+93', region: 'Asia' },
  { name: 'Albania', iso2: 'AL', iso3: 'ALB', dial: '+355', region: 'Europe' },
  { name: 'Algeria', iso2: 'DZ', iso3: 'DZA', dial: '+213', region: 'Africa' },
  { name: 'Argentina', iso2: 'AR', iso3: 'ARG', dial: '+54', region: 'Americas' },
  { name: 'Armenia', iso2: 'AM', iso3: 'ARM', dial: '+374', region: 'Asia' },
  { name: 'Australia', iso2: 'AU', iso3: 'AUS', dial: '+61', region: 'Oceania' },
  { name: 'Austria', iso2: 'AT', iso3: 'AUT', dial: '+43', region: 'Europe' },
  { name: 'Azerbaijan', iso2: 'AZ', iso3: 'AZE', dial: '+994', region: 'Asia' },
  { name: 'Bahrain', iso2: 'BH', iso3: 'BHR', dial: '+973', region: 'Asia' },
  { name: 'Bangladesh', iso2: 'BD', iso3: 'BGD', dial: '+880', region: 'Asia' },
  { name: 'Belarus', iso2: 'BY', iso3: 'BLR', dial: '+375', region: 'Europe' },
  { name: 'Belgium', iso2: 'BE', iso3: 'BEL', dial: '+32', region: 'Europe' },
  { name: 'Bolivia', iso2: 'BO', iso3: 'BOL', dial: '+591', region: 'Americas' },
  { name: 'Bosnia and Herzegovina', iso2: 'BA', iso3: 'BIH', dial: '+387', region: 'Europe' },
  { name: 'Brazil', iso2: 'BR', iso3: 'BRA', dial: '+55', region: 'Americas' },
  { name: 'Bulgaria', iso2: 'BG', iso3: 'BGR', dial: '+359', region: 'Europe' },
  { name: 'Cambodia', iso2: 'KH', iso3: 'KHM', dial: '+855', region: 'Asia' },
  { name: 'Cameroon', iso2: 'CM', iso3: 'CMR', dial: '+237', region: 'Africa' },
  { name: 'Canada', iso2: 'CA', iso3: 'CAN', dial: '+1', region: 'Americas' },
  { name: 'Chile', iso2: 'CL', iso3: 'CHL', dial: '+56', region: 'Americas' },
  { name: 'China', iso2: 'CN', iso3: 'CHN', dial: '+86', region: 'Asia' },
  { name: 'Colombia', iso2: 'CO', iso3: 'COL', dial: '+57', region: 'Americas' },
  { name: 'Costa Rica', iso2: 'CR', iso3: 'CRI', dial: '+506', region: 'Americas' },
  { name: 'Croatia', iso2: 'HR', iso3: 'HRV', dial: '+385', region: 'Europe' },
  { name: 'Cyprus', iso2: 'CY', iso3: 'CYP', dial: '+357', region: 'Europe' },
  { name: 'Czechia', iso2: 'CZ', iso3: 'CZE', dial: '+420', region: 'Europe' },
  { name: 'Denmark', iso2: 'DK', iso3: 'DNK', dial: '+45', region: 'Europe' },
  { name: 'Dominican Republic', iso2: 'DO', iso3: 'DOM', dial: '+1', region: 'Americas' },
  { name: 'Ecuador', iso2: 'EC', iso3: 'ECU', dial: '+593', region: 'Americas' },
  { name: 'Egypt', iso2: 'EG', iso3: 'EGY', dial: '+20', region: 'Africa' },
  { name: 'Estonia', iso2: 'EE', iso3: 'EST', dial: '+372', region: 'Europe' },
  { name: 'Ethiopia', iso2: 'ET', iso3: 'ETH', dial: '+251', region: 'Africa' },
  { name: 'Finland', iso2: 'FI', iso3: 'FIN', dial: '+358', region: 'Europe' },
  { name: 'France', iso2: 'FR', iso3: 'FRA', dial: '+33', region: 'Europe' },
  { name: 'Georgia', iso2: 'GE', iso3: 'GEO', dial: '+995', region: 'Asia' },
  { name: 'Germany', iso2: 'DE', iso3: 'DEU', dial: '+49', region: 'Europe' },
  { name: 'Ghana', iso2: 'GH', iso3: 'GHA', dial: '+233', region: 'Africa' },
  { name: 'Greece', iso2: 'GR', iso3: 'GRC', dial: '+30', region: 'Europe' },
  { name: 'Guatemala', iso2: 'GT', iso3: 'GTM', dial: '+502', region: 'Americas' },
  { name: 'Hong Kong', iso2: 'HK', iso3: 'HKG', dial: '+852', region: 'Asia' },
  { name: 'Hungary', iso2: 'HU', iso3: 'HUN', dial: '+36', region: 'Europe' },
  { name: 'Iceland', iso2: 'IS', iso3: 'ISL', dial: '+354', region: 'Europe' },
  { name: 'India', iso2: 'IN', iso3: 'IND', dial: '+91', region: 'Asia' },
  { name: 'Indonesia', iso2: 'ID', iso3: 'IDN', dial: '+62', region: 'Asia' },
  { name: 'Iran', iso2: 'IR', iso3: 'IRN', dial: '+98', region: 'Asia' },
  { name: 'Iraq', iso2: 'IQ', iso3: 'IRQ', dial: '+964', region: 'Asia' },
  { name: 'Ireland', iso2: 'IE', iso3: 'IRL', dial: '+353', region: 'Europe' },
  { name: 'Israel', iso2: 'IL', iso3: 'ISR', dial: '+972', region: 'Asia' },
  { name: 'Italy', iso2: 'IT', iso3: 'ITA', dial: '+39', region: 'Europe' },
  { name: 'Jamaica', iso2: 'JM', iso3: 'JAM', dial: '+1', region: 'Americas' },
  { name: 'Japan', iso2: 'JP', iso3: 'JPN', dial: '+81', region: 'Asia' },
  { name: 'Jordan', iso2: 'JO', iso3: 'JOR', dial: '+962', region: 'Asia' },
  { name: 'Kazakhstan', iso2: 'KZ', iso3: 'KAZ', dial: '+7', region: 'Asia' },
  { name: 'Kenya', iso2: 'KE', iso3: 'KEN', dial: '+254', region: 'Africa' },
  { name: 'Kuwait', iso2: 'KW', iso3: 'KWT', dial: '+965', region: 'Asia' },
  { name: 'Latvia', iso2: 'LV', iso3: 'LVA', dial: '+371', region: 'Europe' },
  { name: 'Lebanon', iso2: 'LB', iso3: 'LBN', dial: '+961', region: 'Asia' },
  { name: 'Lithuania', iso2: 'LT', iso3: 'LTU', dial: '+370', region: 'Europe' },
  { name: 'Luxembourg', iso2: 'LU', iso3: 'LUX', dial: '+352', region: 'Europe' },
  { name: 'Malaysia', iso2: 'MY', iso3: 'MYS', dial: '+60', region: 'Asia' },
  { name: 'Maldives', iso2: 'MV', iso3: 'MDV', dial: '+960', region: 'Asia' },
  { name: 'Mexico', iso2: 'MX', iso3: 'MEX', dial: '+52', region: 'Americas' },
  { name: 'Moldova', iso2: 'MD', iso3: 'MDA', dial: '+373', region: 'Europe' },
  { name: 'Mongolia', iso2: 'MN', iso3: 'MNG', dial: '+976', region: 'Asia' },
  { name: 'Montenegro', iso2: 'ME', iso3: 'MNE', dial: '+382', region: 'Europe' },
  { name: 'Morocco', iso2: 'MA', iso3: 'MAR', dial: '+212', region: 'Africa' },
  { name: 'Nepal', iso2: 'NP', iso3: 'NPL', dial: '+977', region: 'Asia' },
  { name: 'Netherlands', iso2: 'NL', iso3: 'NLD', dial: '+31', region: 'Europe' },
  { name: 'New Zealand', iso2: 'NZ', iso3: 'NZL', dial: '+64', region: 'Oceania' },
  { name: 'Nigeria', iso2: 'NG', iso3: 'NGA', dial: '+234', region: 'Africa' },
  { name: 'North Macedonia', iso2: 'MK', iso3: 'MKD', dial: '+389', region: 'Europe' },
  { name: 'Norway', iso2: 'NO', iso3: 'NOR', dial: '+47', region: 'Europe' },
  { name: 'Oman', iso2: 'OM', iso3: 'OMN', dial: '+968', region: 'Asia' },
  { name: 'Pakistan', iso2: 'PK', iso3: 'PAK', dial: '+92', region: 'Asia' },
  { name: 'Panama', iso2: 'PA', iso3: 'PAN', dial: '+507', region: 'Americas' },
  { name: 'Peru', iso2: 'PE', iso3: 'PER', dial: '+51', region: 'Americas' },
  { name: 'Philippines', iso2: 'PH', iso3: 'PHL', dial: '+63', region: 'Asia' },
  { name: 'Poland', iso2: 'PL', iso3: 'POL', dial: '+48', region: 'Europe' },
  { name: 'Portugal', iso2: 'PT', iso3: 'PRT', dial: '+351', region: 'Europe' },
  { name: 'Qatar', iso2: 'QA', iso3: 'QAT', dial: '+974', region: 'Asia' },
  { name: 'Romania', iso2: 'RO', iso3: 'ROU', dial: '+40', region: 'Europe' },
  { name: 'Russia', iso2: 'RU', iso3: 'RUS', dial: '+7', region: 'Europe' },
  { name: 'Rwanda', iso2: 'RW', iso3: 'RWA', dial: '+250', region: 'Africa' },
  { name: 'Saudi Arabia', iso2: 'SA', iso3: 'SAU', dial: '+966', region: 'Asia' },
  { name: 'Serbia', iso2: 'RS', iso3: 'SRB', dial: '+381', region: 'Europe' },
  { name: 'Singapore', iso2: 'SG', iso3: 'SGP', dial: '+65', region: 'Asia' },
  { name: 'Slovakia', iso2: 'SK', iso3: 'SVK', dial: '+421', region: 'Europe' },
  { name: 'Slovenia', iso2: 'SI', iso3: 'SVN', dial: '+386', region: 'Europe' },
  { name: 'South Africa', iso2: 'ZA', iso3: 'ZAF', dial: '+27', region: 'Africa' },
  { name: 'South Korea', iso2: 'KR', iso3: 'KOR', dial: '+82', region: 'Asia' },
  { name: 'Spain', iso2: 'ES', iso3: 'ESP', dial: '+34', region: 'Europe' },
  { name: 'Sri Lanka', iso2: 'LK', iso3: 'LKA', dial: '+94', region: 'Asia' },
  { name: 'Sweden', iso2: 'SE', iso3: 'SWE', dial: '+46', region: 'Europe' },
  { name: 'Switzerland', iso2: 'CH', iso3: 'CHE', dial: '+41', region: 'Europe' },
  { name: 'Taiwan', iso2: 'TW', iso3: 'TWN', dial: '+886', region: 'Asia' },
  { name: 'Tanzania', iso2: 'TZ', iso3: 'TZA', dial: '+255', region: 'Africa' },
  { name: 'Thailand', iso2: 'TH', iso3: 'THA', dial: '+66', region: 'Asia' },
  { name: 'Tunisia', iso2: 'TN', iso3: 'TUN', dial: '+216', region: 'Africa' },
  { name: 'Turkey', iso2: 'TR', iso3: 'TUR', dial: '+90', region: 'Asia' },
  { name: 'Uganda', iso2: 'UG', iso3: 'UGA', dial: '+256', region: 'Africa' },
  { name: 'Ukraine', iso2: 'UA', iso3: 'UKR', dial: '+380', region: 'Europe' },
  { name: 'United Arab Emirates', iso2: 'AE', iso3: 'ARE', dial: '+971', region: 'Asia' },
  { name: 'United Kingdom', iso2: 'GB', iso3: 'GBR', dial: '+44', region: 'Europe' },
  { name: 'United States', iso2: 'US', iso3: 'USA', dial: '+1', region: 'Americas' },
  { name: 'Uruguay', iso2: 'UY', iso3: 'URY', dial: '+598', region: 'Americas' },
  { name: 'Uzbekistan', iso2: 'UZ', iso3: 'UZB', dial: '+998', region: 'Asia' },
  { name: 'Venezuela', iso2: 'VE', iso3: 'VEN', dial: '+58', region: 'Americas' },
  { name: 'Vietnam', iso2: 'VN', iso3: 'VNM', dial: '+84', region: 'Asia' },
  { name: 'Zimbabwe', iso2: 'ZW', iso3: 'ZWE', dial: '+263', region: 'Africa' },
]

export const COUNTRY_ALIASES: Record<string, string> = {
  usa: 'US', us: 'US', 'u.s.': 'US', 'u.s.a.': 'US', america: 'US', 'united states of america': 'US',
  uk: 'GB', 'u.k.': 'GB', britain: 'GB', 'great britain': 'GB', england: 'GB', scotland: 'GB', wales: 'GB',
  uae: 'AE', 'u.a.e.': 'AE', emirates: 'AE',
  'south korea': 'KR', korea: 'KR',
  russia: 'RU', 'russian federation': 'RU',
  deutschland: 'DE', holland: 'NL', 'the netherlands': 'NL',
  'czech republic': 'CZ', turkiye: 'TR', 'türkiye': 'TR',
  'ivory coast': 'CI', 'burma': 'MM', 'viet nam': 'VN',
  'republic of ireland': 'IE', 'eire': 'IE',
}

export function countryNameToIso2(input: string | null | undefined): string | null {
  if (!input) return null
  const q = input.trim().toLowerCase()
  if (!q) return null
  const exact = COUNTRIES.find(
    (c) => c.name.toLowerCase() === q || c.iso2.toLowerCase() === q || c.iso3.toLowerCase() === q,
  )
  if (exact) return exact.iso2
  if (COUNTRY_ALIASES[q]) return COUNTRY_ALIASES[q]
  const partial = COUNTRIES.filter((c) => c.name.toLowerCase().startsWith(q))
  if (partial.length === 1) return partial[0].iso2
  return null
}

export function findCountry(input: string | null | undefined): Country | null {
  const iso = countryNameToIso2(input)
  return iso ? COUNTRIES.find((c) => c.iso2 === iso) ?? null : null
}

export function isoToFlag(iso2: string | null | undefined): string {
  if (!iso2 || iso2.length !== 2) return ''
  if (/[A-Z]{2}/.test(iso2)) {
    return String.fromCodePoint(0x1f1e6 + iso2.charCodeAt(0) - 65, 0x1f1e6 + iso2.charCodeAt(1) - 65)
  }
  return ''
}

export function isoToEmojiFallback(iso2: string): string {
  return (iso2 || '').toUpperCase()
}

export function resolveLocationCountry(cityOrState: string): string | null {
  const key = cityOrState.trim().toLowerCase()
  if (!key) return null
  const US_STATES: Record<string, string> = {
    alabama: 'US', alaska: 'US', arizona: 'US', arkansas: 'US', california: 'US', colorado: 'US',
    connecticut: 'US', delaware: 'US', florida: 'US', georgia: 'US', hawaii: 'US', idaho: 'US',
    illinois: 'US', indiana: 'US', iowa: 'US', kansas: 'US', kentucky: 'US', louisiana: 'US',
    maine: 'US', maryland: 'US', massachusetts: 'US', michigan: 'US', minnesota: 'US',
    mississippi: 'US', missouri: 'US', montana: 'US', nebraska: 'US', nevada: 'US',
    'new hampshire': 'US', 'new jersey': 'US', 'new mexico': 'US', 'new york': 'US',
    'north carolina': 'US', 'north dakota': 'US', ohio: 'US', oklahoma: 'US', oregon: 'US',
    pennsylvania: 'US', 'rhode island': 'US', 'south carolina': 'US', 'south dakota': 'US',
    tennessee: 'US', texas: 'US', utah: 'US', vermont: 'US', virginia: 'US', washington: 'US',
    'west virginia': 'US', wisconsin: 'US', wyoming: 'US', 'district of columbia': 'US',
    al: 'US', ak: 'US', az: 'US', ar: 'US', ca: 'US', co: 'US', ct: 'US', de: 'US', fl: 'US',
    ga: 'US', hi: 'US', id: 'US', il: 'US', in: 'US', ia: 'US', ks: 'US', ky: 'US', la: 'US',
    me: 'US', md: 'US', ma: 'US', mi: 'US', mn: 'US', ms: 'US', mo: 'US', mt: 'US', ne: 'US',
    nv: 'US', nh: 'US', nj: 'US', nm: 'US', ny: 'US', nc: 'US', nd: 'US', oh: 'US', ok: 'US',
    or: 'US', pa: 'US', ri: 'US', sc: 'US', sd: 'US', tn: 'US', tx: 'US', ut: 'US', vt: 'US',
    va: 'US', wa: 'US', wv: 'US', wi: 'US', wy: 'US', dc: 'US',
  }
  const CA_PROVINCES: Record<string, string> = {
    ontario: 'CA', quebec: 'CA', 'quebec province': 'CA', alberta: 'CA', 'british columbia': 'CA',
    manitoba: 'CA', saskatchewan: 'CA', 'nova scotia': 'CA', 'new brunswick': 'CA',
    newfoundland: 'CA', 'prince edward island': 'CA', yukon: 'CA', 'northwest territories': 'CA',
    nunavut: 'CA', on: 'CA', qc: 'CA', ab: 'CA', bc: 'CA', mb: 'CA', sk: 'CA', ns: 'CA', nb: 'CA',
  }
  const AU_STATES: Record<string, string> = {
    'new south wales': 'AU', victoria: 'AU', queensland: 'AU', 'western australia': 'AU',
    'south australia': 'AU', tasmania: 'AU', 'northern territory': 'AU', nsw: 'AU', vic: 'AU',
    qld: 'AU', wa: 'AU', sa: 'AU', tas: 'AU', act: 'AU',
  }
  const IN_STATES: Record<string, string> = {
    karnataka: 'IN', maharashtra: 'IN', 'tamil nadu': 'IN', 'west bengal': 'IN', gujarat: 'IN',
    rajasthan: 'IN', punjab: 'IN', telangana: 'IN', kerala: 'IN', 'uttar pradesh': 'IN',
    'andhra pradesh': 'IN', 'madhya pradesh': 'IN', odisha: 'IN', bihar: 'IN', assam: 'IN',
    delhi: 'IN', 'new delhi': 'IN', goa: 'IN', haryana: 'IN',
  }
  const BD_CITIES: Record<string, string> = {
    dhaka: 'BD', chittagong: 'BD', chattogram: 'BD', khulna: 'BD', rajshahi: 'BD', sylhet: 'BD',
    barishal: 'BD', rangpur: 'BD', mymensingh: 'BD', narayanganj: 'BD', gazipur: 'BD', comilla: 'BD',
    'cox\'s bazar': 'BD',
  }
  const CITY_COUNTRY: Record<string, string> = {
    'new york': 'US', 'new york city': 'US', 'los angeles': 'US', chicago: 'US', houston: 'US',
    phoenix: 'US', philadelphia: 'US', 'san antonio': 'US', 'san diego': 'US', dallas: 'US',
    'san jose': 'US', austin: 'US', jacksonville: 'US', columbus: 'US', charlotte: 'US',
    'san francisco': 'US', indianapolis: 'US', seattle: 'US', denver: 'US', boston: 'US',
    nashville: 'US', 'washington dc': 'US', atlanta: 'US', miami: 'US', portland: 'US',
    london: 'GB', manchester: 'GB', birmingham: 'GB', edinburgh: 'GB', glasgow: 'GB',
    liverpool: 'GB', leeds: 'GB', bristol: 'GB',
    toronto: 'CA', vancouver: 'CA', montreal: 'CA', calgary: 'CA', ottawa: 'CA', edmonton: 'CA',
    paris: 'FR', lyon: 'FR', marseille: 'FR', toulouse: 'FR', nice: 'FR', bordeaux: 'FR',
    berlin: 'DE', munich: 'DE', hamburg: 'DE', frankfurt: 'DE', cologne: 'DE', stuttgart: 'DE',
    'frankfurt am main': 'DE', düsseldorf: 'DE', dusseldorf: 'DE',
    madrid: 'ES', barcelona: 'ES', valencia: 'ES', seville: 'ES', sevilla: 'ES',
    rome: 'IT', milan: 'IT', milano: 'IT', naples: 'IT', turin: 'IT', florence: 'IT',
    amsterdam: 'NL', rotterdam: 'NL', utrecht: 'NL', 'the hague': 'NL',
    brussels: 'BE', antwerp: 'BE', zurich: 'CH', geneva: 'CH', lucerne: 'CH',
    vienna: 'AT', stockholm: 'SE', oslo: 'NO', copenhagen: 'DK', helsinki: 'FI',
    lisbon: 'PT', porto: 'PT', dublin: 'IE', warsaw: 'PL', krakow: 'PL', prague: 'CZ',
    budapest: 'HU', athens: 'GR', istanbul: 'TR', ankara: 'TR', moscow: 'RU',
    sydney: 'AU', melbourne: 'AU', brisbane: 'AU', perth: 'AU', adelaide: 'AU', canberra: 'AU',
    auckland: 'NZ', wellington: 'NZ',
    tokyo: 'JP', osaka: 'JP', kyoto: 'JP', seoul: 'KR', busan: 'KR', beijing: 'CN',
    shanghai: 'CN', shenzhen: 'CN', 'hong kong': 'HK', singapore: 'SG', bangkok: 'TH',
    jakarta: 'ID', 'kuala lumpur': 'MY', manila: 'PH', hanoi: 'VN', 'ho chi minh city': 'VN',
    mumbai: 'IN', bangalore: 'IN', bengaluru: 'IN', hyderabad: 'IN', chennai: 'IN', kolkata: 'IN',
    pune: 'IN', ahmedabad: 'IN', jaipur: 'IN',
    karachi: 'PK', lahore: 'PK', islamabad: 'PK',
    cairo: 'EG', 'cape town': 'ZA', johannesburg: 'ZA', lagos: 'NG', nairobi: 'KE',
    'addis ababa': 'ET', casablanca: 'MA', accra: 'GH',
    'mexico city': 'MX', guadalajara: 'MX', 'sao paulo': 'BR', 'são paulo': 'BR',
    'rio de janeiro': 'BR', 'buenos aires': 'AR', santiago: 'CL', lima: 'PE', bogota: 'CO',
    'bogotá': 'CO',
    dubai: 'AE', 'abu dhabi': 'AE', 'riyadh': 'SA', jeddah: 'SA', doha: 'QA',
    'tel aviv': 'IL', jerusalem: 'IL', 'kuwait city': 'KW',
    ...BD_CITIES,
  }
  if (US_STATES[key]) return US_STATES[key]
  if (CA_PROVINCES[key]) return CA_PROVINCES[key]
  if (AU_STATES[key]) return AU_STATES[key]
  if (IN_STATES[key]) return IN_STATES[key]
  if (CITY_COUNTRY[key]) return CITY_COUNTRY[key]
  return null
}

export const KNOWN_CITIES: string[] = Object.keys(
  {
    austin: 1, 'new york': 1, 'los angeles': 1, chicago: 1, houston: 1, dallas: 1, 'san francisco': 1,
    seattle: 1, denver: 1, boston: 1, miami: 1, atlanta: 1, phoenix: 1, 'san diego': 1, nashville: 1,
    london: 1, manchester: 1, birmingham: 1, edinburgh: 1, glasgow: 1,
    toronto: 1, vancouver: 1, montreal: 1, calgary: 1, ottawa: 1,
    paris: 1, lyon: 1, marseille: 1, berlin: 1, munich: 1, hamburg: 1, frankfurt: 1,
    madrid: 1, barcelona: 1, rome: 1, milan: 1, amsterdam: 1, brussels: 1, zurich: 1, geneva: 1,
    vienna: 1, stockholm: 1, oslo: 1, copenhagen: 1, helsinki: 1, lisbon: 1, dublin: 1,
    warsaw: 1, prague: 1, budapest: 1, athens: 1, istanbul: 1, moscow: 1,
    sydney: 1, melbourne: 1, brisbane: 1, perth: 1, auckland: 1,
    tokyo: 1, osaka: 1, seoul: 1, beijing: 1, shanghai: 1, 'hong kong': 1, singapore: 1,
    bangkok: 1, jakarta: 1, 'kuala lumpur': 1, manila: 1, hanoi: 1,
    mumbai: 1, bangalore: 1, bengaluru: 1, hyderabad: 1, chennai: 1, kolkata: 1, pune: 1,
    delhi: 1, 'new delhi': 1, dhaka: 1, chittagong: 1, khulna: 1, sylhet: 1, rajshahi: 1,
    karachi: 1, lahore: 1, islamabad: 1, cairo: 1, lagos: 1, nairobi: 1, johannesburg: 1,
    'cape town': 1, 'mexico city': 1, 'sao paulo': 1, 'rio de janeiro': 1, 'buenos aires': 1,
    santiago: 1, lima: 1, bogota: 1, dubai: 1, 'abu dhabi': 1, riyadh: 1, doha: 1,
    'tel aviv': 1, 'south carolina': 1, texas: 1, california: 1, florida: 1, 'new jersey': 1,
    ontario: 1, quebec: 1, karnataka: 1, maharashtra: 1,
  },
)

export function getDialCode(iso2: string | null | undefined): string {
  const c = findCountry(iso2)
  return c ? c.dial : ''
}

export function dialCodesForIso(iso2: string): string[] {
  return COUNTRIES.filter((c) => c.iso2 === iso2).map((c) => c.dial)
}

export function countryFromDial(dial: string): Country[] {
  return COUNTRIES.filter((c) => c.dial === dial)
}
