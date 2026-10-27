import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth, useStore } from './store/Store'
import Layout from './components/Layout'
import { PageFallback, Spinner } from './components/ui'
import { Login, Profile, Settings } from './pages/Account'

// Each screen is its own chunk, loaded the first time it is opened
const Dashboard = lazy(() => import('./pages/Dashboard'))
const RepDashboard = lazy(() => import('./pages/RepDashboard'))
const Leads = lazy(() => import('./pages/Leads'))
const LeadDetail = lazy(() => import('./pages/LeadDetail'))
const Companies = lazy(() => import('./pages/Companies'))
const CompanyDetail = lazy(() => import('./pages/CompanyDetail'))
const Team = lazy(() => import('./pages/Team'))
const FollowUps = lazy(() => import('./pages/FollowUps'))
const Pipeline = lazy(() => import('./pages/Pipeline'))
const Opportunities = lazy(() => import('./pages/Opportunities'))
const OpportunityDetail = lazy(() => import('./pages/OpportunityDetail'))
const Proposals = lazy(() => import('./pages/Proposals'))
const Invoices = lazy(() => import('./pages/Invoices'))
const Campaigns = lazy(() => import('./pages/Campaigns'))
const CalendarPage = lazy(() => import('./pages/CalendarPage'))
const Services = lazy(() => import('./pages/Services'))
const Messages = lazy(() => import('./pages/Messages'))
const Inquiry = lazy(() => import('./pages/Inquiry'))

function Home() {
  const { me } = useStore()
  return me.role === 'admin' ? <Dashboard /> : <RepDashboard />
}

function Gate() {
  const { phase, reload } = useAuth()
  if (phase.kind === 'loading') return <div className="flex min-h-screen items-center justify-center gap-3 text-[13px] text-muted"><Spinner /> Loading LeadHub…</div>
  if (phase.kind === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-[15px] font-medium">LeadHub could not load</p>
        <p className="max-w-md text-[13px] text-muted">{phase.message}</p>
        <button className="btn-primary" onClick={reload}>Try again</button>
      </div>
    )
  }
  if (phase.kind === 'anon') {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }
  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="my-day" element={<RepDashboard />} />
        <Route path="team" element={<Team />} />
        <Route path="leads" element={<Leads />} />
        <Route path="leads/:id" element={<LeadDetail />} />
        <Route path="companies" element={<Companies />} />
        <Route path="companies/:id" element={<CompanyDetail />} />
        <Route path="follow-ups" element={<FollowUps />} />
        <Route path="pipeline" element={<Pipeline />} />
        <Route path="opportunities" element={<Opportunities />} />
        <Route path="opportunities/:id" element={<OpportunityDetail />} />
        <Route path="proposals" element={<Proposals />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="services" element={<Services />} />
        <Route path="messages" element={<Messages />} />
        <Route path="profile" element={<Profile />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/inquiry" element={<Inquiry />} />
        <Route path="*" element={<Gate />} />
      </Routes>
    </Suspense>
  )
}
