import { create } from 'zustand'

export type ToastTone = 'ok' | 'error' | 'info' | 'amber'

export interface ToastEntry {
  id: number
  title: string
  detail?: string
  tone: ToastTone
}

interface ToastStore {
  toasts: ToastEntry[]
  push: (toast: Omit<ToastEntry, 'id'>) => void
  dismiss: (id: number) => void
}

let counter = 1

export const useToast = create<ToastStore>((set) => ({
  toasts: [],
  push: (toast) => {
    const id = counter++
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...toast, id }] }))
    window.setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 4200)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export function toastOk(title: string, detail?: string) {
  useToast.getState().push({ title, detail, tone: 'ok' })
}
export function toastError(title: string, detail?: string) {
  useToast.getState().push({ title, detail, tone: 'error' })
}
export function toastInfo(title: string, detail?: string) {
  useToast.getState().push({ title, detail, tone: 'info' })
}
