import { Routes, Route, Navigate } from 'react-router-dom'
import Shell from '@/components/layout/Shell'
import InstrumentList from '@/components/instruments/InstrumentList'
import InstrumentEditor from '@/components/instruments/InstrumentEditor'
import FluorophoreTable from '@/components/fluorophores/FluorophoreTable'
import AntibodyTable from '@/components/antibodies/AntibodyTable'

function PanelsPage() {
  return <h1 className="text-2xl font-bold">Panels</h1>
}

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/instruments" element={<InstrumentList />} />
        <Route path="/instruments/new" element={<InstrumentEditor />} />
        <Route path="/instruments/:id" element={<InstrumentEditor />} />
        <Route path="/fluorophores" element={<FluorophoreTable />} />
        <Route path="/antibodies" element={<AntibodyTable />} />
        <Route path="/panels" element={<PanelsPage />} />
        <Route path="/" element={<Navigate to="/instruments" replace />} />
      </Route>
    </Routes>
  )
}
