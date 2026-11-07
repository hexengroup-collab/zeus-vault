import { useEffect } from 'react'
import { useLocation, useOutlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { StatusBar } from './StatusBar'
import { Toasts } from './Toasts'
import { call, zeus } from '@/lib/api'
import { applyAppearance } from '@/lib/appearance'

const SECTION_TITLES: Record<string, string> = {
  '/overview': 'Overview',
  '/profiles': 'All Profiles',
  '/b2b': 'B2B Contacts',
  '/profiles/new': 'Create Profile',
  '/search': 'Global Search',
  '/categories': 'Categories',
  '/countries': 'Countries',
  '/favorites': 'Favorites',
  '/archived': 'Archived Profiles',
  '/activity': 'Activity Logs',
  '/users': 'User Management',
  '/settings': 'Settings',
  '/account': 'My Account',
  '/import': 'Import Wizard',
  '/export': 'Export Center',
  '/backups': 'Backup & Restore',
  '/security': 'Security Center',
  '/about': 'About',
}

export function Shell() {
  const outlet = useOutlet()
  const location = useLocation()
  const base = '/' + (location.pathname.split('/')[1] ?? '')
  const section = SECTION_TITLES[base] ?? (base === '/profiles' ? 'Dossier' : 'Zeus Vault')

  useEffect(() => {
    call(zeus.settings.get()).then(applyAppearance).catch(() => void 0)
  }, [])

  useEffect(() => {
    const el = document.getElementById('vault-content')
    el?.scrollTo({ top: 0 })
  }, [location.pathname])

  return (
    <div className="vault-stage relative flex h-full w-full overflow-hidden">
      <div className="vault-grain" />
      <Sidebar />
      <div className="relative z-[1] flex min-w-0 flex-1 flex-col">
        <TopBar section={section.toUpperCase()} />
        <main id="vault-content" className="vault-scroll min-h-0 flex-1 overflow-y-auto">
          {outlet}
        </main>
        <StatusBar />
      </div>
      <Toasts />
    </div>
  )
}
