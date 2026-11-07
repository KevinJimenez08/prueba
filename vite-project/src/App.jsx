import { useEffect, useState } from 'react';
import GestionRoles from './GestionRoles.jsx';
import ClienteHotel from './ClienteHotel.jsx';
import AccesoHotel from './AccesoHotel.jsx';
import './App.css';

const leerSesion = () => {
  try {
    const sesion = JSON.parse(localStorage.getItem('lunariaSesion') || 'null');
    const token = sesion?.token || sesion?.usuario?.token;
    if (token && !localStorage.getItem('lunariaToken')) localStorage.setItem('lunariaToken', token);
    return sesion;
  } catch { return null; }
};
const normalizarPermiso = (valor = '') => String(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const usuarioEsCliente = (usuario) => Number(usuario?.idRolesFK) === 4 || normalizarPermiso(usuario?.Rol) === 'cliente';
const tienePermisosAdmin = (usuario) => {
  if (!usuario) return false;
  const rol = normalizarPermiso(usuario.Rol);
  if (Number(usuario.idRolesFK) === 1 || rol.includes('superadmin') || rol === 'administrador' || rol === 'admin') return true;
  let raw = usuario.Permisos ?? '';
  if (Array.isArray(raw)) return raw.length > 0;
  if (raw && typeof raw === 'object') return Object.values(raw).some(v => v === true || v === 1 || v === '1');
  try { const parsed = JSON.parse(String(raw)); if (Array.isArray(parsed)) return parsed.length > 0; if (parsed && typeof parsed === 'object') return Object.values(parsed).some(v => v === true || v === 1 || v === '1'); } catch { /* Texto separado por comas. */ }
  const texto = normalizarPermiso(raw);
  if (!texto || ['sinpermisosasignados', 'ninguno', 'ningunpermiso'].includes(texto)) return false;
  return String(raw).split(/[,;|\n]/).some(x => normalizarPermiso(x).length > 0);
};

export default function App() {
  const [sesion, setSesion] = useState(leerSesion);
  const [pantalla, setPantalla] = useState('inicio');
  const [modoAcceso, setModoAcceso] = useState('login');

  useEffect(() => {
    const abrirAcceso = (event) => {
      setModoAcceso(event.detail?.modo || 'login');
      setPantalla('acceso');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    window.addEventListener('lunaria:acceso', abrirAcceso);
    return () => window.removeEventListener('lunaria:acceso', abrirAcceso);
  }, []);

  const entrar = (datos) => {
    localStorage.setItem('lunariaSesion', JSON.stringify(datos));
    if (datos.token) localStorage.setItem('lunariaToken', datos.token);
    setSesion(datos);
    const reservaPendiente = Boolean(sessionStorage.getItem('lunariaReservaPendiente'));
    setPantalla(usuarioEsCliente(datos.usuario) ? (reservaPendiente ? 'inicio' : 'cuenta') : (tienePermisosAdmin(datos.usuario) ? 'admin' : 'inicio'));
  };

  const cerrarSesion = () => {
    localStorage.removeItem('lunariaSesion');
    localStorage.removeItem('lunariaToken');
    localStorage.removeItem('usuarioNombre');
    localStorage.removeItem('usuarioRol');
    setSesion(null);
    setPantalla('inicio');
    setModoAcceso('login');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const rolId = Number(sesion?.usuario?.idRolesFK);
  const puedeAdministrar = Boolean(sesion && !usuarioEsCliente(sesion.usuario) && tienePermisosAdmin(sesion.usuario));

  if (pantalla === 'acceso') return <AccesoHotel modo={modoAcceso} cambiarModo={setModoAcceso} volver={() => setPantalla('inicio')} alEntrar={entrar} />;
  if (pantalla === 'admin') {
    if (!sesion || !puedeAdministrar) return <AccesoHotel modo="login" cambiarModo={setModoAcceso} volver={() => setPantalla('inicio')} alEntrar={entrar} mensaje="Inicia sesión con una cuenta autorizada para el área administrativa." />;
    return <div className="lunaria-admin-shell"><GestionRoles sesion={sesion} onCerrarSesion={cerrarSesion} onVerPaginaPublica={() => setPantalla('inicio')} /></div>;
  }
  if (pantalla === 'cuenta') {
    if (!sesion || !usuarioEsCliente(sesion.usuario)) { setPantalla('inicio'); return null; }
    return <main className="lunaria-account"><header><img src="/img/Logo.jpg" alt="Hotel Lunaria"/><div><h1>Mi cuenta Lunaria</h1><p>Hola, {sesion.usuario.Nombre}. Ya iniciaste sesión.</p></div><button onClick={cerrarSesion}>Cerrar sesión</button><button onClick={() => setPantalla('inicio')}>Volver al hotel</button></header><section><h2>Tu próxima estadía comienza aquí</h2><p>Consulta la disponibilidad desde la página principal, elige una habitación y personaliza tu estadía con paquetes y servicios opcionales.</p><button onClick={() => setPantalla('inicio')}>Explorar habitaciones y servicios</button></section></main>;
  }
  return <ClienteHotel sesion={sesion} onCerrarSesion={cerrarSesion} onReturnToPanel={() => setPantalla('admin')} onOpenAccount={() => setPantalla('cuenta')} />;
}
