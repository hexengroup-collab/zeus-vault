export interface AddressLike {
  street: string
  apartment: string
  city: string
  state: string
  postalCode: string
  country: string
}

/** Single-line, copyable full address for dossiers and exports. */
export function fullAddress(d: { address: AddressLike }): string {
  const { address } = d
  return [address.street, address.apartment, address.city, address.state, address.postalCode, address.country]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join(', ')
}
