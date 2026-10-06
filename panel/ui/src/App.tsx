import { BrowserRouter, Navigate, Route, Routes, useOutletContext } from 'react-router-dom'
import { tiene, type Sesion } from './api'
import OpsShell, { PERMISOS_RESUMEN } from './shell/OpsShell'
import HubPage from './pages/HubPage'
import EscanearPage from './pages/EscanearPage'
import BuscarPage from './pages/BuscarPage'
import MesaPage from './pages/MesaPage'
import RegistroPage from './pages/RegistroPage'
import ReportesPage from './pages/ReportesPage'
import ZonasPage from './pages/ZonasPage'

/** Las mesas de registro e impresión no tienen resumen: entran directo a su pantalla. */
function Inicio() {
  const sesion = useOutletContext<Sesion | null>()
  if (PERMISOS_RESUMEN.some((p) => tiene(sesion, p))) return <HubPage />
  if (tiene(sesion, 'registrar')) return <Navigate to="/registro" replace />
  if (tiene(sesion, 'buscar')) return <Navigate to="/buscar" replace />
  return <HubPage />
}

export default function App() {
  return (
    <BrowserRouter basename="/accesos">
      <Routes>
        <Route element={<OpsShell />}>
          <Route index element={<Inicio />} />
          <Route path="registro" element={<RegistroPage />} />
          <Route path="buscar" element={<BuscarPage />} />
          <Route path="mesa" element={<MesaPage />} />
          <Route path="escanear" element={<EscanearPage />} />
          <Route path="movil" element={<Navigate to="/escanear" replace />} />
          <Route path="reportes" element={<ReportesPage />} />
          <Route path="zonas" element={<ZonasPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
