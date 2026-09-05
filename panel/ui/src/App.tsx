import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import OpsShell from './shell/OpsShell'
import HubPage from './pages/HubPage'
import EscanearPage from './pages/EscanearPage'
import BuscarPage from './pages/BuscarPage'
import ReportesPage from './pages/ReportesPage'
import ZonasPage from './pages/ZonasPage'

export default function App() {
  return (
    <BrowserRouter basename="/accesos">
      <Routes>
        <Route element={<OpsShell />}>
          <Route index element={<HubPage />} />
          <Route path="escanear" element={<EscanearPage />} />
          <Route path="movil" element={<Navigate to="/escanear" replace />} />
          <Route path="buscar" element={<BuscarPage />} />
          <Route path="reportes" element={<ReportesPage />} />
          <Route path="zonas" element={<ZonasPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
