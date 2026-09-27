# MantenPro — Resumen de sesión (24–26 de septiembre de 2026)

**Archivo de trabajo:** `mantenpro-prototipo.jsx`

## Acuerdos de trabajo (forma de operar)
- Todo cambio de JSX se valida con **esbuild + Babel** antes de entregarse.
- Todo cambio de SQL se valida con **pglast** (parser real de Postgres) antes de entregarse, y se entrega como archivo `.sql` descargable.
- Para RLS o funciones de alto riesgo (dinero, fiscal) no se adivina: se piden las políticas/funciones reales (`pg_policies`, `pg_get_functiondef`) antes de tocar nada.
- El usuario corre el SQL en el SQL Editor de Supabase y reporta resultado o errores.

## 1. Panel (Dashboard) — rediseño tipo "app launcher"
- Pantalla de inicio con iconos grandes de acceso rápido (estilo Odoo), junto al menú lateral (no lo reemplaza).
- Se quitaron del Panel: KPIs, gráfico de barras, lista de órdenes recientes y las 4 alertas — quedan solo los iconos.
- **Drill-down de tres niveles:** 4 departamentos → subsecciones de cada uno → renglones de los ítems con submenú (Inventario, Catálogo, Compras, Ventas, Gestión Contable). Antes estos últimos se aplanaban y sus renglones se perdían; ahora aparecen como un ícono más que abre un tercer nivel.
- **Botón "atrás"** (navegador/celular) integrado al historial real (`pushState`/`popState` con `{view, dept, sub}`): retrocede paso a paso por los tres niveles antes de salir de la app, en vez de saltar directo al Panel.
- Menú lateral: ahora se puede colapsar hacia la izquierda (botón `‹`/`›`), sin perder la sección abierta.
- Color de marca: de naranja claro a **verde claro** (botones, franja del navegador móvil, ícono de splash "M" — se generaron 5 PNGs nuevos). Íconos del launcher y los 4 departamentos, más grandes.
- Los botones "Crear varias" / "Nueva orden" quedaron restringidos a la vista de Órdenes de trabajo (ya no aparecen en el Panel).

## 2. Cotizaciones y clientes — catálogo DGII
- El campo **Cliente** de Cotizaciones busca a la vez entre los clientes ya registrados y el catálogo DGII importado (`dgii_rnc_catalog`), por nombre o nombre comercial.
- Al elegir un resultado del catálogo DGII, el cliente se crea en Clientes al vuelo y queda **seleccionado de inmediato** en la cotización — sin pasar por el botón "+".
- El modal "Agregar cliente" (compartido por Cotizaciones, Facturación, Incidentes y Activos de cliente) también tiene su propio buscador por nombre en el catálogo DGII.
- Al crear un cliente nuevo con el botón "+" en cualquiera de esos 4 formularios, ese cliente queda **seleccionado automáticamente** en el formulario donde se creó.
- Pendiente si se pide: llevar la búsqueda directa (sin "+") también a Facturación e Incidentes — hoy solo está en Cotizaciones.

## 3. Caja y facturación — hallazgos y cambio aplicado
- **Confirmado y aceptado así:** crear/emitir una factura no depende de que la caja esté abierta.
- **Confirmado:** la caja está seccionada por **sucursal**, no por usuario — el saldo es la suma de todos los pagos de esa sesión sin importar qué vendedor los registró. Vendedores de la misma sucursal comparten la misma caja.
- **Hallazgo:** `register_invoice_payment` buscaba la caja abierta de la sucursal para vincular el pago, pero si no encontraba ninguna, igual registraba el pago con `cash_session_id = null` — quedaba invisible en cualquier cuadre.
- **Cambio aplicado** (migración `bloquear-pago-sin-caja-abierta.sql`, corrida por el usuario): `register_invoice_payment` ahora bloquea el pago si la factura no tiene sucursal asignada, o si la sucursal no tiene una caja abierta en ese momento. No toca `open_cash_session`, `close_cash_session` ni la creación de la factura.
- **Aclarado:** en facturas a crédito, cada pago se vincula a la caja abierta el día en que se **registra el pago** (no el día de la factura); pagos parciales en días distintos pueden caer en sesiones de caja distintas.

## 4. Pendiente al cerrar esta sesión
- **Editar factura después de emitida:** se quiere poder editar la nota general y/o la descripción de los renglones, sin permitir tocar cantidades, precios, subtotal, ITBIS, total ni el NCF.
  - Se pidió el resultado de una consulta de solo lectura a `pg_policies` de `invoices` e `invoice_items` (`ver-rls-invoices.sql`) para confirmar si ya existe alguna política UPDATE abierta, antes de diseñar la función RPC + protección a nivel de base de datos (mismo patrón que `register_invoice_payment`). **Aún no se recibió esa respuesta.**

## Temas explícitamente postergados (de sesiones anteriores, siguen abiertos)
- Botón para eliminar empresa vacía (migración `eliminar-empresa-vacia-rpc.sql` sin correr).
- Búsqueda de dominio propio (`mantenpro.com` y `.app` ocupados).
- Activar Supabase Pro ($25/mes) — se hará cuando la primera empresa piloto esté lista (hoy en plan Free: sin backups, se pausa a los 7 días de inactividad).
- Confirmar si las empresas piloto manejan e-CF (facturación electrónica) — falta ese dato.

## Archivos SQL entregados en esta sesión
- `ver-register-invoice-payment.sql` — solo lectura, trajo el código de `register_invoice_payment`, `open_cash_session`, `close_cash_session`.
- `bloquear-pago-sin-caja-abierta.sql` — **aplicada** (bloquea pago sin caja abierta).
- `ver-rls-invoices.sql` — solo lectura, **respuesta pendiente**, necesaria para el punto de editar factura.

## Archivo de trabajo
`mantenpro-prototipo.jsx` se entregó actualizado varias veces (Panel de 3 niveles + historial, búsqueda DGII en Cotizaciones, auto-selección de cliente nuevo). Cada entrega se validó con esbuild + Babel antes de enviarse.
