# Resumen de sesión — MantenPro

## Código final
Todo el trabajo de esta sesión está en un único archivo, entregado varias veces
de forma acumulativa a lo largo del chat:

**`src/mantenpro-prototipo.jsx`**

Cada entrega fue validada con Babel (sintaxis) y esbuild (bundle, para atrapar
errores de orden de declaración) antes de compartirse. La última versión
entregada en este chat es la vigente — reemplaza el archivo completo en el
repo, no se parchea a mano.

## Funcionalidades acordadas y construidas

**Cotizaciones / Ventas**
- Se quitó "convertir en factura" directo desde cotización — ahora el flujo
  obligatorio es Cotización → Orden de Venta → Factura.
- Botón de eliminar cotización (con policy de RLS correspondiente).
- Campo "Observaciones" libre en cotizaciones, órdenes de venta y facturas
  (sale impreso) — para pedir adelantos u otras notas.
- Renglón de trabajo/descripción libre en cotizaciones y facturas, sin
  necesidad de vincularlo a un producto del catálogo.
- RNC del cliente/proveedor visible en cotizaciones, órdenes de venta,
  compras y facturas (pantalla e impreso).
- Número de factura interno (`FAC-00001`), separado del NCF fiscal.
- Varias cuentas bancarias de la empresa, seleccionables al facturar,
  impresas como referencia de pago.
- Contratos recurrentes: campo de fecha de término (deja de facturar solo
  después de esa fecha).

**Inventario / Herramientas**
- Productos compuestos (kits): un solo renglón en cotización/factura que,
  al facturarse, descuenta cada componente por separado del almacén.
- Campo de sucursal ("dónde está guardado") en productos, con filtro en el
  listado. Un usuario con sucursal fija en su perfil solo puede asignar
  productos a su propia sucursal (reforzado también a nivel de base de
  datos, no solo en pantalla).
- Gestión de Equipos: filtros por técnico asignado, sucursal y tipo;
  selección múltiple y borrado en lote.
- Listados de herramientas (kits de herramientas): se arman una vez y se
  asignan por cantidad a técnicos específicos, descontando del disponible
  del listado.
- Préstamo de herramientas entre técnicos (peer-to-peer), con confirmación
  de recepción en ambos sentidos y registro de quién prestó qué a quién.
- Vista de "mis herramientas" del técnico rediseñada como listado por kit,
  en vez de tabla.

**Conciliación / Contabilidad**
- Ventana de coincidencia automática en conciliación bancaria ampliada de
  5 a 45 días (por créditos a clientes/proveedores).
- Corrección del error al guardar el Perfil de la Empresa (faltaba policy
  de UPDATE en `companies`).

**Catálogo RNC (DGII)**
- Nueva pantalla para importar el listado oficial de RNC de la DGII
  (archivo TXT que hay que descargar y subir manualmente cada cierto
  tiempo — la DGII no tiene API en tiempo real).
- Autocompletado del nombre del cliente al escribir un RNC ya importado;
  enlace a la consulta manual de la DGII cuando no aparece en el catálogo
  (cubre personas físicas "registradas" sin RNC de contribuyente).

**Usuarios y permisos**
- Gestión de usuarios ampliada: asignar sucursal fija, y
  activar/desactivar el acceso de un empleado sin borrar su historial.
- Historial de actividad y de cada registro muestra el nombre del usuario,
  no su correo.

**Interfaz**
- Corregido un bug real: los campos de precio/cantidad con
  `type="number"` perdían lo escrito al tipear decimales — se cambiaron a
  texto con teclado numérico en toda la app.
- Todas las pantallas de listados se convirtieron de tabla a tarjetas
  (Órdenes, Cotizaciones, Facturación, Clientes, Productos, Compras,
  Notas de Crédito, Contratos, Cuentas por Cobrar/Pagar, Herramientas,
  Incidentes, Historial de actividad, Usuarios, y el resto de
  Administración).
- Nueva sección "Informes" que reúne los reportes por departamento
  (Técnico, Comercial/Ventas — nuevo, Financieros, Fiscales DGII) en un
  solo menú.
- Descarga en PDF (además de CSV) para el Historial de actividad.

## Migraciones SQL entregadas (correr todas, en orden, si falta alguna)
1. `migracion-fecha-termino-contratos.sql`
2. `migracion-eliminar-cotizacion.sql`
3. `migracion-perfil-empresa-rls.sql`
4. `migracion-numero-factura-pago-deadline.sql`
5. `migracion-productos-compuestos.sql`
6. `migracion-cuentas-bancarias.sql`
7. `migracion-observaciones.sql`
8. `migracion-listados-herramientas.sql`
9. `migracion-catalogo-dgii.sql`
10. `migracion-sucursal-productos.sql`
11. `migracion-restriccion-sucursal-productos.sql`
12. `migracion-gestion-usuarios.sql`
13. `migracion-prestamos-herramientas.sql`

Todas usan `if not exists` / `drop policy if exists` — son seguras de
volver a correr sin duplicar nada.

## Puntos clave / aprendizajes
- **Patrón de trabajo confirmado**: una mejora a la vez, con su SQL y
  validación (Babel + esbuild) antes de entregar, sin explicaciones de más
  salvo que se pidan.
- **Bug recurrente de RLS**: varias veces la causa raíz de un error fue que
  faltaba la policy de `UPDATE`/`DELETE` en Supabase (no solo `SELECT`) —
  siempre verificar las 4 operaciones al agregar una tabla o función nueva.
- **Bug de inputs numéricos**: nunca usar `type="number"` en React para
  precios/cantidades — usar `type="text" inputMode="decimal"` para evitar
  que el navegador borre lo escrito a mitad de tipeo.
- **DGII no tiene API en tiempo real**: ni para RNC de contribuyentes
  (existe archivo descargable oficial, sí importable) ni para cédulas de
  personas registradas sin fines de contribuyente (no hay archivo, solo
  consulta manual uno por uno).
- **Desactivar usuarios, no borrarlos**: se usó un flag `is_active` en vez
  de eliminar el registro, para no romper el historial de documentos ya
  creados por ese usuario. El bloqueo de acceso hoy es a nivel de
  aplicación; falta reforzarlo a nivel de RLS si se comparte la definición
  de la función `auth_company_id()`.
- **"Pedidos a Proveedores"** sigue siendo un módulo placeholder sin
  funcionalidad real — pendiente si se necesita en el futuro.
