import { Routes, Route, Navigate } from 'react-router-dom'
import Shell from '@/components/layout/Shell'
import InstrumentList from '@/components/instruments/InstrumentList'
import InstrumentEditor from '@/components/instruments/InstrumentEditor'
import FluorophoreTable from '@/components/fluorophores/FluorophoreTable'
import AntibodyTable from '@/components/antibodies/AntibodyTable'
import PanelList from '@/components/panels/PanelList'
import PanelDesigner from '@/components/panels/PanelDesigner'
import Settings from '@/components/settings/Settings'

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/instruments" element={<InstrumentList />} />
        <Route path="/instruments/new" element={<InstrumentEditor />} />
        <Route path="/instruments/:id" element={<InstrumentEditor />} />
        <Route path="/fluorophores" element={<FluorophoreTable />} />
        <Route path="/antibodies" element={<AntibodyTable />} />
        <Route path="/panels" element={<PanelList />} />
        <Route path="/panels/:id" element={<PanelDesigner />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/" element={<Navigate to="/instruments" replace />} />
      </Route>
    </Routes>
  )
}
