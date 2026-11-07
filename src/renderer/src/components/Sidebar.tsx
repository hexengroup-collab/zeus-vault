import { NavLink, useLocation } from 'react-router-dom'
import {
  Activity,
  Archive,
  Building2,
  ChevronRight,
  Download,
  Fingerprint,
  Globe2,
  Home,
  Layers,
  Lock,
  NotebookPen,
  PlusCircle,
  Search,
  Settings,
  Star,
  Upload,
  Users,
  UserCircle2,
  Database,
  ShieldCheck,
} from 'lucide-react'
import { VaultMark } from './VaultMark'
import { useSession } from '@/stores/session'
import { APP_VERSION } from '@shared/constants'
import { bytes } from '@/lib/format'

interface NavItem {
  to: string
  label: string
  icon: typeof Home
}

const OVERVIEW: NavItem[] = [{ to: '/overview', label: 'Overview', icon: Home }]
const INTELLIGENCE: NavItem[] = [
  { to: '/profiles', label: 'All Profiles', icon: Layers },
  { to: '/b2b', label: 'B2B Contacts', icon: Building2 },
  { to: '/profiles/new', label: 'Create Profile', icon: PlusCircle },
  { to: '/search', label: 'Global Search', icon: Search },
  { to: '/categories', label: 'Categories', icon: Archive },
  { to: '/countries', label: 'Countries', icon: Globe2 },
  { to: '/favorites', label: 'Favorites', icon: Star },
  { to: '/archived', label: 'Archived Profiles', icon: Archive },
]
const ADMINISTRATION_BASE: NavItem[] = [
  { to: '/activity', label: 'Activity Logs', icon: Activity },
  { to: '/import', label: 'Import Wizard', icon: Upload },
  { to: '/export', label: 'Export Center', icon: Download },
  { to: '/backups', label: 'Backup & Restore', icon: Database },
  { to: '/security', label: 'Security Center', icon: ShieldCheck },
]

export function Sidebar() {
  const { user, app } = useSession()
  const isAdmin = user?.role === 'admin'
  const location = useLocation()
  const section = (title: string) => (
    <div className="mt-5 px-4 font-mono text-[9px] font-semibold uppercase tracking-[0.28em] text-vault-muted">{title}</div>
  )
  const item = (nav: NavItem) => {
    const active = location.pathname === nav.to || (nav.to !== '/overview' && location.pathname.startsWith(nav.to + '/'))
    const Icon = nav.icon
    return (
      <NavLink
        key={nav.to}
        to={nav.to}
        end={nav.to === '/profiles/new'}
        className={`group relative flex items-center gap-2.5 px-4 py-[7px] text-[11.5px] transition-colors duration-150 ${
          active ? 'bg-white/[0.045] text-vault-text' : 'text-vault-text2 hover:bg-white/[0.025] hover:text-vault-text'
        }`}
      >
        <span className={`absolute left-0 top-0 h-full w-[2px] ${active ? 'bg-vault-red' : 'bg-transparent'}`} />
        <Icon size={13} strokeWidth={1.6} className={active ? 'text-vault-red' : 'text-vault-muted group-hover:text-vault-text2'} />
        <span className="font-medium">{nav.label}</span>
        <ChevronRight size={11} className={`ml-auto transition-opacity ${active ? 'opacity-40' : 'opacity-0 group-hover:opacity-40'}`} />
      </NavLink>
    )
  }

  return (
    <aside className="relative z-10 flex h-full w-[228px] shrink-0 flex-col border-r border-vault-border-soft bg-[#0B0D10]">
      <div className="flex items-center gap-2.5 border-b border-vault-border-soft px-4 py-4">
        <VaultMark size={30} />
        <div className="leading-tight">
          <div className="font-condensed text-[19px] font-bold leading-none tracking-[0.14em] text-vault-text">
            ZEUS<span className="text-vault-red"> VAULT</span>
          </div>
          <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.32em] text-vault-muted">Intelligence Archive</div>
        </div>
      </div>

      <nav className="vault-scroll flex-1 overflow-y-auto pb-4" aria-label="Primary">
        {section('Overview')}
        {OVERVIEW.map(item)}
        {section('Intelligence')}
        {INTELLIGENCE.map(item)}
        {section('Administration')}
        {ADMINISTRATION_BASE.map(item)}
        {isAdmin && item({ to: '/users', label: 'User Management', icon: Users })}
        {item({ to: '/about', label: 'About', icon: NotebookPen })}
        {item({ to: '/settings', label: 'Settings', icon: Settings })}
        {item({ to: '/account', label: 'My Account', icon: UserCircle2 })}
      </nav>

      <div className="border-t border-vault-border-soft px-4 py-3">
        <div className="flex items-center justify-between font-mono text-[8.5px] uppercase tracking-[0.18em] text-vault-muted">
          <span className="flex items-center gap-1.5"><Lock size={9} />AES-256-GCM</span>
          <span>v{APP_VERSION}</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between font-mono text-[8.5px] uppercase tracking-[0.18em] text-vault-muted">
          <span>{app ? `DB ${bytes(app.dbBytes)}` : 'DB - '}</span>
          <span className="flex items-center gap-1.5"><Fingerprint size={9} />{app ? app.fingerprints.field.toString(16).toUpperCase().padStart(8, '0').slice(0, 8) : ' - '}</span>
        </div>
      </div>
    </aside>
  )
}
