import { useState } from 'react';
import { ArrowLeft, LockKeyhole, Mail, UserRound, Phone, MoonStar } from 'lucide-react';
import './AccesoHotel.css';
const API = 'https://hotel-lunaria-backend-prueba.onrender.com/api/auth';

export default function AccesoHotel({ modo, cambiarModo, volver, alEntrar, mensaje = '' }) {
  const [form, setForm] = useState({ Nombre: '', Email: '', Telefono: '', contraseña: '' });
  const [error, setError] = useState(mensaje);
  const [cargando, setCargando] = useState(false);
  const [recuperar, setRecuperar] = useState(false);
  const [paso, setPaso] = useState(1);
  const [codigo, setCodigo] = useState('');
  const [nuevaContrasena, setNuevaContrasena] = useState('');
  const registro = modo === 'registro';
  const actualizar = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  async function enviar(e) {
    e.preventDefault(); setError(''); setCargando(true);
    try {
      const response = await fetch(`${API}/${registro ? 'registro' : 'login'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.mensaje || 'No fue posible completar el acceso.');
      alEntrar(data);
    } catch (err) {
      setError(err.message || 'No se pudo conectar con el servidor. Verifica que el backend esté iniciado.');
    } finally { setCargando(false); }
  }

  async function enviarCodigo(e) {
    e.preventDefault(); setError(''); setCargando(true);
    try { const r=await fetch(`${API}/recuperar`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({Email:form.Email})}); const d=await r.json(); if(!r.ok)throw new Error(d.mensaje||'No se pudo enviar el código.'); setError(d.mensaje); setPaso(2); }
    catch(err){setError(err.message);} finally{setCargando(false);}
  }
  async function guardarNueva(e) {
    e.preventDefault(); setError(''); setCargando(true);
    try { const r=await fetch(`${API}/restablecer`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({Email:form.Email,codigo,nuevaContrasena})}); const d=await r.json(); if(!r.ok)throw new Error(d.mensaje||'No se pudo cambiar la contraseña.'); setError(d.mensaje); setRecuperar(false); setPaso(1); setCodigo(''); setNuevaContrasena(''); }
    catch(err){setError(err.message);} finally{setCargando(false);}
  }

  return <main className="luna-auth-page">
    <button className="luna-auth-back" onClick={volver}><ArrowLeft size={17}/> Volver al hotel</button>
    <section className="luna-auth-card">
      <img className="luna-auth-logo" src="/img/Logo.jpg" alt="Logo de Hotel Lunaria" onError={e => { e.currentTarget.style.display = 'none'; }}/>
      <div className="luna-auth-brand"><MoonStar size={18}/><span>HOTEL LUNARIA</span></div>
      <h1>{registro ? 'Crea tu cuenta' : 'Qué bueno tenerte de vuelta'}</h1>
      <p className="luna-auth-intro">{registro ? 'Regístrate para preparar tu próxima experiencia.' : 'Ingresa para continuar con tu experiencia Lunaria.'}</p>
      {recuperar ? <form onSubmit={paso===1?enviarCodigo:guardarNueva}>
        <label><span><Mail size={16}/> Correo electrónico</span><input type="email" value={form.Email} onChange={e=>setForm({...form,Email:e.target.value})} required placeholder="correo@ejemplo.com"/></label>
        {paso===2 && <>
          <label><span><LockKeyhole size={16}/> Código de 6 dígitos</span><input inputMode="numeric" maxLength={6} value={codigo} onChange={e=>setCodigo(e.target.value.replace(/\D/g,'').slice(0,6))} required placeholder="000000"/></label>
          <label><span><LockKeyhole size={16}/> Nueva contraseña</span><input type="password" minLength={6} value={nuevaContrasena} onChange={e=>setNuevaContrasena(e.target.value)} required placeholder="Mínimo 6 caracteres"/></label>
        </>}
        {error && <p className="luna-auth-error" role="alert">{error}</p>}
        <button className="luna-auth-submit" type="submit" disabled={cargando}>{cargando?'Procesando…':paso===1?'Enviar código':'Restablecer contraseña'}</button>
        <p className="luna-auth-switch"><button type="button" onClick={()=>{setRecuperar(false);setPaso(1);setError('');}}>Volver al inicio de sesión</button></p>
      </form> : <form onSubmit={enviar}>
        {registro && <label><span><UserRound size={16}/> Nombre completo</span><input name="Nombre" value={form.Nombre} onChange={actualizar} autoComplete="name" required maxLength={100} placeholder="Tu nombre"/></label>}
        <label><span><Mail size={16}/> Correo electrónico</span><input type="email" name="Email" value={form.Email} onChange={actualizar} autoComplete="email" required placeholder="correo@ejemplo.com"/></label>
        {registro && <label><span><Phone size={16}/> Teléfono</span><input name="Telefono" value={form.Telefono} onChange={actualizar} autoComplete="tel" required placeholder="Tu teléfono"/></label>}
        <label><span><LockKeyhole size={16}/> Contraseña</span><input type="password" name="contraseña" value={form.contraseña} onChange={actualizar} autoComplete={registro ? 'new-password' : 'current-password'} minLength={6} required placeholder="Mínimo 6 caracteres"/></label>
        {error && <p className="luna-auth-error" role="alert">{error}</p>}
        <button className="luna-auth-submit" type="submit" disabled={cargando}>{cargando ? 'Procesando…' : registro ? 'Crear cuenta' : 'Iniciar sesión'}</button>
      </form>}
      {!registro && !recuperar && <p className="luna-auth-switch"><button type="button" onClick={()=>{setRecuperar(true);setError('');}}>¿Olvidaste tu contraseña?</button></p>}
      <p className="luna-auth-switch">{registro ? '¿Ya tienes una cuenta?' : '¿Primera vez en Lunaria?'} <button onClick={() => { cambiarModo(registro ? 'login' : 'registro'); setError(''); }}>{registro ? 'Inicia sesión' : 'Regístrate'}</button></p>
    </section>
  </main>;
}
