export const US_STATES: { name: string; abbr: string }[] = [
  { name: 'Alabama', abbr: 'AL' }, { name: 'Alaska', abbr: 'AK' }, { name: 'Arizona', abbr: 'AZ' },
  { name: 'Arkansas', abbr: 'AR' }, { name: 'California', abbr: 'CA' }, { name: 'Colorado', abbr: 'CO' },
  { name: 'Connecticut', abbr: 'CT' }, { name: 'Delaware', abbr: 'DE' }, { name: 'Florida', abbr: 'FL' },
  { name: 'Georgia', abbr: 'GA' }, { name: 'Hawaii', abbr: 'HI' }, { name: 'Idaho', abbr: 'ID' },
  { name: 'Illinois', abbr: 'IL' }, { name: 'Indiana', abbr: 'IN' }, { name: 'Iowa', abbr: 'IA' },
  { name: 'Kansas', abbr: 'KS' }, { name: 'Kentucky', abbr: 'KY' }, { name: 'Louisiana', abbr: 'LA' },
  { name: 'Maine', abbr: 'ME' }, { name: 'Maryland', abbr: 'MD' }, { name: 'Massachusetts', abbr: 'MA' },
  { name: 'Michigan', abbr: 'MI' }, { name: 'Minnesota', abbr: 'MN' }, { name: 'Mississippi', abbr: 'MS' },
  { name: 'Missouri', abbr: 'MO' }, { name: 'Montana', abbr: 'MT' }, { name: 'Nebraska', abbr: 'NE' },
  { name: 'Nevada', abbr: 'NV' }, { name: 'New Hampshire', abbr: 'NH' }, { name: 'New Jersey', abbr: 'NJ' },
  { name: 'New Mexico', abbr: 'NM' }, { name: 'New York', abbr: 'NY' }, { name: 'North Carolina', abbr: 'NC' },
  { name: 'North Dakota', abbr: 'ND' }, { name: 'Ohio', abbr: 'OH' }, { name: 'Oklahoma', abbr: 'OK' },
  { name: 'Oregon', abbr: 'OR' }, { name: 'Pennsylvania', abbr: 'PA' }, { name: 'Rhode Island', abbr: 'RI' },
  { name: 'South Carolina', abbr: 'SC' }, { name: 'South Dakota', abbr: 'SD' }, { name: 'Tennessee', abbr: 'TN' },
  { name: 'Texas', abbr: 'TX' }, { name: 'Utah', abbr: 'UT' }, { name: 'Vermont', abbr: 'VT' },
  { name: 'Virginia', abbr: 'VA' }, { name: 'Washington', abbr: 'WA' }, { name: 'West Virginia', abbr: 'WV' },
  { name: 'Wisconsin', abbr: 'WI' }, { name: 'Wyoming', abbr: 'WY' }, { name: 'District of Columbia', abbr: 'DC' },
]

export const CA_PROVINCES: { name: string; abbr: string }[] = [
  { name: 'Alberta', abbr: 'AB' }, { name: 'British Columbia', abbr: 'BC' }, { name: 'Manitoba', abbr: 'MB' },
  { name: 'New Brunswick', abbr: 'NB' }, { name: 'Newfoundland and Labrador', abbr: 'NL' }, { name: 'Nova Scotia', abbr: 'NS' },
  { name: 'Ontario', abbr: 'ON' }, { name: 'Prince Edward Island', abbr: 'PE' }, { name: 'Quebec', abbr: 'QC' }, { name: 'Saskatchewan', abbr: 'SK' },
]

export const REGIONS = [...US_STATES, ...CA_PROVINCES]

export function findRegion(text: string): { name: string; abbr: string; index: number; length: number } | null {
  const lower = text.toLowerCase()
  let best: { name: string; abbr: string; index: number; length: number } | null = null
  for (const r of REGIONS) {
    const idx = lower.indexOf(r.name.toLowerCase())
    if (idx >= 0) {
      // word boundary check
      const before = idx === 0 ? ' ' : lower[idx - 1]
      const after = idx + r.name.length >= lower.length ? ' ' : lower[idx + r.name.length]
      if (!/[a-z]/i.test(before) && !/[a-z]/i.test(after)) {
        if (!best || r.name.length > best.length) best = { ...r, index: idx, length: r.name.length }
      }
      continue
    }
    const abbrIdx = lower.search(new RegExp(`(^|[^a-z])${r.abbr.toLowerCase()}([^a-z]|$)`))
    if (abbrIdx >= 0) {
      const m = new RegExp(`(^|[^a-z])${r.abbr.toLowerCase()}([^a-z]|$)`).exec(lower)
      if (m) {
        const start = abbrIdx + m[1].length
        if (!best || r.abbr.length > best.length) best = { ...r, index: start, length: r.abbr.length }
      }
    }
  }
  return best
}
