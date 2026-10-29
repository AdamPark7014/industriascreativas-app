import { BrowserRouter, Navigate, Route, Routes, useOutletContext } from 'react-router-dom'
import { tiene, type Sesion } from './api'
import Shell from './shell/Shell'
import DirectoPage from './pages/DirectoPage'
import EscanearPage from './pages/EscanearPage'
import HistorialPage from './pages/HistorialPage'
import LoginPage from './pages/LoginPage'
import PasesPage from './pages/PasesPage'
import ResumenPage from './pages/ResumenPage'

/** La puerta (PDA) no tiene resumen: entra directo al escáner, igual que en FICTI. */
function Inicio() {
  const sesion = useOutletContext<Sesion | null>()
  if (tiene(sesion, 'resumen')) return <ResumenPage />
  return <Navigate to="/escanear" replace />
}

export default function App() {
  return (
    <BrowserRouter basename="/pumpkin">
      <Routes>
        <Route path="login" element={<LoginPage />} />
        <Route path="directo" element={<DirectoPage />} />
        <Route element={<Shell />}>
          <Route index element={<Inicio />} />
          <Route path="escanear" element={<EscanearPage />} />
          <Route path="pases" element={<PasesPage />} />
          <Route path="historial" element={<HistorialPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
