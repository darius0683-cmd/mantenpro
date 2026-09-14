# Resumen de sesión — MantenPro

## Archivo final
Todo el código vive en `src/mantenpro-prototipo.jsx`. Se fue entregando actualizado en cada turno de esta sesión.

## Funciones agregadas (en orden)

1. **Notas y comprobantes de pago en facturas** — campo de notas y subida de uno o varios archivos al registrar un cobro.
2. **Menú reorganizado en submenús colapsables**: Catálogo (Clientes, Productos, Servicios, Activos en Garantía), Ventas (Cotizaciones, Órdenes de Venta, Facturación, Notas de Crédito, Caja), Compras, Gestión Contable, Administración. Todas las secciones se pueden expandir/colapsar.
3. **Servicios** en el catálogo (mismo catálogo de productos con campo Tipo: Producto/Servicio).
4. **Arrastrar y soltar (drag & drop)** para reordenar renglones/capítulos en Cotizaciones, Facturación y Compras (reemplazó los botones subir/bajar).
5. **Buscador de fecha específica** en la Agenda (resalta el día).
6. **Activos en Garantía generados desde Facturación**: al facturar se puede marcar un renglón para registrarlo automáticamente como activo con garantía.
7. **Compras (Factura de proveedor)**:
   - Cotejo de ITBIS por renglón (igual que Ventas).
   - Retenciones **Ley 254-06** (ITBIS 100% e ISR 10%) como cotejos independientes, con nota impresa "Aplica Reglamento 254-06".
   - Subida de factura en PDF que autocompleta proveedor (si ya existe), No. de factura, fecha, y crea un renglón automático por el total detectado (heurística de texto, no OCR/IA).
8. **Facturación**:
   - Cotejo de **retención ITBIS 30% (Norma 02-05)**.
   - Cotejo de **factura exenta de ITBIS** (toda la factura).
9. **Cuentas por Cobrar / Cuentas por Pagar** con antigüedad de saldos (aging).
10. **Catálogo de cuentas, Otros gastos, Tasas impositivas** (módulos nuevos con CRUD completo).
11. **Reportes fiscales 606 (Compras) y 607 (Ventas)** — exporta CSV con las columnas exactas de las plantillas oficiales de la DGII, por período (mes). Algunas columnas quedan en blanco porque el sistema no captura ese dato aún (tipo de bien/servicio, forma de pago/venta).
12. **Rol "Vendedor"** (convive con Supervisor): cotiza, factura y controla la caja de su sucursal asignada.
13. **Caja (apertura/cierre y cuadre)** por sucursal: controla Efectivo, Tarjeta y Transferencia por separado; calcula lo esperado vs. lo declarado y exige nota si hay descuadre. Historial de cuadres por sucursal.
14. **Permisos por usuario, sección por sección**, con 3 niveles: Sin acceso / Ver / Editar. Reemplaza los permisos fijos por rol — el admin puede personalizar exactamente qué ve y qué puede editar cada usuario (incluyendo Panel, Agenda y Órdenes de trabajo, antes fijos). Aplicado tanto a la visibilidad de cada sección del menú como a los botones de agregar/editar/eliminar dentro de cada una.
15. **"Anular factura" restringido solo a Admin**, sin importar el permiso que tenga configurado el usuario en Facturación.
16. **Modo Soporte** (solo lectura, para ti como dueño de la plataforma): pantalla especial para cuentas marcadas como `platform_admins`, con selector de cualquier empresa y pestañas de solo lectura (Usuarios, Clientes, Catálogo, Órdenes, Cotizaciones, Órdenes de Venta, Facturas, Compras, NCF, Caja).

## Puntos clave / acuerdos

- **Aislamiento multi-empresa**: cada tabla tiene `company_id`, y las políticas RLS de Supabase (usando `auth_company_id()`) garantizan que una empresa nunca vea datos de otra — el aislamiento es a nivel de base de datos, no solo de interfaz.
- **Bug de código vs. bug de datos**: un bug de código (lógica de la app) afecta a todas las empresas por igual, ya que comparten el mismo despliegue. Un bug de datos (un registro puntual mal cargado) solo afecta a la empresa dueña de esos datos.
- **Soporte a clientes hoy**: diagnóstico y corrección directa vía Supabase (Table Editor / SQL Editor), que tiene privilegios de administrador y no le aplica RLS. El "Modo Soporte" construido en la app es solo para diagnóstico visual (lectura), no reemplaza el acceso a Supabase para corregir datos.
- **El rol "admin" es de la aplicación, no de la base de datos** — no da ningún acceso a Supabase ni a SQL. El acceso a la base de datos es exclusivamente tuyo, vía tu propia cuenta de Supabase.
- **Al crear una empresa nueva**, quien la crea queda automáticamente como `role: "admin"` de esa empresa.
- **Después de cada cambio de código/SQL**, no se dan explicaciones ni pasos de instalación/despliegue a menos que se pidan explícitamente (preferencia guardada de sesiones anteriores).

## Librería nueva agregada al proyecto
- `pdfjs-dist` — lectura de texto de PDF (checklists y facturas de proveedor). **Este fue el causante del build que falló en Vercel** — el paquete se usaba en el código pero nunca se había instalado (`npm install pdfjs-dist`) ni committeado en `package.json`/`package-lock.json`.

## SQL pendiente / ya ejecutado
Se entregó un script SQL consolidado con todo lo pendiente de la sesión (tablas nuevas, columnas nuevas, políticas RLS, funciones `is_company_admin()` e `is_platform_admin()`). Se confirmó ejecución exitosa ("Success. No rows returned").

**Pendiente de confirmar:** si `invites.permissions` quedó correctamente como `jsonb` (igual que `profiles.permissions`, que ya se confirmó). Si al usar invitaciones da error de tipo de dato, hay que migrarla con el mismo patrón usado para `profiles` (agregar columna nueva, copiar datos convertidos, borrar la vieja, renombrar).

## Pendiente para una próxima sesión
- Módulos aún no construidos (solo aparecen como "en desarrollo" en el menú): Pedidos a Proveedores, Nota de entrega proveedores, Reportes fiscales avanzados más allá del 606/607 CSV.
- Terminar de aplicar los niveles de permiso Ver/Editar a algunos modales de detalle que quedaron pendientes de una revisión exhaustiva (se cubrieron los principales: compras, facturas, cotizaciones, órdenes de venta, órdenes de trabajo, incidentes, checklists).
- Confirmar que el despliegue en Vercel compiló bien después de instalar `pdfjs-dist`.
