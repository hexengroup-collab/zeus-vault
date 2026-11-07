import type { FieldError } from '../../shared/types'

export class AppError extends Error {
  code: string
  fields?: FieldError[]
  status?: number
  constructor(code: string, message: string, fields?: FieldError[]) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.fields = fields
  }
}

export function assertFound<T>(value: T | null | undefined | false, what = 'Record'): T {
  if (value === null || value === undefined || value === false) {
    throw new AppError('NOT_FOUND', `${what} not found.`)
  }
  return value as T
}

export function validationError(fields: FieldError[]): never {
  throw new AppError('VALIDATION', 'Please correct the highlighted fields.', fields)
}
