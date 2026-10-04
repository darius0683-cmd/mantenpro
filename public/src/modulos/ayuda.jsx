// Manual de ayuda: se abre desde el botón "Ayuda" del pie del menú (junto a Tema).
// Se carga solo cuando alguien lo abre (ver lazy.jsx). Las imágenes viven en public/ayuda/*.webp
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
const imgUrl = (name) => `/ayuda/${name}.webp?v=${IMG_VERSION}`;

const MODULE_TITLES = {
  tecnico: "Departamento Técnico",
  comercial: "Comercial",
  contable: "Gestión Contable",
  administracion: "Administración",
  nomina: "Nómina",
};

// requires: módulos que además debe tener la empresa para ver ese tema
export const HELP_TOPICS = [
  // ------------------------------------------------------------------ Órdenes
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
  },
  // ------------------------------------------------------------------ Material
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
  },
  {
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
  },
  {
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
  },
  // ------------------------------------------------------------------ Equipos
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
  },
  {
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

          <div className={`${current ? "block" : "hidden md:block"} flex-1 overflow-y-auto p-4 md:p-6`}>
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
