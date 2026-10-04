// Manual de ayuda: se abre desde el botón "Ayuda" del pie del menú (junto a Tema).
// Se carga solo cuando alguien lo abre (ver lazy.jsx). Las imágenes viven en public/*.webp
// y se descargan al ver cada tema. Cada empresa ve solo la ayuda de los módulos que tiene.
//
// Para agregar un tema: añadirlo a HELP_TOPICS (module, group, title, summary, steps con su
// imagen, tips). Las capturas se generan con datos de demostración (sin datos reales).
import React, { useMemo, useState } from "react";
import { BookOpen, ChevronDown, ChevronLeft, ChevronRight, Lightbulb, Search, X } from "lucide-react";
import { C } from "./base.jsx";

// Subir este número cuando se reemplacen imágenes con el mismo nombre (evita que el navegador
// muestre la versión vieja guardada en caché).
const IMG_VERSION = "2";
// Las imágenes están en la raíz de "public" (ot-1.webp, mat-1.webp, …).
const imgUrl = (name) => `/${name}.webp?v=${IMG_VERSION}`;

const MODULE_TITLES = {
  tecnico: "Departamento Técnico",
  comercial: "Comercial",
  contable: "Gestión Contable",
  administracion: "Administración",
  nomina: "Nómina",
};

// requires: módulos que además debe tener la empresa para ver ese tema
export const HELP_TOPICS = [
  {
    id: "crear-orden",
    module: "tecnico",
    group: "Órdenes de trabajo",
    title: "Crear una orden de trabajo",
    summary: "Registra un trabajo para un equipo, asígnalo a un técnico y dale seguimiento hasta cerrarlo.",
    keywords: "nueva orden ot trabajo asignar tecnico programar fecha limite preventivo correctivo",
    steps: [
      { text: "En el menú entra a **Órdenes de trabajo** (1) y toca **Nueva orden** (2), arriba a la derecha.", img: "ot-1" },
      { text: "Escribe un **título** corto que diga qué pasa (1), elige el **tipo** de mantenimiento (2), la **fecha programada** (3), el **equipo** (4) y el **técnico principal** (5). La prioridad, la fecha límite, los técnicos adicionales y los archivos de apoyo son opcionales. Toca **Crear orden** (6).", img: "ot-2" },
      { text: "La orden aparece en la lista y en la Agenda del técnico. Desde la tarjeta se cambia el estado: **En progreso** (1) cuando se empieza. **Completada** (2) abre la orden, porque para cerrarla se pide la nota de cierre.", img: "ot-3" },
    ],
    tips: [
      "Para crear muchas órdenes iguales (por ejemplo, el preventivo de varios equipos) usa **Crear varias**.",
      "Si pasa la fecha límite y la orden no está completada, se marca en rojo como vencida.",
      "Con **Imprimir lista** sacas en papel o PDF las órdenes que se ven con los filtros puestos.",
    ],
  },  {
    id: "cerrar-orden",
    module: "tecnico",
    group: "Órdenes de trabajo",
    title: "Completar y cerrar una orden (checklist, nota, fotos y firma)",
    summary: "Lo que el técnico registra al terminar el trabajo, y cómo se cierra la orden con todo en regla.",
    keywords: "cerrar orden completar checklist nota cierre fotos antes despues firma cliente informe servicio pdf correo reabrir",
    steps: [
      { text: "Abre la orden. Si tiene **checklist**, responde cada punto: **OK / No OK / N/A** (1), una **lectura numérica** (2) que se marca en rojo si sale del rango esperado, o la casilla de cotejo. Si un punto sale mal, puedes **Reportar como incidente** (3) desde ahí mismo.", img: "close-1" },
      { text: "Escribe la **nota de solución / cierre** (1): qué se hizo, qué se encontró y qué se recomienda. Sube las **fotos de antes** (2) y **de después** (3) del trabajo.", img: "close-2" },
      { text: "Para la **firma del cliente**, escribe el nombre de quien firma (1), que firme con el dedo o el mouse en el cuadro (2) y toca **Guardar firma** (3).", img: "close-3" },
      { text: "Abajo, la app te dice qué falta para poder cerrar (1). Con **Imprimir / descargar PDF** (2) sacas el informe de servicio, o lo envías por correo al cliente. Cuando ya no falta nada, toca **Cerrar orden** (3) y la orden queda **Completada**.", img: "close-4" },
    ],
    tips: [
      "Para cerrar una orden hacen falta tres cosas: el checklist completo (si tiene), la nota de cierre y la firma del cliente.",
      "El informe de servicio incluye el checklist, los materiales usados, las horas, las fotos de antes y después y la firma.",
      "Con **Guardar** registras el avance sin cerrar la orden.",
      "Un supervisor o administrador puede **Reabrir** una orden completada: vuelve a \"En progreso\" y el checklist queda editable otra vez.",
      "Si no aparece ningún checklist, el supervisor puede cargar uno al abrir la orden (se sugieren los del mismo tipo de equipo).",
    ],
  },
  {
    id: "llegada-salida",
    module: "tecnico",
    group: "Órdenes de trabajo",
    title: "Marcar llegada y salida en una orden",
    summary: "El técnico marca \"Llegué\" y \"Terminé\" desde el celular; queda la hora y la ubicación, y las horas reales pasan a la mano de obra y a la nómina.",
    keywords: "llegada salida llegue termine check in check out gps ubicacion hora horas reales en sitio visita nomina mano de obra",
    steps: [
      { text: "El técnico abre su orden en el celular y toca **Llegué** (1). La app toma la hora (la del sistema, no la del teléfono) y la ubicación del celular. Si la orden estaba **Pendiente**, pasa sola a **En progreso**.", img: "vis-1" },
      { text: "Mientras trabaja ve el tiempo **en sitio** (1). Al terminar toca **Terminé** (2). Cada visita queda con su enlace al mapa (3) para comprobar dónde estaba.", img: "vis-2" },
      { text: "El supervisor ve en **Técnicos** quién está en sitio y en qué orden (1). Con **Horas en sitio** (2) abre el reporte.", img: "vis-3" },
      { text: "En el reporte eliges las fechas (1) y ves las horas de cada técnico (2), listas para la **nómina**. Se puede imprimir o bajar en **Excel** (3) con el detalle de cada visita.", img: "vis-4" },
      { text: "Si un técnico olvidó marcar la salida, el supervisor le pone la hora con **poner salida** desde la orden; queda marcada como **salida puesta a mano** (1). Al cerrarse cada visita, las horas pasan **solas** a la mano de obra de la orden (2) con la tarifa del técnico, y el administrador ve el costo.", img: "vis-5" },
    ],
    tips: [
      "Un técnico solo puede estar en sitio en **una orden a la vez**: para llegar a otra, primero marca Terminé en la anterior.",
      "Si el celular no da la ubicación (permiso negado o sin señal), la llegada igual se marca, pero queda como **sin ubicación**.",
      "Una orden puede tener varias visitas (varios días o varios técnicos); las horas se suman por técnico.",
      "El técnico ve sus horas, pero **no ve la tarifa ni el costo** de la mano de obra; eso solo lo ven administradores y supervisores.",
      "Solo el técnico asignado marca su llegada, y su usuario tiene que estar **vinculado a su ficha de técnico** (Administración → Usuarios). Corregir o borrar visitas lo hacen supervisores y administradores.",
    ],
  },
  {
    id: "agenda",
    module: "tecnico",
    group: "Órdenes de trabajo",
    title: "Agenda: ver el trabajo del mes o de la semana",
    summary: "El calendario con todas las órdenes programadas, por técnico, con colores según su situación.",
    keywords: "agenda calendario mes semana programadas vencidas tecnico dia",
    steps: [
      { text: "Entra a **Agenda**. Arriba eliges ver por **Mes o Semana** (1) y filtras por **técnico** (2). Cada orden aparece en su día (3): tócala para abrirla.", img: "agenda-1" },
      { text: "La vista de **Semana** muestra cada día con sus órdenes y el técnico asignado. Con las flechas cambias de semana y con **Hoy** regresas a la fecha actual.", img: "agenda-2" },
    ],
    tips: [
      "Colores: **azul** = próxima, **amarillo** = hoy, **rojo** = vencida (la fecha ya pasó y no se completó), **verde** = completada.",
      "Arriba sale un aviso rojo cuando hay órdenes vencidas.",
      "Con el buscador de fecha saltas directo a un día.",
      "El técnico ve en la Agenda solo sus propias órdenes.",
    ],
  },
  {
    id: "incidentes",
    module: "tecnico",
    group: "Incidentes",
    title: "Reportar y atender un incidente",
    summary: "Registra una falla o un reporte del cliente, asígnalo, anota lo encontrado y conviértelo en orden de trabajo o en cotización.",
    keywords: "incidente reportar falla averia hallazgos revision completado convertir orden cotizacion sla prioridad",
    steps: [
      { text: "En **Incidentes** toca **Reportar incidente** (1). Cada tarjeta (2) muestra el estado, el técnico, la sucursal y la prioridad.", img: "inc-1" },
      { text: "Escribe el **título** (1) y elige la **prioridad** (2). Si quieres, asígnalo a un **técnico** (3) y vincúlalo al **equipo** (4) y al cliente. Toca **Reportar incidente** (5).", img: "inc-2" },
      { text: "Al abrir un incidente nuevo, el supervisor puede **Marcar en revisión** (1) cuando alguien lo empieza a atender, **Convertir en orden de trabajo** (2) si hay que hacer un trabajo, o **Convertir en cotización** (3) si hay que cobrarle al cliente.", img: "inc-3" },
      { text: "En **Hallazgos** se escribe lo encontrado (1). Con **Guardar avance** (2) se guarda sin terminar. **Marcar como completado** (3) lo cierra.", img: "inc-4" },
    ],
    tips: [
      "Estados: **Abierto** → **En revisión** → **Completado**. Si no procedía, se puede **Descartar**.",
      "La app mide cuánto se tardó en atender y en resolver cada incidente. Lo ves en Reportes, por prioridad.",
      "Un técnico solo puede reportar incidentes si en su ficha está marcado \"Puede reportar incidentes desde la app\".",
      "Desde el checklist de una orden, un punto \"No OK\" se puede convertir en incidente con un toque.",
    ],
  },
  {
    id: "proyectos",
    module: "tecnico",
    group: "Proyectos",
    title: "Proyectos: agrupar órdenes, materiales y costos",
    summary: "Junta en un solo lugar todas las órdenes y materiales de un trabajo grande, y compáralo con el presupuesto.",
    keywords: "proyecto obra presupuesto costo vincular ordenes materiales cliente responsable",
    steps: [
      { text: "En **Proyectos** toca **Nuevo proyecto** (1). Cada tarjeta (2) muestra el cliente, las fechas y cuántas órdenes, materiales y órdenes de venta tiene.", img: "proj-1" },
      { text: "Escribe el **nombre** (1), elige el **cliente** (2), la sucursal y el técnico responsable, y si quieres pon el **presupuesto** (3) y las fechas. Toca **Crear proyecto**.", img: "proj-2" },
      { text: "Dentro del proyecto: busca y **Vincula** las órdenes de trabajo (1). En **Materiales asignados** (2) ves lo usado y su costo. Para agregar material, búscalo, pon la cantidad y toca **Descontar y asignar** (3); se descuenta igual que en una orden.", img: "proj-3" },
    ],
    tips: [
      "Arriba se compara el presupuesto con el costo real de mano de obra de las órdenes vinculadas.",
      "Estados del proyecto: Activo, Pausado, Completado, Cancelado.",
      "Si eliminas un proyecto, sus órdenes quedan sin proyecto y los materiales asignados regresan a su origen.",
    ],
  },
  {
    id: "agregar-equipo",
    module: "tecnico",
    group: "Equipos",
    title: "Agregar un equipo y su plan de mantenimiento",
    summary: "Registra un equipo con sus datos y dile a la app cada cuánto hay que darle mantenimiento.",
    keywords: "agregar equipo nuevo plan mantenimiento preventivo frecuencia proximo horometro kilometraje ubicacion sucursal",
    steps: [
      { text: "En **Gestión de Equipos** toca **Agregar equipo**. Escribe el **nombre** (1) y el **tipo** (2): el tipo sirve para sugerir el checklist correcto. Elige la **sucursal** (3) y la ubicación; con **+** (4) creas una ubicación nueva. En el **plan de mantenimiento** pon cada cuántos días toca (5), la fecha del **próximo** (6) y el **técnico por defecto** (7). Si el equipo se controla por horas o kilómetros, elige la **unidad de uso** (8).", img: "eq-1" },
    ],
    tips: [
      "Si dejas la frecuencia en blanco, el equipo no aparece en \"Mantenimiento programado\".",
      "Con mantenimiento por uso (horómetro o kilometraje), toca mantenimiento cuando la lectura avanza lo indicado en \"Cada cuántas unidades\".",
      "En cada tarjeta de equipo, **Historial** muestra todas sus órdenes.",
      "Para muchos equipos a la vez, usa \"Cargar o actualizar equipos desde Excel\".",
    ],
  },
  {
    id: "equipos-excel",
    module: "tecnico",
    group: "Equipos",
    title: "Cargar o actualizar equipos desde Excel",
    summary: "Descarga la lista, llénala en campo y súbela para cargar muchos equipos de una vez.",
    keywords: "equipos excel cargar subir descargar plantilla campo importar masivo",
    steps: [
      { text: "En **Gestión de Equipos** toca **Descargar Excel** (1). Baja los equipos que se ven con los filtros puestos, o solo los que tengas marcados. Cuando el archivo esté listo, súbelo con **Subir Excel** (2).", img: "xls-1" },
      { text: "En el archivo: para **agregar** equipos escribe filas nuevas al final **dejando vacía la columna ID**, porque la app le pone el ID sola. Para **corregir**, cambia los datos en su fila sin tocar el ID. La hoja **Listas** trae los nombres exactos de las sucursales, ubicaciones, técnicos y clientes.", img: "xls-2" },
      { text: "Al subirlo, la app muestra un resumen antes de guardar: cuántos equipos son nuevos, cuántos se actualizan, cuántos no cambian y qué filas tienen errores, con el motivo. Toca **Cargar** (1) para guardar. Las filas con error no se cargan: corrígelas y vuelve a subir el mismo archivo.", img: "xls-3" },
    ],
    tips: [
      "Borrar una fila del Excel **no** borra el equipo de la app.",
      "Una celda vacía deja ese dato vacío en el equipo (por ejemplo, sin técnico).",
      "La columna **Cliente (dueño)** dice de quién es cada equipo; así sale en el **portal** de ese cliente. Si subes un Excel viejo que no tiene esa columna, los clientes ya asignados no se tocan.",
      "Si escribes una ubicación que no existe en esa sucursal, la app la crea.",
      "Si una fila nueva tiene el mismo nombre que un equipo de la misma sucursal, la app avisa antes de cargar, por si subiste el archivo dos veces.",
    ],
  },  {
    id: "equipos-imprimir",
    module: "tecnico",
    group: "Equipos",
    title: "Imprimir o guardar en PDF la lista de equipos",
    summary: "Saca la lista de equipos operativos, fuera de servicio o todos, en papel o PDF.",
    keywords: "imprimir pdf equipos operativos fuera de servicio lista guardar",
    steps: [
      { text: "En **Gestión de Equipos** elige el estado en el filtro (1): **Operativos**, **Fuera de servicio** o **Todos los estados**. Puedes combinarlo con sucursal, técnico y tipo. Toca **Imprimir / PDF** (2).", img: "print-1" },
      { text: "Se abre la hoja lista para imprimir. Con \"Todos\" trae un resumen, las dos listas por separado y el total. Para guardarla, en la ventana de impresión elige **Guardar como PDF** en vez de una impresora.", img: "print-2" },
    ],
    tips: ["Si marcas algunos equipos con la casilla, se imprimen solo esos."],
  },  {
    id: "equipos-qr",
    module: "tecnico",
    group: "Equipos",
    title: "Etiquetas QR en los equipos",
    summary: "Pega un QR en cada equipo. Al escanearlo se abre su ficha para ver el historial, abrir una orden o reportar una avería.",
    keywords: "qr codigo etiqueta escanear camara celular sticker pegatina ficha equipo historial averia reportar orden",
    steps: [
      { text: "En **Gestión de Equipos** toca **Etiquetas QR** (1) para imprimir las de todos los equipos que ves en pantalla; si marcas algunos, salen solo esos. El ícono QR de cada tarjeta (2) abre la ficha de ese equipo. Para escanear, usa el botón de arriba (3).", img: "qr-1" },
      { text: "Las etiquetas salen dos por fila con el logo, el nombre, la serie y la ubicación del equipo. Recórtalas por la línea punteada o imprímelas en papel adhesivo, y pégalas en un lugar visible del equipo.", img: "qr-2" },
      { text: "Al escanear se abre la ficha: datos y **próximo mantenimiento** (1). Desde ahí puedes **reportar una avería** (2) o **abrir una orden de trabajo** (3), con el equipo, la sucursal y el técnico ya puestos. Abajo ves los **últimos trabajos** hechos al equipo (4).", img: "qr-3" },
    ],
    tips: [
      "También funciona con la cámara normal del teléfono: abre MantenPro y, si la persona no ha iniciado sesión, se lo pide primero.",
      "En iPhone, si usas MantenPro instalado en la pantalla de inicio, escanea con el botón de la app: así no te pide iniciar sesión en Safari.",
      "Solo ven la ficha los usuarios de tu empresa; una etiqueta escaneada por alguien de fuera no muestra nada.",
      "Para que dure en exteriores o cuartos de máquinas, cubre la etiqueta con cinta transparente o imprímela en vinil.",
    ],
  },
  {
    id: "mantenimiento-programado",
    module: "tecnico",
    group: "Equipos",
    title: "Mantenimiento programado: generar las órdenes preventivas",
    summary: "La lista de equipos a los que ya les toca (o les va a tocar) mantenimiento, para crear sus órdenes con un toque.",
    keywords: "mantenimiento programado preventivo generar ordenes vencido proximo horometro lectura frecuencia",
    steps: [
      { text: "Entra a **Mantenimiento programado**. Con **Generar todas las vencidas** (1) se crean de una vez las órdenes de todos los equipos que ya tocan, o puedes usar **Generar orden** (2) equipo por equipo. Los vencidos salen en rojo (3) y los próximos 7 días en amarillo. En los equipos por uso, escribe la lectura nueva y toca **Actualizar** (4).", img: "maint-1" },
    ],
    tips: [
      "Cada orden generada es preventiva, con fecha de hoy y asignada al técnico por defecto del equipo, que recibe el aviso.",
      "Al generar la orden, la fecha del próximo mantenimiento avanza sola según la frecuencia (por ejemplo, 90 días).",
      "Los equipos fuera de servicio no aparecen aquí.",
      "Los activos instalados en clientes (Activos en Garantía) también salen en esta pantalla, en su propia lista.",
    ],
  },
  {
    id: "checklists",
    module: "tecnico",
    group: "Checklists",
    title: "Crear un checklist",
    summary: "Arma la lista de puntos que el técnico debe revisar en cada tipo de equipo.",
    keywords: "checklist crear puntos temas revisar ok no ok numerico rango pdf excel plantilla",
    steps: [
      { text: "En **Checklists** toca **Nuevo checklist** (1). También puedes **descargar** (2) y **subir** (3) todos los checklists en Excel.", img: "ck-1" },
      { text: "Escribe el **tipo de equipo** (1), igual que en el tipo del equipo, y el **nombre** del checklist (2). Puedes cargar los puntos desde un **PDF** (3). Para cada punto eliges cómo se responde (4): **Cotejo (✓)**, **OK / No OK / N/A** o **Numérico**, este último con su rango esperado. Agrega puntos (5) y agrúpalos por **temas** (6).", img: "ck-2" },
    ],
    tips: [
      "En el PDF: una línea sin casilla es un tema y una línea con \"[ ]\" es un punto.",
      "Al abrir una orden preventiva sin checklist se sugieren primero los del mismo tipo de equipo, pero se puede elegir cualquiera.",
      "En el Excel, si el tipo y el nombre ya existen se actualizan sus puntos; si no, se crea un checklist nuevo.",
    ],
  },
  {
    id: "tecnicos",
    module: "tecnico",
    group: "Técnicos y herramientas",
    title: "Agregar técnicos",
    summary: "Registra a tu personal técnico para asignarle órdenes, equipos y herramientas.",
    keywords: "tecnico agregar personal tarifa hora sucursal baja reactivar incidentes",
    steps: [
      { text: "En **Técnicos** toca **Agregar técnico**. Escribe el **nombre** (1), la especialidad y la **tarifa por hora** (2), que se usa para calcular el costo de mano de obra. Elige su sucursal principal y, si trabaja en otras, márcalas. Marca \"Puede reportar incidentes desde la app\" si le das ese permiso.", img: "tech-1" },
    ],
    tips: [
      "Si un técnico ya tiene historial (órdenes o incidentes), al eliminarlo queda **dado de baja**: no se le puede asignar trabajo, pero se conserva su historial. El mismo botón lo reactiva.",
      "Para que el técnico entre a la app con su propio usuario, invítalo desde Administración → Usuarios y vincúlalo a su ficha de técnico. Si ya tiene usuario, ábrelo en Usuarios y elige su **Ficha de técnico vinculada**.",
    ],
  },
  {
    id: "herramientas",
    module: "tecnico",
    group: "Técnicos y herramientas",
    title: "Herramientas: registrar, asignar y confirmar recepción",
    summary: "Controla qué herramienta tiene cada técnico y si ya confirmó que la recibió.",
    keywords: "herramientas asignar tecnico confirmar recepcion listado kit prestamo devolver baja carga masiva",
    steps: [
      { text: "En **Inventario → Herramientas** toca **Agregar herramienta** (1), o **Carga masiva** para muchas a la vez. Para asignarla, elige el técnico en la tarjeta (2): queda **Pendiente de confirmación** (3) hasta que el técnico, desde su usuario, toca **Confirmar recepción**. En **Listados** (4) armas kits.", img: "tools-1" },
      { text: "Un **listado** agrupa varias herramientas (por ejemplo, \"Kit básico de refrigeración\"). Créalo con **Nuevo listado** (1). Desde ahí asignas cada herramienta a un técnico con **Asignar** (2) y la devuelves con **Devolver**.", img: "tools-2" },
    ],
    tips: [
      "Estados: Disponible, Asignada, En mantenimiento y Dada de baja.",
      "Con **Agrupar por técnico** ves de un vistazo lo que tiene cada uno.",
      "Los técnicos pueden prestarse herramientas entre ellos desde su usuario, y queda registrado.",
    ],
  },
  {
    id: "material-en-orden",
    module: "tecnico",
    group: "Almacén y materiales",
    title: "Usar material en una orden de trabajo",
    summary: "Registra lo que el técnico usó en la orden. Se descuenta del inventario al momento y, si sobra algo, se devuelve o se guarda como sobrante.",
    keywords: "material retirar descontar inventario productos almacen devolver sobrante consumo kardex existencia",
    steps: [
      { text: "Abre la orden y baja hasta **Materiales usados** (1). En el buscador (2) aparecen los productos marcados para el Departamento Técnico que tienen existencia en la sucursal de la orden, y los sobrantes del almacén técnico.", img: "mat-1" },
      { text: "Elige el material, escribe la **cantidad** (1) y toca **Retirar** (2). En ese momento se descuenta: si viene de Productos queda en el kárdex como \"Consumo en orden de trabajo\" con su costo.", img: "mat-2" },
      { text: "Cada material usado tiene dos botones. **Devolver** regresa a su origen lo que no se usó: la app pregunta cuánto, y si devuelves todo, el renglón se quita. **Sobrante** es para lo que quedó incompleto o usado y ya no puede volver a Productos.", img: "mat-3" },
      { text: "Al tocar **Sobrante**, escribe una descripción, la cantidad, la unidad y la condición (incompleto, usado o recuperado de equipo), y toca **Guardar sobrante**. Queda en el almacén técnico, sin costo, con la referencia de esta orden.", img: "mat-4" },
    ],
    tips: [
      "Solo un supervisor o un administrador puede retirar o devolver materiales.",
      "Si no hay suficiente existencia en la sucursal de la orden, la app no deja retirar. Primero haz una transferencia entre sucursales o registra la compra.",
      "Material **completo y sin abrir** → Devolver (vuelve a Productos). Material **cortado, abierto o usado** → Sobrante.",
      "Si se elimina una orden, todo el material que tenía asignado regresa a su origen.",
      "En empresas que solo tienen el Departamento Técnico, el material sale del almacén técnico y se devuelve ahí mismo.",
    ],
  },  {
    id: "producto-para-tecnico",
    module: "tecnico",
    requires: ["comercial"],
    group: "Almacén y materiales",
    title: "Habilitar un producto para el Departamento Técnico",
    summary: "Decide qué productos del inventario pueden usar los técnicos en órdenes y proyectos.",
    keywords: "producto disponible departamento tecnico habilitar marcar catalogo inventario",
    steps: [
      { text: "Entra a **Catálogo → Productos** y abre el producto (lápiz) o toca **Agregar producto**. Marca **Disponible para el Departamento Técnico** (1) y guarda. Desde ese momento aparece en el buscador de materiales de las órdenes y proyectos.", img: "prod-1" },
    ],
    tips: [
      "Los servicios y los kits (productos compuestos) no se pueden usar como material porque no llevan existencia propia.",
      "Marca solo lo que de verdad usa el técnico (cables, filtros, refrigerante…). Así el buscador no se llena de mercancía de venta.",
    ],
  },  {
    id: "almacen-sobrantes",
    module: "tecnico",
    group: "Almacén y materiales",
    title: "Almacén técnico y sobrantes",
    summary: "Dónde quedan los materiales sobrantes y cómo agregar los que no vienen de una orden.",
    keywords: "almacen sobrantes sobrante recuperado usado incompleto material anterior inventario tecnico",
    steps: [
      { text: "Entra a **Inventario → Almacén**. Con **Agregar sobrante** (1) registras material que no viene de una orden: una pieza recuperada de un equipo o lo que ya estaba guardado en el taller. En **Productos disponibles para el técnico** (2) ves, solo para consulta, la existencia de cada producto por sucursal.", img: "mat-5" },
    ],
    tips: [
      "Los sobrantes no tienen costo, no se venden y no cuentan en el inventario de Productos.",
      "Cada sobrante muestra su condición y de qué orden salió.",
      "Los materiales que ya existían antes aparecen como **Material anterior**: se pueden usar en órdenes, pero su cantidad ya no se cambia a mano. El material nuevo se registra en Productos.",
      "En empresas que solo tienen el Departamento Técnico, aquí se lleva todo el inventario del técnico, con su stock mínimo y máximo.",
    ],
  },  {
    id: "reportes-tecnico",
    module: "tecnico",
    group: "Reportes",
    title: "Reportes del Departamento Técnico",
    summary: "Los indicadores para medir el trabajo: cumplimiento, tiempos, fallas y desempeño de cada técnico.",
    keywords: "reportes indicadores kpi mttr mtbf cumplimiento preventivo vencidas reapertura desempeño tecnico costo mano de obra sla",
    steps: [
      { text: "En **Reportes** elige el rango de fechas (1); la sucursal se cambia en el filtro de arriba. Los **indicadores clave** (2) muestran el cumplimiento del preventivo, el tiempo promedio de reparación (**MTTR**), el tiempo entre fallas (**MTBF**), el cumplimiento de fechas límite, las órdenes vencidas y la tasa de reapertura.", img: "rep-1" },
      { text: "Más abajo está el **desempeño por técnico** (órdenes por tipo, incidentes, reabiertas y costo de mano de obra) y el **historial por equipo**, con los equipos que más fallan. Con **Ver** (1) abres todas las órdenes de ese técnico o equipo.", img: "rep-2" },
    ],
    tips: [
      "Con el filtro **Técnico** ves los informes de una sola persona (órdenes donde fue principal o adicional, y sus incidentes).",
      "**Imprimir / PDF** saca el informe completo con los filtros que tengas puestos; con un técnico elegido incluye el detalle de cada orden y sus horas. En la ventana de impresión elige **Guardar como PDF**.",
      "También verás los tiempos promedio de atención y de resolución de incidentes por prioridad (SLA).",
      "El uso de checklist al cierre muestra cuántas órdenes se cerraron con checklist y cuántas quedaron 100% respondidas.",
    ],
  },
  // ================================================================== COMERCIAL — VENTAS
  {
    id: "clientes",
    module: "comercial",
    group: "Clientes y productos",
    title: "Agregar clientes",
    summary: "Registra a tus clientes con su RNC o cédula para cotizar y facturar.",
    keywords: "cliente agregar rnc cedula dgii razon social correo telefono",
    steps: [
      { text: "En **Catálogo → Clientes** toca **Agregar cliente** (1). Con el buscador (2) encuentras cualquier cliente por nombre, RNC, teléfono o correo.", img: "cli-1" },
      { text: "Si tienes cargado el catálogo de la DGII, escribe el nombre de la empresa en el buscador de arriba (1) y se llenan solos el nombre y el RNC. Si no, escribe la **razón social** (2) y el **RNC o cédula** (3); con **Buscar en DGII** compruebas el nombre. Completa el teléfono, el **correo** (4), que se usa para enviar documentos, y la dirección.", img: "cli-2" },
    ],
    tips: [
      "Para emitir una factura de **crédito fiscal (B01)**, el cliente debe tener un RNC o una cédula válida.",
      "El catálogo de la DGII se carga en Gestión Contable → Catálogo RNC (DGII).",
    ],
  },
  {
    id: "portal-cliente",
    module: "comercial",
    group: "Clientes y productos",
    title: "Portal del cliente",
    summary: "Un enlace para que tu cliente reporte averías y vea sus trabajos, equipos y facturas, sin usuario ni contraseña.",
    keywords: "portal cliente enlace link whatsapp reportar averia autoservicio facturas trabajos informe compartir desactivar",
    steps: [
      { text: "En **Catálogo → Clientes**, toca el ícono de enlace (1) del cliente y luego **Crear enlace del portal**.", img: "portal-1" },
      { text: "**Copia** el enlace (1) o mándalo directo por **WhatsApp** (2) o correo. Abajo ves si el cliente ya lo abrió (3). Si el enlace se filtra, **desactívalo** (4) o crea uno nuevo; el anterior deja de funcionar.", img: "portal-2" },
      { text: "Así lo ve tu cliente: arriba un resumen (1) de averías abiertas, trabajos en curso y saldo pendiente. Reporta una avería (2) eligiendo el equipo y la envía (3): entra como **incidente abierto** y a los administradores y supervisores les llega el aviso en la campana, por correo y al celular (push). En las pestañas (4) ve sus trabajos con el **informe de servicio**, sus equipos y sus **facturas** para imprimir.", img: "portal-3" },
    ],
    tips: [
      "Para que un equipo salga en el portal, ponle el **cliente dueño** en el formulario del equipo. Las órdenes también tienen ahora el campo **Cliente**; se llena solo al elegir un equipo que tiene dueño.",
      "El cliente solo ve lo suyo: sus equipos, las órdenes de esos equipos o de sus proyectos, sus averías y sus facturas (no ve costos internos ni facturas anuladas).",
      "Cada enlace acepta hasta 20 reportes por día, para evitar abusos.",
      "Los técnicos pueden ver el enlace, pero solo administradores, supervisores y vendedores lo crean o desactivan.",
    ],
  },
  {
    id: "productos-inventario",
    module: "comercial",
    group: "Clientes y productos",
    title: "Productos, servicios e inventario",
    summary: "Tu catálogo de lo que vendes, con precio, costo y existencia por sucursal.",
    keywords: "producto servicio precio costo margen inventario existencia stock sucursal transferir ajustar kardex movimientos kit compuesto",
    steps: [
      { text: "En **Catálogo → Productos** toca **Agregar producto** (1): nombre, unidad, costo, % de ganancia (el precio se calcula solo) y stock inicial. **Transferir** (2) mueve existencia entre sucursales, **Ajustar inventario** (3) corrige cantidades con su motivo, y el ícono del kárdex (4) muestra todos los movimientos del producto.", img: "prods-1" },
    ],
    tips: [
      "Los **servicios** (mano de obra, visitas) se crean en Catálogo → Servicios y no llevan existencia.",
      "Un **producto compuesto (kit)** se vende como un solo renglón, pero al facturarlo descuenta cada componente.",
      "La existencia sube con las compras y las notas de entrega, y baja con las facturas y lo que usa el Departamento Técnico.",
      "El costo es promedio: cada compra lo recalcula.",
    ],
  },
  {
    id: "cotizacion",
    module: "comercial",
    group: "Cotizaciones y órdenes de venta",
    title: "Hacer una cotización",
    summary: "Prepara la propuesta para el cliente, imprímela y, cuando la apruebe, pásala a orden de venta.",
    keywords: "cotizacion presupuesto proforma aprobar rechazar capitulos descuento dolares imprimir duplicar",
    steps: [
      { text: "En **Ventas → Cotizaciones** toca **Nueva cotización** (1). Cada tarjeta muestra su estado (2): Pendiente, Aprobada, Rechazada o En orden de venta.", img: "quo-1" },
      { text: "Elige el **cliente** (1) y la fecha de validez. En cada renglón busca el **producto o servicio** (2), o escribe una descripción libre, y pon la cantidad y el precio. **Agregar línea** (3) suma renglones y **Agregar capítulo** (4) los agrupa (por ejemplo, Materiales y Mano de obra), con subtotal por capítulo. Puedes poner descuento, cotizar en dólares y agregar observaciones. Toca **Crear cotización** (5).", img: "quo-2" },
      { text: "Al abrirla: **Marcar aprobada** (1) cuando el cliente la acepte, y después aparece **Pasar a Orden de Venta**. Puedes imprimir la **Pro-Forma** (2) o la **cotización** (3), y también **Editar** o **Duplicar** para hacer una parecida.", img: "quo-3" },
    ],
    tips: [
      "Arrastra los renglones para cambiar el orden en que salen impresos.",
      "Cada usuario tiene un descuento máximo permitido; el administrador lo configura en Usuarios.",
      "Un incidente se puede convertir directamente en cotización.",
    ],
  },
  {
    id: "orden-venta",
    module: "comercial",
    group: "Cotizaciones y órdenes de venta",
    title: "Orden de venta: del trabajo aprobado a la factura",
    summary: "La cotización aprobada se convierte en orden de venta, que genera la orden de trabajo para el técnico y luego la factura.",
    keywords: "orden de venta ov generar factura orden de trabajo cancelar",
    steps: [
      { text: "En **Ventas → Órdenes de Venta** abre la orden. **Generar orden de trabajo** (1) crea el trabajo para el Departamento Técnico. Cuando esté listo para cobrar, toca **Generar factura** (2): se abre la factura con los mismos renglones.", img: "so-1" },
    ],
    tips: [
      "Las órdenes de venta nacen de una cotización aprobada (botón \"Pasar a Orden de Venta\").",
      "Una orden cancelada ya no se puede facturar.",
    ],
  },
  {
    id: "factura",
    module: "comercial",
    group: "Facturación y cobros",
    title: "Emitir una factura con NCF",
    summary: "Factura a un cliente con su comprobante fiscal, forma de pago, ITBIS y retenciones.",
    keywords: "factura facturar ncf b01 b02 credito fiscal consumidor itbis retencion norma 02-05 exenta dolares 607 garantia",
    steps: [
      { text: "En **Ventas → Facturación** toca **Nueva factura** (1). Con el filtro de cobro (2) ves las pendientes, las parciales y las cobradas. **Estado de cuenta** (3) imprime todo lo que debe un cliente.", img: "inv-1" },
      { text: "Elige el **cliente** (1) y la **secuencia NCF** (2): B01 para crédito fiscal o B02 para consumidor final. Pon la **forma de pago** (3) y el **tipo de ingreso** para el 607 (4). Agrega los **renglones** (5) igual que en la cotización. Al final puedes marcar la factura como **exenta de ITBIS** o aplicar la **retención del 30% del ITBIS (Norma 02-05)**. Toca **Emitir factura**.", img: "inv-2" },
    ],
    tips: [
      "Antes de facturar necesitas al menos una secuencia NCF en Gestión Contable → Secuencia NCF.",
      "El NCF se asigna solo, en orden, al emitir. La factura descuenta el inventario de los productos.",
      "En un renglón puedes marcar \"Registrar este renglón como activo en garantía\": el equipo vendido queda en Activos en Garantía.",
      "Facturas en dólares: se pone la tasa del día y la factura muestra el equivalente en pesos para el NCF.",
      "Una factura emitida no se edita: para corregirla se anula o se emite una nota de crédito.",
    ],
  },
  {
    id: "cobro",
    module: "comercial",
    group: "Facturación y cobros",
    title: "Registrar un cobro y dar recibo",
    summary: "Anota lo que pagó el cliente (total o parcial) e imprime el recibo de ingreso.",
    keywords: "cobro pago abono parcial recibo ingreso efectivo transferencia tarjeta voucher retencion isr saldo pendiente",
    steps: [
      { text: "Abre la factura. Arriba ves el **saldo pendiente** (1). Toca **Registrar pago** (2). Desde aquí también puedes **Anular** (3) o **Imprimir** (4) la factura.", img: "inv-3" },
      { text: "Escribe el **monto pagado** (1); puede ser un abono parcial. Elige el **método** (2): efectivo, tarjeta, transferencia u otro. En transferencia eliges la cuenta a la que llegó; en tarjeta se piden los datos del voucher. Puedes adjuntar la foto del comprobante. Toca **Guardar pago** (3).", img: "inv-4" },
    ],
    tips: [
      "La factura pasa sola a **Parcialmente cobrada** o **Cobrada**.",
      "Cada pago tiene su **Imprimir recibo de ingreso**.",
      "Si el cliente te **retuvo ISR**, regístralo con la opción de retención: rebaja el saldo, pero no es dinero en caja.",
      "Los cobros quedan registrados en la **Caja** abierta de la sucursal.",
      "Pagos en dólares: se pone la tasa del día y la app calcula la diferencia cambiaria.",
    ],
  },
  {
    id: "anular-nota-credito",
    module: "comercial",
    group: "Facturación y cobros",
    title: "Anular una factura o emitir una nota de crédito",
    summary: "Cómo corregir una factura ya emitida, según el caso.",
    keywords: "anular factura 608 nota de credito b04 devolucion correccion error",
    steps: [
      { text: "**Anular** se usa cuando la factura no debió existir (cliente equivocado, error grave) y todavía no tiene cobros. Abre la factura, toca **Anular factura** y elige el **motivo** (1), que va al reporte 608. El NCF queda consumido y el inventario se devuelve.", img: "void-1" },
      { text: "La **nota de crédito** se usa para devoluciones, descuentos o correcciones parciales. En **Ventas → Notas de Crédito → Nueva nota de crédito** busca la **factura** (1), elige la secuencia **B04** (2), desmarca las líneas que no aplican, ajusta las cantidades y toca **Emitir nota de crédito** (3). Rebaja el saldo de la factura.", img: "cn-1" },
    ],
    tips: [
      "Solo un administrador puede anular facturas.",
      "Si la factura tiene cobros o notas de crédito aplicadas no se puede anular: usa una nota de crédito.",
      "Necesitas una secuencia **B04** activa para emitir notas de crédito.",
    ],
  },
  {
    id: "caja",
    module: "comercial",
    group: "Facturación y cobros",
    title: "Caja: abrir, cobrar y cuadrar",
    summary: "El control del dinero que entra cada día en una sucursal, con su cuadre al cerrar.",
    keywords: "caja abrir cerrar cuadre fondo inicial efectivo tarjeta transferencia diferencia faltante sobrante adquirente comision",
    steps: [
      { text: "En **Ventas → Caja** abre la caja con su **fondo inicial**. Mientras está abierta ves lo **esperado** (1) en efectivo, tarjeta y transferencia según los cobros registrados. Al final del día toca **Cerrar caja** (2). Abajo queda el **historial de cuadres** (3).", img: "cash-1" },
      { text: "Al cerrar, escribe lo que **contaste** de verdad (1) en efectivo, tarjeta y transferencia. La app calcula la **diferencia** (2) contra lo esperado. Si hay faltante o sobrante, explícalo en las **notas** (3). Toca **Cerrar caja**.", img: "cash-2" },
    ],
    tips: [
      "Cada sucursal tiene su propia caja. El vendedor ve la de su sucursal.",
      "En **Adquirentes de tarjeta** configuras la comisión y la retención de cada procesador (CardNET, Azul…). La caja muestra cuánto se va a depositar neto.",
      "Si se cobran dólares en efectivo, la caja los cuenta aparte.",
    ],
  },
  {
    id: "contratos-recurrentes",
    module: "comercial",
    group: "Facturación y cobros",
    title: "Contratos recurrentes (igualas)",
    summary: "Facturas que se repiten cada cierto tiempo, como el mantenimiento mensual, sin tener que hacerlas a mano.",
    keywords: "contrato recurrente iguala mensual facturar automatico frecuencia proxima factura",
    steps: [
      { text: "En **Ventas → Contratos recurrentes** toca **Nuevo contrato** (1). Cuando a un contrato le toca facturar, sale en rojo y con **Facturar** (2) emites su factura. **Generar todas las vencidas** (3) las hace todas de una vez.", img: "rc-1" },
      { text: "Elige el cliente y el título del servicio, que sale en la factura. Pon el **monto** sin ITBIS (1), **cada cuántos días** se factura (2), por ejemplo 30, y la **próxima fecha de facturación** (3). Elige la secuencia NCF y marca si aplica ITBIS o retención.", img: "rc-2" },
    ],
    tips: [
      "Después de cada factura, la próxima fecha avanza sola según la frecuencia.",
      "Contratos en dólares: al facturar, la app pide la tasa del día.",
      "Desmarca \"Contrato activo\" para pausarlo sin borrarlo. Con fecha de término, se finaliza solo.",
    ],
  },
  // ---------- Comercial · Compras ----------
  {
    id: "proveedores",
    module: "comercial",
    group: "Compras: proveedores, pedidos y recepción",
    title: "Agregar un proveedor",
    summary: "Registra a quién le compras, con su RNC, para usarlo en pedidos, facturas y gastos.",
    keywords: "proveedor suplidor agregar nuevo rnc telefono correo editar compras",
    steps: [
      { text: "Entra a **Compras → Proveedores**. Toca **Agregar proveedor** (1). Con el buscador (2) encuentras uno por nombre, RNC, teléfono o correo, y con el lápiz (3) corriges sus datos.", img: "supp-1" },
      { text: "Escribe el **nombre o razón social** (1) y el **RNC** (2), además del teléfono y el correo. Toca **Agregar** (3).", img: "supp-2" },
    ],
    tips: [
      "El **RNC** es necesario para que sus facturas y gastos salgan bien en el **606**.",
      "Marca varios proveedores con la casilla y usa **Imprimir selección** para sacar solo esos.",
      "Desde el formulario de un pedido o de una compra también puedes crear un proveedor con el botón **+**.",
    ],
  },
  {
    id: "pedido-proveedor",
    module: "comercial",
    group: "Compras: proveedores, pedidos y recepción",
    title: "Hacer un pedido a un proveedor",
    summary: "Anota qué le pediste al proveedor y cuándo debe llegar, sin tocar el inventario todavía.",
    keywords: "pedido orden de compra proveedor solicitar encargar fecha llegada pendiente parcial recibido cancelar",
    steps: [
      { text: "Entra a **Compras → Pedidos a Proveedores** y toca **Nuevo pedido**. Elige el **proveedor** (1) y, si quieres, la **fecha estimada de llegada** (2). Agrega los **productos** con su cantidad y costo (3). Toca **Crear pedido** (4).", img: "po-1" },
      { text: "Cada pedido muestra su estado (1): **Pendiente**, **Recibido parcial** o **Recibido completo**. Cuando llegue la mercancía toca **Recibir** (2). En **Detalle** (3) ves lo pedido y puedes **cancelar** el pedido.", img: "po-2" },
    ],
    tips: [
      "El pedido **no cambia el inventario**. La existencia sube cuando registras la **nota de entrega** con lo que llegó de verdad.",
      "El número del pedido (PED-…) lo pone la app.",
      "Si el proveedor manda la mercancía en varias entregas, el pedido queda en **Recibido parcial** hasta que llegue todo.",
    ],
  },
  {
    id: "nota-entrega",
    module: "comercial",
    group: "Compras: proveedores, pedidos y recepción",
    title: "Recibir mercancía (nota de entrega)",
    summary: "Registra lo que llegó del proveedor. Con esto sube la existencia en tu inventario.",
    keywords: "nota de entrega recepcion recibir mercancia llego conduce entrada inventario almacen existencia pedido parcial",
    steps: [
      { text: "Desde el pedido toca **Recibir**. La app te dice contra qué pedido estás recibiendo (1) y pone las **cantidades que faltan** (2). Si llegó menos o más, cámbialas. Revisa la **fecha de recepción** (3) y toca **Registrar recepción** (4).", img: "gr-1" },
      { text: "Todas las recepciones quedan en **Compras → Nota de entrega proveedores**. Con **Nueva nota de entrega** (1) registras mercancía que llegó sin pedido. La etiqueta **Sin facturar** (2) te avisa que todavía falta la factura del proveedor: tócala en **Facturar** (3) cuando te llegue.", img: "gr-2" },
    ],
    tips: [
      "Al registrar la nota sube la existencia en la sucursal elegida y se recalcula el **costo promedio** del producto.",
      "Usa las **Notas** para dejar constancia de diferencias (faltantes, mercancía dañada).",
      "Si te equivocaste y la nota todavía **no está facturada**, puedes eliminarla; la existencia vuelve atrás.",
    ],
  },
  {
    id: "factura-proveedor",
    module: "comercial",
    group: "Compras: facturas, pagos y gastos",
    title: "Registrar la factura del proveedor",
    summary: "Anota la factura con su NCF para tener la cuenta por pagar y el reporte 606 al día.",
    keywords: "factura proveedor compra registrar ncf 606 b11 informal pdf retencion itbis isr 254-06 cuenta por pagar costo",
    steps: [
      { text: "Si la mercancía ya entró con una nota de entrega, toca **Facturar** en esa nota. El proveedor y los productos se llenan solos (1) y **el inventario no se duplica**. Escribe el **NCF** de la factura (2), revisa el **total** (3) contra el papel y toca **Registrar compra** (4).", img: "pur-1" },
      { text: "Para una compra sin nota de entrega, entra a **Compras → Factura de proveedor** y toca **Registrar compra**. Puedes **subir el PDF** de la factura (1) para que se llenen el proveedor, el número, la fecha y el total. Si no, elige el **proveedor** (2), escribe el **NCF** (3) y agrega los productos con **Agregar línea** (4). Si al proveedor hay que **retenerle** ITBIS o ISR, marca la casilla (5).", img: "pur-2" },
    ],
    tips: [
      "Sin nota de entrega, la compra **sí sube el inventario** en la sucursal que elijas.",
      "Si el proveedor es informal y tienes una secuencia **B11**, marca **Proveedor informal: emitir B11** y la app pone el comprobante.",
      "El **tipo de bien o servicio** y la **forma de pago** van al 606. Si se te olvidan, los corriges después en el **Detalle** de la compra, en **Datos para el 606**.",
      "Con las retenciones marcadas, el total que ves es el **neto a pagar al proveedor**.",
    ],
  },
  {
    id: "pago-proveedor",
    module: "comercial",
    group: "Compras: facturas, pagos y gastos",
    title: "Pagar a un proveedor",
    summary: "Registra lo que le pagaste (total o abono) para bajar la cuenta por pagar.",
    keywords: "pago proveedor abonar pagar saldo cuenta por pagar transferencia cheque efectivo recibo de proveedor",
    steps: [
      { text: "Abre la compra con **Detalle**. Arriba de los pagos ves el **saldo pendiente** (1). Toca **Registrar pago**, escribe el **monto** (2); puede ser un abono. Pon el **método** (3), por ejemplo transferencia o cheque, y en notas la referencia. Toca **Guardar pago** (4).", img: "pay-1" },
      { text: "Todos los pagos quedan en **Compras → Recibos de proveedor** (1), con el proveedor, la factura, la fecha y el método.", img: "pay-2" },
    ],
    tips: [
      "La compra pasa sola a **Parcialmente pagada** o **Pagada**.",
      "Si no elegiste forma de pago en la compra, el 606 la toma de los pagos registrados (sin pagos cuenta como **a crédito**).",
      "Las compras que todavía se deben aparecen en **Gestión Contable → Cuentas por Pagar**, de la más vieja a la más nueva.",
    ],
  },
  {
    id: "otros-gastos",
    module: "comercial",
    group: "Compras: facturas, pagos y gastos",
    title: "Registrar otros gastos",
    summary: "Combustible, alquiler, comidas y demás gastos que no son mercancía para el inventario.",
    keywords: "gasto otros gastos combustible gasolina alquiler luz comida viatico b13 gasto menor ncf 606 itbis",
    steps: [
      { text: "Entra a **Compras → Otros gastos** y toca **Registrar gasto** (1). Los gastos con NCF muestran **va al 606** (2).", img: "exp-1" },
      { text: "Escribe la **descripción** (1) y el **monto total pagado** con el ITBIS incluido (2). Si tiene comprobante (3), escribe el **NCF del proveedor**, el **ITBIS facturado**, el tipo de gasto y la **forma de pago**. Toca **Registrar gasto** (4).", img: "exp-2" },
    ],
    tips: [
      "Si el gasto **no tiene comprobante**, deja el NCF vacío: se guarda el gasto, pero no va al 606.",
      "Para un gasto menor sin comprobante puedes **emitir un B13** desde la misma pantalla, si tienes la secuencia activa.",
      "Para que vaya al 606 hay que elegir un **proveedor con RNC**.",
      "Los gastos **no suben inventario**. Para comprar mercancía usa **Factura de proveedor**.",
    ],
  },
  {
    id: "libro-compras",
    module: "comercial",
    group: "Compras: facturas, pagos y gastos",
    title: "Libro de facturas recibidas",
    summary: "Todas las facturas de proveedores en un solo lugar, con su estado de pago.",
    keywords: "libro de compras facturas recibidas proveedores estado pendiente de pago pagada parcial historial",
    steps: [
      { text: "Entra a **Compras → Libro de facturas recibidas**. Cada factura muestra su estado: **Pendiente de pago** (1), **Parcialmente pagada** (2) o **Pagada**. Con **Detalle** (3) la abres para ver los productos, los pagos y los datos del 606, o para registrar un pago.", img: "led-1" },
    ],
    tips: [
      "Para ver solo lo que se debe y hace cuántos días, usa **Gestión Contable → Cuentas por Pagar**. Las de más de 60 días salen en rojo.",
      "En **Factura de proveedor** puedes buscar por proveedor o por número de factura.",
    ],
  },
  {
    id: "reportes-ventas",
    module: "comercial",
    group: "Reportes",
    title: "Reportes de ventas",
    summary: "Cuánto facturaste y cobraste, cuánto cotizaste y quiénes son tus mejores clientes.",
    keywords: "reportes ventas facturado cobrado pendiente cotizado conversion clientes mensual",
    steps: [
      { text: "En **Reportes de Ventas** elige el rango de fechas (1). Arriba ves el **total facturado**, lo **cobrado y pendiente**, lo **cotizado** y la **tasa de conversión** de cotizaciones (2). Más abajo están la facturación de los últimos 6 meses, los 5 mejores clientes y las cotizaciones por estado.", img: "srep-1" },
    ],
    tips: ["La tasa de conversión solo cuenta las cotizaciones ya decididas (aprobadas o rechazadas)."],
  },
];

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const plain = (s) => String(s || "").replace(/\*\*/g, "");

// **negrita** sencilla, sin HTML
function Rich({ text }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith("**") ? <b key={i} style={{ color: C.text }}>{p.slice(2, -2)}</b> : <React.Fragment key={i}>{p}</React.Fragment>));
}

export function HelpCenter({ enabledModules, onClose }) {
  const modsKey = (enabledModules || []).join(",");
  const topics = useMemo(() => {
    const mods = modsKey.split(",");
    return HELP_TOPICS.filter((t) => mods.includes(t.module) && (t.requires || []).every((r) => mods.includes(r)));
  }, [modsKey]);
  const [query, setQuery] = useState("");
  const [currentId, setCurrentId] = useState(null);
  const [zoom, setZoom] = useState(null);

  const filtered = useMemo(() => {
    const q = norm(query).trim();
    if (!q) return topics;
    const words = q.split(/\s+/);
    return topics.filter((t) => {
      const hay = norm([t.title, t.summary, t.keywords, t.group, ...t.steps.map((s) => plain(s.text)), ...(t.tips || []).map(plain)].join(" "));
      return words.every((w) => hay.includes(w));
    });
  }, [query, topics]);

  const current = topics.find((t) => t.id === currentId) || null;

  // Índice por departamento → grupo → tema
  const tree = useMemo(() => {
    const out = [];
    filtered.forEach((t) => {
      let m = out.find((x) => x.module === t.module);
      if (!m) { m = { module: t.module, groups: [], count: 0 }; out.push(m); }
      let g = m.groups.find((x) => x.group === t.group);
      if (!g) { g = { key: `${t.module}||${t.group}`, group: t.group, items: [] }; m.groups.push(g); }
      g.items.push(t);
      m.count += 1;
    });
    return out;
  }, [filtered]);

  // Plegables: todo cerrado al abrir la ayuda (si la empresa tiene un solo departamento, ese queda abierto).
  // Mientras se busca, todo se muestra abierto para ver los resultados.
  const [openMods, setOpenMods] = useState(() => {
    const mods = [...new Set(topics.map((t) => t.module))];
    return mods.length === 1 ? mods : [];
  });
  const [openGroups, setOpenGroups] = useState([]);
  const searching = norm(query).trim() !== "";
  const toggle = (setter, key) => setter((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  const ensureOpen = (setter, key) => setter((prev) => (prev.includes(key) ? prev : [...prev, key]));
  const openTopic = (t) => {
    ensureOpen(setOpenMods, t.module);
    ensureOpen(setOpenGroups, `${t.module}||${t.group}`);
    setCurrentId(t.id);
  };
  const openModule = (mod) => setOpenMods([mod]);

  const list = (
    <div className="space-y-2">
      {tree.map((m) => {
        const modOpen = searching || openMods.includes(m.module);
        return (
          <div key={m.module} style={{ border: `1px solid ${C.border}` }}>
            <button onClick={() => toggle(setOpenMods, m.module)} disabled={searching}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left" style={{ background: modOpen ? C.panelAlt : "transparent" }}>
              {modOpen ? <ChevronDown size={15} color={C.amber} /> : <ChevronRight size={15} color={C.amber} />}
              <span className="flex-1 text-xs font-bold uppercase tracking-wide" style={{ color: C.amber }}>{MODULE_TITLES[m.module] || m.module}</span>
              <span className="text-[11px]" style={{ color: C.muted }}>{m.count}</span>
            </button>
            {modOpen && (
              <div className="py-1">
                {m.groups.map((g) => {
                  const groupOpen = searching || openGroups.includes(g.key);
                  return (
                    <div key={g.key}>
                      <button onClick={() => toggle(setOpenGroups, g.key)} disabled={searching}
                        className="w-full flex items-center gap-1.5 pl-4 pr-3 py-1.5 text-left">
                        {groupOpen ? <ChevronDown size={13} color={C.muted} /> : <ChevronRight size={13} color={C.muted} />}
                        <span className="flex-1 text-xs font-semibold" style={{ color: groupOpen ? C.text : C.muted }}>{g.group}</span>
                        <span className="text-[11px]" style={{ color: C.muted }}>{g.items.length}</span>
                      </button>
                      {groupOpen && g.items.map((t) => (
                        <button key={t.id} onClick={() => openTopic(t)} className="w-full text-left text-sm pl-9 pr-3 py-1.5 mb-0.5"
                          style={{ background: currentId === t.id ? C.panelAlt : "transparent", borderLeft: `2px solid ${currentId === t.id ? C.amber : "transparent"}`, color: currentId === t.id ? C.text : C.muted }}>
                          {t.title}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {filtered.length === 0 && (
        <div className="text-sm px-1" style={{ color: C.muted }}>
          {topics.length === 0 ? "Todavía no hay temas de ayuda para los módulos de tu empresa. Pronto los agregaremos." : "No encontré temas con esas palabras. Prueba con otras (por ejemplo: excel, sobrante, imprimir)."}
        </div>
      )}
    </div>
  );

  // Para la portada: departamentos con sus grupos
  const modules = useMemo(() => {
    const out = [];
    topics.forEach((t) => {
      let m = out.find((x) => x.module === t.module);
      if (!m) { m = { module: t.module, groups: [], count: 0 }; out.push(m); }
      if (!m.groups.includes(t.group)) m.groups.push(t.group);
      m.count += 1;
    });
    return out;
  }, [topics]);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch md:items-center justify-center md:p-6" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="w-full max-w-6xl h-full md:h-[90vh] flex flex-col" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-3 px-4 md:px-5 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
          <BookOpen size={18} color={C.amber} />
          <div className="font-semibold" style={{ color: C.text }}>Ayuda</div>
          <div className="flex items-center gap-2 px-3 py-1.5 flex-1 max-w-md ml-2" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
            <Search size={14} color={C.muted} />
            <input autoFocus value={query} onChange={(e) => { setQuery(e.target.value); setCurrentId(null); }} placeholder="¿Qué necesitas hacer? Ej: sobrante, excel, imprimir"
              className="bg-transparent outline-none text-sm w-full" style={{ color: C.text }} />
            {query && <button onClick={() => setQuery("")} style={{ color: C.muted }}><X size={13} /></button>}
          </div>
          <button onClick={onClose} className="ml-auto p-1" style={{ color: C.muted }} title="Cerrar"><X size={20} /></button>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* Índice: siempre visible en pantallas grandes; en celular se muestra cuando no hay tema abierto */}
          <div className={`${current ? "hidden md:block" : "block"} w-full md:w-72 flex-shrink-0 overflow-y-auto p-4`} style={{ borderRight: `1px solid ${C.border}` }}>
            {list}
          </div>

          {/* key: al cambiar de tema, el artículo empieza desde arriba */}
          <div key={currentId || "inicio"} className={`${current ? "block" : "hidden md:block"} flex-1 overflow-y-auto p-4 md:p-6`}>
            {!current ? (
              <div className="max-w-xl" style={{ color: C.muted }}>
                <div className="text-lg font-semibold mb-2" style={{ color: C.text }}>¿En qué te ayudamos?</div>
                <div className="text-sm mb-4">Elige un departamento a la izquierda (o aquí abajo) y abre el grupo que te interesa, o escribe en el buscador lo que necesitas hacer. Cada tema explica los pasos con imágenes de la app.</div>
                <div className="grid sm:grid-cols-2 gap-2">
                  {modules.map((m) => (
                    <button key={m.module} onClick={() => openModule(m.module)} className="text-left p-3"
                      style={{ background: C.panelAlt, border: `1px solid ${openMods.includes(m.module) ? C.amber : C.border}` }}>
                      <div className="flex items-center gap-2">
                        <span className="flex-1 text-sm font-semibold" style={{ color: C.text }}>{MODULE_TITLES[m.module] || m.module}</span>
                        <span className="text-[11px]" style={{ color: C.muted }}>{m.count} {m.count === 1 ? "tema" : "temas"}</span>
                      </div>
                      <div className="text-xs mt-1">{m.groups.join(" · ")}</div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <article className="max-w-3xl">
                <button onClick={() => setCurrentId(null)} className="md:hidden flex items-center gap-1 text-xs mb-3" style={{ color: C.amber }}><ChevronLeft size={14} /> Todos los temas</button>
                <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: C.amber }}>{MODULE_TITLES[current.module]} · {current.group}</div>
                <h2 className="text-xl font-bold mb-2" style={{ color: C.text }}>{current.title}</h2>
                <p className="text-sm mb-5" style={{ color: C.muted }}>{current.summary}</p>
                <ol className="space-y-6">
                  {current.steps.map((s, i) => (
                    <li key={i}>
                      <div className="flex gap-3">
                        <div className="w-7 h-7 flex-shrink-0 flex items-center justify-center text-sm font-bold" style={{ background: C.amber, color: "#1A1500", borderRadius: 14 }}>{i + 1}</div>
                        <div className="text-sm leading-relaxed pt-0.5" style={{ color: C.muted }}><Rich text={s.text} /></div>
                      </div>
                      {s.img && (
                        <button onClick={() => setZoom(s.img)} className="block mt-3 md:ml-10 text-left" title="Ver en grande">
                          <img src={imgUrl(s.img)} alt={plain(s.text).slice(0, 120)} loading="lazy"
                            className="max-w-full h-auto" style={{ border: `1px solid ${C.border}`, maxHeight: 520 }} />
                        </button>
                      )}
                    </li>
                  ))}
                </ol>
                {current.tips?.length > 0 && (
                  <div className="mt-8 p-4" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                    <div className="flex items-center gap-2 text-sm font-semibold mb-2" style={{ color: C.text }}><Lightbulb size={15} color={C.amber} /> Bueno saber</div>
                    <ul className="list-disc pl-5 space-y-1.5 text-sm" style={{ color: C.muted }}>
                      {current.tips.map((t, i) => <li key={i}><Rich text={t} /></li>)}
                    </ul>
                  </div>
                )}
              </article>
            )}
          </div>
        </div>
      </div>

      {zoom && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 cursor-zoom-out" style={{ background: "rgba(0,0,0,0.85)" }} onClick={() => setZoom(null)}>
          <img src={imgUrl(zoom)} alt="" className="max-w-full max-h-full" />
        </div>
      )}
    </div>
  );
}
