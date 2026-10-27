import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth, useStore } from './store/Store'
import Layout from './components/Layout'
import { Spinner } from './components/ui'
import Dashboard from './pages/Dashboard'
import RepDashboard from './pages/RepDashboard'
import Leads from './pages/Leads'
import LeadDetail from './pages/LeadDetail'
import Companies from './pages/Companies'
import CompanyDetail from './pages/CompanyDetail'
import Team from './pages/Team'
import FollowUps from './pages/FollowUps'
import Pipeline from './pages/Pipeline'
import Opportunities from './pages/Opportunities'
import OpportunityDetail from './pages/OpportunityDetail'
import Proposals from './pages/Proposals'
import Invoices from './pages/Invoices'
import Campaigns from './pages/Campaigns'
import CalendarPage from './pages/CalendarPage'
import Services from './pages/Services'
import Messages from './pages/Messages'
import Inquiry from './pages/Inquiry'
import { Login, Profile, Settings } from './pages/Account'

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
    <Routes>
      <Route path="/inquiry" element={<Inquiry />} />
      <Route path="*" element={<Gate />} />
    </Routes>
  )
}
