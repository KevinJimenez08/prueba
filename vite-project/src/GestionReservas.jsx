import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';

const obtenerTokenSesion = () => {
  const tokenGuardado = localStorage.getItem('lunariaToken');
  if (tokenGuardado && tokenGuardado !== 'undefined' && tokenGuardado !== 'null') return tokenGuardado;
  try {
    const sesion = JSON.parse(localStorage.getItem('lunariaSesion') || 'null');
    return sesion?.token || sesion?.usuario?.token || '';
  } catch {
    return '';
  }
};

const authHeaders = () => ({ Authorization: `Bearer ${obtenerTokenSesion()}` });

export default function GestionReservas() {
  const [reservas, setReservas] = useState([]);
  const [paquetes, setPaquetes] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [habitaciones, setHabitaciones] = useState([]);
  const [clientes, setClientes] = useState([]);

  const [modalAgregar, setModalAgregar] = useState(false);
  const [reservaEditando, setReservaEditando] = useState(null);
  const [confirmarEliminarId, setConfirmarEliminarId] = useState(null);
  const [alertaMsg, setAlertaMsg] = useState(null);
  const [filtroReservas, setFiltroReservas] = useState('');

  const [nuevaReserva, setNuevaReserva] = useState({
    idClientesFK: '',
    idHabitacionesFK: '',
    idPaquetesFK: '',
    personas: '1',
    habitacionesSeleccionadas: [],
    serviciosSeleccionados: [],
    descripcion: '',
    fechaInicio: '',
    fechaFin: '',
    estado: 'Pendiente',
    total: 0
  });

  // Cargar datos iniciales desde los endpoints
  const cargarDatos = useCallback(async () => {
    try {
      const [resRes, resPaq, resServ, resHab, resCli] = await Promise.all([
        fetch('http://localhost:3000/api/reservas', { headers: authHeaders() }),
        fetch('http://localhost:3000/api/paquetes', { headers: authHeaders() }),
        fetch('http://localhost:3000/api/servicios', { headers: authHeaders() }),
        fetch('http://localhost:3000/api/habitaciones', { headers: authHeaders() }),
        fetch('http://localhost:3000/api/clientes', { headers: authHeaders() })
      ]);

      if (resRes.ok) setReservas(await resRes.json());
      if (resPaq.ok) {
        const paquetesApi = await resPaq.json();
        setPaquetes(Array.isArray(paquetesApi) ? paquetesApi.map((paquete) => ({
          ...paquete,
          idPaquetes: Number(paquete.idPaquetes),
          serviciosIncluidos: Array.isArray(paquete.serviciosIncluidos)
            ? paquete.serviciosIncluidos.map((servicio) => Number(
                typeof servicio === 'object' && servicio !== null
                  ? servicio.idServicios ?? servicio.servicios_idServicios ?? servicio.idServicio
                  : servicio
              )).filter(Number.isFinite)
            : []
        })) : []);
      } else {
        console.error('No se pudieron cargar los paquetes:', resPaq.status);
      }
      if (resServ.ok) setServicios(await resServ.json());
      if (resHab.ok) setHabitaciones(await resHab.json());
      if (resCli.ok) setClientes(await resCli.json());
    } catch (err) {
      console.error('Error al cargar datos:', err);
    }
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // Verifica si un servicio está incluido en el paquete seleccionado
  const esServicioIncluidoEnPaquete = useCallback(
    (idServicio, idPaqueteSeleccionado) => {
      if (!idPaqueteSeleccionado) return false;
      const paquete = paquetes.find(
        (p) => Number(p.idPaquetes) === Number(idPaqueteSeleccionado)
      );
      if (!paquete || !Array.isArray(paquete.serviciosIncluidos)) return false;
      const idBuscado = Number(idServicio);
      if (!Number.isFinite(idBuscado)) return false;
      return paquete.serviciosIncluidos.some((servicio) => {
        const idIncluido = typeof servicio === 'object' && servicio !== null
          ? servicio.idServicios ?? servicio.servicios_idServicios ?? servicio.Servicios_idServicios ?? servicio.idServicio
          : servicio;
        return Number(idIncluido) === idBuscado;
      });
    },
    [paquetes]
  );

  // Cálculo del total dinámico
  const calcularTotal = (fechaInicio, fechaFin, idHabitacion, idPaquete, serviciosExtra) => {
    let subtotal = 0;

    // 1. Si hay paquete, toma el precio base del paquete
    if (idPaquete) {
      const paq = paquetes.find((p) => Number(p.idPaquetes) === Number(idPaquete));
      if (paq) {
        subtotal += parseFloat(paq.precioPaquete || paq.precio || 0);
      }
    } 
    // 2. Si no hay paquete, calcula: Días x Precio de Habitación
    else if (fechaInicio && fechaFin && idHabitacion) {
      const inicio = new Date(fechaInicio);
      const fin = new Date(fechaFin);
      const dias = Math.ceil((fin.getTime() - inicio.getTime()) / (1000 * 3600 * 24));

      if (dias > 0) {
        const hab = habitaciones.find((h) => Number(h.idHabitaciones) === Number(idHabitacion));
        subtotal += dias * parseFloat(hab?.precio || hab?.precioNoche || 0);
      }
    }

    // 3. Sumar únicamente los servicios extra que NO estén incluidos en el paquete
    if (serviciosExtra && serviciosExtra.length > 0) {
      serviciosExtra.forEach((idServ) => {
        if (!esServicioIncluidoEnPaquete(idServ, idPaquete)) {
          const serv = servicios.find((s) => Number(s.idServicios) === Number(idServ));
          if (serv) subtotal += parseFloat(serv.precio || 0);
        }
      });
    }

    return subtotal;
  };

  // Manejador de cambios en inputs y selects
  const handleFormChange = (e, esEdicion = false) => {
    const { name, value } = e.target;
    const estadoPrevio = esEdicion ? reservaEditando : nuevaReserva;

    const estadoActualizado = { ...estadoPrevio, [name]: value };

    if (name === 'idPaquetesFK') {
      if (value !== '') {
        const paquete = paquetes.find(
          (p) => Number(p.idPaquetes) === Number(value)
        );
        estadoActualizado.idHabitacionesFK = paquete?.idHabitacionesFK != null
          ? String(paquete.idHabitacionesFK)
          : '';
        // Los servicios del paquete se muestran marcados y bloqueados; no se envían
        // como adicionales para evitar duplicarlos en la relación de reserva.
        estadoActualizado.serviciosSeleccionados = (estadoActualizado.serviciosSeleccionados || [])
          .filter((id) => !esServicioIncluidoEnPaquete(id, value));
      } else {
        estadoActualizado.idHabitacionesFK = '';
      }
    }

    estadoActualizado.total = calcularTotal(
      estadoActualizado.fechaInicio,
      estadoActualizado.fechaFin,
      estadoActualizado.idHabitacionesFK,
      estadoActualizado.idPaquetesFK,
      estadoActualizado.serviciosSeleccionados
    );

    if (esEdicion) {
      setReservaEditando(estadoActualizado);
    } else {
      setNuevaReserva(estadoActualizado);
    }
  };

  const alternarHabitacionAdmin = (id, cantidad = 1) => {
    const actual = nuevaReserva.habitacionesSeleccionadas || [];
    const existe = actual.some(x => Number(x.idHabitacionesFK) === Number(id));
    const seleccion = existe
      ? actual.filter(x => Number(x.idHabitacionesFK) !== Number(id))
      : [...actual, { idHabitacionesFK: Number(id), cantidadHabitaciones: Math.max(1, Number(cantidad) || 1) }];
    setNuevaReserva(prev => ({ ...prev, habitacionesSeleccionadas: seleccion }));
  };

  const cambiarCantidadHabitacionAdmin = (id, cantidad) => {
    setNuevaReserva(prev => ({
      ...prev,
      habitacionesSeleccionadas: (prev.habitacionesSeleccionadas || []).map(x =>
        Number(x.idHabitacionesFK) === Number(id)
          ? { ...x, cantidadHabitaciones: Math.max(1, Number(cantidad) || 1) }
          : x
      )
    }));
  };

  // Alternar checkboxes de servicios adicionales
  const handleServiceToggle = (idServicio, esEdicion = false) => {
    const estadoPrevio = esEdicion ? reservaEditando : nuevaReserva;
    const existe = (estadoPrevio.serviciosSeleccionados || []).some((id) => Number(id) === Number(idServicio));

    const nuevosServicios = existe
      ? estadoPrevio.serviciosSeleccionados.filter((id) => Number(id) !== Number(idServicio))
      : [...estadoPrevio.serviciosSeleccionados, idServicio];

    const estadoActualizado = { ...estadoPrevio, serviciosSeleccionados: nuevosServicios };

    estadoActualizado.total = calcularTotal(
      estadoActualizado.fechaInicio,
      estadoActualizado.fechaFin,
      estadoActualizado.idHabitacionesFK,
      estadoActualizado.idPaquetesFK,
      nuevosServicios
    );

    if (esEdicion) {
      setReservaEditando(estadoActualizado);
    } else {
      setNuevaReserva(estadoActualizado);
    }
  };

  // Guardar nueva reserva
  const handleGuardarNueva = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        idClientesFK: parseInt(nuevaReserva.idClientesFK),
        idHabitacionesFK: nuevaReserva.idHabitacionesFK ? parseInt(nuevaReserva.idHabitacionesFK) : null,
        idPaquetesFK: nuevaReserva.idPaquetesFK ? parseInt(nuevaReserva.idPaquetesFK) : null,
        habitacionesSeleccionadas: nuevaReserva.habitacionesSeleccionadas || [],
        personas: Number(nuevaReserva.personas || 1),
        descripcion: nuevaReserva.descripcion,
        fechaInicio: nuevaReserva.fechaInicio,
        fechaFin: nuevaReserva.fechaFin,
        estado: nuevaReserva.estado,
        total: parseFloat(nuevaReserva.total),
        serviciosSeleccionados: (nuevaReserva.serviciosSeleccionados || [])
          .filter((id) => !esServicioIncluidoEnPaquete(id, nuevaReserva.idPaquetesFK))
      };

      const res = await fetch('http://localhost:3000/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setModalAgregar(false);
        cargarDatos();
        setAlertaMsg('Reserva creada correctamente.');
        setNuevaReserva({
          idClientesFK: '',
          idHabitacionesFK: '',
          idPaquetesFK: '',
          personas: '1',
          habitacionesSeleccionadas: [],
          serviciosSeleccionados: [],
          descripcion: '',
          fechaInicio: '',
          fechaFin: '',
          estado: 'Pendiente',
          total: 0
        });
      } else {
        const errorData = await res.json();
        setAlertaMsg(errorData.error || 'No se pudo guardar la reserva.');
      }
    } catch (err) {
      setAlertaMsg('Error de conexión con el servidor.');
    }
  };

  // Guardar edición de reserva
  const handleGuardarEdicion = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        idClientesFK: parseInt(reservaEditando.idClientesFK),
        idHabitacionesFK: reservaEditando.idHabitacionesFK ? parseInt(reservaEditando.idHabitacionesFK) : null,
        idPaquetesFK: reservaEditando.idPaquetesFK ? parseInt(reservaEditando.idPaquetesFK) : null,
        descripcion: reservaEditando.descripcion,
        fechaInicio: reservaEditando.fechaInicio ? reservaEditando.fechaInicio.split('T')[0] : null,
        fechaFin: reservaEditando.fechaFin ? reservaEditando.fechaFin.split('T')[0] : null,
        estado: reservaEditando.estado,
        total: parseFloat(reservaEditando.total),
        serviciosSeleccionados: (reservaEditando.serviciosSeleccionados || [])
          .filter((id) => !esServicioIncluidoEnPaquete(id, reservaEditando.idPaquetesFK))
      };

      const res = await fetch(`http://localhost:3000/api/reservas/${reservaEditando.idReservas}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setReservaEditando(null);
        cargarDatos();
        setAlertaMsg('Reserva actualizada correctamente.');
      } else {
        const errorData = await res.json();
        setAlertaMsg(errorData.error || 'No se pudo actualizar la reserva.');
      }
    } catch (err) {
      setAlertaMsg('Error de conexión con el servidor.');
    }
  };

  // Eliminar reserva
  const ejecutarEliminacion = async () => {
    try {
      const res = await fetch(`http://localhost:3000/api/reservas/${confirmarEliminarId}`, { method: 'DELETE', headers: authHeaders() });

      if (res.ok) {
        setConfirmarEliminarId(null);
        cargarDatos();
        setAlertaMsg('Reserva eliminada correctamente.');
      } else {
        setAlertaMsg('No se pudo eliminar la reserva.');
      }
    } catch (err) {
      setAlertaMsg('Error de conexión con el servidor.');
    }
  };

  const formatearFecha = (fecha) => {
    if (!fecha) return 'Sin fecha';
    return new Date(fecha).toLocaleDateString('es-CO');
  };

  const reservasFiltradas = reservas.filter(r => [r.idReservas,r.NombreCliente,r.Paquete,r.Habitacion,r.estado,r.descripcion,r.NumerosHabitacion,(r.habitacionesFisicas || []).map(u => `ID ${u.idUnidad} ${u.numeroHabitacion}`).join(' ')].filter(Boolean).join(' ').toLocaleLowerCase('es').includes(filtroReservas.trim().toLocaleLowerCase('es')));

  return (
    <>
      <div className="roles-header-card">
        <h2>Gestión de Reservas</h2>
        <button className="btn-add-role" onClick={() => setModalAgregar(true)}>
          <Plus size={24} />
        </button>
      </div>

      <div className="admin-filter-bar"><input value={filtroReservas} onChange={e=>setFiltroReservas(e.target.value)} placeholder="Buscar por cliente, paquete, estado o ID..."/></div>
      <div className="roles-table-container reservas-table">
        <div className="table-header">
          <span>ID</span>
          <span>Cliente</span>
          <span>Habitación / Paquete</span>
          <span>Fechas</span>
          <span>Estado</span>
          <span>Total</span>
          <span>Descripción</span>
          <span>Acciones</span>
        </div>

        {reservasFiltradas.length > 0 ? (
          reservasFiltradas.map((res) => (
            <div className="role-row" key={res.idReservas}>
              <span>{res.idReservas}</span>
              <span>{res.NombreCliente || `Cliente #${res.idClientesFK}`}</span>
              <span>
                <>{res.Paquete ? `Paquete: ${res.Paquete}` : (res.HabitacionesAsignadas || res.Habitacion || `Habitación #${res.idHabitacionesFK}`)}{(res.habitacionesFisicas || []).length > 0 ? <small className="reserva-habitaciones-fisicas">{res.habitacionesFisicas.map((unidad) => `ID físico ${unidad.idUnidad} · Hab. ${unidad.numeroHabitacion}`).join(' | ')}</small> : <small className="reserva-habitaciones-fisicas">Sin asignación física registrada</small>}</>
              </span>
              <span>
                {formatearFecha(res.fechaInicio)} - {formatearFecha(res.fechaFin)}
              </span>
              <span>
                <span className={`status-badge ${
                  res.estado === 'Confirmada' ? 'active' : res.estado === 'Pendiente' ? 'pending' : 'inactive'
                }`}>
                  {res.estado || 'Pendiente'}
                </span>
              </span>
              <span>
                {res.total ? `$${Number(res.total).toLocaleString('es-CO')}` : '$0'}
              </span>
              <span>{res.descripcion || 'Sin descripción'}</span>
              <div className="row-actions">
                <Pencil 
                  className="action-icon" 
                  size={18} 
                  onClick={() => setReservaEditando({ ...res, serviciosSeleccionados: Array.isArray(res.serviciosSeleccionados) ? res.serviciosSeleccionados.map(Number) : [] })} 
                />
                <Trash2 className="action-icon" title="Eliminar reserva" size={18} onClick={() => setConfirmarEliminarId(res.idReservas)} />
              </div>
            </div>
          ))
        ) : (
          <div style={{ padding: '20px', textAlign: 'center', color: '#777' }}>
            No hay reservas registradas.
          </div>
        )}
      </div>

      {/* MODAL AGREGAR RESERVA */}
      {modalAgregar && (
        <div className="modal-overlay">
          <form className="modal-content" onSubmit={handleGuardarNueva} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <h3>Agregar Nueva Reserva</h3>
            
            <div className="modal-field">
              <label>Cliente</label>
              <select
                name="idClientesFK"
                value={nuevaReserva.idClientesFK}
                onChange={(e) => handleFormChange(e)}
                required
              >
                <option value="">-- Seleccionar Cliente --</option>
                {clientes.map((cli) => (
                  <option key={cli.idClientes} value={cli.idClientes}>
                    {cli.Nombre} (ID: {cli.idClientes})
                  </option>
                ))}
              </select>
            </div>

            <div className="modal-field">
              <label>Paquete (Opcional)</label>
              <select 
                name="idPaquetesFK"
                value={nuevaReserva.idPaquetesFK} 
                onChange={(e) => handleFormChange(e)}
              >
                <option value="">-- Sin Paquete --</option>
                {paquetes.map((paq) => (
                  <option key={paq.idPaquetes} value={paq.idPaquetes}>
                    {paq.nomPaquete} (${Number(paq.precioPaquete || paq.precio || 0).toLocaleString('es-CO')})
                  </option>
                ))}
              </select>
            </div>

            <div className="modal-field">
              <label>Habitación</label>
              <select 
                name="idHabitacionesFK"
                value={nuevaReserva.idHabitacionesFK} 
                onChange={(e) => handleFormChange(e)}
                disabled={Boolean(nuevaReserva.idPaquetesFK)}
                required={!nuevaReserva.idPaquetesFK}
                style={{
                  backgroundColor: nuevaReserva.idPaquetesFK ? '#f0f0f0' : '#fff',
                  cursor: nuevaReserva.idPaquetesFK ? 'not-allowed' : 'pointer'
                }}
              >
                <option value="">
                  {nuevaReserva.idPaquetesFK 
                    ? '-- Habitación configurada en el paquete --' 
                    : '-- Seleccionar Habitación --'}
                </option>
                {!nuevaReserva.idPaquetesFK && habitaciones.map((hab) => (
                  <option key={hab.idHabitaciones} value={hab.idHabitaciones}>
                    {hab.tipo} (Capacidad: {hab.capacidad})
                  </option>
                ))}
              </select>
            </div>

            <div className="modal-field">
              <label>Habitaciones adicionales (puedes seleccionar varias categorías)</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid #ddd', padding: 10, borderRadius: 8 }}>
                {habitaciones.map((hab) => {
                  const seleccionada = (nuevaReserva.habitacionesSeleccionadas || []).find(x => Number(x.idHabitacionesFK) === Number(hab.idHabitaciones));
                  return (
                    <div key={hab.idHabitaciones} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1 }}>
                        <input type="checkbox" checked={Boolean(seleccionada)}
                          onChange={() => alternarHabitacionAdmin(hab.idHabitaciones)} />
                        {hab.tipo} · capacidad {hab.capacidad} · ${Number(hab.precio || 0).toLocaleString('es-CO')}/noche
                      </label>
                      {seleccionada && <input aria-label={`Cantidad ${hab.tipo}`} type="number" min="1" max={hab.cantidad}
                        value={seleccionada.cantidadHabitaciones}
                        onChange={e => cambiarCantidadHabitacionAdmin(hab.idHabitaciones, e.target.value)}
                        style={{ width: 68 }} />}
                    </div>
                  );
                })}
              </div>
              <small>El sistema asignará números físicos disponibles para las fechas indicadas. La habitación incluida en el paquete se conserva automáticamente.</small>
            </div>

            <div className="modal-field">
              <label>Número de huéspedes</label>
              <input type="number" min="1" max="100" name="personas" value={nuevaReserva.personas}
                onChange={(e) => handleFormChange(e)} required />
              <small>El sistema asignará automáticamente las habitaciones físicas necesarias según su capacidad.</small>
            </div>

            <div className="modal-field">
              <label>Fecha Inicio</label>
              <input 
                type="date" 
                name="fechaInicio"
                value={nuevaReserva.fechaInicio} 
                onChange={(e) => handleFormChange(e)} 
                required
              />
            </div>

            <div className="modal-field">
              <label>Fecha Fin</label>
              <input 
                type="date" 
                name="fechaFin"
                value={nuevaReserva.fechaFin} 
                onChange={(e) => handleFormChange(e)} 
                required
              />
            </div>

            {/* SECCIÓN DE SERVICIOS */}
            <div className="modal-field">
              <label>Servicios Adicionales (Opcional)</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '120px', overflowY: 'auto', border: '1px solid #ddd', padding: '8px', borderRadius: '4px' }}>
                {servicios.map((serv) => {
                  const incluido = esServicioIncluidoEnPaquete(serv.idServicios, nuevaReserva.idPaquetesFK);
                  const marcado = incluido || nuevaReserva.serviciosSeleccionados.some((id) => Number(id) === Number(serv.idServicios));

                  return (
                    <label 
                      key={serv.idServicios} 
                      style={{ 
                        fontSize: '0.85rem', 
                        fontWeight: 'normal', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px',
                        color: incluido ? '#7f8c8d' : '#000',
                        cursor: incluido ? 'not-allowed' : 'pointer'
                      }}
                    >
                      <input 
                        type="checkbox"
                        checked={marcado}
                        disabled={incluido}
                        onChange={() => handleServiceToggle(serv.idServicios, false)}
                      />
                      <span>
                        {serv.nombre} {incluido ? '(Incluido en el paquete)' : `(+$${Number(serv.precio || 0).toLocaleString('es-CO')})`}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="modal-field">
              <label>Estado</label>
              <select 
                name="estado"
                value={nuevaReserva.estado} 
                onChange={(e) => handleFormChange(e)}
              >
                <option value="Pendiente">Pendiente</option>
                <option value="Confirmada">Confirmada</option>
                <option value="Cancelada">Cancelada</option>
              </select>
            </div>

            <div className="modal-field">
              <label>Total Calculado ($)</label>
              <input 
                type="number" 
                value={nuevaReserva.total} 
                readOnly 
                style={{ backgroundColor: '#f0f0f0', fontWeight: 'bold' }}
              />
            </div>

            <div className="modal-field">
              <label>Descripción</label>
              <input 
                type="text" 
                name="descripcion"
                value={nuevaReserva.descripcion} 
                onChange={(e) => handleFormChange(e)} 
              />
            </div>

            <div className="modal-actions">
              <button type="button" className="btn-cancelar" onClick={() => setModalAgregar(false)}>Cancelar</button>
              <button type="submit" className="btn-guardar">Guardar</button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL EDITAR RESERVA */}
      {reservaEditando && (
        <div className="modal-overlay">
          <form className="modal-content" onSubmit={handleGuardarEdicion} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <h3>Editar Reserva #{reservaEditando.idReservas}</h3>

            <div className="modal-field">
              <label>Cliente</label>
              <select
                name="idClientesFK"
                value={reservaEditando.idClientesFK}
                onChange={(e) => handleFormChange(e, true)}
                required
              >
                <option value="">-- Seleccionar Cliente --</option>
                {clientes.map((cli) => (
                  <option key={cli.idClientes} value={cli.idClientes}>
                    {cli.Nombre} (ID: {cli.idClientes})
                  </option>
                ))}
              </select>
            </div>

            <div className="modal-field">
              <label>Paquete (Opcional)</label>
              <select 
                name="idPaquetesFK"
                value={reservaEditando.idPaquetesFK || ''} 
                onChange={(e) => handleFormChange(e, true)}
              >
                <option value="">-- Sin Paquete --</option>
                {paquetes.map((paq) => (
                  <option key={paq.idPaquetes} value={paq.idPaquetes}>
                    {paq.nomPaquete} (${Number(paq.precioPaquete || paq.precio || 0).toLocaleString('es-CO')})
                  </option>
                ))}
              </select>
            </div>

            <div className="modal-field">
              <label>Habitación</label>
              <select 
                name="idHabitacionesFK"
                value={reservaEditando.idHabitacionesFK || ''} 
                onChange={(e) => handleFormChange(e, true)}
                disabled={Boolean(reservaEditando.idPaquetesFK)}
                required={!reservaEditando.idPaquetesFK}
                style={{
                  backgroundColor: reservaEditando.idPaquetesFK ? '#f0f0f0' : '#fff',
                  cursor: reservaEditando.idPaquetesFK ? 'not-allowed' : 'pointer'
                }}
              >
                <option value="">
                  {reservaEditando.idPaquetesFK 
                    ? '-- Habitación configurada en el paquete --' 
                    : '-- Seleccionar Habitación --'}
                </option>
                {!reservaEditando.idPaquetesFK && habitaciones.map((hab) => (
                  <option key={hab.idHabitaciones} value={hab.idHabitaciones}>
                    {hab.tipo} (Capacidad: {hab.capacidad})
                  </option>
                ))}
              </select>
            </div>

            <div className="modal-field">
              <label>Fecha Inicio</label>
              <input 
                type="date" 
                name="fechaInicio"
                value={reservaEditando.fechaInicio ? reservaEditando.fechaInicio.split('T')[0] : ''} 
                onChange={(e) => handleFormChange(e, true)} 
                required
              />
            </div>

            <div className="modal-field">
              <label>Fecha Fin</label>
              <input 
                type="date" 
                name="fechaFin"
                value={reservaEditando.fechaFin ? reservaEditando.fechaFin.split('T')[0] : ''} 
                onChange={(e) => handleFormChange(e, true)} 
                required
              />
            </div>

            <div className="modal-field">
              <label>Servicios Adicionales (Opcional)</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '120px', overflowY: 'auto', border: '1px solid #ddd', padding: '8px', borderRadius: '4px' }}>
                {servicios.map((serv) => {
                  const incluido = esServicioIncluidoEnPaquete(serv.idServicios, reservaEditando.idPaquetesFK);
                  const marcado = incluido || (reservaEditando.serviciosSeleccionados || []).some((id) => Number(id) === Number(serv.idServicios));

                  return (
                    <label 
                      key={serv.idServicios} 
                      style={{ 
                        fontSize: '0.85rem', 
                        fontWeight: 'normal', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px',
                        color: incluido ? '#7f8c8d' : '#000',
                        cursor: incluido ? 'not-allowed' : 'pointer'
                      }}
                    >
                      <input 
                        type="checkbox"
                        checked={marcado}
                        disabled={incluido}
                        onChange={() => handleServiceToggle(serv.idServicios, true)}
                      />
                      <span>
                        {serv.nombre} {incluido ? '(Incluido en el paquete)' : `(+$${Number(serv.precio || 0).toLocaleString('es-CO')})`}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="modal-field">
              <label>Estado</label>
              <select 
                name="estado"
                value={reservaEditando.estado || 'Pendiente'} 
                onChange={(e) => handleFormChange(e, true)}
              >
                <option value="Pendiente">Pendiente</option>
                <option value="Confirmada">Confirmada</option>
                <option value="Cancelada">Cancelada</option>
              </select>
            </div>

            <div className="modal-field">
              <label>Total Calculado ($)</label>
              <input 
                type="number" 
                value={reservaEditando.total} 
                readOnly 
                style={{ backgroundColor: '#f0f0f0', fontWeight: 'bold' }}
              />
            </div>

            <div className="modal-field">
              <label>Descripción</label>
              <input 
                type="text" 
                name="descripcion"
                value={reservaEditando.descripcion || ''} 
                onChange={(e) => handleFormChange(e, true)} 
              />
            </div>

            <div className="modal-actions">
              <button type="button" className="btn-cancelar" onClick={() => setReservaEditando(null)}>Cancelar</button>
              <button type="submit" className="btn-guardar">Actualizar</button>
            </div>
          </form>
        </div>
      )}

      {/* NOTIFICACIONES Y DIÁLOGOS */}
      {alertaMsg && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ textAlign: 'center', width: '350px' }}>
            <h3>Notificación</h3>
            <p style={{ margin: '15px 0' }}>{alertaMsg}</p>
            <button className="btn-guardar" onClick={() => setAlertaMsg(null)}>Aceptar</button>
          </div>
        </div>
      )}

      {confirmarEliminarId && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ textAlign: 'center', width: '350px' }}>
            <h3>Confirmar Eliminación</h3>
            <p style={{ margin: '15px 0' }}>¿Deseas eliminar esta reserva?</p>
            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              <button className="btn-cancelar" onClick={() => setConfirmarEliminarId(null)}>Cancelar</button>
              <button className="btn-guardar" style={{ backgroundColor: '#e74c3c' }} onClick={ejecutarEliminacion}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}