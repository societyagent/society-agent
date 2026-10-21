import { Navigate, Route, Routes } from 'react-router'
import Landing from './pages/Landing'
import { Dashboard, MyRuns, RunView, Simulation } from './pages/Workspace'

export default function App() {
  return <Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/app" element={<Dashboard />} />
    <Route path="/app/sim" element={<Simulation />} />
    <Route path="/app/runs" element={<MyRuns />} />
    <Route path="/app/runs/:id" element={<RunView />} />
    <Route path="/r/:id" element={<RunView />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
}
