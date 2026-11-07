import { create } from 'zustand'
import type { AppInfo, SessionUser } from '@shared/types'

export type BootState = 'booting' | 'needs-setup' | 'needs-login' | 'locked' | 'ready'

interface SessionStore {
  boot: BootState
  user: SessionUser | null
  sessionRef: string | null
  sessionExpiresAt: string | null
  app: AppInfo | null
  setBoot: (boot: BootState) => void
  setAuthenticated: (user: SessionUser, sessionRef: string, expiresAt: string, app: AppInfo | null) => void
  setLocked: () => void
  clear: () => void
  setApp: (app: AppInfo) => void
}

export const useSession = create<SessionStore>((set) => ({
  boot: 'booting',
  user: null,
  sessionRef: null,
  sessionExpiresAt: null,
  app: null,
  setBoot: (boot) => set({ boot }),
  setAuthenticated: (user, sessionRef, expiresAt, app) =>
    set({ boot: 'ready', user, sessionRef, sessionExpiresAt: expiresAt, app }),
  setLocked: () => set({ boot: 'locked' }),
  clear: () => set({ boot: 'needs-login', user: null, sessionRef: null, sessionExpiresAt: null, app: null }),
  setApp: (app) => set({ app }),
}))
