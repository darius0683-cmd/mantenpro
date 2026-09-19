# Resumen de sesión — MantenPro (18 sep 2026)

## 1. Gestión de técnicos y usuarios que se desvinculan

**Acuerdo:** nunca borrar por completo a alguien con historial real (órdenes, facturas, costos) — se pierde trazabilidad y se reescriben nombres/tarifas hacia atrás. Solo se borra de verdad si nunca tuvo ningún historial.

**Implementado en el código:**
- `technicians` ahora tiene `is_active`. El botón de eliminar técnico revisa si tiene historial (órdenes, incidentes, herramientas, equipos, proyectos):
  - Sin historial → borra de verdad.
  - Con historial → pregunta y lo da de baja (`is_active = false`) en vez de borrar. El mismo botón reactiva si ya está de baja.
- Tarjeta de técnico marca visualmente "Dado de baja — no se puede asignar".
- Selects de "asignar técnico" (órdenes, incidentes, herramientas, equipos, proyectos, invitaciones) ya no muestran técnicos inactivos como opción para trabajo nuevo, pero conservan el nombre si ya estaban asignados a algo existente.
- Usuarios: botón directo de "Desactivar/Reactivar" en cada tarjeta (antes solo estaba escondido dentro de "Gestionar").
- Dentro de "Gestionar" ahora también se puede **cambiar el rol** de un usuario (Técnico/Vendedor/Supervisor/Admin) — al cambiar el rol, sus permisos se reinician a los de ese rol por defecto.

**Migración SQL aplicada:** `migracion-tecnicos-baja.sql` (agrega `technicians.is_active`).

**Buena práctica acordada al desvincular a alguien:** no reutilizar el registro del técnico ni la cuenta de login para otra persona — congelar el historial y crear todo nuevo para quien entra. Si el correo es de la empresa (no del empleado), liberarlo renombrando la cuenta vieja en Supabase antes de dárselo al nuevo.

## 2. Sucursales múltiples

**Acuerdo:** un técnico o usuario puede tener una sucursal principal + sucursales adicionales donde también puede operar.

**Implementado:**
- `technicians.extra_branch_ids` y `profiles.extra_branch_ids` (arrays de uuid).
- Formulario de técnico y "Gestionar" usuario: sucursal principal + checklist de sucursales adicionales.
- Todos los filtros de "¿este técnico trabaja en esta sucursal?" ahora consideran ambas.
- **Nota importante:** esta restricción de sucursal es solo de interfaz, no de RLS en la base de datos. Si en el futuro hay sucursales de dueños distintos y se necesita aislamiento real, hay que agregar políticas RLS.

**Migración SQL aplicada:** `migracion-sucursales-multiples.sql`.

## 3. Recuperación y cambio de contraseña

**Implementado:**
- "¿Olvidaste tu contraseña?" en el login → envía correo de recuperación (`supabase.auth.resetPasswordForEmail`).
- La app detecta el evento `PASSWORD_RECOVERY` y muestra pantalla para poner contraseña nueva.
- "Cambiar contraseña" disponible para cualquier usuario logueado, en el menú lateral.

**Configuración en Supabase (hecha):**
- Dominio propio **manticrd.com** verificado en Resend.
- SMTP personalizado conectado en Supabase (Authentication → Notifications → Emails) usando Resend: host `smtp.resend.com`, puerto 465, **usuario `resend`** (el error inicial `535 Invalid username` fue por no tener ese campo exacto), contraseña = API key de Resend, remitente `@manticrd.com`.
- Plantilla de "Reset Password" traducida al español (pendiente: traducir también "Invite user" y "Confirm signup" si se quiere).

**Pendiente de confirmar:** Redirect URLs / Site URL en Supabase (Authentication → URL Configuration) con el dominio de producción.

## 4. Herramientas — selección y acciones en grupo

**Implementado:** casillas de selección en cada herramienta, "Seleccionar todas", y dos acciones masivas:
- **Dar de baja (N)** → `status = "baja"`, sin borrar (conserva historial de préstamos).
- **Eliminar seleccionadas (N)** → borrado real con confirmación.

## 5. Multi-empresa (varios tenants reales) y Modo Soporte

**Acordado:** ya no se puede usar `TRUNCATE` general para "limpiar" — hay que borrar empresa por empresa. Script listo: `eliminar-empresa.sql` (borra todo lo de una sola empresa por `company_id`, en el orden correcto para no romper llaves foráneas). Ya se usó una vez para borrar una empresa de prueba creada por accidente. El borrado del login (`auth.users`) de los usuarios de esa empresa sigue siendo manual, desde Authentication → Users.

**Modo Soporte (`SupportViewer`):**
- Es un acceso completamente aparte del admin normal de una empresa — requiere una cuenta de login **sin ningún perfil de empresa** que además esté en la tabla `platform_admins`. Un admin de empresa nueva nunca tiene esto automáticamente.
- Se creó el acceso: cuenta dedicada + fila en `platform_admins` + política RLS que faltaba (`usuarios pueden ver su propia fila en platform_admins`, ejecutada directo en SQL Editor).
- Se corrigió un bug que dejaba la pantalla en blanco al abrir cualquier empresa: `GenericTable` intentaba mostrar campos tipo objeto/lista (`permissions`, `extra_branch_ids`) directamente y React truena. Ahora esos campos se muestran como JSON truncado.
- Se rediseñó por completo para que se vea como el resto de la app: barra lateral con buscador de empresas, tarjetas KPI (usuarios, clientes, órdenes, facturado), pestañas con íconos, y tabla con formato inteligente (roles y estados como `Pill` de color, fechas y montos formateados).

**Pendiente acordado:** agregar un botón de "Eliminar empresa" dentro del Modo Soporte (nunca dentro del Dashboard normal, para que sea imposible que le aparezca a un admin de empresa) — con confirmación fuerte (escribir el nombre de la empresa). Aún no construido.

## 6. Comercialización — cómo cobrar

Se plantearon dos caminos, no excluyentes:
- **Manual** (recomendado para empezar): campo de estado por empresa (al día / suspendida) + bloqueo de acceso si está suspendida, gestionado a mano desde el Modo Soporte. Sencillo, sin integración.
- **Stripe Billing** (para cuando haya volumen): cobro recurrente automático con tarjeta, webhooks que activan/suspenden solo. República Dominicana sí está soportada por Stripe para recibir pagos.

**Aún no implementado** — pendiente de decidir cuál construir primero.

## 7. Camino a producción (recordatorio)

- Mileto va a dar acceso a su contable (rol Supervisor + permisos personalizados solo de las secciones contables).
- Cuando el prototipo esté terminado: borrar todos los datos de prueba y arrancar limpio con las empresas reales — en ese momento se arma el script de borrado total (distinto al de "una empresa", sería para resetear todo antes del lanzamiento).

## Archivos entregados en esta sesión
- `mantenpro-prototipo.jsx` (código final, validado con Babel + esbuild en cada entrega)
- `migracion-tecnicos-baja.sql`
- `migracion-sucursales-multiples.sql`
- `eliminar-empresa.sql`
- Política RLS de `platform_admins` (entregada como bloque de código, no archivo)
