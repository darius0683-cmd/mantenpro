# MantenPro — Resumen de sesión (auditoría de seguridad + mejoras)

**Fecha:** 19–21 de septiembre de 2026
**Archivo de trabajo:** `mantenpro-prototipo.jsx`

## Acuerdos de trabajo (forma de operar)

- Se revisa un hallazgo a la vez ("seguimos" para avanzar al siguiente).
- Todo cambio de JSX se valida con Babel + esbuild antes de entregarse.
- Todo cambio de SQL se valida con un parser real de Postgres (`pglast`) antes de entregarse, y se entrega como archivo `.sql` descargable (no pegado en el chat, para evitar truncamientos).
- Para cambios de RLS de alto riesgo (`profiles`, `invites`, `notifications`, `work_orders`), no se adivina: se piden las políticas reales (`pg_policies`) antes de tocar nada.
- El usuario corre todo el SQL en el editor de Supabase y reporta resultado/errores.

## 1. Auditoría de seguridad — hallazgos resueltos

### Dinero y operaciones críticas (RPCs `security definer`)
- `void_invoice`, `register_invoice_payment`, `open_cash_session`, `close_cash_session`, trigger de límite de descuento.

### Privilegios de usuario (ALTA)
- 5 funciones `admin_*` (rol, permisos, descuento máx., sucursal, activar/desactivar) con protección contra auto-bloqueo.

### Nota de crédito (ALTA)
- `apply_credit_to_invoice`: bloqueo de fila + tope duro, evita sobregiro del crédito aplicado.

### Pagos a proveedores / facturas (MEDIA)
- `register_purchase_payment`, `delete_purchase_payment`, `delete_invoice_payment`.

### Numeración interna y contratos recurrentes (BAJA/MEDIA)
- Tabla `document_counters` + `next_document_number` (evita números de factura/cotización/orden duplicados).
- `claim_contract_invoice_run` (evita doble facturación del mismo contrato recurrente).

### Invitaciones de usuario (ALTA)
- `admin_create_invite`, `accept_invite`, `get_invite_by_token` — reemplazan inserts directos del cliente.

### RLS reales corregidas (a partir de políticas pegadas por el usuario)
- **`profiles` / `invites`**: se cerró auto-escalación de rol (`profiles_update_own` no limitaba columnas), fuga total de invitaciones (`invites_select_by_token` con `using(true)`), y una rama de `profiles_insert_own` que dejaba insertar con rol arbitrario.
- **`notifications`**: las 4 políticas solo filtraban por empresa, no por usuario — cualquiera dentro de la empresa podía leer/marcar/borrar notificaciones de un compañero. Se agregó un trigger de columnas para preservar el caso legítimo (quien envía actualiza el estado de envío).
- **`work_orders`**: el técnico asignado podía, llamando a la API directo, cambiar cualquier columna de su orden (reasignarla, cambiar sucursal, título, prioridad). Se agregó un trigger que solo le permite tocar los campos que la app ya le expone (notas, foto, estado, horas, tarifa, firma).

### Bucket de Storage `evidence` (hallazgo pendiente, ahora resuelto)
- Bucket pasó de público a **privado**. La carpeta `logos/` es la única excepción pública.
- Fotos de órdenes, firmas y comprobantes de pago ahora usan **URLs firmadas** (vencen en 7 días) en vez de URLs públicas fijas.
- Se agregaron columnas `*_path` para poder regenerar el enlace firmado automáticamente cada vez que se abre el detalle de una orden o se ven los comprobantes de un pago — así los datos viejos no quedan con enlaces rotos.
- **Importante:** las URLs públicas ya guardadas dejaron de servir en cuanto se corrió el SQL; se renuevan solas la próxima vez que se abre esa orden/pago.

### Duplicados al importar estados de cuenta bancarios (integridad de datos)
- Índice único (empresa + fecha + descripción + monto) + `upsert` con `ignoreDuplicates`. Subir el mismo archivo dos veces ya no duplica movimientos.

## 2. KPIs del departamento técnico (Informes)

Nuevos indicadores agregados, sin romper nada de lo que ya existía:
1. **Cumplimiento de fecha límite** — % de órdenes cerradas a tiempo (antes solo se medía si se completó, no si fue a tiempo).
2. **Órdenes vencidas** — tabla en tiempo real de órdenes abiertas que ya pasaron su `deadline`, con días de atraso.
3. **Tasa de reapertura** — % de órdenes reabiertas después de cerradas (requirió una columna nueva, `reopened_count`, que la app incrementa sola; el historial anterior a este cambio no se puede reconstruir).

Pendiente, si se quiere seguir: tiempo promedio de reparación por técnico y cumplimiento de checklist al cerrar.

## 3. Ficha de Almacén ampliada

Se agregaron los campos que faltaban en `inventory_materials`: descripción, ID/código de repuesto, número de parte, número de serie, stock máximo y ubicación en el almacén. Stock actual y stock mínimo ya existían. Los materiales ya registrados quedan con estos campos vacíos hasta que se editen.

## 4. Pendiente explícito (decisión del usuario)

Nada queda pendiente de la auditoría original — todos los hallazgos de las 3 rondas de diagnóstico, más el del bucket de Storage, están resueltos.

## Archivos SQL entregados en esta sesión (correr en orden si no se han corrido)

1. `respaldo-rls-dinero.sql`
2. `respaldo-rls-usuarios.sql`
3. `respaldo-rls-nota-credito.sql`
4. `respaldo-rls-pagos.sql`
5. `respaldo-numeracion-contratos.sql`
6. `respaldo-rls-invitaciones.sql`
7. `rls-profiles-invites.sql`
8. `rls-notifications.sql`
9. `respaldo-duplicados-banco.sql`
10. `rls-work-orders.sql`
11. `rls-storage-evidence.sql`
12. `kpi-departamento-tecnico.sql`
13. `almacen-ficha-repuestos.sql`

El archivo `mantenpro-prototipo.jsx` entregado al final de la sesión incluye todos los cambios de código correspondientes a estos 13 archivos SQL.
