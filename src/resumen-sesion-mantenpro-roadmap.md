# Resumen de sesión — MantenPro (roadmap de mejoras)

## Contexto
A partir de una lista de mejoras recomendadas para el lado de facturación y
manejo técnico, se acordó construirlas **una por una, en orden**, cada una con
su SQL, su código validado (Babel + esbuild) y entrega inmediata — sin meter
varias a la vez para no arriesgar lo que ya funciona en producción.

## Roadmap acordado y completado (12 puntos)

1. **Mantenimiento preventivo recurrente** — equipos y activos de cliente con
   frecuencia (días) o por uso (horómetro/km); genera órdenes solas o con un
   clic desde "Mantenimiento programado".
2. **Costo real por orden** — materiales consumidos (con descuento de
   inventario) + mano de obra (horas × tarifa del técnico) = costo total visible
   por orden.
3. **Multi-técnico por orden** — técnico principal + adicionales; todos ven la
   orden en su lista.
4. **SLA de incidentes** — tiempos promedio de atención y resolución por
   prioridad, visibles en Reportes y en cada incidente.
5. **Firma digital del cliente** — firma a mano en pantalla, guardada con
   nombre y fecha, dentro de cada orden.
6. **Horómetro / kilometraje** — mantenimiento disparado por uso real del
   equipo, no solo por fecha calendario.
7. **Reportes financieros (P&L y flujo de caja)** — estado de resultados
   devengado + flujo de caja real, por rango de fechas.
8. **Recordatorios de cobro** — alerta en Dashboard de facturas +30 días
   vencidas; botones de WhatsApp, correo (manual) y correo automático desde
   Cuentas por Cobrar.
9. **Contratos recurrentes** — clientes con servicio fijo mensual se facturan
   solos, usando el mismo flujo fiscal de siempre (NCF, ITBIS).
10. **Facturación parcial de cotizaciones** — factura solo una parte de una
    cotización aprobada; lleva el control de lo ya facturado por renglón.
11. **Multi-moneda (USD)** — cotizaciones y facturas en dólares; el
    subtotal/ITBIS/total fiscal SIEMPRE queda en pesos (el dólar es una capa
    informativa encima, no reemplaza el cumplimiento DGII).
12. **Conciliación bancaria** — importa estado de cuenta (CSV/Excel), sugiere
    coincidencias automáticas contra pagos ya registrados.

## Fuera del roadmap principal (decisiones que necesitaban input del usuario)

- **Facturación electrónica (e-CF)** — pendiente: depende de si/cuándo le
  toca el mandato de la DGII.
- **Notificaciones (correo + push)** — SÍ se construyó. Centro de
  notificaciones en la app (campanita), correo vía Resend, push vía Web Push
  con VAPID. Requirió desplegar 3 Supabase Edge Functions (`send-notification-email`,
  `send-client-email`, `send-web-push`) con Supabase CLI — ya desplegadas y
  probadas con éxito.
- **PWA (app instalable)** — SÍ se construyó. Manifest + íconos + service
  worker con caché básico; se instala desde el navegador en Android/iPhone sin
  pasar por tiendas.
- **Portal de cliente** — NO se construyó todavía. Se dejaron 3 niveles de
  opciones sobre la mesa (enlace sin login → portal con login → portal
  interactivo completo) para decidir más adelante.

## Ajustes de UI hechos sobre la marcha

- Menú lateral responsivo: en celular se esconde detrás de un botón de
  hamburguesa (☰) y se abre como panel encima del contenido.
- Las 73 tablas de la app ahora se pueden deslizar horizontalmente en
  pantallas angostas en vez de aplastar/superponer columnas.
- **Perfil de la empresa** (logo, RNC, dirección, teléfono, correo, sitio web)
  — aparece ahora en el encabezado de facturas, cotizaciones, notas de
  crédito, órdenes de compra y de venta impresas.

## Código final

El código vive en un único archivo: `src/mantenpro-prototipo.jsx`. Se fue
entregando actualizado en cada punto del roadmap, siempre validado con Babel
(sintaxis) y esbuild (bundle, para atrapar errores de orden de declaración de
variables antes de que rompan la app en el navegador).

Cada punto del roadmap trajo su propio script SQL (todos con `if not exists`,
así que son seguros de volver a correr):
- `migracion-inventario.sql` (base: herramientas, materiales, incidentes)
- `migracion-mantenimiento-recurrente.sql`
- `migracion-costo-ordenes.sql`
- `migracion-multi-tecnico.sql`
- `migracion-sla-incidentes.sql`
- `migracion-firma-digital.sql`
- `migracion-horometro.sql`
- `migracion-facturacion-parcial.sql`
- `migracion-multimoneda.sql`
- `migracion-contratos-recurrentes.sql`
- `migracion-conciliacion-bancaria.sql`
- `migracion-notificaciones.sql`
- `migracion-perfil-empresa.sql`

Más dos paquetes de archivos aparte del `.jsx` (no son SQL, van directo al
proyecto):
- `notificaciones-mantenpro.zip` — 3 Edge Functions + service worker + guía de
  despliegue (Resend + Supabase CLI + VAPID).
- `pwa-mantenpro.zip` — manifest.json, íconos, service worker con caché, guía
  para editar `index.html`.

## Puntos clave / aprendizajes de la sesión

- **Bug real encontrado y corregido**: `todayStr` se usaba antes de
  declararse (`Cannot access 'todayStr' before initialization`) — desde
  entonces se agregó una segunda validación con **esbuild** (además de Babel)
  a cada entrega, específicamente para atrapar este tipo de error de orden de
  declaración que Babel no detecta pero sí rompe en el navegador.
- **Notificaciones multi-empresa**: la clave pública VAPID es la misma para
  toda la plataforma (identifica al servidor, no a una empresa) — se dejó fija
  en el código, nadie tiene que copiarla/pegarla.
- **Multi-moneda diseñado a propósito de forma conservadora**: los campos
  fiscales (`subtotal`/`itbis`/`total`) nunca se tocan — siempre quedan en
  pesos, sin importar la moneda de cotización, para no arriesgar el
  cumplimiento con la DGII ni romper 606/607.
- **Despliegue de Supabase Edge Functions** requiere Supabase CLI (no se hace
  desde el SQL Editor). En Windows se instala con Scoop. Ya quedó instalado,
  conectado (`supabase link`) y con las 3 funciones desplegadas.
- Preferencia de trabajo confirmada: entregas paso a paso, con SQL +
  validación antes de seguir a la siguiente mejora, y sin explicaciones de
  más salvo que se pidan.
