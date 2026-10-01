# MantenPro — Resumen de sesión (26 sep – 1 oct 2026)

## Acuerdos de trabajo
- Todo JSX se valida con Babel + esbuild (desde el inventario, también con revisión de variables sin definir) antes de entregarse; todo SQL con pglast.
- Funciones de dinero, fiscales o RLS: no se adivinan. Primero se pide el código real (consulta de solo lectura en un solo resultado, porque el SQL Editor muestra solo el último) y después se cambia.
- Las migraciones corren dentro de una transacción y verifican que la anterior ya se aplicó.
- Datos actuales: son de prueba; se borrarán antes de las empresas piloto (por eso no se corrigieron datos viejos).
- Los dólares y otras funciones que dependen de cada empresa son configurables por empresa (multi-tenant), apagadas por defecto.

## Código final
- `mantenpro-prototipo.jsx` — versión del 1-oct (guardada en el Proyecto).
- SQL, **en este orden** (cada uno es requisito del siguiente cuando lo indica):
  1. `pagos-con-tarjeta.sql` — adquirentes y datos del voucher
  2. `campos-606.sql` · 3. `campos-607.sql` · 4. `moneda-renglones.sql`
  5. `cobros-en-dolares.sql` → 6. `dolares-por-empresa-y-cuentas.sql` → 7. `recibos-y-retencion-isr.sql`
  8. `crear-anular-factura-servidor.sql` → 9. `costo-promedio.sql` → 10. `inventario-por-sucursal.sql`
  11. `contratos-norma-0205.sql` · 12. `emitir-b11-b13.sql`
- Regla: correr el SQL y **enseguida** subir el JSX (8 y 10 cierran caminos que la app vieja usa).

## Qué se hizo
- **Caja:** pagos con tarjeta (adquirente, aprobación, comisión, neto); cobros en US$ con tasa del día y diferencia cambiaria; caja con efectivo en US$; recibo de ingreso numerado (REC-); retención de ISR del cliente.
- **Facturación (servidor):** `create_invoice` / `void_invoice` en una transacción — valida NCF (vencido, tipo vs cliente, B01 exige RNC), descuento, cliente; calcula totales; motivo de anulación (608). Se cerraron inserciones/ediciones directas de facturas. Vendedores con permiso ya pueden facturar.
- **Fiscal:** 606 (incluye gastos con NCF, columnas completas, lista de faltantes), 607 (notas de crédito, forma de venta, tipo de ingreso, retenciones), 608, resúmenes IT-1 e IR-17 (ITBIS retenido va en IR-17), emisión de B11/B13, avisos de secuencias NCF.
- **Dinero:** renglones siempre en RD$ (US$ aparte); notas de crédito a la tasa y con el descuento de la factura; tope de cobro por saldo; estado de pago cuenta notas de crédito.
- **Bancos:** moneda por cuenta, cuenta destino en transferencias, conciliación por cuenta sin efectivo ni duplicados.
- **Inventario:** costo promedio ponderado, costo de venta en el estado de resultados, stock por sucursal, transferencias (TR-), ajustes con motivo, kárdex.
- **Otros:** paginación (adiós al límite de 1,000 filas), tema claro/oscuro, mensajes claros para notificaciones push bloqueadas, contratos con B01 y Norma 02-05.

## Hallazgos importantes
- La DGII exige e-CF a pequeños y micro desde el **15-nov-2026** (Aviso 06-26).
- Antes: se podía cobrar más que el saldo; admin/supervisor podían editar facturas emitidas; el trigger de sucursal de productos bloqueaba ventas de vendedores. Todo corregido.
- El límite de descuento sí estaba protegido en el servidor (trigger).

## Pendiente
- **e-CF:** en conversación con el proveedor (Mileto).
- **#11 Contabilidad:** espera el catálogo de cuentas del contador.
- **#18 Nómina** y **#19 dividir el código por módulos**.
- **Dominio propio:** falta la dirección exacta para cambiar `APP_URL`; luego Supabase (Site URL/Redirect URLs), Vercel y reinstalar la PWA.
- **Nombre del producto:** pospuesto.
- **Confirmar con el contador:** ITBIS por adelantar en 606; formas de venta del 607 con retención 02-05 y en notas de crédito; mes del 608; RNC en 606 de gastos B13; retenciones en compras B11; base gravada IT-1 (ITBIS ÷ 18%).

Documento de análisis completo: «MantenPro ERP — Análisis y hoja de ruta» (Docs).
