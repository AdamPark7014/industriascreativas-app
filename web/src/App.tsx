import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import HomePage from './pages/HomePage'
import EmpresariosPage from './pages/EmpresariosPage'
import EstudiantesPage from './pages/EstudiantesPage'
import EventoElisaPage from './pages/EventoElisaPage'
import EscanearPage from './pages/EscanearPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/empresarios" element={<EmpresariosPage />} />
        <Route path="/estudiantes" element={<EstudiantesPage />} />
        <Route path="/alumnos" element={<Navigate to="/estudiantes" replace />} />
        <Route path="/eventoelisa" element={<EventoElisaPage />} />
        <Route path="/escanear" element={<EscanearPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
