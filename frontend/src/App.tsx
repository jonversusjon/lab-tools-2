import { Routes, Route, Navigate } from 'react-router-dom'
import Shell from '@/components/layout/Shell'
import InstrumentList from '@/components/instruments/InstrumentList'
import InstrumentEditor from '@/components/instruments/InstrumentEditor'
import FluorophoreTable from '@/components/fluorophores/FluorophoreTable'
import AntibodyTable from '@/components/antibodies/AntibodyTable'
import PanelList from '@/components/panels/PanelList'
import PanelDesigner from '@/components/panels/PanelDesigner'
import SecondaryList from '@/components/secondaries/SecondaryList'
import Settings from '@/components/settings/Settings'

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        {/* Flow Cytometry */}
        <Route path="/flow/instruments" element={<InstrumentList />} />
        <Route path="/flow/instruments/new" element={<InstrumentEditor />} />
        <Route path="/flow/instruments/:id" element={<InstrumentEditor />} />
        <Route path="/flow/fluorophores" element={<FluorophoreTable />} />
        <Route path="/flow/antibodies" element={<AntibodyTable />} />
        <Route path="/flow/secondaries" element={<SecondaryList />} />
        <Route path="/flow/panels" element={<PanelList />} />
        <Route path="/flow/panels/:id" element={<PanelDesigner />} />

        <Route path="/settings" element={<Settings />} />
        <Route path="/" element={<Navigate to="/flow/panels" replace />} />
      </Route>
    </Routes>
  )
}
