import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { call, zeus } from '@/lib/api'
import { useSession } from '@/stores/session'
import { Splash } from '@/pages/Splash'
import { Login } from '@/pages/Login'
import { Setup } from '@/pages/Setup'
import { Unlock } from '@/pages/Unlock'
import { Shell } from '@/components/Shell'
import { Overview } from '@/pages/Overview'
import { Profiles } from '@/pages/Profiles'
import { ProfileForm } from '@/pages/ProfileForm'
import { Dossier } from '@/pages/Dossier'
import { B2bContacts } from '@/pages/B2bContacts'
import { SearchPage } from '@/pages/Search'
import { ImageSearch } from '@/pages/ImageSearch'
import { PersonFinder } from '@/pages/PersonFinder'
import { Categories } from '@/pages/Categories'
import { Countries } from '@/pages/Countries'
import { Favorites } from '@/pages/Favorites'
import { Archived } from '@/pages/Archived'
import { ActivityLogs } from '@/pages/ActivityLogs'
import { UserManagement } from '@/pages/UserManagement'
import { MyAccount } from '@/pages/MyAccount'
import { SettingsPage } from '@/pages/Settings'
import { ImportWizard } from '@/pages/ImportWizard'
import { ExportCenter } from '@/pages/ExportCenter'
import { Backups } from '@/pages/Backups'
import { SecurityCenter } from '@/pages/SecurityCenter'
import { About } from '@/pages/About'
import { Toasts } from '@/components/Toasts'
import { TitleBar } from '@/components/TitleBar'

function VaultRoutes() {
  const navigate = useNavigate()
  const { boot, clear } = useSession()

  useEffect(() => {
    let cancelled = false
    const boot = async () => {
      try {
        const status = await call(zeus.setup.status())
        if (!status.initialized) {
          useSession.getState().setBoot('needs-setup')
          return
        }
        const result = await call(zeus.session.bootstrap())
        if (cancelled) return
        if (result.state === 'authenticated') {
          useSession.getState().setAuthenticated(result.user, result.session.sessionRef, result.session.expiresAt, result.app)
        } else if (result.state === 'locked') {
          useSession.setState({ boot: 'locked', user: result.user })
        } else {
          clear()
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[zeus-vault] boot failed', error)
        if (!cancelled) clear()
      }
    }
    void boot()
    const offLocked = zeus.system.onVaultLocked(() => {
      useSession.getState().setLocked()
      navigate('/unlock', { replace: true })
    })
    return () => {
      cancelled = true
      offLocked()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (boot === 'booting') return <Splash />
  if (boot === 'needs-setup') {
    return (
      <Routes>
        <Route path="/setup" element={<Setup />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    )
  }
  if (boot === 'needs-login') {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }
  if (boot === 'locked') {
    return (
      <Routes>
        <Route path="/unlock" element={<Unlock />} />
        <Route path="*" element={<Navigate to="/unlock" replace />} />
      </Routes>
    )
  }
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/overview" element={<Overview />} />
        <Route path="/profiles" element={<Profiles />} />
        <Route path="/b2b" element={<B2bContacts />} />
        <Route path="/profiles/new" element={<ProfileForm mode="create" />} />
        <Route path="/profiles/:id" element={<Dossier />} />
        <Route path="/profiles/:id/edit" element={<ProfileForm mode="edit" />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/image-search" element={<ImageSearch />} />
        <Route path="/person-finder" element={<PersonFinder />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/countries" element={<Countries />} />
        <Route path="/favorites" element={<Favorites />} />
        <Route path="/archived" element={<Archived />} />
        <Route path="/activity" element={<ActivityLogs />} />
        <Route path="/users" element={<UserManagement />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/account" element={<MyAccount />} />
        <Route path="/import" element={<ImportWizard />} />
        <Route path="/export" element={<ExportCenter />} />
        <Route path="/backups" element={<Backups />} />
        <Route path="/security" element={<SecurityCenter />} />
        <Route path="/about" element={<About />} />
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <div className="vault-stage relative flex h-screen w-screen flex-col overflow-hidden">
      <TitleBar />
      <div className="min-h-0 flex-1">
        <HashRouter>
          <VaultRoutes />
          <Toasts />
        </HashRouter>
      </div>
    </div>
  )
}
