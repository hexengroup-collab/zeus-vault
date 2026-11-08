import { contextBridge, ipcRenderer } from 'electron'
import type { ZeusApi } from '../shared/api'

const invoke = <T>(channel: string) => (payload?: unknown) =>
  ipcRenderer.invoke(channel, payload) as Promise<T>

const api: ZeusApi = {
  setup: {
    status: invoke('setup:status') as ZeusApi['setup']['status'],
    initialize: invoke('setup:initialize') as ZeusApi['setup']['initialize'],
  },
  session: {
    bootstrap: () => ipcRenderer.invoke('session:bootstrap'),
    login: (payload) => ipcRenderer.invoke('session:login', payload),
    unlock: (payload) => ipcRenderer.invoke('session:unlock', payload),
    lock: () => ipcRenderer.invoke('session:lock'),
    logout: () => ipcRenderer.invoke('session:logout'),
    touch: () => ipcRenderer.invoke('session:touch'),
    appInfo: () => ipcRenderer.invoke('session:appInfo'),
  },
  dashboard: {
    overview: () => ipcRenderer.invoke('dashboard:overview'),
  },
  profiles: {
    list: (query) => ipcRenderer.invoke('profiles:list', query),
    get: (id) => ipcRenderer.invoke('profiles:get', id),
    create: (input) => ipcRenderer.invoke('profiles:create', input),
    update: (payload) => ipcRenderer.invoke('profiles:update', payload),
    archive: (id) => ipcRenderer.invoke('profiles:archive', id),
    restore: (id) => ipcRenderer.invoke('profiles:restore', id),
    remove: (id) => ipcRenderer.invoke('profiles:delete', id),
    duplicate: (id) => ipcRenderer.invoke('profiles:duplicate', id),
    toggleFavorite: (id) => ipcRenderer.invoke('profiles:toggleFavorite', id),
    fieldHistory: (id) => ipcRenderer.invoke('profiles:fieldHistory', id),
    audit: (id) => ipcRenderer.invoke('profiles:audit', id),
    setAvatar: (payload) => ipcRenderer.invoke('profiles:setAvatar', payload),
    addGalleryImage: (payload) => ipcRenderer.invoke('profiles:addGalleryImage', payload),
    removeGalleryImage: (id) => ipcRenderer.invoke('profiles:removeGalleryImage', id),
    addAttachment: (payload) => ipcRenderer.invoke('profiles:addAttachment', payload),
    removeAttachment: (id) => ipcRenderer.invoke('profiles:removeAttachment', id),
    composeCopyText: (payload) => ipcRenderer.invoke('profiles:composeCopyText', payload),
  },
  search: {
    query: (payload) => ipcRenderer.invoke('search:query', payload),
    saved: () => ipcRenderer.invoke('search:saved'),
    save: (payload) => ipcRenderer.invoke('search:save', payload),
    deleteSaved: (id) => ipcRenderer.invoke('search:deleteSaved', id),
    recent: () => ipcRenderer.invoke('search:recent'),
    tags: () => ipcRenderer.invoke('search:tags'),
    countryStats: () => ipcRenderer.invoke('search:countryStats'),
  },
  nlp: {
    extract: (text) => ipcRenderer.invoke('nlp:extract', text),
    interpret: (text) => ipcRenderer.invoke('nlp:interpret', text),
    aliases: () => ipcRenderer.invoke('nlp:aliases'),
    addAlias: (payload) => ipcRenderer.invoke('nlp:addAlias', payload),
    deleteAlias: (alias) => ipcRenderer.invoke('nlp:deleteAlias', alias),
    embedAll: () => ipcRenderer.invoke('nlp:embedAll'),
    semantic: (text) => ipcRenderer.invoke('nlp:semantic', text),
  },
  photos: {
    status: () => ipcRenderer.invoke('photos:status'),
    enqueueAll: () => ipcRenderer.invoke('photos:enqueueAll'),
    search: (payload) => ipcRenderer.invoke('photos:search', payload),
    recheck: (profileId) => ipcRenderer.invoke('photos:recheck', profileId),
    profile: (profileId) => ipcRenderer.invoke('photos:profile', profileId),
    matchFace: (payload) => ipcRenderer.invoke('photos:matchFace', payload),
    saveGeom: (payload) => ipcRenderer.invoke('photos:saveGeom', payload),
    saveDesc: (payload) => ipcRenderer.invoke('photos:saveDesc', payload),
    inherit: (payload) => ipcRenderer.invoke('photos:inherit', payload),
    saveFace: (payload) => ipcRenderer.invoke('photos:saveFace', payload),
    docStatus: () => ipcRenderer.invoke('docs:status'),
    ocrAll: () => ipcRenderer.invoke('docs:ocrAll'),
    docSearch: (text) => ipcRenderer.invoke('docs:search', text),
  },
  categories: {
      list: () => ipcRenderer.invoke('categories:list'),
    create: (input) => ipcRenderer.invoke('categories:create', input),
    update: (payload) => ipcRenderer.invoke('categories:update', payload),
    delete: (payload) => ipcRenderer.invoke('categories:delete', payload),
  },
  audit: {
    list: (query) => ipcRenderer.invoke('audit:list', query),
    verify: () => ipcRenderer.invoke('audit:verify'),
  },
  users: {
    list: () => ipcRenderer.invoke('users:list'),
    create: (input) => ipcRenderer.invoke('users:create', input),
    update: (payload) => ipcRenderer.invoke('users:update', payload),
    resetPassword: (payload) => ipcRenderer.invoke('users:resetPassword', payload),
    sessions: (id) => ipcRenderer.invoke('users:sessions', id),
    revokeSessions: (id) => ipcRenderer.invoke('users:revokeSessions', id),
    loginHistory: (id) => ipcRenderer.invoke('users:loginHistory', id),
  },
  account: {
    updateProfile: (payload) => ipcRenderer.invoke('account:updateProfile', payload),
    setAvatar: (dataUrl) => ipcRenderer.invoke('account:setAvatar', dataUrl),
    changePassword: (payload) => ipcRenderer.invoke('account:changePassword', payload),
    sessions: () => ipcRenderer.invoke('account:sessions'),
    revokeSession: (sessionId) => ipcRenderer.invoke('account:revokeSession', sessionId),
    logoutAll: () => ipcRenderer.invoke('account:logoutAll'),
    loginHistory: () => ipcRenderer.invoke('account:loginHistory'),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch) => ipcRenderer.invoke('settings:update', patch),
  },
  importexport: {
    pickFile: () => ipcRenderer.invoke('import:pickFile'),
    pickSave: (payload) => ipcRenderer.invoke('export:pickSave', payload),
    preview: (filePath) => ipcRenderer.invoke('import:preview', filePath),
    execute: (payload) => ipcRenderer.invoke('import:execute', payload),
    exportProfiles: (payload) => ipcRenderer.invoke('export:profiles', payload),
    exportDossier: (payload) => ipcRenderer.invoke('export:dossier', payload),
    showItem: (filePath) => ipcRenderer.invoke('export:showItem', filePath),
  },
  backup: {
    create: (payload) => ipcRenderer.invoke('backup:create', payload),
    list: () => ipcRenderer.invoke('backup:list'),
    delete: (id) => ipcRenderer.invoke('backup:delete', id),
    restore: (id) => ipcRenderer.invoke('backup:restore', id),
  },
  b2b: {
    list: (query) => ipcRenderer.invoke('b2b:list', query),
    get: (id) => ipcRenderer.invoke('b2b:get', id),
    create: (input) => ipcRenderer.invoke('b2b:create', input),
    update: (payload) => ipcRenderer.invoke('b2b:update', payload),
    setFavorite: (payload) => ipcRenderer.invoke('b2b:setFavorite', payload),
    remove: (id) => ipcRenderer.invoke('b2b:delete', id),
    industries: () => ipcRenderer.invoke('b2b:industries'),
    exportCsv: (query) => ipcRenderer.invoke('b2b:exportCsv', query),
  },
  security: {
    integrity: () => ipcRenderer.invoke('security:integrity'),
    center: () => ipcRenderer.invoke('security:center'),
    verifyAudit: () => ipcRenderer.invoke('security:verifyAudit'),
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximizedChange: (callback: (v: boolean) => void) => {
      const listener = (_event: unknown, v: boolean) => callback(v)
      ipcRenderer.on('window:maximized', listener)
      return () => ipcRenderer.removeListener('window:maximized', listener)
    },
  },
  mcp: {
    getInfo: () => ipcRenderer.invoke('mcp:getInfo'),
    regenerateToken: () => ipcRenderer.invoke('mcp:regenerateToken'),
    setEnabled: (enabled) => ipcRenderer.invoke('mcp:setEnabled', enabled),
  },
  apikeys: {
    generate: (label) => ipcRenderer.invoke('apikeys:generate', label),
    list: () => ipcRenderer.invoke('apikeys:list'),
    revoke: (id) => ipcRenderer.invoke('apikeys:revoke', id),
  },
  system: {
    onVaultLocked: (callback: () => void) => {
      const listener = () => callback()
      ipcRenderer.on('zeus:locked', listener)
      return () => ipcRenderer.removeListener('zeus:locked', listener)
    },
  },
}

contextBridge.exposeInMainWorld('zeus', api)
