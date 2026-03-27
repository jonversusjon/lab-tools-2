import { Routes, Route, Navigate } from 'react-router-dom'
import Shell from '@/components/layout/Shell'

function InstrumentsPage() {
  return <h1 className="text-2xl font-bold">Instruments</h1>
}

function FluorophoresPage() {
  return <h1 className="text-2xl font-bold">Fluorophores</h1>
}

function AntibodiesPage() {
  return <h1 className="text-2xl font-bold">Antibodies</h1>
}

function PanelsPage() {
  return <h1 className="text-2xl font-bold">Panels</h1>
}

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/instruments" element={<InstrumentsPage />} />
        <Route path="/fluorophores" element={<FluorophoresPage />} />
        <Route path="/antibodies" element={<AntibodiesPage />} />
        <Route path="/panels" element={<PanelsPage />} />
        <Route path="/" element={<Navigate to="/instruments" replace />} />
      </Route>
    </Routes>
  )
}
