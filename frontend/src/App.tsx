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
import Homepage from '@/components/home/Homepage'
import PlaceholderPage from '@/components/placeholder/PlaceholderPage'
import PlateMapList from '@/components/plate-maps/PlateMapList'
import PlateMapEditor from '@/components/plate-maps/PlateMapEditor'

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={<Homepage />} />

        {/* Resources (shared across experiment types) */}
        <Route path="/resources/primaries" element={<AntibodyTable />} />
        <Route path="/resources/secondaries" element={<SecondaryList />} />
        <Route path="/resources/fluorophores" element={<FluorophoreTable />} />

        {/* Flow Cytometry */}
        <Route path="/flow/instruments" element={<InstrumentList />} />
        <Route path="/flow/instruments/new" element={<InstrumentEditor />} />
        <Route path="/flow/instruments/:id" element={<InstrumentEditor />} />
        <Route path="/flow/panels" element={<PanelList />} />
        <Route path="/flow/panels/:id" element={<PanelDesigner />} />

        {/* Legacy redirects — namespace migration */}
        <Route path="/flow/antibodies" element={<Navigate to="/resources/primaries" replace />} />
        <Route path="/flow/secondaries" element={<Navigate to="/resources/secondaries" replace />} />
        <Route path="/flow/fluorophores" element={<Navigate to="/resources/fluorophores" replace />} />
        <Route path="/antibodies" element={<Navigate to="/resources/primaries" replace />} />
        <Route path="/secondaries" element={<Navigate to="/resources/secondaries" replace />} />
        <Route path="/fluorophores" element={<Navigate to="/resources/fluorophores" replace />} />

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

        {/* Plate Maps */}
        <Route path="/plate-maps" element={<PlateMapList />} />
        <Route path="/plate-maps/:id" element={<PlateMapEditor />} />

        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
