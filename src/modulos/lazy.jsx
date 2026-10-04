// Carga diferida: cada área de la app se descarga la primera vez que se usa, no al abrir.
// Cada componente de aquí tiene el MISMO nombre que el original, así que el resto del código
// no cambia: <OrderDetailModal .../> sigue funcionando igual.
//
// - El <Suspense> va pegado a cada componente (no a toda la pantalla): mientras baja el archivo
//   no se ve nada en ese lugar, pero el resto de la pantalla y lo que estés escribiendo no se toca.
// - Si después de publicar una versión nueva el navegador pide un archivo viejo que ya no existe,
//   se recarga la página UNA vez para tomar la versión nueva. Si aun así falla, se muestra un
//   aviso en ese lugar en vez de dejar la pantalla en blanco.
import React, { lazy, Suspense } from "react";

const IMPORTERS = {
  "vistas-admin": () => import("./vistas-admin.jsx"),
  "vistas-compras": () => import("./vistas-compras.jsx"),
  "vistas-contable": () => import("./vistas-contable.jsx"),
  "vistas-tecnico": () => import("./vistas-tecnico.jsx"),
  "vistas-ventas": () => import("./vistas-ventas.jsx"),
  admin: () => import("./admin.jsx"),
  ayuda: () => import("./ayuda.jsx"),
  compras: () => import("./compras.jsx"),
  "equipos-qr": () => import("./equipos-qr.jsx"),
  nomina: () => import("./nomina.jsx"),
  portal: () => import("./portal.jsx"),
  soporte: () => import("./soporte.jsx"),
  tecnico: () => import("./tecnico.jsx"),
  ventas: () => import("./ventas.jsx"),
  visitas: () => import("./visitas.jsx"),
};

const RELOAD_KEY = "mantenpro-chunk-reload";
function loadForRender(file) {
  return IMPORTERS[file]()
    .then((m) => {
      try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* sin almacenamiento: no pasa nada */ }
      return m;
    })
    .catch((err) => {
      let alreadyReloaded = false;
      try {
        alreadyReloaded = sessionStorage.getItem(RELOAD_KEY) === "1";
        sessionStorage.setItem(RELOAD_KEY, "1");
      } catch { alreadyReloaded = true; }
      if (!alreadyReloaded) window.location.reload();
      throw err;
    });
}

class ChunkErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) {
      return (
        <div className="p-3 text-sm" style={{ border: "1px solid #E8654F", color: "#E8654F" }}>
          No se pudo cargar esta sección (¿sin conexión?).{" "}
          <button className="underline" onClick={() => window.location.reload()}>Recargar</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function lazyComponent(file, name) {
  const Loaded = lazy(() => loadForRender(file).then((m) => ({ default: m[name] })));
  function LazyWrapper(props) {
    return (
      <ChunkErrorBoundary>
        <Suspense fallback={null}>
          <Loaded {...props} />
        </Suspense>
      </ChunkErrorBoundary>
    );
  }
  LazyWrapper.displayName = name;
  return LazyWrapper;
}

// admin
export const AccountFormModal = lazyComponent("admin", "AccountFormModal");
export const CompanyProfileForm = lazyComponent("admin", "CompanyProfileForm");
export const ExportDataPanel = lazyComponent("admin", "ExportDataPanel");
export const InviteFormModal = lazyComponent("admin", "InviteFormModal");
export const TaxRateFormModal = lazyComponent("admin", "TaxRateFormModal");
export const UserPermissionsModal = lazyComponent("admin", "UserPermissionsModal");

// compras
export const ExpenseFormModal = lazyComponent("compras", "ExpenseFormModal");
export const GoodsReceiptDetailModal = lazyComponent("compras", "GoodsReceiptDetailModal");
export const GoodsReceiptFormModal = lazyComponent("compras", "GoodsReceiptFormModal");
export const ProductFormModal = lazyComponent("compras", "ProductFormModal");
export const PurchaseDetailModal = lazyComponent("compras", "PurchaseDetailModal");
export const PurchaseFormModal = lazyComponent("compras", "PurchaseFormModal");
export const PurchaseOrderDetailModal = lazyComponent("compras", "PurchaseOrderDetailModal");
export const PurchaseOrderFormModal = lazyComponent("compras", "PurchaseOrderFormModal");
export const StockAdjustModal = lazyComponent("compras", "StockAdjustModal");
export const StockMovementsModal = lazyComponent("compras", "StockMovementsModal");
export const StockTransferModal = lazyComponent("compras", "StockTransferModal");
export const SupplierFormModal = lazyComponent("compras", "SupplierFormModal");

// equipos-qr
export const EquipmentQrModal = lazyComponent("equipos-qr", "EquipmentQrModal");
export const QrScannerModal = lazyComponent("equipos-qr", "QrScannerModal");

// nomina
export const PayrollSection = lazyComponent("nomina", "PayrollSection");

// visitas
export const VisitsReportModal = lazyComponent("visitas", "VisitsReportModal");

// portal
export const ClientPortal = lazyComponent("portal", "ClientPortal");
export const ClientPortalLinkModal = lazyComponent("portal", "ClientPortalLinkModal");

// soporte
export const SupportViewer = lazyComponent("soporte", "SupportViewer");

// tecnico
export const BranchFormModal = lazyComponent("tecnico", "BranchFormModal");
export const BulkOrderFormModal = lazyComponent("tecnico", "BulkOrderFormModal");
export const BulkToolFormModal = lazyComponent("tecnico", "BulkToolFormModal");
export const ChecklistTemplateFormModal = lazyComponent("tecnico", "ChecklistTemplateFormModal");
export const ClientAssetFormModal = lazyComponent("tecnico", "ClientAssetFormModal");
export const EquipmentFormModal = lazyComponent("tecnico", "EquipmentFormModal");
export const HistoryModal = lazyComponent("tecnico", "HistoryModal");
export const IncidentDetailModal = lazyComponent("tecnico", "IncidentDetailModal");
export const IncidentFormModal = lazyComponent("tecnico", "IncidentFormModal");
export const LocationFormModal = lazyComponent("tecnico", "LocationFormModal");
export const MaterialFormModal = lazyComponent("tecnico", "MaterialFormModal");
export const OrderDetailModal = lazyComponent("tecnico", "OrderDetailModal");
export const OrderFormModal = lazyComponent("tecnico", "OrderFormModal");
export const ProjectDetailModal = lazyComponent("tecnico", "ProjectDetailModal");
export const ProjectFormModal = lazyComponent("tecnico", "ProjectFormModal");
export const TechFormModal = lazyComponent("tecnico", "TechFormModal");
export const TechnicianToolRow = lazyComponent("tecnico", "TechnicianToolRow");
export const ToolFormModal = lazyComponent("tecnico", "ToolFormModal");
export const ToolListCard = lazyComponent("tecnico", "ToolListCard");
export const ToolListFormModal = lazyComponent("tecnico", "ToolListFormModal");
export const UsageQuickUpdate = lazyComponent("tecnico", "UsageQuickUpdate");

// ventas
export const CardAcquirersPanel = lazyComponent("ventas", "CardAcquirersPanel");
export const CashCloseModal = lazyComponent("ventas", "CashCloseModal");
export const CashOpenModal = lazyComponent("ventas", "CashOpenModal");
export const ClientFormModal = lazyComponent("ventas", "ClientFormModal");
export const CreditNoteDetailModal = lazyComponent("ventas", "CreditNoteDetailModal");
export const CreditNoteFormModal = lazyComponent("ventas", "CreditNoteFormModal");
export const ExchangeRatePromptModal = lazyComponent("ventas", "ExchangeRatePromptModal");
export const InvoiceDetailModal = lazyComponent("ventas", "InvoiceDetailModal");
export const InvoiceFormModal = lazyComponent("ventas", "InvoiceFormModal");
export const QuoteDetailModal = lazyComponent("ventas", "QuoteDetailModal");
export const QuoteFormModal = lazyComponent("ventas", "QuoteFormModal");
export const RecurringContractFormModal = lazyComponent("ventas", "RecurringContractFormModal");
export const SalesOrderDetailModal = lazyComponent("ventas", "SalesOrderDetailModal");
export const StatementModal = lazyComponent("ventas", "StatementModal");
export const VoidInvoiceModal = lazyComponent("ventas", "VoidInvoiceModal");

// vistas-admin
export const VistaUsers = lazyComponent("vistas-admin", "VistaUsers");
export const VistaActivityLog = lazyComponent("vistas-admin", "VistaActivityLog");

// vistas-compras
export const VistaProductsServices = lazyComponent("vistas-compras", "VistaProductsServices");
export const VistaSuppliers = lazyComponent("vistas-compras", "VistaSuppliers");
export const VistaPurchases = lazyComponent("vistas-compras", "VistaPurchases");
export const VistaPurchaseOrders = lazyComponent("vistas-compras", "VistaPurchaseOrders");
export const VistaDeliveryNotes = lazyComponent("vistas-compras", "VistaDeliveryNotes");
export const VistaOtherExpenses = lazyComponent("vistas-compras", "VistaOtherExpenses");
export const VistaSupplierReceipts = lazyComponent("vistas-compras", "VistaSupplierReceipts");
export const VistaPurchaseLedger = lazyComponent("vistas-compras", "VistaPurchaseLedger");
export const VistaPayables = lazyComponent("vistas-compras", "VistaPayables");

// vistas-contable
export const VistaChartOfAccounts = lazyComponent("vistas-contable", "VistaChartOfAccounts");
export const VistaTaxRates = lazyComponent("vistas-contable", "VistaTaxRates");
export const VistaFiscalReports = lazyComponent("vistas-contable", "VistaFiscalReports");
export const VistaFinancialReports = lazyComponent("vistas-contable", "VistaFinancialReports");
export const VistaBankReconciliation = lazyComponent("vistas-contable", "VistaBankReconciliation");
export const VistaNcf = lazyComponent("vistas-contable", "VistaNcf");
export const VistaDgiiCatalog = lazyComponent("vistas-contable", "VistaDgiiCatalog");

// vistas-tecnico
export const VistaAgenda = lazyComponent("vistas-tecnico", "VistaAgenda");
export const VistaOrders = lazyComponent("vistas-tecnico", "VistaOrders");
export const VistaIncidents = lazyComponent("vistas-tecnico", "VistaIncidents");
export const VistaProjects = lazyComponent("vistas-tecnico", "VistaProjects");
export const VistaEquipment = lazyComponent("vistas-tecnico", "VistaEquipment");
export const VistaTechnicians = lazyComponent("vistas-tecnico", "VistaTechnicians");
export const VistaTools = lazyComponent("vistas-tecnico", "VistaTools");
export const VistaMaterials = lazyComponent("vistas-tecnico", "VistaMaterials");
export const VistaMaintenanceSchedule = lazyComponent("vistas-tecnico", "VistaMaintenanceSchedule");
export const VistaBranches = lazyComponent("vistas-tecnico", "VistaBranches");
export const VistaWarranty = lazyComponent("vistas-tecnico", "VistaWarranty");
export const VistaChecklists = lazyComponent("vistas-tecnico", "VistaChecklists");
export const VistaReports = lazyComponent("vistas-tecnico", "VistaReports");

// vistas-ventas
export const VistaClients = lazyComponent("vistas-ventas", "VistaClients");
export const VistaSalesReports = lazyComponent("vistas-ventas", "VistaSalesReports");
export const VistaReceivables = lazyComponent("vistas-ventas", "VistaReceivables");
export const VistaQuotes = lazyComponent("vistas-ventas", "VistaQuotes");
export const VistaSalesOrders = lazyComponent("vistas-ventas", "VistaSalesOrders");
export const VistaInvoices = lazyComponent("vistas-ventas", "VistaInvoices");
export const VistaCaja = lazyComponent("vistas-ventas", "VistaCaja");
export const VistaCreditNotes = lazyComponent("vistas-ventas", "VistaCreditNotes");
export const VistaRecurringContracts = lazyComponent("vistas-ventas", "VistaRecurringContracts");

// ayuda
export const HelpCenter = lazyComponent("ayuda", "HelpCenter");

// Qué archivo necesita cada sección del menú (para precargar en segundo plano).
const CHUNK_OF_VIEW = {
  dataExport: "admin",
  agenda: "tecnico",
  orders: "tecnico",
  incidents: "tecnico",
  projects: "tecnico",
  equipment: "tecnico",
  checklists: "tecnico",
  technicians: "tecnico",
  tools: "tecnico",
  materials: "tecnico",
  maintenanceSchedule: "tecnico",
  reports: "tecnico",
  warranty: "tecnico",
  branches: "tecnico",
  clients: "ventas",
  quotes: "ventas",
  salesOrders: "ventas",
  invoices: "ventas",
  creditNotes: "ventas",
  recurringContracts: "ventas",
  caja: "ventas",
  receivables: "ventas",
  salesReports: "ventas",
  products: "compras",
  services: "compras",
  suppliers: "compras",
  purchaseOrders: "compras",
  deliveryNotes: "compras",
  purchases: "compras",
  supplierReceipts: "compras",
  otherExpenses: "compras",
  purchaseLedger: "compras",
  payables: "compras",
  users: "admin",
  companyProfile: "admin",
  chartOfAccounts: "admin",
  taxRates: "admin",
  ncf: "admin",
  payroll: "nomina"
};

// Archivo con la pantalla de cada sección (fase 2).
const VIEW_CHUNK_OF_VIEW = {
  agenda: "vistas-tecnico",
  orders: "vistas-tecnico",
  incidents: "vistas-tecnico",
  projects: "vistas-tecnico",
  equipment: "vistas-tecnico",
  technicians: "vistas-tecnico",
  tools: "vistas-tecnico",
  materials: "vistas-tecnico",
  maintenanceSchedule: "vistas-tecnico",
  branches: "vistas-tecnico",
  warranty: "vistas-tecnico",
  checklists: "vistas-tecnico",
  reports: "vistas-tecnico",
  clients: "vistas-ventas",
  products: "vistas-compras",
  services: "vistas-compras",
  suppliers: "vistas-compras",
  purchases: "vistas-compras",
  purchaseOrders: "vistas-compras",
  deliveryNotes: "vistas-compras",
  otherExpenses: "vistas-compras",
  chartOfAccounts: "vistas-contable",
  taxRates: "vistas-contable",
  fiscalReports: "vistas-contable",
  salesReports: "vistas-ventas",
  financialReports: "vistas-contable",
  bankReconciliation: "vistas-contable",
  supplierReceipts: "vistas-compras",
  purchaseLedger: "vistas-compras",
  receivables: "vistas-ventas",
  payables: "vistas-compras",
  ncf: "vistas-contable",
  dgiiCatalog: "vistas-contable",
  quotes: "vistas-ventas",
  salesOrders: "vistas-ventas",
  invoices: "vistas-ventas",
  caja: "vistas-ventas",
  creditNotes: "vistas-ventas",
  recurringContracts: "vistas-ventas",
  users: "vistas-admin",
  activityLog: "vistas-admin"
};

// Precarga silenciosa: si falla (sin internet), no recarga ni avisa; se reintenta al usar la sección.
export function prefetchForViews(viewKeys) {
  const chunks = new Set((viewKeys || []).flatMap((k) => [CHUNK_OF_VIEW[k], VIEW_CHUNK_OF_VIEW[k]]).filter(Boolean));
  chunks.forEach((f) => { IMPORTERS[f]().catch(() => {}); });
}
