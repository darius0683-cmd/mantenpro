// Manual de ayuda: se abre desde el botón "Ayuda" del pie del menú (junto a Tema).
// Se carga solo cuando alguien lo abre (ver lazy.jsx). Las imágenes viven en public/*.webp
// y se descargan al ver cada tema. Cada empresa ve solo la ayuda de los módulos que tiene.
//
// Para agregar un tema: añadirlo a HELP_TOPICS (module, group, title, summary, steps con su
// imagen, tips). Las capturas se generan con datos de demostración (sin datos reales).
import React, { useMemo, useState } from "react";
import { BookOpen, ChevronLeft, Lightbulb, Search, X } from "lucide-react";
import { C } from "./base.jsx";

// Subir este número cuando se reemplacen imágenes con el mismo nombre (evita que el navegador
// muestre la versión vieja guardada en caché).
const IMG_VERSION = "1";
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
      { text: "En el archivo: para **agregar** equipos escribe filas nuevas al final **dejando vacía la columna ID**, porque la app le pone el ID sola. Para **corregir**, cambia los datos en su fila sin tocar el ID. La hoja **Listas** trae los nombres exactos de las sucursales, ubicaciones y técnicos.", img: "xls-2" },
      { text: "Al subirlo, la app muestra un resumen antes de guardar: cuántos equipos son nuevos, cuántos se actualizan, cuántos no cambian y qué filas tienen errores, con el motivo. Toca **Cargar** (1) para guardar. Las filas con error no se cargan: corrígelas y vuelve a subir el mismo archivo.", img: "xls-3" },
    ],
    tips: [
      "Borrar una fila del Excel **no** borra el equipo de la app.",
      "Una celda vacía deja ese dato vacío en el equipo (por ejemplo, sin técnico).",
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
      "Para que el técnico entre a la app con su propio usuario, invítalo desde Administración → Usuarios y vincúlalo a su ficha de técnico.",
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
      "También verás los tiempos promedio de atención y de resolución de incidentes por prioridad (SLA).",
      "El uso de checklist al cierre muestra cuántas órdenes se cerraron con checklist y cuántas quedaron 100% respondidas.",
    ],
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
  const grouped = useMemo(() => {
    const out = [];
    filtered.forEach((t) => {
      const key = `${t.module}||${t.group}`;
      let g = out.find((x) => x.key === key);
      if (!g) { g = { key, module: t.module, group: t.group, items: [] }; out.push(g); }
      g.items.push(t);
    });
    return out;
  }, [filtered]);

  const list = (
    <div className="space-y-4">
      {grouped.map((g, i) => (
        <div key={g.key}>
          {(i === 0 || grouped[i - 1].module !== g.module) && (
            <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: C.amber }}>{MODULE_TITLES[g.module] || g.module}</div>
          )}
          <div className="text-xs font-semibold mb-1" style={{ color: C.muted }}>{g.group}</div>
          {g.items.map((t) => (
            <button key={t.id} onClick={() => setCurrentId(t.id)} className="w-full text-left text-sm px-3 py-2 mb-1"
              style={{ background: currentId === t.id ? C.panelAlt : "transparent", borderLeft: `2px solid ${currentId === t.id ? C.amber : "transparent"}`, color: currentId === t.id ? C.text : C.muted }}>
              {t.title}
            </button>
          ))}
        </div>
      ))}
      {filtered.length === 0 && (
        <div className="text-sm px-1" style={{ color: C.muted }}>
          {topics.length === 0 ? "Todavía no hay temas de ayuda para los módulos de tu empresa. Pronto los agregaremos." : "No encontré temas con esas palabras. Prueba con otras (por ejemplo: excel, sobrante, imprimir)."}
        </div>
      )}
    </div>
  );

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
                <div className="text-sm mb-4">Elige un tema a la izquierda o escribe en el buscador lo que necesitas hacer. Cada tema explica los pasos con imágenes de la app.</div>
                <div className="grid sm:grid-cols-2 gap-2">
                  {topics.slice(0, 6).map((t) => (
                    <button key={t.id} onClick={() => setCurrentId(t.id)} className="text-left p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                      <div className="text-sm font-semibold" style={{ color: C.text }}>{t.title}</div>
                      <div className="text-xs mt-1">{t.summary}</div>
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
