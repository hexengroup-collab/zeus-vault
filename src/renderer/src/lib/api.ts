import type { ApiResult } from '@shared/types'
import type { ZeusApi } from '@shared/api'

declare global {
  interface Window {
    zeus: ZeusApi
  }
}

export class ApiFailure extends Error {
  code: string
  fields?: { field: string; message: string }[]
  constructor(message: string, code: string, fields?: { field: string; message: string }[]) {
    super(message)
    this.name = 'ApiFailure'
    this.code = code
    this.fields = fields
  }
}

/** Unwraps an IPC ApiResult, throwing ApiFailure on error. */
export async function call<T>(promise: Promise<ApiResult<T>>): Promise<T> {
  const res = await promise
  if (!res.ok) {
    throw new ApiFailure(res.error?.message ?? 'Unknown error', res.error?.code ?? 'INTERNAL', res.error?.fields)
  }
  return res.result as T
}

export const zeus = window.zeus
