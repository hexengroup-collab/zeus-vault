// Deterministic local text embeddings — hashed bag-of-words, no model,
// no network. 256-dim vectors used for semantic search inside the vault.
export const EMBED_DIM = 256

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'are', 'was', 'has', 'had', 'have', 'whose', 'which', 'about', 'into', 'also', 'their', 'there', 'been'])

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#@.-]+/)
    .filter((t) => t.length >= 2 && !STOP.has(t))
}

function fnv(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h
}

export function embedText(text: string): number[] {
  const v = Array.from({ length: EMBED_DIM }, () => 0)
  for (const tok of tokenize(text)) {
    v[fnv(tok) % EMBED_DIM] += 1
  }
  const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1
  return v.map((x) => x / norm)
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}
