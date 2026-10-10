// Pantallas de acceso: login, crear empresa y aceptar invitación. Se cargan siempre.

import React from "react";
import { useState } from "react";
import { supabase } from "../supabaseClient";
import { Wrench } from "lucide-react";
import { APP_URL, C, Field, ROLE_CFG, inputClass, inputStyle } from "./base.jsx";

// ---------------------------------------------------------------------------
// Pantalla de acceso (login / crear cuenta)
// ---------------------------------------------------------------------------
export function AuthScreen({ inviteInfo, qrHint }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState(inviteInfo?.email || "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resetSent, setResetSent] = useState(false);

  const submit = async () => {
    setError("");
    if (!email.trim() || !password) { setError("Completa correo y contraseña."); return; }
    setLoading(true);
    const action = mode === "login"
      ? supabase.auth.signInWithPassword({ email: email.trim(), password })
      : supabase.auth.signUp({ email: email.trim(), password });
    const { error } = await action;
    setLoading(false);
    if (error) setError(error.message);
  };

  const sendReset = async () => {
    setError("");
    if (!email.trim()) { setError("Escribe tu correo para poder enviarte el enlace."); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: APP_URL });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setResetSent(true);
  };

  if (mode === "forgot") {
    return (
      <div className="w-full min-h-[720px] flex items-center justify-center" style={{ background: C.bg, fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <div className="w-full max-w-sm p-6" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 flex items-center justify-center" style={{ background: C.amber }}>
              <Wrench size={18} color="#1A1500" />
            </div>
            <div>
              <div className="font-bold text-base leading-none" style={{ color: C.text }}>MantenPro</div>
              <div className="text-[10px] uppercase tracking-wide" style={{ color: C.muted }}>Recuperar contraseña</div>
            </div>
          </div>
          {resetSent ? (
            <div className="text-sm mb-4" style={{ color: C.text }}>
              Si <b>{email}</b> tiene una cuenta con nosotros, te enviamos un correo con un enlace para poner una contraseña nueva. Revisa también la carpeta de spam.
            </div>
          ) : (
            <>
              <div className="text-xs mb-4" style={{ color: C.muted }}>Escribe tu correo y te enviamos un enlace para poner una contraseña nueva.</div>
              <Field label="Correo electrónico">
                <input className={inputClass} style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@empresa.com" />
              </Field>
              {error && <div className="text-xs mb-3" style={{ color: C.red }}>{error}</div>}
              <button onClick={sendReset} disabled={loading} className="w-full px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
                {loading ? "Enviando..." : "Enviar enlace de recuperación"}
              </button>
            </>
          )}
          <button onClick={() => { setMode("login"); setError(""); setResetSent(false); }} className="w-full text-xs mt-4" style={{ color: C.muted }}>
            ← Volver a iniciar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-[720px] flex items-center justify-center" style={{ background: C.bg, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div className="w-full max-w-sm p-6" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 flex items-center justify-center" style={{ background: C.amber }}>
            <Wrench size={18} color="#1A1500" />
          </div>
          <div>
            <div className="font-bold text-base leading-none" style={{ color: C.text }}>MantenPro</div>
            <div className="text-[10px] uppercase tracking-wide" style={{ color: C.muted }}>Multi-empresa</div>
          </div>
        </div>

        {qrHint && !inviteInfo && (
          <div className="text-xs mb-4 px-3 py-2" style={{ background: C.panelAlt, color: C.text, border: `1px solid ${C.border}` }}>
            <b>¿Eres cliente?</b> Para ver este equipo, abre una vez en este teléfono el enlace del portal que te envió la empresa que te da servicio. Después, al escanear las etiquetas QR se abrirá directo la ficha del equipo.
            <div className="mt-1" style={{ color: C.muted }}>Si trabajas en la empresa, inicia sesión abajo.</div>
          </div>
        )}
        {inviteInfo && (
          <div className="text-xs mb-4 px-3 py-2" style={{ background: C.panelAlt, color: C.amber, border: `1px solid ${C.border}` }}>
            Te invitaron a unirte a <b>{inviteInfo.companyName}</b> como {ROLE_CFG[inviteInfo.role]?.label || inviteInfo.role}. Inicia sesión o crea tu cuenta con el correo <b>{inviteInfo.email}</b>.
          </div>
        )}

        <div className="flex mb-5" style={{ borderBottom: `1px solid ${C.border}` }}>
          {[["login", "Iniciar sesión"], ["signup", "Crear cuenta"]].map(([key, label]) => (
            <button key={key} onClick={() => { setMode(key); setError(""); }}
              className="flex-1 text-sm py-2 font-medium"
              style={{ color: mode === key ? C.amber : C.muted, borderBottom: `2px solid ${mode === key ? C.amber : "transparent"}` }}>
              {label}
            </button>
          ))}
        </div>

        <Field label="Correo electrónico">
          <input className={inputClass} style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@empresa.com" />
        </Field>
        <Field label="Contraseña">
          <input className={inputClass} style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </Field>

        {mode === "login" && (
          <button onClick={() => { setMode("forgot"); setError(""); }} className="text-xs mb-3" style={{ color: C.amber }}>
            ¿Olvidaste tu contraseña?
          </button>
        )}

        {error && <div className="text-xs mb-3" style={{ color: C.red }}>{error}</div>}

        <button onClick={submit} disabled={loading} className="w-full px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {loading ? "Un momento..." : mode === "login" ? "Entrar" : "Crear cuenta"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pantalla de bienvenida: crear la empresa la primera vez (sin invitación)
// ---------------------------------------------------------------------------
export function OnboardingScreen({ onDone }) {
  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!companyName.trim()) { setError("Escribe el nombre de tu empresa."); return; }
    setLoading(true);
    setError("");
    // create_company_with_admin crea la empresa y tu perfil de administrador en un solo
    // paso del lado del servidor (todo o nada). Antes eran dos inserts desde aquí y el
    // primero fallaba por RLS: la empresa recién creada no se podía leer de vuelta porque
    // el usuario todavía no tenía perfil.
    const { error: createError } = await supabase.rpc("create_company_with_admin", {
      p_company_name: companyName.trim(), p_full_name: fullName.trim() || null,
    });
    setLoading(false);
    if (createError) { setError(createError.message); return; }
    onDone();
  };

  return (
    <div className="w-full min-h-[720px] flex items-center justify-center" style={{ background: C.bg, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div className="w-full max-w-sm p-6" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
        <div className="font-bold text-base mb-1" style={{ color: C.text }}>Configura tu empresa</div>
        <div className="text-xs mb-3" style={{ color: C.muted }}>Este será tu espacio de trabajo — nadie fuera de tu empresa podrá verlo.</div>
        <div className="text-xs mb-5 px-3 py-2" style={{ background: C.panelAlt, color: C.text, border: `1px solid ${C.border}` }}>Tienes <b>30 días de prueba gratis</b> con todo incluido: órdenes de trabajo, técnicos, equipos, checklists, mantenimiento programado, ventas, facturación y compras.</div>

        <Field label="Nombre de la empresa">
          <input className={inputClass} style={inputStyle} value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Ej. Grupo Frío RD" />
        </Field>
        <Field label="Tu nombre (opcional)">
          <input className={inputClass} style={inputStyle} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ej. Darius Peña" />
        </Field>

        {error && <div className="text-xs mb-3" style={{ color: C.red }}>{error}</div>}

        <button onClick={submit} disabled={loading} className="w-full px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {loading ? "Creando..." : "Comenzar"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pantalla de aceptación de invitación
// ---------------------------------------------------------------------------
export function InviteAcceptScreen({ session, inviteInfo, onDone, onSignOut }) {
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const emailMatches = session.user.email?.toLowerCase() === inviteInfo.email.toLowerCase();

  const accept = async () => {
    setLoading(true);
    setError("");
    // accept_invite busca la invitación por token del lado del servidor y toma de ahí
    // company_id/rol/permisos/sucursal — no de lo que mande el cliente — y además verifica
    // que el correo de la invitación coincida con el de la sesión actual. Antes era un
    // insert directo a "profiles" con company_id/rol tomados de inviteInfo (estado del
    // cliente), lo que dependía enteramente de la política RLS de "profiles" para impedir
    // que alguien insertara su propio perfil con una empresa o rol arbitrarios.
    const { error: acceptError } = await supabase.rpc("accept_invite", { p_token: inviteInfo.token, p_full_name: fullName.trim() || null });
    if (acceptError) { setLoading(false); setError(acceptError.message); return; }
    setLoading(false);
    onDone();
  };

  return (
    <div className="w-full min-h-[720px] flex items-center justify-center" style={{ background: C.bg, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div className="w-full max-w-sm p-6" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
        <div className="font-bold text-base mb-1" style={{ color: C.text }}>Únete a {inviteInfo.companyName}</div>

        {!emailMatches ? (
          <>
            <div className="text-xs mt-3 mb-4" style={{ color: C.red }}>
              Esta invitación es para <b>{inviteInfo.email}</b>, pero iniciaste sesión como <b>{session.user.email}</b>. Cierra sesión y entra con el correo correcto.
            </div>
            <button onClick={onSignOut} className="w-full px-4 py-2 text-sm font-semibold" style={{ background: C.amber, color: "#1A1500" }}>Cerrar sesión</button>
          </>
        ) : (
          <>
            <div className="text-xs mb-5" style={{ color: C.muted }}>
              Te invitaron como <b style={{ color: C.text }}>{ROLE_CFG[inviteInfo.role]?.label}</b>.
            </div>
            <Field label="Tu nombre (opcional)">
              <input className={inputClass} style={inputStyle} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ej. José Pérez" />
            </Field>
            {error && <div className="text-xs mb-3" style={{ color: C.red }}>{error}</div>}
            <button onClick={accept} disabled={loading} className="w-full px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
              {loading ? "Uniéndote..." : "Unirme a la empresa"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
