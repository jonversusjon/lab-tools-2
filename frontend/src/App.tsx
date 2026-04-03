import { Routes, Route } from 'react-router-dom'
import Shell from '@/components/layout/Shell'
import InstrumentList from '@/components/instruments/InstrumentList'
import InstrumentEditor from '@/components/instruments/InstrumentEditor'
import FluorophoreTable from '@/components/fluorophores/FluorophoreTable'
import AntibodyTable from '@/components/antibodies/AntibodyTable'
import PanelList from '@/components/panels/PanelList'
import PanelDesigner from '@/components/panels/PanelDesigner'
import SecondaryList from '@/components/secondaries/SecondaryList'
import Settings from '@/components/settings/Settings'
import Homepage from '@/components/home/Homepage'
import PlaceholderPage from '@/components/placeholder/PlaceholderPage'

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={<Homepage />} />

        {/* Flow Cytometry */}
        <Route path="/flow/instruments" element={<InstrumentList />} />
        <Route path="/flow/instruments/new" element={<InstrumentEditor />} />
        <Route path="/flow/instruments/:id" element={<InstrumentEditor />} />
        <Route path="/flow/fluorophores" element={<FluorophoreTable />} />
        <Route path="/flow/antibodies" element={<AntibodyTable />} />
        <Route path="/flow/secondaries" element={<SecondaryList />} />
        <Route path="/flow/panels" element={<PanelList />} />
        <Route path="/flow/panels/:id" element={<PanelDesigner />} />

        {/* IF / IHC (placeholder) */}
        <Route
          path="/if-ihc/protocols"
          element={
            <PlaceholderPage
              title="IF / IHC Protocols"
              description="Plan and manage your immunofluorescence and immunohistochemistry staining protocols."
              icon="📝"
            />
          }
        />
        <Route
          path="/if-ihc/experiments"
          element={
            <PlaceholderPage
              title="IF / IHC Experiments"
              description="Track experiments, imaging sessions, and results."
              icon="🧪"
            />
          }
        />

        {/* qPCR (placeholder) */}
        <Route
          path="/qpcr/primers"
          element={
            <PlaceholderPage
              title="Primer Library"
              description="Manage your qPCR primer inventory and validated pairs."
              icon="🧪"
            />
          }
        />
        <Route
          path="/qpcr/plates"
          element={
            <PlaceholderPage
              title="qPCR Plates"
              description="Design plate layouts, assign samples, and track runs."
              icon="📋"
            />
          }
        />

        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
