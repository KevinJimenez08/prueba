import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BedDouble, CalendarDays, Check, Menu, Sparkles, Waves, X, UserRound, LogOut, LayoutDashboard, ChevronDown, Search, LoaderCircle } from 'lucide-react';
import './ClienteHotel.css';

const API = 'https://hotel-lunaria-backend-prueba.onrender.com/api';
const COP = (n) => Number(n || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
// Una ruta vacía/null significa que el registro no tiene fotografía. No se asignan imágenes de respaldo.
const imagePath = (value) => {
  const path = typeof value === 'string' ? value.trim() : '';
  if (!path) return '';
  return path.startsWith('/') || /^https?:\/\//i.test(path) ? path : `/${path}`;
};
const activeRecord = (item) => item.estado === undefined || item.estado === null || item.estado === '' || Number(item.estado) === 1 || String(item.estado).toLowerCase() === 'activo';
const leerReservaPendiente = () => { try { return JSON.parse(sessionStorage.getItem('lunariaReservaPendiente') || 'null'); } catch { return null; } };

export default function ClienteHotel({ sesion = null, onCerrarSesion, onReturnToPanel, onOpenAccount }) {
  const [habitaciones, setHabitaciones] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [paquetes, setPaquetes] = useState([]);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [menuSesionAbierto, setMenuSesionAbierto] = useState(false);
  const [filtro, setFiltro] = useState('Todas');
  const [reserva, setReserva] = useState(() => leerReservaPendiente()?.reserva || { llegada: '', salida: '', personas: '2' });
  const [busqueda, setBusqueda] = useState({ cargando: false, consultada: false, error: '', habitaciones: [] });
  const [habitacionElegida, setHabitacionElegida] = useState(() => leerReservaPendiente()?.habitacionElegida || '');
  const [paqueteElegido, setPaqueteElegido] = useState(() => leerReservaPendiente()?.paqueteElegido || '');
  const [serviciosElegidos, setServiciosElegidos] = useState(() => leerReservaPendiente()?.serviciosElegidos?.map(Number) || []);
  const [reservaEstado, setReservaEstado] = useState({ cargando: false, error: '', mensaje: '' });

  useEffect(() => {
    let cancelado = false;
    const cargar = async (ruta, setter) => {
      try {
        const response = await fetch(`${API}/${ruta}`);
        if (!response.ok) throw new Error(`No se pudo cargar ${ruta}`);
        const data = await response.json();
        if (!cancelado) setter(Array.isArray(data) ? data.filter(activeRecord) : []);
      } catch (error) {
        console.error(error);
        if (!cancelado) setter([]);
      }
    };
    cargar('habitaciones', setHabitaciones);
    cargar('servicios', setServicios);
    cargar('paquetes', setPaquetes);
    // Si el huésped tuvo que iniciar sesión para reservar, recuperamos su selección y volvemos a consultar disponibilidad.
    try {
      const pendingRaw = sessionStorage.getItem('lunariaReservaPendiente');
      if (pendingRaw) {
        const pending = JSON.parse(pendingRaw);
        if (pending.reserva?.llegada && pending.reserva?.salida) {
          const params = new URLSearchParams({ llegada: pending.reserva.llegada, salida: pending.reserva.salida, personas: pending.reserva.personas || '2' });
          fetch(`${API}/disponibilidad?${params.toString()}`).then(async response => {
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.mensaje || 'No fue posible consultar disponibilidad.');
            if (!cancelado) {
              const disponibles = Array.isArray(data.habitaciones) ? data.habitaciones : [];
              setBusqueda({ cargando: false, consultada: true, error: '', habitaciones: disponibles });
              const paquetePendiente = paquetes.find(p => String(p.idPaquetes) === String(pending.paqueteElegido));
              const habitacionBase = paquetePendiente?.idHabitacionesFK ? habitaciones.find(h => String(h.idHabitaciones) === String(paquetePendiente.idHabitacionesFK)) : null;
              const elegida = disponibles.find(h => String(h.idHabitaciones) === String(pending.habitacionElegida))
                || (habitacionBase ? disponibles.find(h => String(h.tipo || '').trim().toLowerCase() === String(habitacionBase.tipo || '').trim().toLowerCase()) : null);
              if (elegida) setHabitacionElegida(String(elegida.idHabitaciones));
            }
          }).catch(error => { if (!cancelado) setBusqueda({ cargando: false, consultada: true, error: error.message, habitaciones: [] }); });
        }
      }
    } catch { sessionStorage.removeItem('lunariaReservaPendiente'); }
    return () => { cancelado = true; };
  }, []);

  const tipos = useMemo(() => ['Todas', ...new Set(habitaciones.map(h => h.tipo).filter(Boolean))], [habitaciones]);
  const habitacionesFiltradas = habitaciones.filter(h => filtro === 'Todas' || h.tipo === filtro);
  const paqueteActual = paquetes.find(p => String(p.idPaquetes) === String(paqueteElegido));
  const habitacionPaqueteId = paqueteActual?.idHabitacionesFK ? String(paqueteActual.idHabitacionesFK) : '';
  const nochesEstadia = reserva.llegada && reserva.salida && reserva.salida > reserva.llegada ? Math.max(1, Math.round((Date.parse(`${reserva.salida}T00:00:00Z`) - Date.parse(`${reserva.llegada}T00:00:00Z`)) / 86400000)) : 0;
  const habitacionPaquete = habitaciones.find(h => String(h.idHabitaciones) === habitacionPaqueteId);
  const habitacionSeleccionada = busqueda.habitaciones.find(h => String(h.idHabitaciones) === String(habitacionElegida));
  const serviciosIncluidos = (paqueteActual?.serviciosIncluidos || []).map(Number);
  const capacidadDeHabitacion = (h) => Math.max(1, Number.parseInt(String(h?.capacidad || '').match(/\d+/)?.[0] || '1', 10));
  const asignacionEstimada = useMemo(() => {
    if (!busqueda.consultada || !busqueda.habitaciones.length) return [];
    let pendientes = Math.max(1, Number.parseInt(reserva.personas, 10) || 1);
    const disponibles = [...busqueda.habitaciones];
    const asignadas = [];
    const unidadesUsadas = new Map();
    const unidadesDe = (h) => Math.max(0, Number.parseInt(h.unidadesDisponibles ?? h.cantidad ?? 1, 10) || 0);
    const agregar = (h, incluida = false) => {
      const personasAsignadas = Math.min(pendientes, capacidadDeHabitacion(h));
      const existente = asignadas.find(x => Number(x.idHabitaciones) === Number(h.idHabitaciones));
      if (existente) {
        existente.cantidadHabitaciones += 1;
        existente.personasAsignadas += personasAsignadas;
        existente.incluida = existente.incluida || incluida;
      } else {
        asignadas.push({ ...h, incluida, personasAsignadas, cantidadHabitaciones: 1 });
      }
      pendientes -= personasAsignadas;
      unidadesUsadas.set(Number(h.idHabitaciones), (unidadesUsadas.get(Number(h.idHabitaciones)) || 0) + 1);
    };
    if (paqueteActual) {
      const tipoBase = String(paqueteActual.habitacionIncluidaTipo || habitacionPaquete?.tipo || '').trim().toLowerCase();
      let base = disponibles.find(h => String(h.idHabitaciones) === String(habitacionElegida) && unidadesDe(h) > 0);
      if (!base) base = disponibles.find(h => String(h.idHabitaciones) === String(paqueteActual.idHabitacionesFK) && unidadesDe(h) > 0);
      if (!base && tipoBase) base = disponibles.find(h => String(h.tipo || '').trim().toLowerCase() === tipoBase && unidadesDe(h) > 0);
      if (!base) base = [...disponibles].sort((a, b) => capacidadDeHabitacion(b) - capacidadDeHabitacion(a) || Number(a.precio || 0) - Number(b.precio || 0))[0];
      if (!base) return [];
      agregar(base, true);
    } else {
      const preferida = disponibles.find(h => String(h.idHabitaciones) === String(habitacionElegida) && unidadesDe(h) > 0);
      if (!preferida) return [];
      agregar(preferida, false);
    }
    const candidatas = [...disponibles].sort((a, b) => capacidadDeHabitacion(b) - capacidadDeHabitacion(a) || Number(a.precio || 0) - Number(b.precio || 0));
    while (pendientes > 0) {
      const siguiente = candidatas.find(h => (unidadesUsadas.get(Number(h.idHabitaciones)) || 0) < unidadesDe(h));
      if (!siguiente) return [];
      agregar(siguiente, false);
    }
    return asignadas;
  }, [busqueda.consultada, busqueda.habitaciones, reserva.personas, paqueteActual, habitacionPaquete, habitacionElegida]);
  const habitacionesAdicionalesEstimadas = paqueteActual ? asignacionEstimada.reduce((sum, h) => sum + Number(h.precio || 0) * nochesEstadia * (h.cantidadHabitaciones - (h.incluida ? 1 : 0)), 0) : 0;
  const excedenteMejoraEstimado = paqueteActual && asignacionEstimada[0] && habitacionPaquete ? Math.max(0, Number(asignacionEstimada[0].precio || 0) - Number(habitacionPaquete.precio || paqueteActual.precioHabitacionIncluida || 0)) * nochesEstadia : 0;
  const totalHabitacionesEstimado = paqueteActual
    ? Number(paqueteActual.precioPaquete || 0) + habitacionesAdicionalesEstimadas + excedenteMejoraEstimado
    : asignacionEstimada.reduce((sum, h) => sum + Number(h.precio || 0) * nochesEstadia * h.cantidadHabitaciones, 0);

  const usuario = sesion?.usuario;
  const rolId = Number(usuario?.idRolesFK);
  const esCliente = rolId === 4 || String(usuario?.Rol || '').toLowerCase() === 'cliente';

  const consultarDisponibilidad = async (event) => {
    event.preventDefault();
    setReservaEstado({ cargando: false, error: '', mensaje: '' });
    setBusqueda({ cargando: true, consultada: false, error: '', habitaciones: [] });
    setHabitacionElegida('');
    try {
      const params = new URLSearchParams({ llegada: reserva.llegada, salida: reserva.salida, personas: reserva.personas });
      const response = await fetch(`${API}/disponibilidad?${params.toString()}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.mensaje || 'No fue posible consultar la disponibilidad.');
      const disponibles = Array.isArray(data.habitaciones) ? data.habitaciones : [];
      setBusqueda({ cargando: false, consultada: true, error: '', habitaciones: disponibles });
      const paqueteGuardado = paquetes.find(p => String(p.idPaquetes) === String(paqueteElegido));
      if (paqueteGuardado?.idHabitacionesFK) {
        const habitacionBase = habitaciones.find(h => String(h.idHabitaciones) === String(paqueteGuardado.idHabitacionesFK));
        const asignada = disponibles.find(h => String(h.idHabitaciones) === String(paqueteGuardado.idHabitacionesFK))
          || (habitacionBase ? disponibles.find(h => String(h.tipo || '').trim().toLowerCase() === String(habitacionBase.tipo || '').trim().toLowerCase()) : null);
        if (asignada) setHabitacionElegida(String(asignada.idHabitaciones));
      }
    } catch (error) {
      setBusqueda({ cargando: false, consultada: true, error: error.message || 'No se pudo consultar la disponibilidad.', habitaciones: [] });
    }
  };

  const toggleServicio = (id) => setServiciosElegidos(previous => previous.includes(Number(id)) ? previous.filter(x => x !== Number(id)) : [...previous, Number(id)]);

  const enviarReserva = async () => {
    setReservaEstado({ cargando: true, error: '', mensaje: '' });
    const habitacionFinal = habitacionElegida || (paqueteActual?.idHabitacionesFK ? String(paqueteActual.idHabitacionesFK) : '');
    if (!habitacionFinal && !paqueteActual) {
      setReservaEstado({ cargando: false, error: 'Selecciona una habitación disponible o un paquete con habitación incluida.', mensaje: '' });
      return;
    }
    if (!sesion?.token) {
      sessionStorage.setItem('lunariaReservaPendiente', JSON.stringify({ reserva, habitacionElegida: habitacionFinal, paqueteElegido, serviciosElegidos }));
      setReservaEstado({ cargando: false, error: 'Para reservar, inicia sesión o crea una cuenta de huésped. Tus opciones quedarán guardadas.', mensaje: '' });
      window.dispatchEvent(new CustomEvent('lunaria:acceso', { detail: { modo: 'login' } }));
      return;
    }
    if (!esCliente) {
      setReservaEstado({ cargando: false, error: 'Para reservar una estadía debes ingresar con una cuenta de huésped. Tu sesión administrativa sigue abierta.', mensaje: '' });
      return;
    }
    try {
      const response = await fetch(`${API}/reservas/cliente`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sesion.token}` },
        body: JSON.stringify({
          idHabitacionesFK: habitacionFinal ? Number(habitacionFinal) : null,
          idPaquetesFK: paqueteElegido ? Number(paqueteElegido) : null,
          serviciosSeleccionados: serviciosElegidos,
          fechaInicio: reserva.llegada,
          fechaFin: reserva.salida,
          personas: Number(reserva.personas)
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.mensaje || data.error || 'No fue posible registrar la reserva.');
      setReservaEstado({ cargando: false, error: '', mensaje: `Reserva #${data.idReservas} registrada con estado ${data.estado || 'Pendiente'}. ${data.emailEnviado ? 'Enviamos la confirmación a tu correo.' : 'La reserva se registró, pero el correo no pudo enviarse. Contacta al hotel o revisa la configuración de correo.'}` });
      sessionStorage.removeItem('lunariaReservaPendiente');
    } catch (error) {
      setReservaEstado({ cargando: false, error: error.message || 'Error al registrar la reserva.', mensaje: '' });
    }
  };

  const fechaHoy = new Date();
  const hoyLocal = new Date(fechaHoy.getTime() - fechaHoy.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  return <div className="lunaria-site">
    <header className="lunaria-nav">
      <a className="lunaria-brand" href="#inicio"><img src="/img/Logo.jpg" alt="Logo de Hotel Lunaria" onError={e => { e.currentTarget.style.display = 'none'; }} /><span><strong>LUNARIA</strong><small>HOTEL BOUTIQUE</small></span></a>
      <button className="lunaria-menu-toggle" aria-label="Abrir menú" onClick={() => setMenuAbierto(!menuAbierto)}>{menuAbierto ? <X /> : <Menu />}</button>
      <nav className={menuAbierto ? 'lunaria-links open' : 'lunaria-links'}>{[['#habitaciones','Habitaciones'],['#experiencias','Experiencias'],['#servicios','Servicios'],['#hotel','El hotel']].map(([href,label]) => <a key={href} href={href} onClick={() => setMenuAbierto(false)}>{label}</a>)}<a className="lunaria-nav-cta" href="#reservar" onClick={() => setMenuAbierto(false)}>Reservar estancia <ArrowRight size={16}/></a>{!sesion ? <><button type="button" className="lunaria-login-link" onClick={() => window.dispatchEvent(new CustomEvent('lunaria:acceso',{detail:{modo:'login'}}))}>Iniciar sesión</button><button type="button" className="lunaria-register-link" onClick={() => window.dispatchEvent(new CustomEvent('lunaria:acceso',{detail:{modo:'registro'}}))}>Registrarse</button></> : <div className="lunaria-session-menu"><button type="button" className="lunaria-session-icon" aria-label="Ver sesión" aria-expanded={menuSesionAbierto} onClick={() => setMenuSesionAbierto(v => !v)}><UserRound size={19}/></button>{menuSesionAbierto && <div className="lunaria-session-dropdown"><strong>{usuario?.Nombre || 'Usuario'}</strong><span>{usuario?.Rol || 'Sin rol'}</span>{esCliente ? <button type="button" onClick={() => {setMenuSesionAbierto(false); onOpenAccount?.();}}>Mi cuenta</button> : <button type="button" onClick={() => {setMenuSesionAbierto(false); onReturnToPanel?.();}}><LayoutDashboard size={15}/> Volver al panel</button>}<button type="button" className="lunaria-session-logout" onClick={() => {setMenuSesionAbierto(false); onCerrarSesion?.();}}><LogOut size={15}/> Cerrar sesión</button></div>}</div>}</nav>
    </header>

    <main>
      <section className="lunaria-hero" id="inicio"><img className="lunaria-hero-image" src="/img/lunaria.jpg" alt="Ambiente del Hotel Lunaria" onError={e => { e.currentTarget.style.display = 'none'; }}/><div className="lunaria-hero-shade"/><div className="lunaria-hero-copy"><span className="lunaria-eyebrow"><Sparkles size={15}/> UN LUGAR PARA VOLVER A TI</span><h1>Tu pausa bonita<br/>empieza en <em>Lunaria.</em></h1><p>Hospitalidad cálida, espacios serenos y experiencias que se quedan contigo.</p><a href="#habitaciones" className="lunaria-button">Descubrir el hotel <ArrowRight size={17}/></a></div><div className="lunaria-hero-note"><span>01 — 04</span><span>Descanso con intención</span></div></section>

      <section className="lunaria-intro" id="hotel"><span className="lunaria-eyebrow">BIENVENIDO A LUNARIA</span><h2>Un refugio entre tus planes<br/>y tus mejores recuerdos.</h2><p>En Hotel Lunaria creemos que los mejores viajes también se viven despacio. Encuentra un espacio para descansar, reconectar y disfrutar cada detalle a tu manera.</p><div className="lunaria-perks"><span><Check/> Atención cercana</span><span><Check/> Espacios confortables</span><span><Check/> Experiencias especiales</span></div></section>

      <section className="lunaria-booking" id="reservar"><div><span className="lunaria-eyebrow">PLANEA TU ESTADÍA</span><h2>¿Cuándo nos visitas?</h2><p>Consulta aquí mismo las habitaciones disponibles para tus fechas. Puedes añadir un paquete o servicios opcionales.</p></div>
        <form className="lunaria-booking-form" onSubmit={consultarDisponibilidad}>
          <label><span><CalendarDays size={16}/> Llegada</span><input type="date" min={hoyLocal} value={reserva.llegada} onChange={e => setReserva({...reserva,llegada:e.target.value})} required/></label>
          <label><span><CalendarDays size={16}/> Salida</span><input type="date" min={reserva.llegada || hoyLocal} value={reserva.salida} onChange={e => setReserva({...reserva,salida:e.target.value})} required/></label>
          <label><span>Huéspedes</span><select value={reserva.personas} onChange={e => setReserva({...reserva,personas:e.target.value})}><option value="1">1 persona</option><option value="2">2 personas</option><option value="3">3 personas</option><option value="4">4 personas</option><option value="5">5 personas</option><option value="6">6 personas</option><option value="7">7 personas</option><option value="8">8 personas</option></select><ChevronDown className="lunaria-select-icon" size={16}/></label>
          <button className="lunaria-button" type="submit" disabled={busqueda.cargando}>{busqueda.cargando ? <LoaderCircle className="luna-spin" size={17}/> : <Search size={17}/>} Consultar</button>
        </form>
        {busqueda.error && <p className="lunaria-booking-result error" role="alert">{busqueda.error}</p>}
        {busqueda.consultada && !busqueda.error && <div className="lunaria-availability-results">
          <h3>{busqueda.habitaciones.length ? 'Habitaciones disponibles' : 'No encontramos habitaciones disponibles para esas fechas'}</h3>
          {busqueda.habitaciones.map((h) => <article key={h.idHabitaciones} className={`lunaria-availability-card ${!imagePath(h.imagen) ? 'no-image' : ''} ${String(habitacionElegida) === String(h.idHabitaciones) ? 'selected' : ''}`}>
            {imagePath(h.imagen) && <img src={imagePath(h.imagen)} alt={h.tipo || 'Habitación'} onError={e => { e.currentTarget.style.display = 'none'; }}/>}<div><h4>{h.tipo}</h4><p>{h.descripcion || 'Habitación disponible para las fechas seleccionadas.'}</p><strong>{COP(h.precio)} / noche</strong><small>Capacidad: {h.capacidad} · Disponibles: {h.unidadesDisponibles ?? h.cantidad ?? 1}</small></div><button type="button" onClick={() => {setHabitacionElegida(String(h.idHabitaciones));setReservaEstado({cargando:false,error:'',mensaje:''});}}>{String(habitacionElegida) === String(h.idHabitaciones) ? 'Seleccionada' : 'Elegir habitación'}</button>
          </article>)}
          {busqueda.habitaciones.length > 0 && <div className="lunaria-reservation-options">
            <h3>Personaliza tu estadía <small>(opcional)</small></h3>
            <label className="lunaria-option-label">Paquete
              <select value={paqueteElegido} onChange={e => {
                const id = e.target.value;
                setPaqueteElegido(id);
                const paquete = paquetes.find(p => String(p.idPaquetes) === id);
                const incluidosActuales = (paquete?.serviciosIncluidos || []).map(Number);
                setServiciosElegidos(previous => previous.filter(serviceId => !incluidosActuales.includes(Number(serviceId))));
                if (paquete?.idHabitacionesFK) {
                  const habitacionBase = habitaciones.find(h => String(h.idHabitaciones) === String(paquete.idHabitacionesFK));
                  const asignada = busqueda.habitaciones.find(h => String(h.idHabitaciones) === String(paquete.idHabitacionesFK))
                    || (habitacionBase ? busqueda.habitaciones.find(h => String(h.tipo || '').trim().toLowerCase() === String(habitacionBase.tipo || '').trim().toLowerCase()) : null);
                  setHabitacionElegida(asignada ? String(asignada.idHabitaciones) : '');
                } else {
                  setHabitacionElegida('');
                }
                setReservaEstado({cargando:false,error:'',mensaje:''});
              }}><option value="">Sin paquete</option>{paquetes.map(p => <option key={p.idPaquetes} value={p.idPaquetes}>{p.nomPaquete} — {COP(p.precioPaquete)}</option>)}</select>
            </label>
            {paqueteActual && <div className="lunaria-package-room-note">
              <strong>Habitación incluida:</strong> {habitacionPaquete ? `${habitacionPaquete.tipo} — ${COP(habitacionPaquete.precio)} por noche` : 'Este paquete aún no tiene una habitación configurada.'}
              <p>El paquete incluye una habitación. El sistema asignará automáticamente las habitaciones disponibles necesarias para alojar a todas las personas; las habitaciones adicionales se cobran por noche.</p>
              {habitacionPaquete && !busqueda.habitaciones.some(h => String(h.idHabitaciones) === habitacionPaqueteId || String(h.tipo || '').trim().toLowerCase() === String(habitacionPaquete.tipo || '').trim().toLowerCase()) && <p role="status">La habitación incluida no está disponible. Se buscará automáticamente la alternativa disponible que mejor se ajuste; cualquier diferencia positiva se sumará al total.</p>}
            </div>}
            <fieldset className="lunaria-service-options"><legend>{paqueteActual ? 'Servicios incluidos y adicionales' : 'Servicios adicionales (opcionales)'}</legend>{servicios.length ? servicios.map(s => {
              const incluido = serviciosIncluidos.includes(Number(s.idServicios));
              return <label key={s.idServicios} className={incluido ? 'lunaria-service-included' : ''}>
                <input type="checkbox" checked={incluido || serviciosElegidos.includes(Number(s.idServicios))} disabled={incluido} onChange={() => toggleServicio(s.idServicios)}/>
                <span>{s.nombre} — {COP(s.precio)}{incluido ? ' (Incluido en el paquete)' : ''}</span>
              </label>;
            }) : <p>No hay servicios activos registrados.</p>}</fieldset>
            {asignacionEstimada.length > 0 && <div className="lunaria-booking-hint" role="status">
              <strong>Asignación automática estimada: {asignacionEstimada.reduce((sum, h) => sum + h.cantidadHabitaciones, 0)} habitación(es)</strong>
              <ul>{asignacionEstimada.map((h, i) => <li key={h.idHabitaciones}>{h.cantidadHabitaciones} × {h.tipo} — {h.personasAsignadas} huésped(es){paqueteActual && h.incluida ? ` (${h.cantidadHabitaciones > 1 ? '1 incluida; restantes adicionales' : 'incluida en el paquete'})` : paqueteActual ? ' (adicional)' : ''} {paqueteActual && h.cantidadHabitaciones > (h.incluida ? 1 : 0) ? `— ${COP(Number(h.precio || 0) * nochesEstadia * (h.cantidadHabitaciones - (h.incluida ? 1 : 0)))} en adicionales` : !paqueteActual ? `— ${COP(Number(h.precio || 0) * nochesEstadia * h.cantidadHabitaciones)}` : ''}</li>)}</ul>
              {paqueteActual && excedenteMejoraEstimado > 0 && <p>Excedente por mejora de la habitación incluida: {COP(excedenteMejoraEstimado)}.</p>}
              <p>Total estimado de alojamiento: <strong>{COP(totalHabitacionesEstimado)}</strong>. Los servicios adicionales se suman aparte y el servidor verifica disponibilidad y total final.</p>
            </div>}
            {busqueda.consultada && !asignacionEstimada.length && Number(reserva.personas) > 0 && <p className="lunaria-booking-result error" role="alert">No hay suficientes habitaciones disponibles para alojar a todas las personas con esta selección. Prueba otras fechas o una habitación distinta.</p>}
            {reservaEstado.error && <p className="lunaria-booking-result error" role="alert">{reservaEstado.error}</p>}
            {reservaEstado.mensaje && <p className="lunaria-booking-result success" role="status">{reservaEstado.mensaje}</p>}
            <button type="button" className="lunaria-button lunaria-confirm-booking" onClick={enviarReserva} disabled={reservaEstado.cargando}>{reservaEstado.cargando ? 'Registrando reserva…' : sesion && !esCliente ? 'Inicia con una cuenta de huésped para reservar' : 'Solicitar reserva'} <ArrowRight size={17}/></button>
          </div>}
        </div>}
        <small className="lunaria-booking-hint">La reserva queda en estado pendiente hasta que el hotel la confirme.</small>
      </section>

      <section className="lunaria-section" id="habitaciones"><div className="lunaria-section-heading"><div><span className="lunaria-eyebrow">DESCANSO A TU MEDIDA</span><h2>Nuestras habitaciones</h2><p>Encuentra el espacio perfecto para tu próxima escapada.</p></div><label className="lunaria-filter">Tipo de habitación <select value={filtro} onChange={e => setFiltro(e.target.value)}>{tipos.map(t => <option key={t}>{t}</option>)}</select></label></div><div className="lunaria-room-grid">{habitacionesFiltradas.map((h) => <article className="lunaria-room-card" key={h.idHabitaciones}>{imagePath(h.imagen) ? <div className="lunaria-card-image"><img src={imagePath(h.imagen)} alt={h.tipo || 'Habitación Lunaria'} loading="lazy" onError={e => { e.currentTarget.parentElement.style.display = 'none'; }}/><span className="lunaria-image-tag"><BedDouble size={14}/> {h.capacidad || 'Capacidad no indicada'} huéspedes</span></div> : <div className="lunaria-room-meta"><BedDouble size={14}/> {h.capacidad || 'Capacidad no indicada'} huéspedes</div>}<div className="lunaria-card-body"><h3>{h.tipo || 'Habitación Lunaria'}</h3><p>{h.descripcion || 'Sin descripción disponible.'}</p><div className="lunaria-card-bottom"><span><strong>{COP(h.precio)}</strong><small> / noche</small></span><a href="#reservar" aria-label={`Consultar ${h.tipo}`}>Consultar <ArrowRight size={15}/></a></div></div></article>)}</div>{!habitaciones.length && <p className="lunaria-empty-catalog">No hay habitaciones activas registradas.</p>}</section>

      <section className="lunaria-experience" id="experiencias"><div className="lunaria-experience-copy"><span className="lunaria-eyebrow">MOMENTOS QUE SE DISFRUTAN</span><h2>Haz que tu viaje<br/>se sienta <em>especial.</em></h2><p>Planes pensados para celebrar, desconectar o descubrir nuevos sabores. Elige la experiencia que más va contigo.</p><a href="#paquetes" className="lunaria-text-link">Ver experiencias <ArrowRight size={16}/></a></div><div className="lunaria-experience-image"><img src="/paquetes/Relax.jpg" alt="Experiencia de descanso en Lunaria" loading="lazy" onError={e => { e.currentTarget.style.display = 'none'; }}/></div></section>

      <section className="lunaria-section lunaria-packages" id="paquetes"><div className="lunaria-section-heading"><div><span className="lunaria-eyebrow">UN PLAN PARA CADA MOMENTO</span><h2>Paquetes y experiencias</h2><p>Pequeños detalles que hacen grande una estadía.</p></div></div><div className="lunaria-package-grid">{paquetes.map(p => <article className="lunaria-package-card" key={p.idPaquetes}>{imagePath(p.imagen) && <div className="lunaria-package-image"><img src={imagePath(p.imagen)} alt={p.nomPaquete || 'Experiencia Lunaria'} loading="lazy" onError={e => { e.currentTarget.parentElement.style.display = 'none'; }}/></div>}<div className="lunaria-package-content"><span>{p.tipo || 'Experiencia Lunaria'}</span><h3>{p.nomPaquete || 'Paquete'}</h3><p>{p.descripcion || 'Sin descripción disponible.'}</p><div><strong>{COP(p.precioPaquete)}</strong><a href="#reservar">Me interesa <ArrowRight size={15}/></a></div></div></article>)}</div>{!paquetes.length && <p className="lunaria-empty-catalog">No hay paquetes activos registrados.</p>}</section>

      <section className="lunaria-section lunaria-services" id="servicios"><div className="lunaria-section-heading"><div><span className="lunaria-eyebrow">CUIDAMOS CADA DETALLE</span><h2>Servicios para disfrutar más</h2><p>Todo lo que necesitas para sentirte bien, dentro y fuera de tu habitación.</p></div></div><div className="lunaria-service-grid">{servicios.map(s => { const image = imagePath(s.imagen); return <article className={`lunaria-service-card ${image ? 'has-image' : 'no-image'}`} key={s.idServicios}>{image && <div className="lunaria-service-photo"><img src={image} alt={s.nombre || 'Servicio del hotel'} loading="lazy" onError={e => { e.currentTarget.parentElement.style.display = 'none'; e.currentTarget.closest('.lunaria-service-card')?.classList.remove('has-image'); e.currentTarget.closest('.lunaria-service-card')?.classList.add('no-image'); }}/></div>}<div className="lunaria-service-info"><h3>{s.nombre}</h3><p>{s.descripcion || 'Un detalle más para que tu estadía sea cómoda y especial.'}</p>{s.precio !== undefined && s.precio !== null && <span className="lunaria-service-price">Desde {COP(s.precio)}</span>}</div></article>; })}</div>{!servicios.length && <p className="lunaria-empty-catalog">No hay servicios activos registrados.</p>}</section>

      <section className="lunaria-final-cta"><Waves size={30}/><span className="lunaria-eyebrow">TU PRÓXIMO RECUERDO TE ESPERA</span><h2>Regálate unos días<br/>para disfrutar.</h2><a href="#reservar" className="lunaria-button">Planear mi estadía <ArrowRight size={17}/></a></section>
    </main>
    <footer className="lunaria-footer"><a className="lunaria-brand" href="#inicio"><span><strong>LUNARIA</strong><small>HOTEL BOUTIQUE</small></span></a><p>Un refugio para descansar, descubrir y volver a ti.</p><span>© {new Date().getFullYear()} Hotel Lunaria. Todos los derechos reservados.</span></footer>
  </div>;
}
