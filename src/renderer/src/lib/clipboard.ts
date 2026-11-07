let clearTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Copies a value to the clipboard. Sensitive values clear themselves after
 * `clearAfterSeconds` (defaults to 30s, 0 disables auto-clear).
 */
export async function copyText(value: string, clearAfterSeconds = 30): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
  } catch {
    // Fallback for environments where the async clipboard API is unavailable
    const ta = document.createElement('textarea')
    ta.value = value
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    ta.remove()
    if (!ok) return false
  }
  if (clearAfterSeconds > 0) {
    if (clearTimer) clearTimeout(clearTimer)
    clearTimer = setTimeout(() => {
      void navigator.clipboard.writeText('').catch(() => void 0)
    }, clearAfterSeconds * 1000)
  }
  return true
}

export function fullAddressCopy(d: { street: string; apartment: string; city: string; state: string; postalCode: string; country: string }): string {
  return [d.street, d.apartment, d.city, d.state, d.postalCode, d.country].map((s) => s.trim()).filter(Boolean).join(', ')
}
