import { Navigate, Route, Routes } from 'react-router'
import { ScrollToTop } from './components/ScrollToTop'
import Landing from './pages/Landing'
import { MyRuns, RunView, Simulation } from './pages/Workspace'
import { Dashboard } from './pages/Dashboard'
import { Docs } from './docs/Docs'
import { Lab } from './pages/Lab'
import { Report } from './pages/Report'

export default function App() {
  return <><ScrollToTop /><Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/docs" element={<Docs />} />
    <Route path="/docs/:slug" element={<Docs />} />
    <Route path="/app" element={<Dashboard />} />
    <Route path="/app/sim" element={<Simulation />} />
    <Route path="/app/lab" element={<Lab />} />
    <Route path="/app/lab/report" element={<Report />} />
    <Route path="/app/runs" element={<MyRuns />} />
    <Route path="/app/runs/:id" element={<RunView />} />
    <Route path="/r/:id" element={<RunView />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></>
}
