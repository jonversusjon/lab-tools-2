import { Routes, Route, Navigate } from 'react-router-dom'
import Shell from '@/components/layout/Shell'
import ExperimentList from '@/components/experiments/ExperimentList'
import ExperimentPage from '@/components/experiments/ExperimentPage'
import InstrumentList from '@/components/instruments/InstrumentList'
import InstrumentEditor from '@/components/instruments/InstrumentEditor'
import FluorophoreTable from '@/components/fluorophores/FluorophoreTable'
import AntibodyTable from '@/components/antibodies/AntibodyTable'
import PanelList from '@/components/panels/PanelList'
import PanelDesigner from '@/components/panels/PanelDesigner'
import SecondaryList from '@/components/secondaries/SecondaryList'
import DyeLabelList from '@/components/dye-labels/DyeLabelList'
import Settings from '@/components/settings/Settings'
import Homepage from '@/components/home/Homepage'
import PlaceholderPage from '@/components/placeholder/PlaceholderPage'
import PlateMapList from '@/components/plate-maps/PlateMapList'
import PlateMapEditor from '@/components/plate-maps/PlateMapEditor'
import IFPanelList from '@/components/if-panels/IFPanelList'
import IFPanelDesigner from '@/components/if-panels/IFPanelDesigner'
import MicroscopeList from '@/components/microscopes/MicroscopeList'
import MicroscopeEditor from '@/components/microscopes/MicroscopeEditor'

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={<Homepage />} />

        {/* Experiments */}
        <Route path="/experiments" element={<ExperimentList />} />
        <Route path="/experiments/:id" element={<ExperimentPage />} />

        {/* Resources (shared across experiment types) */}
        <Route path="/resources/primaries" element={<AntibodyTable />} />
        <Route path="/resources/secondaries" element={<SecondaryList />} />
        <Route path="/resources/fluorophores" element={<FluorophoreTable />} />
        <Route path="/resources/dyes-labels" element={<DyeLabelList />} />

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

        {/* IF / IHC */}
        <Route path="/if-ihc/panels" element={<IFPanelList />} />
        <Route path="/if-ihc/panels/:id" element={<IFPanelDesigner />} />
        <Route path="/if-ihc/microscopes" element={<MicroscopeList />} />
        <Route path="/if-ihc/microscopes/new" element={<MicroscopeEditor />} />
        <Route path="/if-ihc/microscopes/:id" element={<MicroscopeEditor />} />

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
