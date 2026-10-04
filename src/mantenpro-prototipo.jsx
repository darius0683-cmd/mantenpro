import { useState, useMemo, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";
import { LayoutDashboard, BarChart3, AlertTriangle, CalendarDays, ClipboardList, FolderKanban, Settings2, ClipboardCheck, Users, Package, Wrench, Boxes, Users2, BadgeCheck, ShoppingCart, Truck, FileText, Receipt, Layers, RotateCcw, Wallet, Hash, Search, Banknote, Building2, ShieldCheck, History, Download, Briefcase, Pencil, Trash2, CheckCircle2, ChevronLeft, X, ChevronDown, ChevronRight, LogOut, Menu, Bell, BellOff, Plus, CircleHelp, ScanLine } from "lucide-react";
import { ACTIVITY_TABLE_LABELS, APP_URL, BANK_MATCH_WINDOW_DAYS, C, ChangePasswordModal, FullScreenLoader, NCFSequenceFormModal, PRIORITY_CFG, Pill, PushSetupInline, ROLE_CFG, ROLE_DEFAULT_PERMISSIONS, TOOL_STATUS_CFG, TYPE_CFG, ThemeToggleButton, addDaysToDateStr, addMonths, compressImage, daysBetween, fetchAllRows, fetchByIdChunks, fmtDate, fmtMoney, iconBtnStyle, isRetentionMethod, issuableSequences, loadXlsx, logoToDataUrl, returnMaterialLine, todayStrRD } from "./modulos/base.jsx";
import { AccountFormModal, BranchFormModal, BulkOrderFormModal, BulkToolFormModal, ChecklistTemplateFormModal, ClientAssetFormModal, ClientFormModal, CompanyProfileForm, CreditNoteDetailModal, ExportDataPanel, CreditNoteFormModal, EquipmentFormModal, ExchangeRatePromptModal, ExpenseFormModal, GoodsReceiptDetailModal, GoodsReceiptFormModal, HistoryModal, IncidentDetailModal, IncidentFormModal, InviteFormModal, InvoiceDetailModal, InvoiceFormModal, LocationFormModal, MaterialFormModal, OrderDetailModal, OrderFormModal, PayrollSection, ProductFormModal, ProjectDetailModal, ProjectFormModal, PurchaseDetailModal, PurchaseFormModal, PurchaseOrderDetailModal, PurchaseOrderFormModal, QuoteDetailModal, QuoteFormModal, RecurringContractFormModal, SalesOrderDetailModal, StatementModal, StockAdjustModal, StockMovementsModal, StockTransferModal, SupplierFormModal, SupportViewer, TaxRateFormModal, TechFormModal, ToolFormModal, ToolListFormModal, UserPermissionsModal, VistaActivityLog, VistaAgenda, VistaBankReconciliation, VistaBranches, VistaCaja, VistaChartOfAccounts, VistaChecklists, VistaClients, VistaCreditNotes, VistaDeliveryNotes, VistaDgiiCatalog, VistaEquipment, VistaFinancialReports, VistaFiscalReports, VistaIncidents, VistaInvoices, VistaMaintenanceSchedule, VistaMaterials, VistaNcf, VistaOrders, VistaOtherExpenses, VistaPayables, VistaProductsServices, VistaProjects, VistaPurchaseLedger, VistaPurchaseOrders, VistaPurchases, VistaQuotes, VistaReceivables, VistaRecurringContracts, VistaReports, VistaSalesOrders, VistaSalesReports, VistaSupplierReceipts, VistaSuppliers, VistaTaxRates, VistaTechnicians, VistaTools, VistaUsers, VistaWarranty, VoidInvoiceModal, HelpCenter, EquipmentQrModal, QrScannerModal, ClientPortal, ClientPortalLinkModal, prefetchForViews } from "./modulos/lazy.jsx";
import { AuthScreen, InviteAcceptScreen, OnboardingScreen } from "./modulos/auth.jsx";

function Dashboard({ session, profile, company, onUpdateCompany, onSignOut }) {
  const companyName = company?.name || "Tu empresa";
  const companyId = profile.company_id;
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const canManage = profile.role === "admin" || profile.role === "supervisor";
  const isAdmin = profile.role === "admin";
  const isTecnico = profile.role === "tecnico";
  const isVendedor = profile.role === "vendedor";
  const canUseCaja = isAdmin || profile.role === "supervisor" || isVendedor;
  // Un vendedor solo debe ver/operar cotizaciones y facturas de su(s) propia(s) sucursal(es) —
  // igual que ya pasa en Caja. Admin y supervisor siguen viendo todas.
  const vendorBranchIds = useMemo(
    () => (isVendedor ? [profile.branch_id, ...(profile.extra_branch_ids || [])].filter(Boolean) : null),
    [isVendedor, profile.branch_id, profile.extra_branch_ids]
  );
  const effectivePermissions = (profile.permissions && typeof profile.permissions === "object" && !Array.isArray(profile.permissions)) ? profile.permissions : (ROLE_DEFAULT_PERMISSIONS[profile.role] || {});
  // Venta por módulos: qué módulo ('tecnico' | 'comercial' | 'administracion') dueño de cada
  // pantalla — coincide 1:1 con las secciones del menú (RAW_NAV más abajo). Lo que no aparece
  // aquí (dashboard, catálogo, reportes) es compartido entre módulos y no se bloquea por esto;
  // el candado real y definitivo vive en RLS (ver venta-por-modulos.sql) — esto es solo para
  // no mostrar en el menú/UI algo que el backend igual va a rechazar.
  const MODULE_OF_KEY = {
    orders: "tecnico", agenda: "tecnico", incidents: "tecnico", projects: "tecnico", equipment: "tecnico",
    checklists: "tecnico", technicians: "tecnico", tools: "tecnico", materials: "tecnico", maintenanceSchedule: "tecnico",
    reports: "tecnico",
    suppliers: "comercial", purchaseOrders: "comercial", deliveryNotes: "comercial", purchases: "comercial",
    supplierReceipts: "comercial", otherExpenses: "comercial", purchaseLedger: "comercial", quotes: "comercial",
    salesOrders: "comercial", invoices: "comercial", creditNotes: "comercial", recurringContracts: "comercial", caja: "comercial",
    salesReports: "comercial",
    chartOfAccounts: "contable", receivables: "contable", payables: "contable", taxRates: "contable",
    bankReconciliation: "contable", ncf: "contable", financialReports: "contable", fiscalReports: "contable",
    activityLog: "administracion",
    payroll: "nomina",
  };
  const companyHasModule = (mod) => !mod || (company?.enabled_modules || []).includes(mod);
  // Técnico + comercial: el técnico usa Productos como inventario y su almacén queda para sobrantes
  const techUsesProducts = companyHasModule("tecnico") && companyHasModule("comercial");
  const hasPerm = (key) => (isAdmin || !!effectivePermissions[key]) && companyHasModule(MODULE_OF_KEY[key]);
  const canEdit = (key) => isAdmin || effectivePermissions[key] === "edit" || effectivePermissions[key] === "edit_no_delete";
  const canDelete = (key) => isAdmin || effectivePermissions[key] === "edit";
  const maxDiscountPct = isAdmin ? 100 : Number(profile.max_discount_pct) || 0;

  const [loadingScope, setLoadingScope] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [branches, setBranches] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [locations, setLocations] = useState([]);
  const [orders, setOrders] = useState([]);
  const [orderTechnicians, setOrderTechnicians] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [invites, setInvites] = useState([]);
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [productComponents, setProductComponents] = useState([]);
  const [clientAssets, setClientAssets] = useState([]);
  const [checklistTemplates, setChecklistTemplates] = useState([]);
  const [importingChecklists, setImportingChecklists] = useState(false);
  const [selectedChecklists, setSelectedChecklists] = useState(new Set());
  const [selectedClients, setSelectedClients] = useState(new Set());
  const [clientSearch, setClientSearch] = useState("");
  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const [selectedSuppliers, setSelectedSuppliers] = useState(new Set());
  const [supplierSearch, setSupplierSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productCategoryFilter, setProductCategoryFilter] = useState("all");
  const [productBranchFilter, setProductBranchFilter] = useState("all");
  const [purchaseSearch, setPurchaseSearch] = useState("");
  const [purchaseSupplierFilter, setPurchaseSupplierFilter] = useState("all");
  const [quoteSearch, setQuoteSearch] = useState("");
  const [quoteStatusFilter, setQuoteStatusFilter] = useState("all");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState("all");
  const [invoicePaymentFilter, setInvoicePaymentFilter] = useState("all");
  const [suppliers, setSuppliers] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [purchaseOrderItems, setPurchaseOrderItems] = useState([]);
  const [goodsReceipts, setGoodsReceipts] = useState([]);
  const [goodsReceiptItems, setGoodsReceiptItems] = useState([]);
  const [otherExpenses, setOtherExpenses] = useState([]);
  const [tools, setTools] = useState([]);
  const [toolLists, setToolLists] = useState([]);
  const [toolLoans, setToolLoans] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectMaterials, setProjectMaterials] = useState([]);
  const [chartOfAccounts, setChartOfAccounts] = useState([]);
  const [taxRates, setTaxRates] = useState([]);
  const [cashSessions, setCashSessions] = useState([]);
  const [allPurchasePayments, setAllPurchasePayments] = useState([]);
  const [ncfSequences, setNcfSequences] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [creditNotes, setCreditNotes] = useState([]);
  const [recurringContracts, setRecurringContracts] = useState([]);
  const [bankTransactions, setBankTransactions] = useState([]);
  const [companyBankAccounts, setCompanyBankAccounts] = useState([]);
  const [importingBankStatement, setImportingBankStatement] = useState(false);
  const [bankImportMsg, setBankImportMsg] = useState("");
  const [bankAccountFilter, setBankAccountFilter] = useState(""); // "" = todas las cuentas
  const [notifications, setNotifications] = useState([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  // Colapsar el menú lateral hacia la izquierda en escritorio (no afecta el menú
  // móvil, que ya se esconde solo). Solo cambia visibilidad/ancho, no desmonta NAV
  // ni pierde la sección abierta — al volver a expandir queda todo como estaba.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Departamento abierto dentro del Panel (null = mostrar los 4 departamentos).
  // Se resetea a null cada vez que se ENTRA al Panel desde otra vista (ver efecto
  // más abajo, cerca de "view"), para que siempre arranque mostrando los
  // departamentos y no se quede "atorado" dentro de uno de una visita anterior.
  const [dashboardDept, setDashboardDept] = useState(null);
  // Ítem con submenú abierto dentro del departamento (null = mostrar las
  // subsecciones del departamento). Tercer nivel del drill-down del Panel.
  const [dashboardSubmenu, setDashboardSubmenu] = useState(null);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [quotes, setQuotes] = useState([]);
  const [salesOrders, setSalesOrders] = useState([]);
  const [selectedSalesOrders, setSelectedSalesOrders] = useState(new Set());
  const [selectedOrders, setSelectedOrders] = useState(new Set());
  const [selectedIncidents, setSelectedIncidents] = useState(new Set());
  const [incidentTechnicianFilter, setIncidentTechnicianFilter] = useState("all");
  const [activityLog, setActivityLog] = useState([]);
  const [loadingActivityLog, setLoadingActivityLog] = useState(false);
  const [activityTableFilter, setActivityTableFilter] = useState("all");
  const [activityActionFilter, setActivityActionFilter] = useState("all");
  const [activityUserFilter, setActivityUserFilter] = useState("all");
  const [activityDateFrom, setActivityDateFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); });
  const [activityDateTo, setActivityDateTo] = useState(() => todayStrRD());
  const [financialDateFrom, setFinancialDateFrom] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); });
  const [financialDateTo, setFinancialDateTo] = useState(() => todayStrRD());
  const [salesReportDateFrom, setSalesReportDateFrom] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); });
  const [salesReportDateTo, setSalesReportDateTo] = useState(() => todayStrRD());
  const [invoicePaymentsAll, setInvoicePaymentsAll] = useState([]);
  const [financialCardCommissions, setFinancialCardCommissions] = useState(0);
  // Nómina en el estado de resultados: solo totales (payroll_cost_summary), nunca salarios por persona.
  const [financialPayrollCost, setFinancialPayrollCost] = useState({ gross: 0, employer: 0, employees: 0 });
  const [financialInvoiceItems, setFinancialInvoiceItems] = useState([]);
  const [financialPurchaseItems, setFinancialPurchaseItems] = useState([]);
  const [purchasePaymentsAll, setPurchasePaymentsAll] = useState([]);
  const [loadingFinancial, setLoadingFinancial] = useState(false);
  const [incidentEquipmentFilter, setIncidentEquipmentFilter] = useState("all");
  const [incidentDateFrom, setIncidentDateFrom] = useState("");
  const [incidentDateTo, setIncidentDateTo] = useState("");
  const [incidentCompletedFrom, setIncidentCompletedFrom] = useState("");
  const [incidentCompletedTo, setIncidentCompletedTo] = useState("");
  const [selectedQuotes, setSelectedQuotes] = useState(new Set());
  const [incidents, setIncidents] = useState([]);

  const [branchFilter, setBranchFilter] = useState("all");
  const [equipmentTechFilter, setEquipmentTechFilter] = useState("all");
  const [equipmentTypeFilter, setEquipmentTypeFilter] = useState("all");
  const [equipmentStatusFilter, setEquipmentStatusFilter] = useState("all"); // all | operativo | fuera_servicio
  const [equipmentSearch, setEquipmentSearch] = useState("");
  const [selectedEquipment, setSelectedEquipment] = useState(new Set());
  const [calendarMonth, setCalendarMonth] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const [searchedDate, setSearchedDate] = useState("");
  const [agendaTechFilter, setAgendaTechFilter] = useState("all");
  const [agendaViewMode, setAgendaViewMode] = useState("month");
  const [agendaWeekAnchor, setAgendaWeekAnchor] = useState(() => todayStrRD());
  const [view, setView] = useState(() => new URLSearchParams(window.location.search).get("view") || "dashboard");

  // Antes cada cambio de sección usaba history.replaceState, así que el botón
  // "atrás" del navegador/celular no tenía ningún historial propio de la app que
  // recorrer y sacaba a la persona de MantenPro de una vez. Ahora cada cambio de
  // sección hace pushState (agrega una entrada), así que "atrás" retrocede por las
  // secciones visitadas dentro de la app. Solo cuando ya se acaba ese historial
  // (se llega a la primera pantalla que se abrió) "atrás" vuelve a comportarse
  // normal y sale de la app — es el comportamiento nativo del navegador, no hay
  // que simularlo.
  //
  // El drill-down del Panel (departamentos → subsecciones) también entra en este
  // mismo historial (guardamos "dept" junto con "view" en cada entrada). Antes solo
  // "view" se empujaba, así que entrar a un departamento no dejaba rastro en el
  // historial: al presionar "atrás" desde una subsección, saltaba directo al Panel
  // sin pasar por la pantalla del departamento. Ahora cada paso (departamento
  // abierto, subsección abierta) es su propia entrada.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("view", view);
    if (dashboardDept) url.searchParams.set("dept", dashboardDept); else url.searchParams.delete("dept");
    if (dashboardSubmenu) url.searchParams.set("sub", dashboardSubmenu); else url.searchParams.delete("sub");
    window.history.replaceState({ view, dept: dashboardDept || null, sub: dashboardSubmenu || null }, "", url);
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    const onPopState = (event) => {
      const params = new URLSearchParams(window.location.search);
      const nextView = event.state?.view ?? params.get("view") ?? "dashboard";
      const nextDept = event.state?.dept ?? params.get("dept") ?? null;
      const nextSub = event.state?.sub ?? params.get("sub") ?? null;
      setView(nextView);
      setDashboardDept(nextDept);
      setDashboardSubmenu(nextSub);
      setShowMobileMenu(false);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const pushHistoryState = (key, dept, sub) => {
    const url = new URL(window.location.href);
    url.searchParams.set("view", key);
    if (dept) url.searchParams.set("dept", dept); else url.searchParams.delete("dept");
    if (sub) url.searchParams.set("sub", sub); else url.searchParams.delete("sub");
    window.history.pushState({ view: key, dept: dept || null, sub: sub || null }, "", url);
  };

  const changeView = (key) => {
    if (key === view && !dashboardDept) return;
    setView(key);
    setDashboardDept(null);
    setDashboardSubmenu(null);
    setShowMobileMenu(false);
    pushHistoryState(key, null, null);
  };

  // Entrar a un departamento del Panel (primer nivel del drill-down). No usa
  // changeView porque la vista sigue siendo "dashboard" — solo cambia qué se
  // muestra dentro de ella — pero sí necesita su propia entrada de historial
  // para que "atrás" regrese a la lista de departamentos en vez de saltarse ese paso.
  const openDashboardDept = (deptName) => {
    setDashboardDept(deptName);
    setDashboardSubmenu(null);
    pushHistoryState("dashboard", deptName, null);
  };

  // Entrar al submenú de un ítem con "children" dentro de un departamento
  // (segundo nivel del drill-down, tercero contando el Panel). Mismo patrón:
  // su propia entrada de historial para que "atrás" regrese a las subsecciones
  // del departamento en vez de saltarse ese paso.
  const openDashboardSubmenu = (menuKey) => {
    setDashboardSubmenu(menuKey);
    pushHistoryState("dashboard", dashboardDept, menuKey);
  };

  // El botón "‹ Departamentos"/"‹ <departamento>" usa el historial real
  // (window.history.back()) en vez de poner el estado en null directamente,
  // para que quede consistente con lo que hace el botón "atrás" nativo — un
  // solo mecanismo, no dos que se puedan desincronizar.
  const closeDashboardDept = () => window.history.back();
  const closeDashboardSubmenu = () => window.history.back();

  const [showOrderForm, setShowOrderForm] = useState(false);
  const [showBulkOrders, setShowBulkOrders] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [editingOrderAttachments, setEditingOrderAttachments] = useState([]);
  const [detailOrder, setDetailOrder] = useState(null);
  const [detailOrderAttachments, setDetailOrderAttachments] = useState([]);
  const [detailOrderChecklist, setDetailOrderChecklist] = useState([]);
  const [showAddChecklist, setShowAddChecklist] = useState(false);
  const [editingChecklist, setEditingChecklist] = useState(null);
  const [orderAttachmentIds, setOrderAttachmentIds] = useState(new Set());
  const [orderChecklistSummary, setOrderChecklistSummary] = useState(new Map()); // work_order_id -> { total, answered } — alimenta el KPI de cumplimiento de checklist en Informes
  const [showAddBranch, setShowAddBranch] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);
  const [showAddTech, setShowAddTech] = useState(false);
  const [editingTech, setEditingTech] = useState(null);
  const [showAddEquipment, setShowAddEquipment] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState(null);
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [pendingLocationBranch, setPendingLocationBranch] = useState(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [historyFor, setHistoryFor] = useState(null);
  // Código QR de equipos: "eq" en el enlace abre la ficha del equipo (ver equipos-qr.jsx).
  const [qrEquipmentId, setQrEquipmentId] = useState(() => new URLSearchParams(window.location.search).get("eq"));
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [orderPrefill, setOrderPrefill] = useState(null);
  const [incidentPrefill, setIncidentPrefill] = useState(null);
  const [portalClient, setPortalClient] = useState(null);
  const [showAddClient, setShowAddClient] = useState(false);
  // Último cliente creado desde el botón "+" de Cotizaciones/Facturación/
  // Incidentes/Activos de cliente, para seleccionarlo solo en ese formulario
  // en cuanto se guarda — sin tener que volver a buscarlo manualmente.
  // autoSelectToken solo sube cuando se crea un cliente nuevo (no al editar),
  // así cada formulario puede distinguir "ya lo aplico" de "esto es de antes,
  // de otra sesión de creación, no me toca a mí".
  const [autoSelectClientId, setAutoSelectClientId] = useState(null);
  const [autoSelectToken, setAutoSelectToken] = useState(0);
  const [editingClient, setEditingClient] = useState(null);
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [showAddPurchase, setShowAddPurchase] = useState(false);
  const [purchaseDetail, setPurchaseDetail] = useState(null);
  const [prefillReceiptId, setPrefillReceiptId] = useState(null); // abre el form de Compras con esta nota de entrega ya elegida
  const [showAddPurchaseOrder, setShowAddPurchaseOrder] = useState(false);
  const [purchaseOrderDetail, setPurchaseOrderDetail] = useState(null);
  const [showAddReceipt, setShowAddReceipt] = useState(false);
  const [receiptFromOrder, setReceiptFromOrder] = useState(null); // pedido desde el que se abrió "Recibir mercancía"
  const [receiptDetail, setReceiptDetail] = useState(null);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [showAddTool, setShowAddTool] = useState(false);
  const [showBulkTools, setShowBulkTools] = useState(false);
  const [editingTool, setEditingTool] = useState(null);
  const [toolStatusFilter, setToolStatusFilter] = useState("all");
  const [toolTechnicianFilter, setToolTechnicianFilter] = useState("all");
  const [toolSearch, setToolSearch] = useState("");
  const [groupToolsByTechnician, setGroupToolsByTechnician] = useState(false);
  const [selectedTools, setSelectedTools] = useState(new Set());
  const [toolViewMode, setToolViewMode] = useState("herramientas");
  const [showAddProject, setShowAddProject] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [projectDetail, setProjectDetail] = useState(null);
  const [projectStatusFilter, setProjectStatusFilter] = useState("all");
  const [projectSearch, setProjectSearch] = useState("");
  const [showAddToolList, setShowAddToolList] = useState(false);
  const [editingToolList, setEditingToolList] = useState(null);
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [materialsLowStockOnly, setMaterialsLowStockOnly] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [showAddTaxRate, setShowAddTaxRate] = useState(false);
  const [dgiiImporting, setDgiiImporting] = useState(false);
  const [dgiiImportProgress, setDgiiImportProgress] = useState(null);
  const [dgiiCatalogCount, setDgiiCatalogCount] = useState(null);
  const [dgiiCatalogUpdatedAt, setDgiiCatalogUpdatedAt] = useState(null);
  const [taxReportPeriod, setTaxReportPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [cajaBranch, setCajaBranch] = useState("");
  const [showOpenCaja, setShowOpenCaja] = useState(false);
  const [editingPermissionsFor, setEditingPermissionsFor] = useState(null);
  const [showCloseCaja, setShowCloseCaja] = useState(false);
  const [sessionPayments, setSessionPayments] = useState([]);
  const [cardAcquirers, setCardAcquirers] = useState([]);
  const [voidingInvoice, setVoidingInvoice] = useState(null);
  const [productStock, setProductStock] = useState([]); // existencia por producto y sucursal
  const [showStockTransfer, setShowStockTransfer] = useState(false);
  const [stockAdjustFor, setStockAdjustFor] = useState(null); // producto (o true) para el ajuste
  const [stockMovementsFor, setStockMovementsFor] = useState(null); // producto para el kárdex
  const [showAcquirers, setShowAcquirers] = useState(false);
  const [editingTaxRate, setEditingTaxRate] = useState(null);
  const [showAddNcf, setShowAddNcf] = useState(false);
  const [editingNcf, setEditingNcf] = useState(null);
  const [showAddInvoice, setShowAddInvoice] = useState(false);
  const [showAddContract, setShowAddContract] = useState(false);
  const [editingContract, setEditingContract] = useState(null);
  // Al generar factura(s) de contrato(s) en USD, se pide la tasa del día en vez de reusar la
  // tasa que quedó guardada de cuando se creó/editó el contrato — ver generateContractInvoice.
  const [exchangeRatePrompt, setExchangeRatePrompt] = useState(null); // { mode: "single" | "batch", contracts: [] }
  const [showStatement, setShowStatement] = useState(false);
  const [invoiceDetail, setInvoiceDetail] = useState(null);
  const [invoicePrefill, setInvoicePrefill] = useState(null);
  const [showAddCreditNote, setShowAddCreditNote] = useState(false);
  const [creditNoteDetail, setCreditNoteDetail] = useState(null);
  const [showAddQuote, setShowAddQuote] = useState(false);
  const [quoteDetail, setQuoteDetail] = useState(null);
  const [editingQuote, setEditingQuote] = useState(null);
  const [editingQuoteItems, setEditingQuoteItems] = useState(null);
  const [salesOrderDetail, setSalesOrderDetail] = useState(null);
  const [showAddIncident, setShowAddIncident] = useState(false);
  const [editingIncident, setEditingIncident] = useState(null);
  const [incidentDetail, setIncidentDetail] = useState(null);
  const [orderFromIncident, setOrderFromIncident] = useState(null);
  const [orderFromSalesOrder, setOrderFromSalesOrder] = useState(null);
  const [quotePrefill, setQuotePrefill] = useState(null);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [technicianFilter, setTechnicianFilter] = useState("all");
  const [orderEquipmentFilter, setOrderEquipmentFilter] = useState("all");
  const [orderDateFrom, setOrderDateFrom] = useState("");
  const [orderDateTo, setOrderDateTo] = useState("");
  const [techReportDateFrom, setTechReportDateFrom] = useState("");
  const [techReportDateTo, setTechReportDateTo] = useState("");

  const loadAll = async () => {
    setLoadingScope(true);
    const [br, tech, eq, loc, ord, woa, wocki, cktpl, ckitems, profs, inv, cli, prod, pcomp, ast, sup, purch, ncf, invc, cnotes, qts, sord, inc, oexp, coa, txr, csess, tls, tlists, tloans, mats, wot, rcon, banktx, cba, projs, projmats, pords, pordit, grcpts, grcptit] = await Promise.all([
      fetchAllRows(() => supabase.from("branches").select("*").eq("company_id", companyId).order("name")),
      fetchAllRows(() => supabase.from("technicians").select("*").eq("company_id", companyId).order("name")),
      fetchAllRows(() => supabase.from("equipment").select("*").eq("company_id", companyId).order("name")),
      fetchAllRows(() => supabase.from("locations").select("*").eq("company_id", companyId).order("name")),
      fetchAllRows(() => supabase.from("work_orders").select("*").eq("company_id", companyId).order("created_at", { ascending: false })),
      fetchAllRows(() => supabase.from("work_order_attachments").select("work_order_id")),
      fetchAllRows(() => supabase.from("work_order_checklist_items").select("work_order_id, checked, respuesta, response_type")),
      fetchAllRows(() => supabase.from("checklist_templates").select("*").eq("company_id", companyId).order("equipment_type")),
      fetchAllRows(() => supabase.from("checklist_template_items").select("*").order("position")),
      fetchAllRows(() => supabase.from("profiles").select("*").eq("company_id", companyId).order("created_at")),
      isAdmin ? supabase.from("invites").select("*").eq("company_id", companyId).eq("used", false).order("created_at") : Promise.resolve({ data: [] }),
      fetchAllRows(() => supabase.from("clients").select("*").eq("company_id", companyId).order("name")),
      fetchAllRows(() => supabase.from("products").select("*").eq("company_id", companyId).order("name")),
      fetchAllRows(() => supabase.from("product_components").select("*").eq("company_id", companyId)),
      fetchAllRows(() => supabase.from("client_assets").select("*").eq("company_id", companyId).order("install_date")),
      fetchAllRows(() => supabase.from("suppliers").select("*").eq("company_id", companyId).order("name")),
      fetchAllRows(() => supabase.from("purchases").select("*").eq("company_id", companyId).order("purchase_date", { ascending: false })),
      fetchAllRows(() => supabase.from("ncf_sequences").select("*").eq("company_id", companyId).order("created_at")),
      fetchAllRows(() => supabase.from("invoices").select("*").eq("company_id", companyId).order("invoice_date", { ascending: false })),
      fetchAllRows(() => supabase.from("credit_notes").select("*").eq("company_id", companyId).order("note_date", { ascending: false })),
      fetchAllRows(() => supabase.from("quotes").select("*").eq("company_id", companyId).order("quote_date", { ascending: false })),
      fetchAllRows(() => supabase.from("sales_orders").select("*").eq("company_id", companyId).order("order_date", { ascending: false })),
      fetchAllRows(() => supabase.from("incidents").select("*").eq("company_id", companyId).order("created_at", { ascending: false })),
      fetchAllRows(() => supabase.from("other_expenses").select("*").eq("company_id", companyId).order("expense_date", { ascending: false })),
      fetchAllRows(() => supabase.from("chart_of_accounts").select("*").eq("company_id", companyId).order("code")),
      fetchAllRows(() => supabase.from("tax_rates").select("*").eq("company_id", companyId).order("name")),
      fetchAllRows(() => supabase.from("cash_sessions").select("*").eq("company_id", companyId).order("opened_at", { ascending: false })),
      fetchAllRows(() => supabase.from("tools").select("*").eq("company_id", companyId).order("name")),
      fetchAllRows(() => supabase.from("tool_lists").select("*").eq("company_id", companyId).order("created_at")),
      fetchAllRows(() => supabase.from("tool_loans").select("*").eq("company_id", companyId).order("loaned_at", { ascending: false })),
      fetchAllRows(() => supabase.from("inventory_materials").select("*").eq("company_id", companyId).order("name")),
      fetchAllRows(() => supabase.from("work_order_technicians").select("*").eq("company_id", companyId)),
      fetchAllRows(() => supabase.from("recurring_contracts").select("*").eq("company_id", companyId).order("next_invoice_date")),
      fetchAllRows(() => supabase.from("bank_transactions").select("*").eq("company_id", companyId).order("transaction_date", { ascending: false })),
      fetchAllRows(() => supabase.from("company_bank_accounts").select("*").eq("company_id", companyId).order("created_at")),
      fetchAllRows(() => supabase.from("projects").select("*").eq("company_id", companyId).order("created_at", { ascending: false })),
      fetchAllRows(() => supabase.from("project_materials").select("*").eq("company_id", companyId).order("created_at", { ascending: false })),
      fetchAllRows(() => supabase.from("purchase_orders").select("*").eq("company_id", companyId).order("order_date", { ascending: false })),
      fetchAllRows(() => supabase.from("purchase_order_items").select("*")),
      fetchAllRows(() => supabase.from("goods_receipts").select("*").eq("company_id", companyId).order("receipt_date", { ascending: false })),
      fetchAllRows(() => supabase.from("goods_receipt_items").select("*")),
    ]);
    if (br.error) setErrorMsg(br.error.message);
    setBranches(br.data || []);
    setTechnicians(tech.data || []);
    setEquipment(eq.data || []);
    setLocations(loc.data || []);
    setOrders(ord.data || []);
    setOrderAttachmentIds(new Set((woa.data || []).map((r) => r.work_order_id)));
    // Misma regla que isChecklistItemAnswered en OrderDetailModal, para que el KPI de
    // Informes cuente "respondido" igual que la pantalla donde el técnico lo llena.
    const checklistSummary = new Map();
    (wocki.data || []).forEach((it) => {
      const cur = checklistSummary.get(it.work_order_id) || { total: 0, answered: 0 };
      cur.total += 1;
      const answered = it.response_type === "ok_no_ok_na" ? !!(it.respuesta && it.respuesta.trim())
        : it.response_type === "numeric" ? !!(it.respuesta && it.respuesta.trim() !== "" && !isNaN(Number(it.respuesta)))
        : !!it.checked;
      if (answered) cur.answered += 1;
      checklistSummary.set(it.work_order_id, cur);
    });
    setOrderChecklistSummary(checklistSummary);
    setChecklistTemplates((cktpl.data || []).map((t) => ({ ...t, items: (ckitems.data || []).filter((it) => it.template_id === t.id) })));
    setProfiles(profs.data || []);
    setInvites(inv.data || []);
    setClients(cli.data || []);
    setProducts(prod.data || []);
    setProductComponents(pcomp.data || []);
    setClientAssets(ast.data || []);
    setSuppliers(sup.data || []);
    setPurchases(purch.data || []);
    setNcfSequences(ncf.data || []);
    setInvoices(invc.data || []);
    setCreditNotes(cnotes.data || []);
    setQuotes(qts.data || []);
    setSalesOrders(sord.data || []);
    setIncidents(inc.data || []);
    setOtherExpenses(oexp.data || []);
    setChartOfAccounts(coa.data || []);
    setTaxRates(txr.data || []);
    setCashSessions(csess.data || []);
    setTools(tls.data || []);
    setToolLists(tlists.data || []);
    setToolLoans(tloans.data || []);
    setMaterials(mats.data || []);
    setOrderTechnicians(wot.data || []);
    setRecurringContracts(rcon.data || []);
    setBankTransactions(banktx.data || []);
    setCompanyBankAccounts(cba.data || []);
    setProjects(projs.data || []);
    setProjectMaterials(projmats.data || []);
    setPurchaseOrders(pords.data || []);
    setPurchaseOrderItems(pordit.data || []);
    setGoodsReceipts(grcpts.data || []);
    setGoodsReceiptItems(grcptit.data || []);
    // Existencia por sucursal (tabla product_stock; puede no existir si no se corrió la migración)
    const ps = await fetchAllRows(() => supabase.from("product_stock").select("product_id, branch_id, quantity").eq("company_id", companyId));
    setProductStock(ps.error ? [] : (ps.data || []));
    setLoadingScope(false);
  };
  const transferStock = async (fromId, toId, items, notes, date) => {
    setSaving(true);
    const { error } = await supabase.rpc("transfer_stock", { p_from_branch: fromId, p_to_branch: toId, p_items: items, p_notes: notes || null, p_date: date || null });
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    setShowStockTransfer(false);
    setErrorMsg("");
    loadAll();
  };
  const adjustStock = async (productId, branchId, delta, reason) => {
    setSaving(true);
    const { error } = await supabase.rpc("adjust_product_stock", { p_product_id: productId, p_delta: delta, p_branch_id: branchId, p_kind: "ajuste", p_reason: reason });
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    setStockAdjustFor(null);
    loadAll();
  };
  const stockAt = (productId, branchId) => Number(productStock.find((r) => r.product_id === productId && r.branch_id === branchId)?.quantity || 0);

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [companyId]);

  // Adquirentes de tarjeta (Azul, CardNET, VisaNet...) con su % de comisión y retención —
  // se cargan aparte de loadAll para no tocar ese Promise.all.
  const loadCardAcquirers = async () => {
    if (!companyId) return;
    const { data, error } = await supabase.from("card_acquirers").select("*").eq("company_id", companyId).order("name");
    if (error) { setErrorMsg(`No se pudieron cargar los adquirentes de tarjeta: ${error.message}`); return; }
    setCardAcquirers(data || []);
  };
  useEffect(() => { loadCardAcquirers(); /* eslint-disable-next-line */ }, [companyId]);

  const saveCardAcquirer = async (acq) => {
    const row = {
      name: acq.name.trim(),
      commission_pct: Number(acq.commission_pct) || 0,
      retention_pct: Number(acq.retention_pct) || 0,
      active: acq.active !== false,
    };
    if (!row.name) return false;
    const q = acq.id
      ? supabase.from("card_acquirers").update(row).eq("id", acq.id).select()
      : supabase.from("card_acquirers").insert({ ...row, company_id: companyId }).select();
    const { data, error } = await q;
    if (error) { setErrorMsg(error.message); return false; }
    if (!data || data.length === 0) { setErrorMsg("No se guardó el adquirente: la base de datos no aplicó el cambio (revisa que tu usuario sea admin)."); return false; }
    await loadCardAcquirers();
    return true;
  };

  useEffect(() => {
    if (view === "dgiiCatalog") loadDgiiCatalogStats();
    /* eslint-disable-next-line */
  }, [view]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => { /* silencioso: la app funciona igual sin esto */ });
    }
  }, []);

  const loadNotifications = async () => {
    if (!profile?.id) return;
    const { data } = await supabase.from("notifications").select("*").eq("profile_id", profile.id).order("created_at", { ascending: false }).limit(50);
    setNotifications(data || []);
  };
  useEffect(() => { loadNotifications(); /* eslint-disable-next-line */ }, [profile?.id, companyId]);

  useEffect(() => {
    (async () => {
      try {
        if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) return;
        const sub = await reg.pushManager.getSubscription();
        setPushSubscribed(!!sub);
      } catch { /* silencioso */ }
    })();
  }, []);

  const createNotification = async (targetProfileId, { title, body, link_view, category }) => {
    if (!targetProfileId) return;
    const { data, error } = await supabase.from("notifications").insert({
      company_id: companyId, profile_id: targetProfileId, title, body: body || null, link_view: link_view || null, category: category || "general",
    }).select().single();
    if (error || !data) return;
    if (targetProfileId === profile.id) setNotifications((prev) => [data, ...prev]);
    try {
      const targetProfile = profiles.find((p) => p.id === targetProfileId);
      if (targetProfile?.notify_email !== false) {
        supabase.functions.invoke("send-notification-email", { body: { notification_id: data.id, to_profile_id: targetProfileId, title, body: body || "" } })
          .then(({ error: fnError }) => supabase.from("notifications").update({ email_status: fnError ? "failed" : "sent" }).eq("id", data.id))
          .catch(() => supabase.from("notifications").update({ email_status: "failed" }).eq("id", data.id));
      }
      if (targetProfile?.notify_push !== false) {
        supabase.functions.invoke("send-web-push", { body: { profile_id: targetProfileId, title, body: body || "" } })
          .then(({ error: fnError }) => supabase.from("notifications").update({ push_status: fnError ? "failed" : "sent" }).eq("id", data.id))
          .catch(() => supabase.from("notifications").update({ push_status: "failed" }).eq("id", data.id));
      }
    } catch { /* el envío real es best-effort; la notificación ya quedó visible en la app */ }
  };

  const notifyManyTechnicians = async (technicianIds, payload) => {
    const uniqueIds = Array.from(new Set(technicianIds.filter(Boolean)));
    for (const techId of uniqueIds) {
      const targetProfile = profiles.find((p) => p.technician_id === techId);
      if (targetProfile) await createNotification(targetProfile.id, payload);
    }
  };

  const markNotificationRead = async (id) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
  };
  const markAllNotificationsRead = async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await supabase.from("notifications").update({ is_read: true }).in("id", unreadIds);
  };

  const urlBase64ToUint8Array = (base64String) => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
  };

  const enablePushNotifications = async (vapidPublicKey) => {
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setErrorMsg("Este navegador no soporta notificaciones push.");
        return;
      }
      // iPhone/iPad: el push solo funciona con la app instalada en la pantalla de inicio (iOS 16.4+)
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const isStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
      if (isIOS && !isStandalone) {
        setErrorMsg("En iPhone/iPad las notificaciones solo funcionan con la app instalada: en Safari toca Compartir → \"Agregar a pantalla de inicio\", abre la app desde ese ícono y activa las notificaciones ahí.");
        return;
      }
      // Si el navegador ya tiene el sitio bloqueado, no vuelve a mostrar la ventana de permiso:
      // hay que desbloquearlo a mano en la configuración del sitio.
      const blockedHelp = "Las notificaciones están bloqueadas para este sitio en tu navegador, y por eso no aparece la ventana de permiso. Para desbloquearlas: toca el ícono a la izquierda de la dirección (candado o ajustes) → Notificaciones → Permitir, recarga la página y vuelve a tocar \"Activar notificaciones push\". En Windows revisa también Configuración → Sistema → Notificaciones, que el navegador tenga permiso.";
      if (Notification.permission === "denied") { setErrorMsg(blockedHelp); return; }
      const permission = await Notification.requestPermission();
      if (permission === "denied") { setErrorMsg(blockedHelp); return; }
      if (permission !== "granted") { setErrorMsg("Cerraste la ventana de permiso sin elegir. Toca \"Activar notificaciones push\" otra vez y elige \"Permitir\"."); return; }
      await navigator.serviceWorker.register("/sw.js");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) });
      const json = sub.toJSON();
      await supabase.from("push_subscriptions").upsert({
        company_id: companyId, profile_id: profile.id, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth,
      }, { onConflict: "endpoint" });
      setPushSubscribed(true);
    } catch (err) {
      setErrorMsg("No se pudo activar el push: " + err.message);
    }
  };
  const disablePushNotifications = async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setPushSubscribed(false);
    } catch { /* silencioso */ }
  };

  const loadActivityLog = async () => {
    setLoadingActivityLog(true);
    let query = supabase.from("activity_log").select("*").eq("company_id", companyId).order("changed_at", { ascending: false }).limit(2000);
    if (activityDateFrom) query = query.gte("changed_at", `${activityDateFrom}T00:00:00`);
    if (activityDateTo) query = query.lte("changed_at", `${activityDateTo}T23:59:59`);
    const { data, error } = await query;
    setLoadingActivityLog(false);
    if (error) { setErrorMsg(error.message); return; }
    setActivityLog(data || []);
  };
  // Restaurar un registro borrado (solo admin; el servidor valida tipo, empresa, módulo y que no exista ya).
  const restoreDeletedRecord = async (log) => {
    const label = ACTIVITY_TABLE_LABELS[log.table_name] || log.table_name;
    if (!window.confirm(`¿Restaurar este registro de ${label}? Vuelve tal como estaba cuando se borró.`)) return;
    const { error } = await supabase.rpc("restore_deleted_record", { p_log_id: log.id });
    if (error) { setErrorMsg(error.message); return; }
    await loadActivityLog();
    loadAll();
  };
  useEffect(() => {
    if (view === "activityLog" && hasPerm("activityLog")) loadActivityLog();
    // eslint-disable-next-line
  }, [view, activityDateFrom, activityDateTo, companyId]);

  const activityLogFiltered = useMemo(() => activityLog.filter((l) =>
    (activityTableFilter === "all" || l.table_name === activityTableFilter) &&
    (activityActionFilter === "all" || l.action === activityActionFilter) &&
    (activityUserFilter === "all" || l.changed_by_email === activityUserFilter)
  ), [activityLog, activityTableFilter, activityActionFilter, activityUserFilter]);

  const activityUsers = useMemo(() => Array.from(new Set(activityLog.map((l) => l.changed_by_email).filter(Boolean))).sort(), [activityLog]);
  const activityTablesPresent = useMemo(() => Array.from(new Set(activityLog.map((l) => l.table_name))).sort(), [activityLog]);
  const activityUserName = useMemo(() => {
    const map = Object.fromEntries(profiles.map((p) => [p.email, p.full_name || p.email]));
    return (email) => (email ? map[email] || email : "—");
  }, [profiles]);

  const describeActivityEntry = (l) => {
    const d = l.new_data || l.old_data || {};
    return d.title || d.name || d.quote_number || d.invoice_number || d.code || d.number || "";
  };

  const loadFinancialData = async () => {
    setLoadingFinancial(true);
    const fromIso = `${financialDateFrom}T00:00:00`;
    const toIso = `${financialDateTo}T23:59:59`;
    const [ip, pp] = await Promise.all([
      fetchAllRows(() => supabase.from("invoice_payments").select("id, amount, method, payment_date, invoice_id, currency, foreign_amount, fx_difference, bank_account_id").gte("payment_date", fromIso).lte("payment_date", toIso)),
      fetchAllRows(() => supabase.from("purchase_payments").select("id, amount, method, payment_date, purchase_id").gte("payment_date", fromIso).lte("payment_date", toIso)),
    ]);
    setLoadingFinancial(false);
    if (ip.error) { setErrorMsg(ip.error.message); return; }
    if (pp.error) { setErrorMsg(pp.error.message); return; }
    setInvoicePaymentsAll(ip.data || []);
    setPurchasePaymentsAll(pp.data || []);
    // Renglones de facturas y compras del período: costo de venta y parte inventariable de las compras
    const inRangeF = (d) => d && d >= financialDateFrom && d <= financialDateTo;
    const invIds = invoices.filter((i) => i.status !== "anulada" && inRangeF(i.invoice_date)).map((i) => i.id);
    const purIds = purchases.filter((pu) => inRangeF(pu.purchase_date)).map((pu) => pu.id);
    const [{ data: invItems }, { data: purItems }] = await Promise.all([
      fetchByIdChunks(invIds, (chunk) => supabase.from("invoice_items").select("invoice_id, product_id, quantity, unit_cost").in("invoice_id", chunk)),
      fetchByIdChunks(purIds, (chunk) => supabase.from("purchase_items").select("purchase_id, product_id, subtotal").in("purchase_id", chunk)),
    ]);
    setFinancialInvoiceItems(invItems || []);
    setFinancialPurchaseItems(purItems || []);
    // Comisiones de tarjeta de los cobros del período (gasto financiero en el estado de resultados)
    const cardIds = (ip.data || []).filter((p) => p.method === "Tarjeta").map((p) => p.id);
    if (cardIds.length > 0) {
      const { data: cardRows } = await fetchByIdChunks(cardIds, (chunk) => supabase.from("invoice_payment_card_details").select("payment_id, commission_amount").in("payment_id", chunk));
      setFinancialCardCommissions((cardRows || []).reduce((sum, c) => sum + Number(c.commission_amount || 0), 0));
    } else {
      setFinancialCardCommissions(0);
    }
    if (companyHasModule("nomina")) {
      const { data: pc, error: pcError } = await supabase.rpc("payroll_cost_summary", { p_from: financialDateFrom, p_to: financialDateTo });
      const row = Array.isArray(pc) ? pc[0] : pc;
      if (!pcError && row) setFinancialPayrollCost({ gross: Number(row.gross) || 0, employer: Number(row.employer_contributions) || 0, employees: Number(row.employees) || 0 });
      else setFinancialPayrollCost({ gross: 0, employer: 0, employees: 0 });
    } else {
      setFinancialPayrollCost({ gross: 0, employer: 0, employees: 0 });
    }
  };
  useEffect(() => {
    if ((view === "financialReports" || view === "bankReconciliation") && (hasPerm("financialReports") || hasPerm("bankReconciliation"))) loadFinancialData();
    // eslint-disable-next-line
  }, [view, financialDateFrom, financialDateTo, companyId]);

  const financialPnl = useMemo(() => {
    const inRange = (dateStr) => dateStr && dateStr >= financialDateFrom && dateStr <= financialDateTo;
    const revenue = invoices.filter((i) => i.status !== "anulada" && inRange(i.invoice_date)).reduce((sum, i) => sum + Number(i.subtotal || 0), 0);
    const creditNotesTotal = creditNotes.filter((n) => inRange(n.note_date)).reduce((sum, n) => sum + Number(n.subtotal || 0), 0);
    const netRevenue = revenue - creditNotesTotal;
    // Costo de la compra = monto antes de impuestos (service_value). Antes se usaba total - ITBIS,
    // que en compras con retención 254-06 quedaba corto (el total ya viene neto de retenciones).
    const purchasesCost = purchases.filter((p) => inRange(p.purchase_date)).reduce((sum, p) => sum + Number(p.service_value ?? (Number(p.total || 0) - Number(p.itbis_amount || 0)) + Number(p.itbis_retained || 0) + Number(p.isr_retained || 0)), 0);
    // El ITBIS de un gasto con NCF se adelanta en el 606 — no es gasto.
    const otherExpensesCost = otherExpenses.filter((e) => inRange(e.expense_date)).reduce((sum, e) => sum + Number(e.amount || 0) - Number(e.itbis_amount || 0), 0);
    // Diferencia cambiaria de los cobros en US$ del período (+ ganancia / - pérdida)
    const fxDifference = invoicePaymentsAll.reduce((sum, p) => sum + Number(p.fx_difference || 0), 0);
    const cardCommissions = financialCardCommissions;
    // Costo de venta: lo que costó cada producto vendido (guardado en el renglón al facturar).
    const itemType = (pid) => products.find((pr) => pr.id === pid)?.item_type || "producto";
    const costOfSales = financialInvoiceItems.reduce((sum, it) => sum + (it.unit_cost != null && it.product_id && itemType(it.product_id) !== "servicio" ? Number(it.quantity || 0) * Number(it.unit_cost) : 0), 0);
    const linesWithoutCost = financialInvoiceItems.filter((it) => it.product_id && it.unit_cost == null && itemType(it.product_id) !== "servicio").length;
    // Las compras de productos de inventario no son gasto hasta venderse (entran como costo de venta)
    const inventoryPurchases = financialPurchaseItems.reduce((sum, it) => sum + (it.product_id && itemType(it.product_id) !== "servicio" ? Number(it.subtotal || 0) : 0), 0);
    const expensePurchases = Math.max(purchasesCost - inventoryPurchases, 0);
    // Nómina cerrada del período (por fecha de pago): salarios brutos + aportes patronales.
    const payrollCost = financialPayrollCost.gross + financialPayrollCost.employer;
    const netIncome = netRevenue - costOfSales - expensePurchases - otherExpensesCost - cardCommissions - payrollCost + fxDifference;
    return { revenue, creditNotesTotal, netRevenue, purchasesCost, costOfSales, linesWithoutCost, inventoryPurchases, expensePurchases, otherExpensesCost, cardCommissions, payrollCost, fxDifference, netIncome };
  }, [invoices, creditNotes, purchases, otherExpenses, products, invoicePaymentsAll, financialCardCommissions, financialPayrollCost, financialInvoiceItems, financialPurchaseItems, financialDateFrom, financialDateTo]);

  const financialCashFlow = useMemo(() => {
    const cashIn = invoicePaymentsAll.filter((p) => !isRetentionMethod(p.method)).reduce((sum, p) => sum + Number(p.amount || 0) + Number(p.fx_difference || 0), 0);
    const cashOutSuppliers = purchasePaymentsAll.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const inRange = (dateStr) => dateStr && dateStr >= financialDateFrom && dateStr <= financialDateTo;
    const cashOutExpenses = otherExpenses.filter((e) => inRange(e.expense_date)).reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const cashOut = cashOutSuppliers + cashOutExpenses;
    return { cashIn, cashOutSuppliers, cashOutExpenses, cashOut, net: cashIn - cashOut };
  }, [invoicePaymentsAll, purchasePaymentsAll, otherExpenses, financialDateFrom, financialDateTo]);

  const salesReportData = useMemo(() => {
    const inRange = (d) => d && d >= salesReportDateFrom && d <= salesReportDateTo;
    const invoicesInRange = invoices.filter((i) => i.status !== "anulada" && inRange(i.invoice_date));
    const quotesInRange = quotes.filter((q) => inRange(q.quote_date));
    const totalInvoiced = invoicesInRange.reduce((sum, i) => sum + Number(i.total || 0), 0);
    const totalCollected = invoicesInRange.reduce((sum, i) => sum + Number(i.amount_paid || 0) + Number(i.credit_applied || 0), 0);
    const totalPending = totalInvoiced - totalCollected;
    const totalQuoted = quotesInRange.reduce((sum, q) => sum + Number(q.total || 0), 0);
    const quotesDecided = quotesInRange.filter((q) => q.status !== "pendiente");
    const quotesWon = quotesInRange.filter((q) => ["aprobada", "en_orden", "parcial", "convertida"].includes(q.status));
    const conversionRate = quotesDecided.length > 0 ? (quotesWon.length / quotesDecided.length) * 100 : null;
    const quoteStatusCounts = quotesInRange.reduce((acc, q) => { acc[q.status] = (acc[q.status] || 0) + 1; return acc; }, {});

    const byClient = {};
    invoicesInRange.forEach((i) => { byClient[i.client_id] = (byClient[i.client_id] || 0) + Number(i.total || 0); });
    const topClients = Object.entries(byClient)
      .map(([clientId, total]) => ({ clientId, total, name: clients.find((c) => c.id === clientId)?.name || "Cliente eliminado" }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
      const monthKey = d.toISOString().slice(0, 7);
      const label = d.toLocaleDateString("es-DO", { month: "short", year: "2-digit" });
      const total = invoices.filter((inv) => inv.status !== "anulada" && (inv.invoice_date || "").slice(0, 7) === monthKey).reduce((sum, inv) => sum + Number(inv.total || 0), 0);
      months.push({ label, total });
    }
    const maxMonthTotal = Math.max(1, ...months.map((m) => m.total));

    return { totalInvoiced, totalCollected, totalPending, totalQuoted, conversionRate, quotesCount: quotesInRange.length, invoicesCount: invoicesInRange.length, quoteStatusCounts, topClients, months, maxMonthTotal };
  }, [invoices, quotes, clients, salesReportDateFrom, salesReportDateTo]);

  const visibleQuotes = useMemo(() => (vendorBranchIds ? quotes.filter((q) => vendorBranchIds.includes(q.branch_id)) : quotes), [quotes, vendorBranchIds]);
  const visibleInvoices = useMemo(() => (vendorBranchIds ? invoices.filter((inv) => vendorBranchIds.includes(inv.branch_id)) : invoices), [invoices, vendorBranchIds]);
  // Igual que arriba, pero para restringir las opciones del <select> de sucursal en los
  // formularios de cotización/factura: un vendedor solo puede elegir entre sus propias sucursales.
  const vendorScopedBranches = useMemo(() => (vendorBranchIds ? branches.filter((b) => vendorBranchIds.includes(b.id)) : branches), [branches, vendorBranchIds]);

  const todayStr = todayStrRD();
  const dueContracts = useMemo(
    () => recurringContracts.filter((c) => c.is_active && c.next_invoice_date <= todayStr && (!c.end_date || c.end_date >= todayStr))
      .sort((a, b) => (a.next_invoice_date || "").localeCompare(b.next_invoice_date || "")),
    [recurringContracts, todayStr]
  );

  const overdueReceivables = useMemo(() => {
    const pending = visibleInvoices.filter((inv) => inv.status !== "anulada" && (Number(inv.total) - Number(inv.amount_paid || 0) - Number(inv.credit_applied || 0)) > 0.009)
      .map((inv) => ({ ...inv, balance: Number(inv.total) - Number(inv.amount_paid || 0) - Number(inv.credit_applied || 0), days: Math.max(0, Math.floor((Date.now() - new Date(inv.invoice_date).getTime()) / 86400000)) }));
    const overdue = pending.filter((inv) => inv.days > 30);
    return { count: overdue.length, total: overdue.reduce((s, inv) => s + inv.balance, 0) };
  }, [visibleInvoices]);

  const financialMonthlyChart = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
      months.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString("es-DO", { month: "short", year: "2-digit" }) });
    }
    return months.map((m) => {
      const rev = invoices.filter((i) => i.status !== "anulada" && (i.invoice_date || "").slice(0, 7) === m.key).reduce((sum, i) => sum + Number(i.subtotal || 0), 0);
      const exp = purchases.filter((p) => (p.purchase_date || "").slice(0, 7) === m.key).reduce((sum, p) => sum + (Number(p.total || 0) - Number(p.itbis_amount || 0)), 0)
        + otherExpenses.filter((e) => (e.expense_date || "").slice(0, 7) === m.key).reduce((sum, e) => sum + Number(e.amount || 0), 0);
      return { name: m.label, Ingresos: rev, Gastos: exp };
    });
  }, [invoices, purchases, otherExpenses]);

  const myOrderIdsAsSecondary = useMemo(
    () => new Set(orderTechnicians.filter((wt) => wt.technician_id === profile.technician_id).map((wt) => wt.work_order_id)),
    [orderTechnicians, profile.technician_id]
  );
  const visibleOrders = useMemo(
    () => isTecnico ? orders.filter((o) => o.technician_id === profile.technician_id || myOrderIdsAsSecondary.has(o.id)) : orders,
    [orders, isTecnico, profile.technician_id, myOrderIdsAsSecondary]
  );
  const scopedOrders = useMemo(() => visibleOrders.filter((o) => branchFilter === "all" || o.branch_id === branchFilter), [visibleOrders, branchFilter]);

  const visibleIncidents = useMemo(
    () => isTecnico ? incidents.filter((i) => i.technician_id === profile.technician_id) : incidents,
    [incidents, isTecnico, profile.technician_id]
  );
  const incidentsFiltered = useMemo(() => visibleIncidents.filter((i) =>
    (incidentTechnicianFilter === "all" || (incidentTechnicianFilter === "none" ? !i.technician_id : i.technician_id === incidentTechnicianFilter)) &&
    (incidentEquipmentFilter === "all" || i.equipment_id === incidentEquipmentFilter) &&
    (!incidentDateFrom || (i.created_at && i.created_at.slice(0, 10) >= incidentDateFrom)) &&
    (!incidentDateTo || (i.created_at && i.created_at.slice(0, 10) <= incidentDateTo)) &&
    (!incidentCompletedFrom || (i.completed_at && i.completed_at.slice(0, 10) >= incidentCompletedFrom)) &&
    (!incidentCompletedTo || (i.completed_at && i.completed_at.slice(0, 10) <= incidentCompletedTo))
  ), [visibleIncidents, incidentTechnicianFilter, incidentEquipmentFilter, incidentDateFrom, incidentDateTo, incidentCompletedFrom, incidentCompletedTo]);
  // Un técnico solo puede reportar incidentes si su ficha de técnico tiene esa casilla activada;
  // admin/supervisor siguen controlados por el permiso general de la sección.
  const canReportIncident = isTecnico
    ? !!technicians.find((t) => t.id === profile.technician_id)?.can_create_incidents
    : canEdit("incidents");

  const visibleTools = useMemo(
    () => isTecnico ? tools.filter((t) => t.technician_id === profile.technician_id) : tools,
    [tools, isTecnico, profile.technician_id]
  );
  const toolsFiltered = useMemo(() => visibleTools.filter((t) => {
    if (toolStatusFilter !== "all" && t.status !== toolStatusFilter) return false;
    if (toolTechnicianFilter !== "all" && (toolTechnicianFilter === "none" ? t.technician_id : t.technician_id !== toolTechnicianFilter)) return false;
    if (toolSearch.trim()) {
      const q = toolSearch.toLowerCase();
      if (!((t.name || "").toLowerCase().includes(q) || (t.serial_number || "").toLowerCase().includes(q) || (t.category || "").toLowerCase().includes(q))) return false;
    }
    return true;
  }), [visibleTools, toolStatusFilter, toolTechnicianFilter, toolSearch]);

  const projectsFiltered = useMemo(() => projects.filter((p) => {
    if (projectStatusFilter !== "all" && p.status !== projectStatusFilter) return false;
    if (projectSearch.trim()) {
      const q = projectSearch.toLowerCase();
      const clientNameStr = (clients.find((c) => c.id === p.client_id)?.name || "").toLowerCase();
      if (!((p.name || "").toLowerCase().includes(q) || clientNameStr.includes(q))) return false;
    }
    return true;
  }), [projects, projectStatusFilter, projectSearch, clients]);
  const toolGroups = useMemo(() => {
    if (!groupToolsByTechnician) return null;
    const map = new Map();
    technicians.forEach((tech) => map.set(tech.id, { id: tech.id, name: tech.name, tools: [] }));
    map.set("none", { id: "none", name: "Sin asignar", tools: [] });
    toolsFiltered.forEach((t) => {
      const key = t.technician_id && map.has(t.technician_id) ? t.technician_id : "none";
      map.get(key).tools.push(t);
    });
    return Array.from(map.values()).filter((g) => g.tools.length > 0);
  }, [groupToolsByTechnician, toolsFiltered, technicians]);

  // Vista del técnico: sus herramientas agrupadas por "Listado" (kit) al que
  // pertenecen, para que las vea organizadas igual que se las asignaron,
  // en vez de una tabla plana con columnas que no le sirven (sucursal, etc.)
  const technicianToolGroups = useMemo(() => {
    if (!isTecnico) return null;
    const groups = [];
    toolLists.forEach((list) => {
      const mine = toolsFiltered.filter((t) => (list.tool_ids || []).includes(t.id));
      if (mine.length > 0) groups.push({ id: list.id, name: list.name, tools: mine });
    });
    const idsInAnyList = new Set(toolLists.flatMap((l) => l.tool_ids || []));
    const loose = toolsFiltered.filter((t) => !idsInAnyList.has(t.id));
    if (loose.length > 0) groups.push({ id: "sueltas", name: "Otras herramientas asignadas", tools: loose });
    return groups;
  }, [isTecnico, toolsFiltered, toolLists]);

  const equipmentTypes = useMemo(() => Array.from(new Set(equipment.map((e) => e.type).filter(Boolean))).sort(), [equipment]);
  const equipmentFiltered = useMemo(() => equipment.filter((e) => {
    if (branchFilter !== "all" && e.branch_id !== branchFilter) return false;
    if (equipmentTechFilter === "none" && e.default_technician_id) return false;
    if (equipmentTechFilter !== "all" && equipmentTechFilter !== "none" && e.default_technician_id !== equipmentTechFilter) return false;
    if (equipmentTypeFilter !== "all" && e.type !== equipmentTypeFilter) return false;
    if (equipmentStatusFilter === "fuera_servicio" && e.operational_status !== "fuera_servicio") return false;
    if (equipmentStatusFilter === "operativo" && e.operational_status === "fuera_servicio") return false;
    if (equipmentSearch) {
      const q = equipmentSearch.toLowerCase();
      if (![e.name, e.brand, e.model, e.serial_number].some((v) => (v || "").toLowerCase().includes(q))) return false;
    }
    return true;
  }), [equipment, branchFilter, equipmentTechFilter, equipmentTypeFilter, equipmentStatusFilter, equipmentSearch]);

  const orderMatchesAgendaTech = (o, techId) => {
    if (techId === "all") return true;
    if (o.technician_id === techId) return true;
    return orderTechnicians.some((wt) => wt.work_order_id === o.id && wt.technician_id === techId);
  };
  const ordersByDate = useMemo(() => {
    const map = {};
    scopedOrders.forEach((o) => {
      if (!o.scheduled) return;
      if (!orderMatchesAgendaTech(o, agendaTechFilter)) return;
      if (!map[o.scheduled]) map[o.scheduled] = [];
      map[o.scheduled].push(o);
    });
    return map;
  }, [scopedOrders, agendaTechFilter, orderTechnicians]);

  const overdueOrders = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return visibleOrders.filter((o) => o.status !== "completada" && o.scheduled && new Date(o.scheduled + "T00:00:00") < today);
  }, [visibleOrders]);

  const pastDeadlineOrders = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return visibleOrders.filter((o) => o.status !== "completada" && o.deadline && new Date(o.deadline + "T00:00:00") < today);
  }, [visibleOrders]);

  const orderDayColor = (o) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const sched = new Date(o.scheduled + "T00:00:00");
    if (o.status === "completada") return C.green;
    if (sched < today) return C.red;
    if (sched.getTime() === today.getTime()) return C.amber;
    return C.blue;
  };
  const filteredOrders = useMemo(() => scopedOrders.filter((o) => {
    // Un técnico ya no ve sus propias órdenes completadas en el listado por defecto
    // (para no sobrecargar su sensación de carga de trabajo pendiente); puede seguir
    // revisándolas a propósito eligiendo "Completada" en el filtro de estado.
    if (isTecnico && statusFilter === "all" && o.status === "completada") return false;
    if (typeFilter !== "all" && o.type !== typeFilter) return false;
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (technicianFilter !== "all" && o.technician_id !== technicianFilter) return false;
    if (orderEquipmentFilter !== "all" && o.equipment_id !== orderEquipmentFilter) return false;
    if (orderDateFrom && (!o.scheduled || o.scheduled < orderDateFrom)) return false;
    if (orderDateTo && (!o.scheduled || o.scheduled > orderDateTo)) return false;
    if (search && !o.title.toLowerCase().includes(search.toLowerCase()) && !(o.code || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [scopedOrders, typeFilter, statusFilter, technicianFilter, orderEquipmentFilter, orderDateFrom, orderDateTo, search]);

  const kpi = useMemo(() => {
    const pend = scopedOrders.filter((o) => o.status === "pendiente").length;
    const prog = scopedOrders.filter((o) => o.status === "en_progreso").length;
    const done = scopedOrders.filter((o) => o.status === "completada").length;
    const prev = scopedOrders.filter((o) => o.type === "preventivo" && o.status !== "completada").length;
    return { pend, prog, done, prev, total: scopedOrders.length };
  }, [scopedOrders]);

  const chartData = useMemo(() => Object.entries(TYPE_CFG).map(([key, cfg]) => ({
    name: cfg.label, value: scopedOrders.filter((o) => o.type === key).length, color: cfg.color,
  })), [scopedOrders]);

  const branchName = (id) => branches.find((b) => b.id === id)?.name || "—";
  const techName = (id) => technicians.find((t) => t.id === id)?.name || "Sin asignar";
  const equipName = (id) => equipment.find((e) => e.id === id)?.name || "—";
  const equipType = (id) => equipment.find((e) => e.id === id)?.type || "";
  const locationName = (id) => locations.find((l) => l.id === id)?.name || null;
  const closeQrEquipment = () => {
    setQrEquipmentId(null);
    const url = new URL(window.location.href);
    if (url.searchParams.has("eq")) { url.searchParams.delete("eq"); window.history.replaceState(window.history.state, "", url); }
  };
  const handleQrScan = async (text) => {
    setShowQrScanner(false);
    const { equipmentIdFromScan } = await import("./modulos/equipos-qr.jsx");
    const id = equipmentIdFromScan(text);
    if (!id) { setErrorMsg("Ese código QR no es de un equipo de MantenPro."); return; }
    setQrEquipmentId(id);
  };

  // Los informes técnicos respetan el filtro de sucursal de arriba (branchFilter) y el rango
  // de fechas propio de esta pantalla (techReportDateFrom/To), en vez de usar siempre todo el
  // histórico sin importar qué sucursal esté seleccionada.
  const reportsOrders = useMemo(() => orders.filter((o) =>
    (branchFilter === "all" || o.branch_id === branchFilter) &&
    (!techReportDateFrom || (o.scheduled && o.scheduled >= techReportDateFrom)) &&
    (!techReportDateTo || (o.scheduled && o.scheduled <= techReportDateTo))
  ), [orders, branchFilter, techReportDateFrom, techReportDateTo]);
  const reportsIncidents = useMemo(() => incidents.filter((i) =>
    (branchFilter === "all" || i.branch_id === branchFilter) &&
    (!techReportDateFrom || (i.created_at && i.created_at.slice(0, 10) >= techReportDateFrom)) &&
    (!techReportDateTo || (i.created_at && i.created_at.slice(0, 10) <= techReportDateTo))
  ), [incidents, branchFilter, techReportDateFrom, techReportDateTo]);
  const reportsEquipment = useMemo(() => equipment.filter((eq) => branchFilter === "all" || eq.branch_id === branchFilter), [equipment, branchFilter]);

  // Costo de mano de obra de una orden: técnico principal (labor_hours × labor_rate_used) +
  // técnicos adicionales (horas por técnico × tarifa por hora de cada uno). No incluye materiales
  // porque el Almacén no guarda un costo unitario.
  const orderLaborCost = (o) => {
    const primary = (Number(o.labor_hours) || 0) * (Number(o.labor_rate_used) || 0);
    const extra = orderTechnicians.filter((wt) => wt.work_order_id === o.id).reduce((sum, wt) => {
      const rate = technicians.find((t) => t.id === wt.technician_id)?.hourly_rate;
      return sum + (Number(wt.hours) || 0) * (Number(rate) || 0);
    }, 0);
    return primary + extra;
  };

  const techStats = useMemo(() => technicians.map((t) => {
    const own = reportsOrders.filter((o) => o.technician_id === t.id || orderTechnicians.some((wt) => wt.work_order_id === o.id && wt.technician_id === t.id));
    const ownIncidents = reportsIncidents.filter((i) => i.technician_id === t.id);
    return {
      ...t,
      total: own.length,
      active: own.filter((o) => o.status !== "completada").length,
      completed: own.filter((o) => o.status === "completada").length,
      preventivo: own.filter((o) => o.type === "preventivo").length,
      correctivo: own.filter((o) => o.type === "correctivo").length,
      predictivo: own.filter((o) => o.type === "predictivo").length,
      incidentesTotal: ownIncidents.length,
      incidentesAbiertos: ownIncidents.filter((i) => i.status === "abierto" || i.status === "en_revision").length,
      incidentesCompletados: ownIncidents.filter((i) => i.status === "resuelto").length,
      reopened: own.filter((o) => (o.reopened_count || 0) > 0).length,
      laborCost: own.reduce((sum, o) => sum + (o.technician_id === t.id ? (Number(o.labor_hours) || 0) * (Number(o.labor_rate_used) || 0) : 0) + (Number(orderTechnicians.find((wt) => wt.work_order_id === o.id && wt.technician_id === t.id)?.hours) || 0) * (Number(t.hourly_rate) || 0), 0),
    };
  }), [technicians, reportsOrders, reportsIncidents, orderTechnicians]);

  const equipStats = useMemo(() => reportsEquipment.map((eq) => {
    const own = reportsOrders.filter((o) => o.equipment_id === eq.id);
    const ownIncidents = reportsIncidents.filter((i) => i.equipment_id === eq.id);
    return {
      ...eq,
      total: own.length,
      correctivo: own.filter((o) => o.type === "correctivo").length,
      open: own.filter((o) => o.status !== "completada").length,
      incidentesTotal: ownIncidents.length,
      incidentesAbiertos: ownIncidents.filter((i) => i.status === "abierto" || i.status === "en_revision").length,
      laborCost: own.reduce((sum, o) => sum + orderLaborCost(o), 0),
    };
  }), [reportsEquipment, reportsOrders, reportsIncidents, orderTechnicians, technicians]);

  // % cumplimiento del preventivo: de las órdenes preventivas programadas en el rango de fechas
  // filtrado, cuántas ya se completaron.
  const preventiveCompliance = useMemo(() => {
    const prev = reportsOrders.filter((o) => o.type === "preventivo");
    const done = prev.filter((o) => o.status === "completada");
    return { total: prev.length, done: done.length, pct: prev.length > 0 ? (done.length / prev.length) * 100 : null };
  }, [reportsOrders]);

  // Tiempo promedio de reparación: horas entre que se creó y se completó, solo órdenes correctivas
  // ya cerradas (requiere completed_at, ver SQL).
  const avgRepairTime = useMemo(() => {
    const durations = reportsOrders
      .filter((o) => o.type === "correctivo" && o.status === "completada" && o.completed_at && o.created_at)
      .map((o) => (new Date(o.completed_at).getTime() - new Date(o.created_at).getTime()) / (1000 * 60 * 60));
    const avg = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
    return { n: durations.length, avgHours: avg, label: avg === null ? "—" : avg < 48 ? `${avg.toFixed(1)} h` : `${(avg / 24).toFixed(1)} días` };
  }, [reportsOrders]);

  // MTBF (tiempo medio entre fallas): por cada equipo con 2 o más órdenes correctivas en el
  // rango filtrado, se mide el intervalo entre fallas consecutivas (por fecha de creación de
  // la orden) y se promedian esos intervalos. El MTBF general que se muestra es el promedio de
  // esos promedios entre los equipos que ya tienen suficiente historial — un equipo con solo
  // 1 correctiva (o ninguna) todavía no aporta, porque no hay ningún intervalo que medir.
  const mtbf = useMemo(() => {
    const byEquip = new Map();
    reportsOrders
      .filter((o) => o.type === "correctivo" && o.equipment_id && o.created_at)
      .forEach((o) => {
        if (!byEquip.has(o.equipment_id)) byEquip.set(o.equipment_id, []);
        byEquip.get(o.equipment_id).push(o.created_at);
      });
    const equipAverages = [];
    byEquip.forEach((dates) => {
      if (dates.length < 2) return;
      const sorted = [...dates].sort();
      const gaps = [];
      for (let i = 1; i < sorted.length; i++) {
        gaps.push((new Date(sorted[i]).getTime() - new Date(sorted[i - 1]).getTime()) / (1000 * 60 * 60));
      }
      equipAverages.push(gaps.reduce((a, b) => a + b, 0) / gaps.length);
    });
    const avg = equipAverages.length > 0 ? equipAverages.reduce((a, b) => a + b, 0) / equipAverages.length : null;
    return {
      nEquip: equipAverages.length,
      avgHours: avg,
      label: avg === null ? "—" : avg < 48 ? `${avg.toFixed(1)} h` : `${(avg / 24).toFixed(1)} días`,
    };
  }, [reportsOrders]);

  // Cumplimiento de fecha límite: de las órdenes con deadline ya cerradas, cuántas se
  // cerraron el mismo día del deadline o antes (a diferencia de "cumplimiento del
  // preventivo", que solo mira si se completó, sin importar si fue a tiempo).
  const deadlineCompliance = useMemo(() => {
    const withDeadline = reportsOrders.filter((o) => o.status === "completada" && o.deadline && o.completed_at);
    const onTime = withDeadline.filter((o) => o.completed_at.slice(0, 10) <= o.deadline);
    return { total: withDeadline.length, onTime: onTime.length, pct: withDeadline.length > 0 ? (onTime.length / withDeadline.length) * 100 : null };
  }, [reportsOrders]);

  // Órdenes vencidas: activas ahora mismo (no cerradas) cuya fecha límite ya pasó. No se
  // filtra por el rango de fechas del reporte (es un indicador del momento actual), solo
  // por sucursal.
  const overdueOpenOrders = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return orders
      .filter((o) => (branchFilter === "all" || o.branch_id === branchFilter) && o.status !== "completada" && o.deadline && o.deadline < today)
      .map((o) => ({ ...o, daysOverdue: Math.round((new Date(today) - new Date(o.deadline)) / 86400000) }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue);
  }, [orders, branchFilter]);

  // Tasa de reapertura: de las órdenes que en algún momento se completaron (lo están
  // ahora, o reopened_count dice que lo estuvieron antes de reabrirse), cuántas se
  // reabrieron al menos una vez. Mide calidad del trabajo, no solo velocidad.
  const reopenStats = useMemo(() => {
    const everCompleted = reportsOrders.filter((o) => o.status === "completada" || (o.reopened_count || 0) > 0);
    const reopened = reportsOrders.filter((o) => (o.reopened_count || 0) > 0);
    return { everCompleted: everCompleted.length, reopened: reopened.length, pct: everCompleted.length > 0 ? (reopened.length / everCompleted.length) * 100 : null };
  }, [reportsOrders]);

  // Cumplimiento de checklist al cierre: de las órdenes cerradas en el rango filtrado,
  // separa dos cosas distintas. (1) "Uso": cuántas se cerraron habiendo cargado algún
  // checklist — cargarlo es opcional, así que una orden puede cerrarse sin ninguno.
  // (2) "Completado": de las que sí tenían checklist, cuántas quedaron con el 100% de
  // los puntos respondidos. En teoría (2) siempre debería dar 100%, porque el botón de
  // cerrar ya exige el checklist completo si hay uno cargado (ver closeRequirements en
  // OrderDetailModal) — pero esa regla es solo del lado del cliente, así que este
  // número también sirve para detectar órdenes viejas (de antes de esa regla) o
  // cerradas por otra vía que quedaron con el checklist a medias.
  const checklistCompliance = useMemo(() => {
    const closed = reportsOrders.filter((o) => o.status === "completada");
    const withChecklist = closed.filter((o) => (orderChecklistSummary.get(o.id)?.total || 0) > 0);
    const complete = withChecklist.filter((o) => {
      const s = orderChecklistSummary.get(o.id);
      return s.total > 0 && s.answered === s.total;
    });
    return {
      closedTotal: closed.length,
      withChecklist: withChecklist.length,
      usagePct: closed.length > 0 ? (withChecklist.length / closed.length) * 100 : null,
      complete: complete.length,
      completePct: withChecklist.length > 0 ? (complete.length / withChecklist.length) * 100 : null,
    };
  }, [reportsOrders, orderChecklistSummary]);

  const techChartData = useMemo(() => techStats.map((t) => ({ name: t.name.split(" ")[0], Preventivo: t.preventivo, Correctivo: t.correctivo, Predictivo: t.predictivo })), [techStats]);
  const equipChartData = useMemo(
    () => [...equipStats].sort((a, b) => b.correctivo - a.correctivo).slice(0, 8).map((eq) => ({ name: eq.name, Correctivos: eq.correctivo })),
    [equipStats]
  );
  const incidentEquipChartData = useMemo(
    () => [...equipStats].sort((a, b) => b.incidentesTotal - a.incidentesTotal).slice(0, 8).filter((eq) => eq.incidentesTotal > 0).map((eq) => ({ name: eq.name, Incidentes: eq.incidentesTotal })),
    [equipStats]
  );

  const incidentSlaStats = useMemo(() => {
    const hoursBetween = (a, b) => (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60);
    const byPriority = {};
    Object.keys(PRIORITY_CFG).forEach((k) => { byPriority[k] = { responseHours: [], resolutionHours: [] }; });
    reportsIncidents.forEach((i) => {
      const bucket = byPriority[i.priority] || (byPriority[i.priority] = { responseHours: [], resolutionHours: [] });
      if (i.attended_at && i.created_at) bucket.responseHours.push(hoursBetween(i.created_at, i.attended_at));
      if (i.completed_at && i.created_at) bucket.resolutionHours.push(hoursBetween(i.created_at, i.completed_at));
    });
    const avg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const fmtHours = (h) => h === null ? "—" : h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} días`;
    return Object.entries(byPriority).map(([key, v]) => ({
      key,
      label: PRIORITY_CFG[key]?.label || key,
      color: PRIORITY_CFG[key]?.color || C.muted,
      avgResponseHours: avg(v.responseHours),
      avgResolutionHours: avg(v.resolutionHours),
      responseLabel: fmtHours(avg(v.responseHours)),
      resolutionLabel: fmtHours(avg(v.resolutionHours)),
      nResponse: v.responseHours.length,
      nResolution: v.resolutionHours.length,
    }));
  }, [reportsIncidents]);

  const isDueByUsage = (item) => item.usage_unit && item.usage_interval && item.current_usage != null &&
    (Number(item.current_usage) - Number(item.usage_last_maintenance || 0)) >= Number(item.usage_interval);
  const isDueByDate = (item) => item.maintenance_frequency_days && item.next_maintenance_date && item.next_maintenance_date <= todayStr;

  // Un equipo "fuera de servicio" no debe entrar al plan de mantenimiento preventivo — no tiene
  // sentido generarle una orden (ni despachar un técnico) a algo que ya se sabe que no funciona.
  const dueEquipment = useMemo(
    () => equipment.filter((e) => e.operational_status !== "fuera_servicio" && (isDueByDate(e) || isDueByUsage(e)))
      .sort((a, b) => (a.next_maintenance_date || "").localeCompare(b.next_maintenance_date || "")),
    [equipment, todayStr]
  );
  const dueClientAssets = useMemo(
    () => clientAssets.filter((a) => isDueByDate(a) || isDueByUsage(a))
      .sort((a, b) => (a.next_maintenance_date || "").localeCompare(b.next_maintenance_date || "")),
    [clientAssets, todayStr]
  );
  const upcomingEquipment = useMemo(() => {
    const in7Str = addDaysToDateStr(todayStr, 7);
    return equipment.filter((e) => e.operational_status !== "fuera_servicio" && !isDueByDate(e) && !isDueByUsage(e) && e.maintenance_frequency_days && e.next_maintenance_date && e.next_maintenance_date > todayStr && e.next_maintenance_date <= in7Str);
  }, [equipment, todayStr]);
  const upcomingClientAssets = useMemo(() => {
    const in7Str = addDaysToDateStr(todayStr, 7);
    return clientAssets.filter((a) => !isDueByDate(a) && !isDueByUsage(a) && a.maintenance_frequency_days && a.next_maintenance_date && a.next_maintenance_date > todayStr && a.next_maintenance_date <= in7Str);
  }, [clientAssets, todayStr]);
  const lowStockMaterials = useMemo(
    () => materials.filter((m) => m.min_quantity != null && Number(m.quantity || 0) <= Number(m.min_quantity)),
    [materials]
  );

  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clients;
    const q = clientSearch.toLowerCase();
    return clients.filter((c) => [c.name, c.rnc_cedula, c.phone, c.email, c.address].some((v) => (v || "").toLowerCase().includes(q)));
  }, [clients, clientSearch]);

  const filteredSuppliers = useMemo(() => {
    if (!supplierSearch.trim()) return suppliers;
    const q = supplierSearch.toLowerCase();
    return suppliers.filter((s) => [s.name, s.rnc, s.phone, s.email].some((v) => (v || "").toLowerCase().includes(q)));
  }, [suppliers, supplierSearch]);

  const isServicesView = view === "services";
  const productCategories = useMemo(() => [...new Set(products.filter((p) => (p.item_type || "producto") === (isServicesView ? "servicio" : "producto")).map((p) => p.category).filter(Boolean))].sort(), [products, isServicesView]);
  const filteredProducts = useMemo(() => products.filter((p) => {
    if ((p.item_type || "producto") !== (isServicesView ? "servicio" : "producto")) return false;
    if (productCategoryFilter !== "all" && (p.category || "") !== productCategoryFilter) return false;
    if (productBranchFilter === "none" && p.branch_id) return false;
    if (productBranchFilter !== "all" && productBranchFilter !== "none" && p.branch_id !== productBranchFilter) return false;
    if (productSearch && !p.name.toLowerCase().includes(productSearch.toLowerCase()) && !(p.sku || "").toLowerCase().includes(productSearch.toLowerCase())) return false;
    return true;
  }), [products, productCategoryFilter, productBranchFilter, productSearch, isServicesView]);

  const filteredPurchases = useMemo(() => purchases.filter((pu) => {
    const supplierName = suppliers.find((s) => s.id === pu.supplier_id)?.name || "";
    if (purchaseSupplierFilter !== "all" && pu.supplier_id !== purchaseSupplierFilter) return false;
    if (purchaseSearch && !supplierName.toLowerCase().includes(purchaseSearch.toLowerCase()) && !(pu.invoice_number || "").toLowerCase().includes(purchaseSearch.toLowerCase())) return false;
    return true;
  }), [purchases, suppliers, purchaseSupplierFilter, purchaseSearch]);

  const filteredQuotes = useMemo(() => visibleQuotes.filter((q) => {
    const clientNameStr = clients.find((c) => c.id === q.client_id)?.name || "";
    if (quoteStatusFilter !== "all" && q.status !== quoteStatusFilter) return false;
    if (quoteSearch && !clientNameStr.toLowerCase().includes(quoteSearch.toLowerCase()) && !(q.quote_number || "").toLowerCase().includes(quoteSearch.toLowerCase())) return false;
    return true;
  }), [visibleQuotes, clients, quoteStatusFilter, quoteSearch]);

  const filteredInvoices = useMemo(() => visibleInvoices.filter((inv) => {
    const clientNameStr = clients.find((c) => c.id === inv.client_id)?.name || "";
    if (invoiceStatusFilter !== "all" && inv.status !== invoiceStatusFilter) return false;
    if (invoicePaymentFilter !== "all" && (inv.payment_status || "pendiente") !== invoicePaymentFilter) return false;
    if (invoiceSearch && !clientNameStr.toLowerCase().includes(invoiceSearch.toLowerCase()) && !(inv.ncf || "").toLowerCase().includes(invoiceSearch.toLowerCase()) && !(inv.invoice_number || "").toLowerCase().includes(invoiceSearch.toLowerCase())) return false;
    return true;
  }), [visibleInvoices, clients, invoiceStatusFilter, invoicePaymentFilter, invoiceSearch]);

  const activeWarrantyAssets = useMemo(() => {
    const today = new Date();
    return clientAssets
      .map((a) => {
        const end = addMonths(a.install_date, a.warranty_months);
        return { ...a, warrantyEnd: end, daysLeft: daysBetween(end, today) };
      })
      .filter((a) => a.daysLeft >= 0)
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [clientAssets]);

  // ---- Órdenes ----
  // Solo agrega/quita los técnicos que cambiaron — no borra y vuelve a insertar todos, porque eso
  // perdería las horas ya registradas (columna "hours") de los técnicos que se mantienen.
  const syncOrderTechnicians = async (workOrderId, techIds) => {
    const current = orderTechnicians.filter((wt) => wt.work_order_id === workOrderId);
    const currentIds = current.map((wt) => wt.technician_id);
    const wanted = techIds || [];
    const toRemove = current.filter((wt) => !wanted.includes(wt.technician_id));
    const toAdd = wanted.filter((id) => !currentIds.includes(id));
    if (toRemove.length > 0) {
      await supabase.from("work_order_technicians").delete().in("id", toRemove.map((wt) => wt.id));
      const removeIds = new Set(toRemove.map((wt) => wt.id));
      setOrderTechnicians((prev) => prev.filter((wt) => !removeIds.has(wt.id)));
    }
    if (toAdd.length > 0) {
      const rows = toAdd.map((technician_id) => ({ company_id: companyId, work_order_id: workOrderId, technician_id }));
      const { data, error } = await supabase.from("work_order_technicians").insert(rows).select();
      if (!error && data) setOrderTechnicians((prev) => [...prev, ...data]);
    }
  };

  const updateOrderTechnicianHours = async (row, hours) => {
    const value = hours === "" || hours == null ? null : Number(hours);
    const { data, error } = await supabase.from("work_order_technicians").update({ hours: value }).eq("id", row.id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setOrderTechnicians((prev) => prev.map((wt) => (wt.id === data.id ? data : wt)));
  };

  // El código OT-000N ya no se calcula como "cantidad de órdenes + 1" (eso se duplica si se borra
  // una orden o si dos personas crean una orden al mismo tiempo). En vez de eso se parte del número
  // más alto ya usado y, si el insert choca con un código que ya existe (código repetido, error
  // 23505 de Postgres — requiere el índice único que se agrega por SQL), se prueba con el siguiente.
  const maxOrderCodeNum = () => orders.reduce((max, o) => {
    const m = /^OT-(\d+)$/.exec(o.code || "");
    return m ? Math.max(max, parseInt(m[1], 10)) : max;
  }, 0);
  const insertOrderWithCode = async (payloadWithoutCode, startAfter) => {
    let n = startAfter ?? maxOrderCodeNum();
    for (let attempt = 0; attempt < 5; attempt++) {
      n += 1;
      const code = `OT-${String(n).padStart(4, "0")}`;
      const { data, error } = await supabase.from("work_orders").insert({ ...payloadWithoutCode, code, company_id: companyId }).select().single();
      if (!error) return { data, code, n };
      if (error.code !== "23505") return { error };
    }
    return { error: { message: "No se pudo generar un código único para la orden. Intenta de nuevo." } };
  };

  const createOrder = async (payload, files, extraTechIds, linkedIncidentId, linkedSalesOrderId) => {
    setSaving(true);
    const { data, error } = await insertOrderWithCode({ ...payload, status: "pendiente" });
    if (error) { setSaving(false); setErrorMsg(error.message); return; }
    setOrders((prev) => [data, ...prev]);
    setShowOrderForm(false);
    setOrderFromIncident(null);
    setOrderFromSalesOrder(null);
    setOrderPrefill(null);
    if (extraTechIds && extraTechIds.length > 0) await syncOrderTechnicians(data.id, extraTechIds);
    await notifyManyTechnicians([data.technician_id, ...(extraTechIds || [])], {
      title: `Nueva orden asignada: ${data.code}`,
      body: data.title,
      link_view: "orders",
      category: "order_assigned",
    });
    if (linkedIncidentId) {
      await supabase.from("incidents").update({ work_order_id: data.id, status: "convertido" }).eq("id", linkedIncidentId);
      setIncidents((prev) => prev.map((i) => (i.id === linkedIncidentId ? { ...i, work_order_id: data.id, status: "convertido" } : i)));
    }
    if (linkedSalesOrderId) {
      await supabase.from("sales_orders").update({ work_order_id: data.id }).eq("id", linkedSalesOrderId);
      setSalesOrders((prev) => prev.map((o) => (o.id === linkedSalesOrderId ? { ...o, work_order_id: data.id } : o)));
    }
    if (files && files.length > 0) {
      for (const file of files) {
        const upFile = await compressImage(file);
        const ext = upFile.name.split(".").pop();
        const path = `support/${companyId}/${data.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const { error: upError } = await supabase.storage.from("evidence").upload(path, upFile);
        if (upError) { setErrorMsg(`No se pudo subir ${file.name}: ${upError.message}`); continue; }
        const { data: signed, error: signError } = await supabase.storage.from("evidence").createSignedUrl(path, 604800);
        if (signError) { setErrorMsg(`Se subió ${file.name} pero no se pudo generar el enlace: ${signError.message}`); continue; }
        const { error: attError } = await supabase.from("work_order_attachments").insert({ work_order_id: data.id, file_url: signed.signedUrl, file_path: path, file_name: upFile.name });
        if (attError) setErrorMsg(`Se subió ${file.name} pero no se pudo vincular a la orden: ${attError.message}`);
        else setOrderAttachmentIds((prev) => new Set(prev).add(data.id));
      }
    }
    setSaving(false);
  };

  const createBulkOrders = async (rows) => {
    setSaving(true);
    let nextAfter = maxOrderCodeNum();
    const inserted = [];
    for (const row of rows) {
      const { data, error, n } = await insertOrderWithCode({
        branch_id: row.branch_id, equipment_id: row.equipment_id || null,
        technician_id: row.technician_id || null, type: row.type, priority: row.priority,
        title: row.title, scheduled: row.scheduled, status: "pendiente",
      }, nextAfter);
      if (error) { setErrorMsg(`No se pudo crear la orden "${row.title}": ${error.message}`); continue; }
      nextAfter = n;
      inserted.push(data);
    }
    setOrders((prev) => [...inserted, ...prev]);
    const byTechnician = {};
    for (const o of inserted) { if (o.technician_id) (byTechnician[o.technician_id] ||= []).push(o); }
    for (const [techId, techOrders] of Object.entries(byTechnician)) {
      await notifyManyTechnicians([techId], {
        title: techOrders.length === 1 ? `Nueva orden asignada: ${techOrders[0].code}` : `${techOrders.length} nuevas órdenes asignadas`,
        body: techOrders.map((o) => o.title).join(" · "),
        link_view: "orders",
        category: "order_assigned",
      });
    }
    setSaving(false);
    setShowBulkOrders(false);
  };

  const openEditOrder = async (order) => {
    const { data, error } = await supabase.from("work_order_attachments").select("*").eq("work_order_id", order.id).order("uploaded_at");
    if (error) { setErrorMsg(error.message); return; }
    setEditingOrderAttachments(data || []);
    setEditingOrder(order);
  };

  const deleteOrderAttachment = async (attachment) => {
    if (!window.confirm(`¿Quitar "${attachment.file_name || "este archivo"}" de la orden?`)) return;
    const { data, error } = await supabase.from("work_order_attachments").delete().eq("id", attachment.id).select();
    if (error) { setErrorMsg(error.message); return; }
    if (!data || data.length === 0) {
      setErrorMsg("No se pudo quitar el archivo: la base de datos no eliminó ningún registro (probablemente falta un permiso DELETE en work_order_attachments).");
      return;
    }
    setEditingOrderAttachments((prev) => {
      const next = prev.filter((a) => a.id !== attachment.id);
      if (next.length === 0) {
        setOrderAttachmentIds((ids) => { const s = new Set(ids); s.delete(attachment.work_order_id); return s; });
      }
      return next;
    });
  };

  const updateOrder = async (payload, files, extraTechIds) => {
    setSaving(true);
    const previousTechnicianId = editingOrder.technician_id;
    const { data, error } = await supabase.from("work_orders").update(payload).eq("id", editingOrder.id).select().single();
    if (error) { setSaving(false); setErrorMsg(error.message); return; }
    setOrders((prev) => prev.map((o) => (o.id === data.id ? data : o)));
    await syncOrderTechnicians(editingOrder.id, extraTechIds || []);
    if (data.technician_id && data.technician_id !== previousTechnicianId) {
      await notifyManyTechnicians([data.technician_id], {
        title: `Te asignaron la orden ${data.code}`,
        body: data.title,
        link_view: "orders",
        category: "order_assigned",
      });
    }
    if (files && files.length > 0) {
      for (const file of files) {
        const upFile = await compressImage(file);
        const ext = upFile.name.split(".").pop();
        const path = `support/${companyId}/${data.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const { error: upError } = await supabase.storage.from("evidence").upload(path, upFile);
        if (upError) { setErrorMsg(`No se pudo subir ${file.name}: ${upError.message}`); continue; }
        const { data: signed, error: signError } = await supabase.storage.from("evidence").createSignedUrl(path, 604800);
        if (signError) { setErrorMsg(`Se subió ${file.name} pero no se pudo generar el enlace: ${signError.message}`); continue; }
        const { data: attRow, error: attError } = await supabase.from("work_order_attachments").insert({ work_order_id: data.id, file_url: signed.signedUrl, file_path: path, file_name: upFile.name }).select().single();
        if (attError) { setErrorMsg(`Se subió ${file.name} pero no se pudo vincular a la orden: ${attError.message}`); continue; }
        setOrderAttachmentIds((prev) => new Set(prev).add(data.id));
        setEditingOrderAttachments((prev) => [...prev, attRow]);
      }
    }
    setSaving(false);
    setEditingOrder(null);
    setEditingOrderAttachments([]);
  };

  // Solo alterna pendiente <-> en_progreso. Pasar a "completada" exige checklist, nota y firma,
  // así que eso se hace desde el detalle de la orden (botón "Cerrar orden"), no con este atajo.
  // Reabrir una orden completada también es una acción deliberada aparte (botón "Reabrir orden").
  // Reemplaza al viejo cycleStatus (que solo alternaba pendiente↔en_progreso con un
  // botón de "avanzar"): ahora la tarjeta de la orden muestra los estados como una
  // barra de botones (estilo Odoo) y este helper deja saltar directo a cualquiera de
  // los dos estados que no requieren nota de cierre. "Completada" sigue sin poder
  // asignarse aquí — eso abre el detalle de la orden (openOrderDetail), porque cerrar
  // una orden pide notas/foto y dispara la lógica de completed_at/reopened_count.
  const setOrderStatus = async (order, nextStatus) => {
    if (order.status === nextStatus || order.status === "completada") return;
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: nextStatus } : o)));
    const { error } = await supabase.from("work_orders").update({ status: nextStatus }).eq("id", order.id);
    if (error) setErrorMsg(error.message);
  };

  const deleteOrder = async (orderId) => {
    if (!window.confirm("¿Eliminar esta orden de trabajo?")) return;
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
    const { error } = await supabase.from("work_orders").delete().eq("id", orderId);
    if (error) setErrorMsg(error.message);
  };

  // El bucket "evidence" es privado (ver rls-storage-evidence.sql): las URLs guardadas
  // en la base de datos son enlaces firmados con vencimiento, no URLs públicas fijas.
  // Esta función regenera un enlace fresco a partir de la ruta guardada (file_path /
  // photo_path / client_signature_path) cada vez que se abre el detalle de una orden,
  // para que fotos y firmas de órdenes viejas no se vean rotas por un enlace vencido.
  const refreshSignedUrls = async (rows, pathField, urlField) => {
    const paths = (rows || []).map((r) => r[pathField]).filter(Boolean);
    if (paths.length === 0) return rows || [];
    const { data: signedList } = await supabase.storage.from("evidence").createSignedUrls(paths, 604800);
    const urlByPath = Object.fromEntries((signedList || []).filter((s) => !s.error && s.signedUrl).map((s) => [s.path, s.signedUrl]));
    return rows.map((r) => (r[pathField] && urlByPath[r[pathField]] ? { ...r, [urlField]: urlByPath[r[pathField]] } : r));
  };

  const openOrderDetail = async (order) => {
    const { data: attachments } = await supabase.from("work_order_attachments").select("*").eq("work_order_id", order.id).order("uploaded_at");
    const { data: checklist } = await supabase.from("work_order_checklist_items").select("*").eq("work_order_id", order.id).order("position");
    const refreshedAttachments = await refreshSignedUrls(attachments || [], "file_path", "file_url");
    const [refreshedOrder] = await refreshSignedUrls([order], "photo_path", "photo_url").then((rows) => refreshSignedUrls(rows, "client_signature_path", "client_signature_url"));
    setDetailOrderAttachments(refreshedAttachments);
    setDetailOrderChecklist(checklist || []);
    setDetailOrder(refreshedOrder || order);
  };

  // Fotos "antes"/"después" del detalle de la orden (columna stage en work_order_attachments,
  // ver SQL). Se pueden subir varias por lado, a diferencia de la vieja foto única de cierre.
  const addOrderPhoto = async (order, file, stage) => {
    const upFile = await compressImage(file);
    const ext = upFile.name.split(".").pop();
    const path = `evidence-multi/${companyId}/${order.id}-${stage}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const { error: upError } = await supabase.storage.from("evidence").upload(path, upFile);
    if (upError) { setErrorMsg(`No se pudo subir la foto: ${upError.message}`); return; }
    const { data: signed, error: signError } = await supabase.storage.from("evidence").createSignedUrl(path, 604800);
    if (signError) { setErrorMsg(`Se subió la foto pero no se pudo generar el enlace: ${signError.message}`); return; }
    const { data: attRow, error: attError } = await supabase.from("work_order_attachments")
      .insert({ work_order_id: order.id, file_url: signed.signedUrl, file_path: path, file_name: upFile.name, stage }).select().single();
    if (attError) { setErrorMsg(`Se subió la foto pero no se pudo vincular a la orden: ${attError.message}`); return; }
    setDetailOrderAttachments((prev) => [...prev, attRow]);
    setOrderAttachmentIds((prev) => new Set(prev).add(order.id));
  };

  const deleteDetailAttachment = async (attachment) => {
    if (!window.confirm("¿Quitar esta foto de la orden?")) return;
    const { data, error } = await supabase.from("work_order_attachments").delete().eq("id", attachment.id).select();
    if (error) { setErrorMsg(error.message); return; }
    if (!data || data.length === 0) {
      setErrorMsg("No se pudo quitar la foto: la base de datos no eliminó ningún registro (probablemente falta un permiso DELETE en work_order_attachments).");
      return;
    }
    setDetailOrderAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
  };

  const loadChecklistFromTemplate = async (order, template) => {
    const sortedItems = (template.items || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0));
    const rows = sortedItems.map((it, i) => ({ work_order_id: order.id, text: it.text, section: it.section || null, checked: false, position: i, response_type: it.response_type || "check", range_min: it.range_min ?? null, range_max: it.range_max ?? null }));
    const { data, error } = await supabase.from("work_order_checklist_items").insert(rows).select();
    if (error) { setErrorMsg(error.message); return; }
    setDetailOrderChecklist(data || []);
  };

  const toggleChecklistItem = async (item, checked) => {
    setDetailOrderChecklist((prev) => prev.map((it) => (it.id === item.id ? { ...it, checked } : it)));
    const { error } = await supabase.from("work_order_checklist_items").update({ checked }).eq("id", item.id);
    if (error) setErrorMsg(error.message);
  };

  const editChecklistItemField = (item, field, value) => {
    setDetailOrderChecklist((prev) => prev.map((it) => (it.id === item.id ? { ...it, [field]: value } : it)));
  };

  const saveChecklistItemField = async (item, field, value) => {
    const { error } = await supabase.from("work_order_checklist_items").update({ [field]: value }).eq("id", item.id);
    if (error) setErrorMsg(error.message);
  };

  const clearOrderChecklist = async (order) => {
    if (order.status === "completada") return;
    if (!window.confirm("¿Quitar el checklist de esta orden? Se perderán los cotejos, respuestas y observaciones ya registradas, y podrás cargar otro checklist.")) return;
    const { data, error } = await supabase.from("work_order_checklist_items").delete().eq("work_order_id", order.id).select();
    if (error) { setErrorMsg(error.message); return; }
    if (!data || data.length === 0) {
      setErrorMsg("No se pudo quitar el checklist: la base de datos no eliminó ningún registro. Probablemente falta un permiso (política RLS) de DELETE en la tabla work_order_checklist_items. No cargues otro checklist hasta corregir esto, o se van a duplicar los puntos.");
      return;
    }
    setDetailOrderChecklist([]);
  };

  const saveOrderDetail = async (order, notes, photoFile, newStatus, laborHours, laborRate) => {
    setSaving(true);
    let photo_url = order.photo_url || null;
    let photo_path = order.photo_path || null;
    if (photoFile) {
      const upPhotoFile = await compressImage(photoFile);
      const ext = upPhotoFile.name.split(".").pop();
      const path = `${companyId}/${order.id}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("evidence").upload(path, upPhotoFile, { upsert: true });
      if (uploadError) { setSaving(false); setErrorMsg(uploadError.message); return; }
      const { data: signed, error: signError } = await supabase.storage.from("evidence").createSignedUrl(path, 604800);
      if (signError) { setSaving(false); setErrorMsg(signError.message); return; }
      photo_url = signed.signedUrl;
      photo_path = path;
    }
    const payload = { resolution_notes: notes, photo_url, photo_path };
    if (newStatus) {
      payload.status = newStatus;
      // completed_at alimenta el indicador de "tiempo promedio de reparación" en Informes.
      // Se marca al cerrar y se limpia al reabrir, para que quede como la última vez que se cerró.
      if (newStatus === "completada") payload.completed_at = new Date().toISOString();
      else if (newStatus !== "completada" && order.status === "completada") {
        payload.completed_at = null;
        // reopened_count alimenta la "tasa de reapertura" en Informes — mide calidad del
        // trabajo (cuántas órdenes hubo que volver a abrir después de darlas por cerradas).
        payload.reopened_count = (order.reopened_count || 0) + 1;
      }
    }
    if (laborHours !== undefined) payload.labor_hours = laborHours === "" ? null : Number(laborHours);
    if (laborRate !== undefined) payload.labor_rate_used = laborRate === "" ? null : Number(laborRate);
    const { data, error } = await supabase.from("work_orders").update(payload).eq("id", order.id).select().single();
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    setOrders((prev) => prev.map((o) => (o.id === data.id ? data : o)));
    setDetailOrder(null);
  };

  const saveClientSignature = async (order, dataUrl, signerName) => {
    const blob = await (await fetch(dataUrl)).blob();
    const path = `signatures/${companyId}/${order.id}-${Date.now()}.png`;
    const { error: upError } = await supabase.storage.from("evidence").upload(path, blob, { contentType: "image/png", upsert: true });
    if (upError) { setErrorMsg(upError.message); return; }
    const { data: signed, error: signError } = await supabase.storage.from("evidence").createSignedUrl(path, 604800);
    if (signError) { setErrorMsg(signError.message); return; }
    const { data, error } = await supabase.from("work_orders").update({
      client_signature_url: signed.signedUrl,
      client_signature_path: path,
      client_signature_name: signerName,
      client_signature_at: new Date().toISOString(),
    }).eq("id", order.id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setOrders((prev) => prev.map((o) => (o.id === data.id ? data : o)));
    setDetailOrder((prev) => (prev ? data : prev));
  };

  // ---- Perfil de la empresa ----
  const saveCompanyProfile = async (payload, logoFile) => {
    setSaving(true);
    let logo_url = company?.logo_url || null;
    if (logoFile) {
      // Antes se subía al almacenamiento privado "evidence" y se guardaba un enlace "público"
      // que ese almacenamiento no permite abrir: por eso el logo salía roto en los documentos.
      try { logo_url = await logoToDataUrl(logoFile); }
      catch (err) { setSaving(false); setErrorMsg(err.message); return; }
    }
    const { data, error } = await supabase.from("companies").update({ ...payload, logo_url }).eq("id", companyId).select().maybeSingle();
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    if (!data) { setErrorMsg("No se pudo guardar el perfil de la empresa: la base de datos no permitió la actualización (revisa los permisos/RLS de la tabla 'companies'). No se perdieron tus datos, puedes reintentar."); return; }
    onUpdateCompany(data);
  };

  // ---- Cuentas bancarias de la empresa (para elegir en las facturas) ----
  const saveBankAccount = async (payload, editingId) => {
    setSaving(true);
    if (editingId) {
      const { data, error } = await supabase.from("company_bank_accounts").update(payload).eq("id", editingId).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setCompanyBankAccounts((prev) => prev.map((a) => (a.id === data.id ? data : a)));
    } else {
      const { data, error } = await supabase.from("company_bank_accounts").insert({ ...payload, company_id: companyId }).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setCompanyBankAccounts((prev) => [...prev, data]);
    }
  };

  const deleteBankAccount = async (id) => {
    if (!window.confirm("¿Eliminar esta cuenta bancaria? Ya no aparecerá como opción al facturar.")) return;
    const { error } = await supabase.from("company_bank_accounts").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setCompanyBankAccounts((prev) => prev.filter((a) => a.id !== id));
  };

  const setDefaultBankAccount = async (id) => {
    await supabase.from("company_bank_accounts").update({ is_default: false }).eq("company_id", companyId).neq("id", id);
    const { data, error } = await supabase.from("company_bank_accounts").update({ is_default: true }).eq("id", id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setCompanyBankAccounts((prev) => prev.map((a) => (a.id === id ? data : { ...a, is_default: false })));
  };

  // ---- Sucursales ----
  const saveBranch = async (name, city) => {
    setSaving(true);
    if (editingBranch) {
      const { data, error } = await supabase.from("branches").update({ name, city }).eq("id", editingBranch.id).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setBranches((prev) => prev.map((b) => (b.id === data.id ? data : b)));
      setEditingBranch(null);
    } else {
      const { data, error } = await supabase.from("branches").insert({ company_id: companyId, name, city }).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setBranches((prev) => [...prev, data]);
      setShowAddBranch(false);
    }
  };

  const deleteBranch = async (id) => {
    if (!window.confirm("¿Eliminar esta sucursal? También se eliminarán sus técnicos, equipos y órdenes.")) return;
    const { error } = await supabase.from("branches").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    loadAll();
  };

  // ---- Clientes ----
  const saveClient = async (payload) => {
    setSaving(true);
    if (editingClient) {
      const { data, error } = await supabase.from("clients").update(payload).eq("id", editingClient.id).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setClients((prev) => prev.map((c) => (c.id === data.id ? data : c)));
      setEditingClient(null);
    } else {
      const { data, error } = await supabase.from("clients").insert({ ...payload, company_id: companyId }).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setClients((prev) => [...prev, data]);
      setShowAddClient(false);
      setAutoSelectClientId(data.id);
      setAutoSelectToken((t) => t + 1);
    }
  };

  // Crea un cliente al vuelo desde un resultado del catálogo DGII, elegido
  // directamente en el buscador de Cliente de Cotizaciones (sin pasar por el
  // botón "+" ni por el formulario completo de "Agregar cliente").
  const createClientFromDgii = async (dgiiRow) => {
    setSaving(true);
    const { data, error } = await supabase.from("clients").insert({ name: dgiiRow.name, rnc_cedula: dgiiRow.rnc, company_id: companyId }).select().single();
    setSaving(false);
    if (error) { setErrorMsg(error.message); return null; }
    setClients((prev) => [...prev, data]);
    return data;
  };

  const deleteClient = async (id) => {
    if (!window.confirm("¿Eliminar este cliente?")) return;
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setClients((prev) => prev.filter((c) => c.id !== id));
  };

  // ---- Activos instalados en clientes (garantía) ----
  const saveClientAsset = async (payload) => {
    setSaving(true);
    if (editingAsset) {
      const { data, error } = await supabase.from("client_assets").update(payload).eq("id", editingAsset.id).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setClientAssets((prev) => prev.map((a) => (a.id === data.id ? data : a)));
      setEditingAsset(null);
    } else {
      const { data, error } = await supabase.from("client_assets").insert({ ...payload, company_id: companyId }).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setClientAssets((prev) => [...prev, data]);
      setShowAddAsset(false);
    }
  };

  const deleteClientAsset = async (id) => {
    if (!window.confirm("¿Eliminar este activo instalado?")) return;
    const { error } = await supabase.from("client_assets").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setClientAssets((prev) => prev.filter((a) => a.id !== id));
  };

  // ---- Mantenimiento preventivo recurrente ----
  const generateMaintenanceOrder = async (source, sourceType, startAfter) => {
    const isEquip = sourceType === "equipment";
    if (!source.branch_id) {
      setErrorMsg(`"${source.name}" no tiene sucursal responsable asignada. Edítalo primero para indicarla.`);
      return { ok: false };
    }
    if (isEquip && source.operational_status === "fuera_servicio") {
      setErrorMsg(`"${source.name}" está marcado como fuera de servicio — no se le puede generar una orden de mantenimiento preventivo mientras esté en ese estado.`);
      return { ok: false };
    }
    const payload = {
      branch_id: source.branch_id,
      equipment_id: isEquip ? source.id : null,
      client_asset_id: isEquip ? null : source.id,
      client_id: isEquip ? null : source.client_id,
      technician_id: source.default_technician_id || null,
      type: "preventivo",
      priority: "media",
      title: `Mantenimiento preventivo — ${source.name}`,
      scheduled: todayStr,
      status: "pendiente",
    };
    const { data, error, n } = await insertOrderWithCode(payload, startAfter);
    if (error) { setErrorMsg(error.message); return { ok: false }; }
    setOrders((prev) => [data, ...prev]);
    if (data.technician_id) {
      await notifyManyTechnicians([data.technician_id], {
        title: `Nueva orden asignada: ${data.code}`,
        body: data.title,
        link_view: "orders",
        category: "order_assigned",
      });
    }

    const updatePayload = {};
    if (source.maintenance_frequency_days && source.next_maintenance_date) {
      updatePayload.next_maintenance_date = addDaysToDateStr(todayStr, Number(source.maintenance_frequency_days));
    }
    if (source.usage_unit && source.usage_interval && source.current_usage != null) {
      updatePayload.usage_last_maintenance = source.current_usage;
    }
    const table = isEquip ? "equipment" : "client_assets";
    const { data: updated, error: updError } = await supabase.from(table).update(updatePayload).eq("id", source.id).select().single();
    if (!updError && updated) {
      if (isEquip) setEquipment((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      else setClientAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    }
    return { ok: true, n };
  };

  const generateOneMaintenanceOrder = async (source, sourceType) => {
    setSaving(true);
    await generateMaintenanceOrder(source, sourceType);
    setSaving(false);
  };

  const generateAllDueMaintenance = async () => {
    setSaving(true);
    let nextAfter = maxOrderCodeNum();
    for (const eq of dueEquipment) {
      const res = await generateMaintenanceOrder(eq, "equipment", nextAfter);
      if (res.ok) nextAfter = res.n;
    }
    for (const asset of dueClientAssets) {
      const res = await generateMaintenanceOrder(asset, "client_asset", nextAfter);
      if (res.ok) nextAfter = res.n;
    }
    setSaving(false);
  };

  const updateUsageReading = async (source, sourceType, newValue) => {
    const table = sourceType === "equipment" ? "equipment" : "client_assets";
    const { data, error } = await supabase.from(table).update({ current_usage: newValue }).eq("id", source.id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    if (sourceType === "equipment") setEquipment((prev) => prev.map((e) => (e.id === data.id ? data : e)));
    else setClientAssets((prev) => prev.map((a) => (a.id === data.id ? data : a)));
  };

  // ---- Catálogo de productos ----
  const syncProductComponents = async (parentProductId, components) => {
    await supabase.from("product_components").delete().eq("parent_product_id", parentProductId);
    setProductComponents((prev) => prev.filter((c) => c.parent_product_id !== parentProductId));
    if (components && components.length > 0) {
      const rows = components.map((c) => ({ company_id: companyId, parent_product_id: parentProductId, component_product_id: c.component_product_id, quantity: Number(c.quantity) || 1 }));
      const { data, error } = await supabase.from("product_components").insert(rows).select();
      if (error) { setErrorMsg(`El producto se guardó, pero no se pudieron guardar sus componentes: ${error.message}`); return; }
      if (data) setProductComponents((prev) => [...prev, ...data]);
    }
  };

  const saveProduct = async (payload, components, stockInfo = {}) => {
    setSaving(true);
    if (editingProduct) {
      const { data, error } = await supabase.from("products").update(payload).eq("id", editingProduct.id).select().single();
      if (error) { setSaving(false); setErrorMsg(error.message); return; }
      setProducts((prev) => prev.map((p) => (p.id === data.id ? data : p)));
      if (payload.is_composite) await syncProductComponents(data.id, components);
      setSaving(false);
      setEditingProduct(null);
    } else {
      const { data, error } = await supabase.from("products").insert({ ...payload, stock_qty: 0, company_id: companyId }).select().single();
      if (error) { setSaving(false); setErrorMsg(error.message); return; }
      setProducts((prev) => [...prev, data]);
      if (payload.is_composite) await syncProductComponents(data.id, components);
      if (stockInfo.initialStock > 0) {
        const { error: stErr } = await supabase.rpc("adjust_product_stock", { p_product_id: data.id, p_delta: stockInfo.initialStock, p_branch_id: stockInfo.initialStockBranchId, p_kind: "inicial", p_reason: "Stock inicial" });
        if (stErr) setErrorMsg(`El producto se creó, pero no se pudo cargar el stock inicial: ${stErr.message}`);
        loadAll();
      }
      setSaving(false);
      setShowAddProduct(false);
    }
  };

  const deleteProduct = async (id) => {
    if (!window.confirm("¿Eliminar este producto del catálogo?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setProducts((prev) => prev.filter((p) => p.id !== id));
    setProductComponents((prev) => prev.filter((c) => c.parent_product_id !== id));
  };

  // ---- Proveedores ----
  const saveSupplier = async (payload) => {
    setSaving(true);
    if (editingSupplier) {
      const { data, error } = await supabase.from("suppliers").update(payload).eq("id", editingSupplier.id).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setSuppliers((prev) => prev.map((s) => (s.id === data.id ? data : s)));
      setEditingSupplier(null);
    } else {
      const { data, error } = await supabase.from("suppliers").insert({ ...payload, company_id: companyId }).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setSuppliers((prev) => [...prev, data]);
      setShowAddSupplier(false);
    }
  };

  const deleteSupplier = async (id) => {
    if (!window.confirm("¿Eliminar este proveedor?")) return;
    const { error } = await supabase.from("suppliers").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setSuppliers((prev) => prev.filter((s) => s.id !== id));
  };

  // ---- Otros gastos ----
  const saveExpense = async (rawPayload) => {
    setSaving(true);
    const { issue_ncf_sequence_id: seqId, ...payload } = rawPayload;
    let saved;
    if (editingExpense) {
      const { data, error } = await supabase.from("other_expenses").update(payload).eq("id", editingExpense.id).select().single();
      if (error) { setSaving(false); setErrorMsg(error.message); return; }
      saved = data;
    } else {
      const { data, error } = await supabase.from("other_expenses").insert({ ...payload, company_id: companyId }).select().single();
      if (error) { setSaving(false); setErrorMsg(error.message); return; }
      saved = data;
    }
    // B13/B11 emitido por la empresa: se asigna después de guardar (si falla, no se pierde el número)
    if (seqId && !saved.ncf) {
      const { data: ncf, error: ncfError } = await supabase.rpc("assign_document_ncf", { p_doc_type: "expense", p_doc_id: saved.id, p_sequence_id: seqId });
      if (ncfError) setErrorMsg(`El gasto se guardó, pero no se pudo emitir el comprobante: ${ncfError.message}. Edítalo para intentarlo de nuevo.`);
      else saved = { ...saved, ncf };
    }
    setSaving(false);
    if (editingExpense) {
      setOtherExpenses((prev) => prev.map((e) => (e.id === saved.id ? saved : e)));
      setEditingExpense(null);
    } else {
      setOtherExpenses((prev) => [saved, ...prev]);
      setShowAddExpense(false);
    }
  };
  const deleteExpense = async (id) => {
    if (!window.confirm("¿Eliminar este gasto?")) return;
    const { error } = await supabase.from("other_expenses").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setOtherExpenses((prev) => prev.filter((e) => e.id !== id));
  };

  // ---- Inventario: Herramientas ----
  const saveTool = async (payload) => {
    setSaving(true);
    if (editingTool) {
      const technicianChanged = (payload.technician_id || null) !== (editingTool.technician_id || null);
      const finalPayload = technicianChanged ? { ...payload, received_at: null } : payload;
      const { data, error } = await supabase.from("tools").update(finalPayload).eq("id", editingTool.id).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setTools((prev) => prev.map((t) => (t.id === data.id ? data : t)));
      setEditingTool(null);
    } else if (Array.isArray(payload)) {
      // Varias unidades idénticas a la vez (campo "Cantidad" del formulario).
      const { data, error } = await supabase.from("tools").insert(payload.map((p) => ({ ...p, company_id: companyId }))).select();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setTools((prev) => [...(data || []), ...prev]);
      setShowAddTool(false);
    } else {
      const { data, error } = await supabase.from("tools").insert({ ...payload, company_id: companyId }).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setTools((prev) => [data, ...prev]);
      setShowAddTool(false);
    }
  };
  const deleteTool = async (id) => {
    if (!window.confirm("¿Eliminar esta herramienta?")) return;
    const { error } = await supabase.from("tools").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setTools((prev) => prev.filter((t) => t.id !== id));
  };

  const bulkDeleteTools = async (ids) => {
    if (ids.length === 0) return;
    if (!window.confirm(`¿Eliminar ${ids.length} herramienta${ids.length !== 1 ? "s" : ""} seleccionada${ids.length !== 1 ? "s" : ""}? Esta acción no se puede deshacer.`)) return;
    const { error } = await supabase.from("tools").delete().in("id", ids);
    if (error) { setErrorMsg(error.message); return; }
    setTools((prev) => prev.filter((t) => !ids.includes(t.id)));
    setSelectedTools(new Set());
  };

  const bulkRetireTools = async (ids) => {
    if (ids.length === 0) return;
    if (!window.confirm(`¿Dar de baja ${ids.length} herramienta${ids.length !== 1 ? "s" : ""} seleccionada${ids.length !== 1 ? "s" : ""}? Dejarán de aparecer como disponibles para asignar, pero no se borran.`)) return;
    const { data, error } = await supabase.from("tools").update({ status: "baja" }).in("id", ids).select();
    if (error) { setErrorMsg(error.message); return; }
    setTools((prev) => prev.map((t) => (ids.includes(t.id) ? (data.find((d) => d.id === t.id) || t) : t)));
    setSelectedTools(new Set());
  };

  // ---- Inventario: Listados de herramientas (kits asignables a un técnico) ----
  const saveToolList = async (payload, editingId) => {
    setSaving(true);
    if (editingId) {
      const { data, error } = await supabase.from("tool_lists").update(payload).eq("id", editingId).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setToolLists((prev) => prev.map((l) => (l.id === data.id ? data : l)));
      setEditingToolList(null);
    } else {
      const { data, error } = await supabase.from("tool_lists").insert({ ...payload, company_id: companyId }).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setToolLists((prev) => [...prev, data]);
      setShowAddToolList(false);
    }
  };

  const deleteToolList = async (id) => {
    if (!window.confirm("¿Eliminar este listado? Las herramientas que contiene NO se eliminan, solo el listado.")) return;
    const { error } = await supabase.from("tool_lists").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setToolLists((prev) => prev.filter((l) => l.id !== id));
  };

  const assignToolsByQuantity = async (list, toolName, qty, technicianId) => {
    setSaving(true);
    const candidates = tools.filter((t) => (list.tool_ids || []).includes(t.id) && t.name === toolName && !t.technician_id).slice(0, qty);
    if (candidates.length === 0) { setSaving(false); return; }
    const { data, error } = await supabase.from("tools").update({ technician_id: technicianId, status: "asignada" }).in("id", candidates.map((t) => t.id)).select();
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    setTools((prev) => prev.map((t) => data.find((u) => u.id === t.id) || t));
  };

  const returnToolsByQuantity = async (list, toolName, technicianId, qty) => {
    setSaving(true);
    const candidates = tools.filter((t) => (list.tool_ids || []).includes(t.id) && t.name === toolName && t.technician_id === technicianId).slice(0, qty);
    if (candidates.length === 0) { setSaving(false); return; }
    const { data, error } = await supabase.from("tools").update({ technician_id: null, status: "disponible" }).in("id", candidates.map((t) => t.id)).select();
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    setTools((prev) => prev.map((t) => data.find((u) => u.id === t.id) || t));
  };
  const createBulkTools = async (rows) => {
    if (rows.length === 0) return;
    setSaving(true);
    const payload = rows.map((r) => ({
      company_id: companyId,
      name: r.name.trim(),
      category: r.category?.trim() || null,
      serial_number: r.serial_number?.trim() || null,
      branch_id: r.branch_id || null,
      technician_id: r.technician_id || null,
      status: r.technician_id ? "asignada" : "disponible",
    }));
    const { data, error } = await supabase.from("tools").insert(payload).select();
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    setTools((prev) => [...(data || []), ...prev]);
    setShowBulkTools(false);
  };
  const assignTool = async (id, technicianId) => {
    const { data, error } = await supabase.from("tools")
      .update({ technician_id: technicianId || null, status: technicianId ? "asignada" : "disponible", received_at: null })
      .eq("id", id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setTools((prev) => prev.map((t) => (t.id === data.id ? data : t)));
  };
  const confirmToolReceipt = async (id) => {
    const { data, error } = await supabase.from("tools")
      .update({ received_at: new Date().toISOString() })
      .eq("id", id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setTools((prev) => prev.map((t) => (t.id === data.id ? data : t)));
  };

  // ---- Préstamos de herramientas entre técnicos ----
  const lendTool = async (tool, toTechnicianId, notes) => {
    if (!toTechnicianId || toTechnicianId === tool.technician_id) return;
    setSaving(true);
    const { data: loan, error: loanError } = await supabase.from("tool_loans").insert({
      company_id: companyId, tool_id: tool.id, from_technician_id: tool.technician_id || null, to_technician_id: toTechnicianId, notes: notes?.trim() || null,
    }).select().single();
    if (loanError) { setSaving(false); setErrorMsg(loanError.message); return; }
    const { data: updatedTool, error: toolError } = await supabase.from("tools")
      .update({ technician_id: toTechnicianId, status: "asignada", received_at: null })
      .eq("id", tool.id).select().single();
    setSaving(false);
    if (toolError) { setErrorMsg(`Se registró el préstamo pero no se pudo actualizar la herramienta: ${toolError.message}`); return; }
    setTools((prev) => prev.map((t) => (t.id === updatedTool.id ? updatedTool : t)));
    setToolLoans((prev) => [loan, ...prev]);
  };

  const returnTool = async (tool) => {
    const activeLoan = toolLoans.find((l) => l.tool_id === tool.id && !l.returned_at);
    if (!activeLoan) return;
    setSaving(true);
    const { data: updatedLoan, error: loanError } = await supabase.from("tool_loans")
      .update({ returned_at: new Date().toISOString() }).eq("id", activeLoan.id).select().single();
    if (loanError) { setSaving(false); setErrorMsg(loanError.message); return; }
    const { data: updatedTool, error: toolError } = await supabase.from("tools")
      .update({ technician_id: activeLoan.from_technician_id, status: activeLoan.from_technician_id ? "asignada" : "disponible", received_at: null })
      .eq("id", tool.id).select().single();
    setSaving(false);
    if (toolError) { setErrorMsg(`Se registró la devolución pero no se pudo actualizar la herramienta: ${toolError.message}`); return; }
    setTools((prev) => prev.map((t) => (t.id === updatedTool.id ? updatedTool : t)));
    setToolLoans((prev) => prev.map((l) => (l.id === updatedLoan.id ? updatedLoan : l)));
  };

  // ---- Inventario: Materiales sobrantes ----
  const saveMaterial = async (payload) => {
    setSaving(true);
    if (editingMaterial) {
      const { data, error } = await supabase.from("inventory_materials").update(payload).eq("id", editingMaterial.id).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setMaterials((prev) => prev.map((m) => (m.id === data.id ? data : m)));
      setEditingMaterial(null);
    } else {
      const { data, error } = await supabase.from("inventory_materials").insert({ ...payload, company_id: companyId }).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setMaterials((prev) => [data, ...prev]);
      setShowAddMaterial(false);
    }
  };
  const deleteMaterial = async (id) => {
    if (!window.confirm("¿Eliminar este material?")) return;
    const { error } = await supabase.from("inventory_materials").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setMaterials((prev) => prev.filter((m) => m.id !== id));
  };
  // Existencias que cambian cuando una orden o un proyecto usa/devuelve material (lo hace la base
  // de datos): se vuelven a leer el almacén técnico y, si aplica, Productos.
  const reloadInventory = async () => {
    const [mats, ps, prods] = await Promise.all([
      fetchAllRows(() => supabase.from("inventory_materials").select("*").eq("company_id", companyId).order("name")),
      techUsesProducts ? fetchAllRows(() => supabase.from("product_stock").select("product_id, branch_id, quantity").eq("company_id", companyId)) : Promise.resolve({ data: null, error: true }),
      techUsesProducts ? fetchAllRows(() => supabase.from("products").select("*").eq("company_id", companyId).order("name")) : Promise.resolve({ data: null, error: true }),
    ]);
    if (!mats.error) setMaterials(mats.data || []);
    if (!ps.error) setProductStock(ps.data || []);
    if (!prods.error) setProducts(prods.data || []);
  };
  // Sobrante: lo que quedó de un producto usado (sin costo, no regresa a Productos)
  const registerLeftover = async (payload) => {
    const { data, error } = await supabase.from("inventory_materials").insert({ ...payload, kind: "sobrante", company_id: companyId }).select().single();
    if (error) { setErrorMsg(error.message); window.alert(error.message); return false; }
    setMaterials((prev) => [data, ...prev]);
    return true;
  };
  const defaultBranchId = useMemo(() => {
    const sorted = branches.slice().sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")) || String(a.name || "").localeCompare(String(b.name || "")));
    return sorted[0]?.id || null;
  }, [branches]);

  // ---- Proyectos ----
  const saveProject = async (payload) => {
    setSaving(true);
    if (editingProject) {
      const { data, error } = await supabase.from("projects").update(payload).eq("id", editingProject.id).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setProjects((prev) => prev.map((p) => (p.id === data.id ? data : p)));
      setEditingProject(null);
      setProjectDetail((prev) => (prev && prev.id === data.id ? data : prev));
    } else {
      const { status, ...rest } = payload;
      const { data, error } = await supabase.from("projects").insert({ ...rest, company_id: companyId, status: "activo" }).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setProjects((prev) => [data, ...prev]);
      setShowAddProject(false);
    }
  };
  const deleteProject = async (project) => {
    if (!window.confirm(`¿Eliminar el proyecto "${project.name}"? Las órdenes, materiales y órdenes de venta vinculados quedarán sin proyecto asignado.`)) return;
    const { error } = await supabase.from("projects").delete().eq("id", project.id);
    if (error) { setErrorMsg(error.message); return; }
    setProjects((prev) => prev.filter((p) => p.id !== project.id));
    setProjectMaterials((prev) => prev.filter((pm) => pm.project_id !== project.id));
    setOrders((prev) => prev.map((o) => (o.project_id === project.id ? { ...o, project_id: null } : o)));
    setSalesOrders((prev) => prev.map((o) => (o.project_id === project.id ? { ...o, project_id: null } : o)));
    setProjectDetail(null);
  };
  const setProjectStatus = async (project, status) => {
    const { data, error } = await supabase.from("projects").update({ status }).eq("id", project.id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setProjects((prev) => prev.map((p) => (p.id === data.id ? data : p)));
    setProjectDetail((prev) => (prev && prev.id === data.id ? data : prev));
  };
  const linkOrderToProject = async (projectId, orderId) => {
    const { data, error } = await supabase.from("work_orders").update({ project_id: projectId }).eq("id", orderId).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setOrders((prev) => prev.map((o) => (o.id === data.id ? data : o)));
  };
  const unlinkOrderFromProject = async (orderId) => {
    const { data, error } = await supabase.from("work_orders").update({ project_id: null }).eq("id", orderId).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setOrders((prev) => prev.map((o) => (o.id === data.id ? data : o)));
  };
  const linkSalesOrderToProject = async (projectId, salesOrderId) => {
    const { data, error } = await supabase.from("sales_orders").update({ project_id: projectId }).eq("id", salesOrderId).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setSalesOrders((prev) => prev.map((o) => (o.id === data.id ? data : o)));
  };
  const unlinkSalesOrderFromProject = async (salesOrderId) => {
    const { data, error } = await supabase.from("sales_orders").update({ project_id: null }).eq("id", salesOrderId).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setSalesOrders((prev) => prev.map((o) => (o.id === data.id ? data : o)));
  };
  // pickId: "p:<producto>" o "m:<material del almacén técnico>". La base descuenta y devuelve.
  const addProjectMaterial = async (projectId, pickId, quantity, notes) => {
    const qty = Number(String(quantity || "").replace(",", "."));
    if (!qty || qty <= 0) { setErrorMsg("La cantidad debe ser mayor a cero."); return; }
    const cols = pickId.startsWith("p:") ? { product_id: pickId.slice(2) } : { material_id: pickId.slice(2) };
    setSaving(true);
    const { data, error } = await supabase.from("project_materials").insert({ company_id: companyId, project_id: projectId, quantity: qty, notes: (notes || "").trim() || null, ...cols }).select().single();
    setSaving(false);
    if (error) { setErrorMsg(error.message); window.alert(error.message); return; }
    setProjectMaterials((prev) => [data, ...prev]);
    reloadInventory();
  };
  // Devolver todo (se quita el renglón) o parte (baja la cantidad)
  const removeProjectMaterial = async (pm) => {
    const res = await returnMaterialLine("project_materials", pm);
    if (!res) return;
    if (res.removed) setProjectMaterials((prev) => prev.filter((p) => p.id !== pm.id));
    else setProjectMaterials((prev) => prev.map((p) => (p.id === pm.id ? res.updated : p)));
    reloadInventory();
  };

  // ---- Catálogo de cuentas ----
  const saveAccount = async (payload) => {
    setSaving(true);
    if (editingAccount) {
      const { data, error } = await supabase.from("chart_of_accounts").update(payload).eq("id", editingAccount.id).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setChartOfAccounts((prev) => prev.map((a) => (a.id === data.id ? data : a)));
      setEditingAccount(null);
    } else {
      const { data, error } = await supabase.from("chart_of_accounts").insert({ ...payload, company_id: companyId }).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setChartOfAccounts((prev) => [...prev, data].sort((a, b) => a.code.localeCompare(b.code)));
      setShowAddAccount(false);
    }
  };
  const deleteAccount = async (id) => {
    if (!window.confirm("¿Eliminar esta cuenta del catálogo?")) return;
    const { error } = await supabase.from("chart_of_accounts").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setChartOfAccounts((prev) => prev.filter((a) => a.id !== id));
  };

  // ---- Tasas impositivas ----
  const saveTaxRate = async (payload) => {
    setSaving(true);
    if (editingTaxRate) {
      const { data, error } = await supabase.from("tax_rates").update(payload).eq("id", editingTaxRate.id).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setTaxRates((prev) => prev.map((t) => (t.id === data.id ? data : t)));
      setEditingTaxRate(null);
    } else {
      const { data, error } = await supabase.from("tax_rates").insert({ ...payload, company_id: companyId }).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setTaxRates((prev) => [...prev, data]);
      setShowAddTaxRate(false);
    }
  };
  const deleteTaxRate = async (id) => {
    if (!window.confirm("¿Eliminar esta tasa impositiva?")) return;
    const { error } = await supabase.from("tax_rates").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setTaxRates((prev) => prev.filter((t) => t.id !== id));
  };

  // ---- Catálogo RNC (DGII) ----
  const loadDgiiCatalogStats = async () => {
    const { count } = await supabase.from("dgii_rnc_catalog").select("rnc", { count: "exact", head: true });
    setDgiiCatalogCount(count ?? 0);
    const { data: latest } = await supabase.from("dgii_rnc_catalog").select("updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    setDgiiCatalogUpdatedAt(latest?.updated_at || null);
  };

  const importDgiiCatalogFile = async (file) => {
    if (!file) return;
    setDgiiImporting(true);
    setDgiiImportProgress({ done: 0, total: 0, phase: "Leyendo archivo..." });
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/);
      const rows = [];
      for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.split("|").map((p) => p.trim().replace(/\s{2,}/g, " "));
        const rnc = (parts[0] || "").replace(/\D/g, "");
        if (!rnc || rnc.length < 9) continue;
        rows.push({
          rnc,
          name: parts[1] || "Sin nombre",
          commercial_name: parts[2] || null,
          status: parts[5] || parts[4] || null,
          updated_at: new Date().toISOString(),
        });
      }
      const total = rows.length;
      if (total === 0) {
        setErrorMsg("No se pudo leer ningún registro válido de ese archivo. Confirma que sea el DGII_RNC.TXT descomprimido, sin editar.");
        setDgiiImporting(false);
        setDgiiImportProgress(null);
        return;
      }
      const batchSize = 1000;
      setDgiiImportProgress({ done: 0, total, phase: "Importando..." });
      for (let i = 0; i < total; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const { error } = await supabase.from("dgii_rnc_catalog").upsert(batch, { onConflict: "rnc" });
        if (error) { setErrorMsg(`Se importaron ${i} de ${total} registros y ocurrió un error: ${error.message}`); break; }
        setDgiiImportProgress({ done: Math.min(i + batchSize, total), total, phase: "Importando..." });
        await new Promise((r) => setTimeout(r, 0));
      }
      await loadDgiiCatalogStats();
    } catch (err) {
      setErrorMsg(`No se pudo procesar el archivo: ${err.message}`);
    }
    setDgiiImporting(false);
    setDgiiImportProgress(null);
  };

  // ---- Recibos de proveedor (libro de pagos a proveedores) ----
  useEffect(() => {
    if (view !== "supplierReceipts" || purchases.length === 0) { if (view !== "supplierReceipts") setAllPurchasePayments([]); return; }
    (async () => {
      const { data } = await fetchByIdChunks(purchases.map((p) => p.id), (chunk) => supabase.from("purchase_payments").select("*").in("purchase_id", chunk));
      setAllPurchasePayments((data || []).sort((a, b) => (b.payment_date || "").localeCompare(a.payment_date || "")));
    })();
  }, [view, purchases]);

  // ---- Producto genérico usado al importar una compra automáticamente desde PDF ----
  const ensureGenericPurchaseProduct = async () => {
    const existing = products.find((p) => p.name === "Compra importada (PDF)" && (p.item_type || "producto") === "servicio");
    if (existing) return existing;
    const { data, error } = await supabase.from("products").insert({
      company_id: companyId, item_type: "servicio", name: "Compra importada (PDF)", category: "Importado",
      unit: "unidad", cost_price: 0, unit_price: 0, stock_qty: 0, is_taxable: true,
    }).select().single();
    if (error) { setErrorMsg(error.message); return null; }
    setProducts((prev) => [...prev, data]);
    return data;
  };

  // ---- Compras (registrar suma stock; eliminar lo resta de vuelta) ----
  // Solo los datos descriptivos del 606 (tipo de bien/servicio, forma de pago, tipo de
  // retención ISR) — nunca montos. Sirve también para completar compras viejas.
  const issueDocumentNcf = async (docType, doc, sequenceId) => {
    const { data: ncf, error } = await supabase.rpc("assign_document_ncf", { p_doc_type: docType, p_doc_id: doc.id, p_sequence_id: sequenceId });
    if (error) { setErrorMsg(error.message); return false; }
    if (docType === "purchase") {
      setPurchases((prev) => prev.map((p) => (p.id === doc.id ? { ...p, invoice_number: ncf } : p)));
      setPurchaseDetail((prev) => (prev && prev.purchase.id === doc.id ? { ...prev, purchase: { ...prev.purchase, invoice_number: ncf } } : prev));
    } else {
      setOtherExpenses((prev) => prev.map((e) => (e.id === doc.id ? { ...e, ncf } : e)));
    }
    loadAll();
    return true;
  };

  const updatePurchase606 = async (purchase, fields) => {
    const { data, error } = await supabase.from("purchases").update(fields).eq("id", purchase.id).select();
    if (error) { setErrorMsg(error.message); return false; }
    if (!data || data.length === 0) { setErrorMsg("No se guardaron los datos del 606: la base de datos no aplicó el cambio (revisa el permiso de edición de compras)."); return false; }
    const updated = data[0];
    setPurchases((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setPurchaseDetail((prev) => (prev ? { ...prev, purchase: updated } : prev));
    return true;
  };

  const createPurchase = async (rawPayload, items) => {
    setSaving(true);
    const { issue_ncf_sequence_id: b11SequenceId, ...payload } = rawPayload;
    const { data: purchase, error: purchaseError } = await supabase.from("purchases").insert({ ...payload, company_id: companyId }).select().single();
    if (purchaseError) { setSaving(false); setErrorMsg(purchaseError.message); return; }
    if (b11SequenceId) {
      // El B11 se asigna después de guardar: si falla, la compra queda sin NCF (se puede emitir
      // desde su detalle) y no se desperdicia ningún número.
      const { error: ncfError } = await supabase.rpc("assign_document_ncf", { p_doc_type: "purchase", p_doc_id: purchase.id, p_sequence_id: b11SequenceId });
      if (ncfError) setErrorMsg(`La compra se registró, pero no se pudo emitir el B11: ${ncfError.message}. Puedes emitirlo desde el detalle de la compra.`);
    }

    const itemRows = items.map((it) => ({
      purchase_id: purchase.id,
      product_id: it.product_id,
      quantity: Number(it.quantity),
      unit_cost: Number(it.unit_cost),
      subtotal: Number(it.quantity) * Number(it.unit_cost),
      chapter: it.chapter?.trim() || null,
    }));
    const { error: itemsError } = await supabase.from("purchase_items").insert(itemRows);
    if (itemsError) { setSaving(false); setErrorMsg(itemsError.message); return; }

    // Entrada de inventario con costo promedio ponderado (receive_product_stock, en el servidor).
    const stockErrors = [];
    for (const row of itemRows) {
      const prod = products.find((p) => p.id === row.product_id);
      if (!prod) continue;
      if (payload.goods_receipt_id && (prod.item_type || "producto") !== "servicio") {
        // El stock ya subió con la nota de entrega (a su costo). Si la factura trae otro costo,
        // se ajusta el costo promedio por la diferencia, sin volver a sumar stock.
        const receiptItem = goodsReceiptItems.find((gi) => gi.goods_receipt_id === payload.goods_receipt_id && gi.product_id === prod.id);
        const diff = Number(row.unit_cost) - Number(receiptItem?.unit_cost ?? row.unit_cost);
        if (Math.abs(diff) >= 0.0001) {
          const { error: revErr } = await supabase.rpc("revalue_product_cost", { p_product_id: prod.id, p_qty: row.quantity, p_cost_difference: diff });
          if (revErr) stockErrors.push(`${prod.name}: ${revErr.message}`);
        }
        continue;
      }
      const { error: recErr } = await supabase.rpc("receive_product_stock", { p_product_id: prod.id, p_qty: row.quantity, p_unit_cost: row.unit_cost, p_branch_id: payload.branch_id || null, p_ref_type: "purchase", p_ref_id: purchase.id });
      if (recErr) stockErrors.push(`${prod.name}: ${recErr.message}`);
    }
    if (stockErrors.length > 0) setErrorMsg(`La compra se registró, pero no se pudo actualizar el inventario de: ${stockErrors.join("; ")}`);

    setSaving(false);
    setShowAddSupplier(false);
    setShowAddPurchase(false);
    setPrefillReceiptId(null);
    loadAll();
  };

  const deletePurchase = async (purchase) => {
    // Si esta compra viene de una nota de entrega, el inventario le pertenece a esa nota —
    // borrar la factura no debe tocarlo (la nota de entrega se borra aparte, si hace falta).
    const linkedToReceipt = !!purchase.goods_receipt_id;
    if (!window.confirm(linkedToReceipt
      ? "¿Eliminar esta compra? El inventario NO se ajustará — ya quedó controlado por su nota de entrega."
      : "¿Eliminar esta compra? Se restará la cantidad comprada del inventario.")) return;
    if (!linkedToReceipt) {
      const { data: items } = await supabase.from("purchase_items").select("*").eq("purchase_id", purchase.id);
      for (const it of items || []) {
        const prod = products.find((p) => p.id === it.product_id);
        if (!prod) continue;
        await supabase.rpc("adjust_product_stock", { p_product_id: prod.id, p_delta: -Number(it.quantity), p_branch_id: purchase.branch_id || null, p_kind: "eliminacion_compra", p_ref_type: "purchase", p_ref_id: purchase.id });
      }
    }
    const { error } = await supabase.from("purchases").delete().eq("id", purchase.id);
    if (error) { setErrorMsg(error.message); return; }
    loadAll();
  };

  const openPurchaseDetail = async (purchase) => {
    const { data: items } = await supabase.from("purchase_items").select("*").eq("purchase_id", purchase.id);
    const withNames = (items || []).map((it) => ({ ...it, productName: products.find((p) => p.id === it.product_id)?.name || "Producto eliminado" }));
    const { data: pays } = await supabase.from("purchase_payments").select("*").eq("purchase_id", purchase.id).order("payment_date");
    setPurchaseDetail({ purchase, items: withNames, payments: pays || [] });
  };

  // register_purchase_payment / delete_purchase_payment: mismo respaldo del lado del
  // servidor que ya se aplicó a los pagos de facturas de clientes — verifican permiso
  // "purchases" y recalculan amount_paid/payment_status de forma atómica, en vez del
  // patrón leer-calcular-escribir desde el cliente que tenían antes.
  const registerPurchasePayment = async (purchase, payload) => {
    setSaving(true);
    const { data: updated, error: payError } = await supabase.rpc("register_purchase_payment", {
      p_purchase_id: purchase.id,
      p_amount: payload.amount,
      p_method: payload.method,
      p_payment_date: payload.payment_date,
      p_notes: payload.notes,
    });
    setSaving(false);
    if (payError) { setErrorMsg(payError.message); return; }
    const { data: allPayments } = await supabase.from("purchase_payments").select("*").eq("purchase_id", purchase.id).order("payment_date");
    if (updated) setPurchases((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setPurchaseDetail((prev) => (prev ? { ...prev, purchase: updated || prev.purchase, payments: allPayments || [] } : prev));
  };

  const deletePurchasePayment = async (payment, purchase) => {
    if (!window.confirm("¿Eliminar este pago registrado?")) return;
    const { data: updated, error: delError } = await supabase.rpc("delete_purchase_payment", { p_payment_id: payment.id });
    if (delError) { setErrorMsg(delError.message); return; }
    const { data: allPayments } = await supabase.from("purchase_payments").select("*").eq("purchase_id", purchase.id).order("payment_date");
    if (updated) setPurchases((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setPurchaseDetail((prev) => (prev ? { ...prev, purchase: updated || prev.purchase, payments: allPayments || [] } : prev));
  };

  // ---- Pedidos a Proveedores ----
  const createPurchaseOrder = async (payload, items) => {
    setSaving(true);
    const { data: numData, error: numError } = await supabase.rpc("next_document_number", { p_doc_type: "purchase_order" });
    if (numError) { setSaving(false); setErrorMsg(`No se pudo generar el número de pedido: ${numError.message}`); return; }
    const order_number = `PO-${String(numData).padStart(5, "0")}`;
    const { data: po, error } = await supabase.from("purchase_orders").insert({ ...payload, company_id: companyId, order_number }).select().single();
    if (error) { setSaving(false); setErrorMsg(error.message); return; }
    const itemRows = items.map((it) => ({ purchase_order_id: po.id, product_id: it.product_id, quantity: Number(it.quantity), unit_cost: Number(it.unit_cost) }));
    const { data: insertedItems, error: itemsError } = await supabase.from("purchase_order_items").insert(itemRows).select();
    setSaving(false);
    if (itemsError) { setErrorMsg(itemsError.message); return; }
    setPurchaseOrders((prev) => [po, ...prev]);
    setPurchaseOrderItems((prev) => [...prev, ...(insertedItems || [])]);
    setShowAddPurchaseOrder(false);
  };

  const cancelPurchaseOrder = async (po) => {
    if (!window.confirm(`¿Cancelar el pedido ${po.order_number || ""}? Ya no se podrá recibir mercancía contra él.`)) return;
    const { data: updated, error } = await supabase.from("purchase_orders").update({ status: "cancelado" }).eq("id", po.id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setPurchaseOrders((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  };

  const deletePurchaseOrder = async (po) => {
    const hasReceipts = goodsReceipts.some((r) => r.purchase_order_id === po.id);
    if (hasReceipts) { setErrorMsg("Este pedido ya tiene notas de entrega registradas — no se puede borrar. Si ya no aplica, cancélalo en vez de borrarlo."); return; }
    if (!window.confirm(`¿Eliminar el pedido ${po.order_number || ""}?`)) return;
    const { error } = await supabase.from("purchase_orders").delete().eq("id", po.id);
    if (error) { setErrorMsg(error.message); return; }
    setPurchaseOrders((prev) => prev.filter((p) => p.id !== po.id));
    setPurchaseOrderItems((prev) => prev.filter((it) => it.purchase_order_id !== po.id));
  };

  // Recalcula pendiente/parcial/recibido de un pedido a partir de sus renglones ya
  // actualizados (received_quantity vs quantity) y guarda el nuevo estado.
  const recomputePurchaseOrderStatus = async (purchaseOrderId, poItemsAfter) => {
    const allReceived = poItemsAfter.every((it) => Number(it.received_quantity) >= Number(it.quantity));
    const anyReceived = poItemsAfter.some((it) => Number(it.received_quantity) > 0);
    const newStatus = allReceived ? "recibido" : anyReceived ? "parcial" : "pendiente";
    const { data: updatedPo } = await supabase.from("purchase_orders").update({ status: newStatus }).eq("id", purchaseOrderId).select().single();
    if (updatedPo) setPurchaseOrders((prev) => prev.map((po) => (po.id === updatedPo.id ? updatedPo : po)));
  };

  // ---- Nota de entrega proveedores ----
  // Aquí es donde de verdad sube el inventario — no al registrar la compra/factura (ver
  // nota en createPurchase). Si la nota viene de un pedido, además avanza received_quantity
  // de cada renglón que haga match por producto y recalcula el estado del pedido.
  const createGoodsReceipt = async (payload, items) => {
    setSaving(true);
    const { data: numData, error: numError } = await supabase.rpc("next_document_number", { p_doc_type: "goods_receipt" });
    if (numError) { setSaving(false); setErrorMsg(`No se pudo generar el número de nota de entrega: ${numError.message}`); return; }
    const receipt_number = `NE-${String(numData).padStart(5, "0")}`;
    const { data: gr, error } = await supabase.from("goods_receipts").insert({ ...payload, company_id: companyId, receipt_number }).select().single();
    if (error) { setSaving(false); setErrorMsg(error.message); return; }
    const itemRows = items.map((it) => ({ goods_receipt_id: gr.id, product_id: it.product_id, quantity: Number(it.quantity), unit_cost: Number(it.unit_cost) }));
    const { data: insertedItems, error: itemsError } = await supabase.from("goods_receipt_items").insert(itemRows).select();
    if (itemsError) { setSaving(false); setErrorMsg(itemsError.message); return; }

    const receiptStockErrors = [];
    for (const row of itemRows) {
      const prod = products.find((p) => p.id === row.product_id);
      if (!prod || (prod.item_type || "producto") === "servicio") continue;
      const { error: recErr } = await supabase.rpc("receive_product_stock", { p_product_id: prod.id, p_qty: row.quantity, p_unit_cost: row.unit_cost, p_branch_id: payload.branch_id || null, p_ref_type: "goods_receipt", p_ref_id: gr.id });
      if (recErr) receiptStockErrors.push(`${prod.name}: ${recErr.message}`);
    }
    if (receiptStockErrors.length > 0) setErrorMsg(`La nota de entrega se registró, pero no se pudo actualizar el inventario de: ${receiptStockErrors.join("; ")}`);

    if (payload.purchase_order_id) {
      const poItems = purchaseOrderItems.filter((it) => it.purchase_order_id === payload.purchase_order_id);
      const poItemsAfter = [];
      for (const poItem of poItems) {
        const receivedNow = itemRows.filter((r) => r.product_id === poItem.product_id).reduce((s, r) => s + Number(r.quantity), 0);
        const newReceived = Number(poItem.received_quantity || 0) + receivedNow;
        if (receivedNow > 0) await supabase.from("purchase_order_items").update({ received_quantity: newReceived }).eq("id", poItem.id);
        poItemsAfter.push({ ...poItem, received_quantity: newReceived });
      }
      setPurchaseOrderItems((prev) => prev.map((it) => poItemsAfter.find((p) => p.id === it.id) || it));
      await recomputePurchaseOrderStatus(payload.purchase_order_id, poItemsAfter);
    }

    setSaving(false);
    setGoodsReceipts((prev) => [gr, ...prev]);
    setGoodsReceiptItems((prev) => [...prev, ...(insertedItems || [])]);
    setShowAddReceipt(false);
    setReceiptFromOrder(null);
  };

  const deleteGoodsReceipt = async (receipt) => {
    const alreadyInvoiced = purchases.some((p) => p.goods_receipt_id === receipt.id);
    if (alreadyInvoiced) { setErrorMsg("Esta nota de entrega ya tiene una compra/factura vinculada — bórrala primero a ella."); return; }
    if (!window.confirm(`¿Eliminar la nota de entrega ${receipt.receipt_number || ""}? Se restará del inventario lo que había sumado.`)) return;
    const items = goodsReceiptItems.filter((it) => it.goods_receipt_id === receipt.id);
    for (const it of items) {
      const prod = products.find((p) => p.id === it.product_id);
      if (!prod || (prod.item_type || "producto") === "servicio") continue;
      await supabase.rpc("adjust_product_stock", { p_product_id: prod.id, p_delta: -Number(it.quantity), p_branch_id: receipt.branch_id || null, p_kind: "eliminacion_nota_entrega", p_ref_type: "goods_receipt", p_ref_id: receipt.id });
    }
    if (receipt.purchase_order_id) {
      const poItems = purchaseOrderItems.filter((it) => it.purchase_order_id === receipt.purchase_order_id);
      const poItemsAfter = [];
      for (const poItem of poItems) {
        const removedNow = items.filter((r) => r.product_id === poItem.product_id).reduce((s, r) => s + Number(r.quantity), 0);
        const newReceived = Math.max(0, Number(poItem.received_quantity || 0) - removedNow);
        if (removedNow > 0) await supabase.from("purchase_order_items").update({ received_quantity: newReceived }).eq("id", poItem.id);
        poItemsAfter.push({ ...poItem, received_quantity: newReceived });
      }
      setPurchaseOrderItems((prev) => prev.map((it) => poItemsAfter.find((p) => p.id === it.id) || it));
      await recomputePurchaseOrderStatus(receipt.purchase_order_id, poItemsAfter);
    }
    const { error } = await supabase.from("goods_receipts").delete().eq("id", receipt.id);
    if (error) { setErrorMsg(error.message); return; }
    setGoodsReceipts((prev) => prev.filter((r) => r.id !== receipt.id));
    setGoodsReceiptItems((prev) => prev.filter((it) => it.goods_receipt_id !== receipt.id));
  };

  // ---- Secuencias NCF ----
  // ---- Checklists por tipo de equipo ----
  const saveChecklistTemplate = async (payload, itemTexts) => {
    setSaving(true);
    if (editingChecklist) {
      const { error: updError } = await supabase.from("checklist_templates").update(payload).eq("id", editingChecklist.id);
      if (updError) { setSaving(false); setErrorMsg(updError.message); return; }
      const existingCount = (editingChecklist.items || []).length;
      const { data: deletedItems, error: delError } = await supabase.from("checklist_template_items").delete().eq("template_id", editingChecklist.id).select();
      if (delError) { setSaving(false); setErrorMsg(delError.message); return; }
      if (existingCount > 0 && (!deletedItems || deletedItems.length === 0)) {
        setSaving(false);
        setErrorMsg("No se pudieron borrar los puntos anteriores de este checklist (probablemente falta un permiso DELETE en checklist_template_items). No se guardaron los cambios para evitar duplicados.");
        return;
      }
      const rows = itemTexts.map((it, i) => ({ template_id: editingChecklist.id, text: it.text, section: it.section || null, position: i, response_type: it.response_type || "check", range_min: it.range_min ?? null, range_max: it.range_max ?? null }));
      const { error: insError } = await supabase.from("checklist_template_items").insert(rows);
      if (insError) { setSaving(false); setErrorMsg(insError.message); return; }
      setSaving(false);
      setEditingChecklist(null);
      loadAll();
    } else {
      const { data: tpl, error: tplError } = await supabase.from("checklist_templates").insert({ ...payload, company_id: companyId }).select().single();
      if (tplError) { setSaving(false); setErrorMsg(tplError.message); return; }
      const rows = itemTexts.map((it, i) => ({ template_id: tpl.id, text: it.text, section: it.section || null, position: i, response_type: it.response_type || "check", range_min: it.range_min ?? null, range_max: it.range_max ?? null }));
      await supabase.from("checklist_template_items").insert(rows);
      setSaving(false);
      setShowAddChecklist(false);
      loadAll();
    }
  };

  const deleteChecklistTemplate = async (id) => {
    if (!window.confirm("¿Eliminar este checklist? No afecta las órdenes que ya lo cargaron.")) return;
    const { data, error } = await supabase.from("checklist_templates").delete().eq("id", id).select();
    if (error) { setErrorMsg(error.message); return; }
    if (!data || data.length === 0) {
      setErrorMsg("No se pudo eliminar el checklist: la base de datos no eliminó ningún registro (probablemente falta un permiso DELETE en checklist_templates).");
      return;
    }
    setChecklistTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  const downloadChecklistsExcel = async (templates) => {
    const XLSX = await loadXlsx();
    const rows = [];
    templates.forEach((tpl) => {
      const items = (tpl.items || []).slice().sort((a, b) => a.position - b.position);
      if (items.length === 0) {
        rows.push({ "Tipo de equipo": tpl.equipment_type, "Nombre del checklist": tpl.name, "Tema": "", "Punto a revisar": "" });
      } else {
        items.forEach((it) => {
          rows.push({ "Tipo de equipo": tpl.equipment_type, "Nombre del checklist": tpl.name, "Tema": it.section || "", "Punto a revisar": it.text });
        });
      }
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 28 }, { wch: 34 }, { wch: 28 }, { wch: 55 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Checklists");
    XLSX.writeFile(wb, templates.length === checklistTemplates.length ? "checklists-mantenpro.xlsx" : "checklists-seleccion.xlsx");
  };

  const importChecklistsFromExcel = async (file) => {
    const XLSX = await loadXlsx();
    setImportingChecklists(true);
    setErrorMsg("");
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

      const groups = [];
      const groupIndex = new Map();
      rows.forEach((row) => {
        const equipmentType = String(row["Tipo de equipo"] || "").trim();
        const name = String(row["Nombre del checklist"] || "").trim();
        const section = String(row["Tema"] || "").trim();
        const text = String(row["Punto a revisar"] || "").trim();
        if (!equipmentType || !name || !text) return;
        const key = equipmentType.toLowerCase() + "||" + name.toLowerCase();
        if (!groupIndex.has(key)) {
          groupIndex.set(key, groups.length);
          groups.push({ equipmentType, name, items: [] });
        }
        groups[groupIndex.get(key)].items.push({ text, section });
      });

      if (groups.length === 0) {
        setErrorMsg("El Excel no tiene filas válidas. Debe tener las columnas 'Tipo de equipo', 'Nombre del checklist' y 'Punto a revisar' (y opcionalmente 'Tema').");
        return;
      }

      let created = 0, updated = 0;
      for (const g of groups) {
        const existing = checklistTemplates.find(
          (t) => t.equipment_type.trim().toLowerCase() === g.equipmentType.toLowerCase() && t.name.trim().toLowerCase() === g.name.toLowerCase()
        );
        if (existing) {
          await supabase.from("checklist_templates").update({ equipment_type: g.equipmentType, name: g.name }).eq("id", existing.id);
          await supabase.from("checklist_template_items").delete().eq("template_id", existing.id);
          const itemRows = g.items.map((it, i) => ({ template_id: existing.id, text: it.text, section: it.section || null, position: i }));
          await supabase.from("checklist_template_items").insert(itemRows);
          updated++;
        } else {
          const { data: tpl, error: tplError } = await supabase.from("checklist_templates").insert({ equipment_type: g.equipmentType, name: g.name, company_id: companyId }).select().single();
          if (tplError) { setErrorMsg(tplError.message); continue; }
          const itemRows = g.items.map((it, i) => ({ template_id: tpl.id, text: it.text, section: it.section || null, position: i }));
          await supabase.from("checklist_template_items").insert(itemRows);
          created++;
        }
      }
      await loadAll();
      window.alert(`Importación completa: ${created} checklist${created !== 1 ? "s" : ""} nuevo${created !== 1 ? "s" : ""}, ${updated} actualizado${updated !== 1 ? "s" : ""}.`);
    } catch (err) {
      setErrorMsg("No se pudo leer el Excel: " + err.message);
    } finally {
      setImportingChecklists(false);
    }
  };

  const saveNcfSequence = async (payload) => {
    setSaving(true);
    if (editingNcf) {
      const { data, error } = await supabase.from("ncf_sequences").update({ range_end: payload.range_end, expiration_date: payload.expiration_date }).eq("id", editingNcf.id).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setNcfSequences((prev) => prev.map((n) => (n.id === data.id ? data : n)));
      setEditingNcf(null);
    } else {
      const { data, error } = await supabase.from("ncf_sequences").insert({ ...payload, company_id: companyId }).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setNcfSequences((prev) => [...prev, data]);
      setShowAddNcf(false);
    }
  };

  const toggleNcfActive = async (seq) => {
    const { data, error } = await supabase.from("ncf_sequences").update({ active: !seq.active }).eq("id", seq.id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setNcfSequences((prev) => prev.map((n) => (n.id === data.id ? data : n)));
  };

  const deleteNcfSequence = async (id) => {
    if (!window.confirm("¿Eliminar esta secuencia NCF? Solo hazlo si no se ha usado ningún número todavía.")) return;
    const { error } = await supabase.from("ncf_sequences").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setNcfSequences((prev) => prev.filter((n) => n.id !== id));
  };

  // ---- Facturación ----
  const createInvoice = async (payload, items) => {
    setSaving(true);
    // Todo ocurre en una sola función del servidor (create_invoice, ver crear-anular-factura-servidor.sql):
    // valida permisos, cliente, secuencia NCF (activa, con números, no vencida, tipo correcto para el
    // cliente) y descuento máximo; calcula subtotal/ITBIS/retención/total; reserva el NCF; inserta
    // factura y renglones; descuenta inventario; registra activos en garantía y marca la orden de
    // venta. Si algo falla no queda nada a medias y el NCF no se consume.
    // Los precios de los renglones van en la moneda de la factura (US$ si es en dólares).
    const header = {
      title: payload.title || null,
      client_id: payload.client_id,
      ncf_sequence_id: payload.ncf_sequence_id,
      branch_id: payload.branch_id || null,
      bank_account_id: payload.bank_account_id || null,
      invoice_date: payload.invoice_date,
      discount_pct: Number(payload.discount_pct) || 0,
      exempt_itbis: !!payload.exempt_itbis,
      applies_norma_0205: !!payload.applies_norma_0205,
      currency: payload.currency || "DOP",
      exchange_rate: payload.currency === "USD" ? Number(payload.exchange_rate) || 0 : 1,
      payment_terms: payload.payment_terms || null,
      notes: payload.notes || null,
      income_type: payload.income_type || "01",
    };
    const itemRows = items.map((it) => ({
      product_id: it.product_id || null,
      description: it.description,
      quantity: Number(it.quantity),
      unit_price: Number(it.unit_price),
      is_taxable: it.is_taxable !== false,
      chapter: it.chapter?.trim() || null,
      register_asset: !!it.register_asset,
      asset_serial: (it.asset_serial || "").trim() || null,
      asset_warranty_months: Number(it.asset_warranty_months) || 0,
    }));
    const { data: invoice, error } = await supabase.rpc("create_invoice", {
      p_invoice: header,
      p_items: itemRows,
      p_source_order_id: invoicePrefill?.sourceOrderId || null,
    });
    setSaving(false);
    if (error || !invoice) {
      setErrorMsg(`No se pudo emitir la factura: ${error?.message || "respuesta vacía del servidor"}. No se consumió ningún NCF.`);
      return false;
    }
    setInvoicePrefill(null);
    setShowAddInvoice(false);
    loadAll();
    return true;
  };

  // ---- Contratos recurrentes ----
  const saveRecurringContract = async (payload) => {
    setSaving(true);
    if (editingContract) {
      const { data, error } = await supabase.from("recurring_contracts").update(payload).eq("id", editingContract.id).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setRecurringContracts((prev) => prev.map((c) => (c.id === data.id ? data : c)));
      setEditingContract(null);
    } else {
      const { data, error } = await supabase.from("recurring_contracts").insert({ ...payload, company_id: companyId }).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setRecurringContracts((prev) => [...prev, data]);
      setShowAddContract(false);
    }
  };
  const deleteRecurringContract = async (id) => {
    if (!window.confirm("¿Eliminar este contrato recurrente? Esto no afecta las facturas ya generadas.")) return;
    const { error } = await supabase.from("recurring_contracts").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setRecurringContracts((prev) => prev.filter((c) => c.id !== id));
  };
  const generateContractInvoice = async (contract, overrideRate) => {
    if (contract.end_date && contract.end_date < todayStr) {
      setErrorMsg(`El contrato "${contract.title}" venció el ${fmtDate(contract.end_date)} y ya no genera facturas.`);
      return false;
    }
    if (!contract.ncf_sequence_id) {
      setErrorMsg(`El contrato "${contract.title}" no tiene una secuencia NCF asignada. Edítalo primero para indicarla.`);
      return false;
    }
    // Si el contrato está en USD, la factura generada hereda esa moneda (igual que una
    // factura manual en USD): los campos fiscales (subtotal/itbis/total) siguen en RD$,
    // y foreign_* llevan el equivalente en US$ para que se imprima y se vea como USD.
    // La tasa NO se reusa congelada del contrato: cada ciclo pide (o recibe por overrideRate)
    // la tasa del día, porque la DGII espera que cada factura refleje la tasa vigente al
    // momento de emitirla, no la que había cuando se creó el contrato meses atrás.
    const isUsdContract = contract.currency === "USD";
    const effectiveRate = isUsdContract ? Number(overrideRate ?? contract.exchange_rate ?? 1) : 1;
    const foreignSubtotal = isUsdContract ? Number(contract.foreign_amount || 0) : null;
    const subtotal = isUsdContract ? foreignSubtotal * effectiveRate : Number(contract.amount); // siempre en RD$ — ver nota de moneda en el formulario del contrato
    const itbis = contract.is_taxable ? subtotal * 0.18 : 0;
    const foreignItbis = isUsdContract ? (contract.is_taxable ? foreignSubtotal * 0.18 : 0) : null;
    const payload = {
      title: contract.title,
      client_id: contract.client_id,
      ncf_sequence_id: contract.ncf_sequence_id,
      branch_id: contract.branch_id || null,
      invoice_date: todayStr,
      discount_pct: 0,
      subtotal,
      itbis,
      exempt_itbis: !contract.is_taxable,
      applies_norma_0205: !!contract.applies_norma_0205 && !!contract.is_taxable,
      itbis_retained: 0, // lo calcula create_invoice
      total: subtotal + itbis,
      currency: contract.currency || "DOP",
      exchange_rate: effectiveRate,
      foreign_subtotal: foreignSubtotal,
      foreign_itbis: foreignItbis,
      foreign_total: isUsdContract ? foreignSubtotal + foreignItbis : null,
    };
    // Precio en la moneda de la factura (US$ si el contrato es en dólares): createInvoice lo
    // convierte a RD$ con la misma tasa, igual que una factura manual.
    const items = [{ product_id: null, description: contract.description || contract.title, quantity: 1, unit_price: isUsdContract ? foreignSubtotal : subtotal, is_taxable: contract.is_taxable, chapter: null }];

    // Reclama este ciclo de facturación de forma atómica ANTES de crear la factura: si dos
    // pestañas/usuarios disparan "Generar todas las vencidas" casi al mismo tiempo para el
    // mismo contrato, solo uno gana la reclamación (avanza next_invoice_date en la base de
    // datos con una condición que ya no se cumple para el segundo) y el otro no llega a
    // facturar. Antes next_invoice_date se avanzaba DESPUÉS de facturar, así que ambas
    // llamadas alcanzaban a crear su propia factura antes de que ninguna avanzara la fecha.
    const oldNextDate = contract.next_invoice_date;
    const { data: claimData, error: claimError } = await supabase.rpc("claim_contract_invoice_run", { p_contract_id: contract.id });
    const claimed = Array.isArray(claimData) ? claimData[0] : claimData;
    if (claimError || !claimed) {
      setErrorMsg(`El contrato "${contract.title}" ya no está pendiente de facturar (probablemente otra sesión ya lo generó).`);
      return false;
    }
    setRecurringContracts((prev) => prev.map((c) => (c.id === claimed.id ? claimed : c)));

    const ok = await createInvoice(payload, items);
    if (!ok) {
      // No se pudo facturar — revierte la reclamación para no dejar el contrato "saltado"
      // sin haber generado ninguna factura.
      const { data: reverted } = await supabase.from("recurring_contracts").update({ next_invoice_date: oldNextDate }).eq("id", contract.id).select().single();
      if (reverted) setRecurringContracts((prev) => prev.map((c) => (c.id === reverted.id ? reverted : c)));
      setErrorMsg(`No se pudo generar la factura del contrato "${contract.title}"; se revirtió la fecha de próxima facturación para poder reintentar.`);
      return false;
    }
    return true;
  };
  const generateOneContractInvoice = async (contract) => {
    if (contract.currency === "USD") {
      setExchangeRatePrompt({ mode: "single", contracts: [contract] });
      return;
    }
    setSaving(true);
    await generateContractInvoice(contract);
    setSaving(false);
  };
  const generateAllDueContracts = async () => {
    if (dueContracts.some((c) => c.currency === "USD")) {
      setExchangeRatePrompt({ mode: "batch", contracts: dueContracts });
      return;
    }
    setSaving(true);
    for (const c of dueContracts) await generateContractInvoice(c);
    setSaving(false);
  };
  // Confirmación del cuadro de tasa de cambio: aplica la tasa ingresada solo a los contratos
  // en USD del lote; los que están en RD$ (si el lote es "todas las vencidas" mixto) generan
  // con su flujo normal, sin tasa.
  const confirmExchangeRatePrompt = async (rate) => {
    const { contracts } = exchangeRatePrompt;
    setSaving(true);
    for (const c of contracts) await generateContractInvoice(c, c.currency === "USD" ? rate : undefined);
    setSaving(false);
    setExchangeRatePrompt(null);
  };

  // ---- Conciliación bancaria ----
  const importBankStatement = async (file) => {
    const XLSX = await loadXlsx();
    if (companyBankAccounts.length > 0 && !bankAccountFilter) {
      setErrorMsg("Antes de importar, elige arriba de qué cuenta bancaria es el estado de cuenta.");
      return;
    }
    setImportingBankStatement(true);
    setErrorMsg("");
    setBankImportMsg("");
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const pick = (row, names) => { for (const n of names) if (row[n] !== undefined && row[n] !== "") return row[n]; return ""; };
      const parseDate = (v) => {
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        if (typeof v === "number") { const d = XLSX.SSF.parse_date_code(v); return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`; }
        const s = String(v).trim();
        const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (m) return `${m[3]}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
        return s.slice(0, 10);
      };
      const parsedRows = rows.map((row) => {
        const dateVal = pick(row, ["Fecha", "Date", "fecha"]);
        const desc = pick(row, ["Descripción", "Descripcion", "Description", "Concepto", "descripcion"]);
        let amount = pick(row, ["Monto", "Amount", "monto"]);
        if (amount === "") {
          const credit = Number(pick(row, ["Crédito", "Credito", "Credit", "Depósito", "Deposito"])) || 0;
          const debit = Number(pick(row, ["Débito", "Debito", "Debit", "Retiro"])) || 0;
          amount = credit - debit;
        }
        return { transaction_date: parseDate(dateVal), description: String(desc || "").trim(), amount: Number(amount) || 0 };
      }).filter((r) => r.transaction_date && r.amount !== 0);

      if (parsedRows.length === 0) {
        setErrorMsg("No se encontraron filas válidas. El archivo debe tener columnas de Fecha, Descripción y Monto (o Crédito/Débito por separado).");
        return;
      }
      // Deduplicar también dentro del propio archivo (mismo movimiento repetido dos veces
      // en la misma hoja), además de contra lo que ya está en la base de datos (vía el
      // índice único company_id+transaction_date+description+amount y el upsert de abajo).
      const seen = new Set();
      const uniqueRows = [];
      for (const r of parsedRows) {
        const key = `${r.transaction_date}|${r.description}|${r.amount}`;
        if (seen.has(key)) continue;
        seen.add(key);
        uniqueRows.push(r);
      }
      const { data, error } = await supabase
        .from("bank_transactions")
        .upsert(uniqueRows.map((r) => ({ ...r, company_id: companyId, bank_account_id: bankAccountFilter || null })), {
          onConflict: "company_id,transaction_date,description,amount",
          ignoreDuplicates: true,
        })
        .select();
      if (error) { setErrorMsg(error.message); return; }
      setBankTransactions((prev) => [...(data || []), ...prev]);
      const importedCount = data?.length || 0;
      const skipped = parsedRows.length - importedCount;
      if (skipped > 0) {
        setBankImportMsg(`Se importaron ${importedCount} movimiento(s). Se omitieron ${skipped} por estar duplicados (misma fecha, descripción y monto que un movimiento ya importado).`);
      } else {
        setBankImportMsg(`Se importaron ${importedCount} movimiento(s).`);
      }
    } catch (err) {
      setErrorMsg("No se pudo leer el archivo: " + err.message);
    } finally {
      setImportingBankStatement(false);
    }
  };

  const bankMatchCandidate = (tx) => {
    const txDate = new Date(`${tx.transaction_date}T00:00:00`).getTime();
    const withinDays = (dateStr, days) => Math.abs(new Date(dateStr).getTime() - txDate) <= days * 86400000;
    const closeAmount = (a, b) => Math.abs(Number(a) - Number(b)) < 1;
    const byDateDistance = (dateKey) => (a, b) => Math.abs(new Date(a[dateKey]) - txDate) - Math.abs(new Date(b[dateKey]) - txDate);
    // Lo que ya está conciliado con otro movimiento no se vuelve a sugerir
    const taken = new Set(bankTransactions.filter((t) => t.is_reconciled && t.matched_id && t.id !== tx.id).map((t) => `${t.matched_type}:${t.matched_id}`));
    const free = (type, id) => !taken.has(`${type}:${id}`);
    const account = companyBankAccounts.find((a) => a.id === tx.bank_account_id) || null;
    const accountCurrency = account?.currency || "DOP";
    // Un cobro sirve si no fue en efectivo (el efectivo no pasa por el banco) y, si se indicó la
    // cuenta de destino, es esta misma cuenta.
    const paymentFitsAccount = (p) => p.method !== "Efectivo" && !isRetentionMethod(p.method) && (!p.bank_account_id || !tx.bank_account_id || p.bank_account_id === tx.bank_account_id);
    if (tx.amount > 0) {
      const candidates = invoicePaymentsAll.filter((p) => {
        if (!paymentFitsAccount(p) || !free("invoice_payment", p.id)) return false;
        if (!withinDays(p.payment_date, BANK_MATCH_WINDOW_DAYS)) return false;
        // Cuenta en US$: se compara contra los dólares recibidos. Cuenta en RD$: contra los pesos
        // reales del día (monto aplicado + diferencia cambiaria).
        if (accountCurrency === "USD") return p.currency === "USD" && closeAmount(p.foreign_amount, tx.amount);
        return closeAmount(Number(p.amount || 0) + Number(p.fx_difference || 0), tx.amount);
      });
      if (candidates.length === 0) return null;
      const inv = (id) => invoices.find((i) => i.id === id);
      const best = candidates.sort(byDateDistance("payment_date"))[0];
      const shown = accountCurrency === "USD" ? `US$ ${Number(best.foreign_amount || 0).toFixed(2)}` : fmtMoney(Number(best.amount || 0) + Number(best.fx_difference || 0));
      return { type: "invoice_payment", id: best.id, label: `Cobro factura ${inv(best.invoice_id)?.ncf || ""} — ${shown}` };
    } else {
      if (accountCurrency === "USD") return null; // los pagos a proveedores y gastos se registran en RD$
      const absAmt = Math.abs(tx.amount);
      const ppCandidates = purchasePaymentsAll.filter((p) => free("purchase_payment", p.id) && !/efectivo/i.test(p.method || "") && closeAmount(p.amount, absAmt) && withinDays(p.payment_date, BANK_MATCH_WINDOW_DAYS));
      if (ppCandidates.length > 0) {
        const sup = (purchaseId) => { const pu = purchases.find((x) => x.id === purchaseId); return suppliers.find((sp) => sp.id === pu?.supplier_id)?.name || ""; };
        const best = ppCandidates.sort(byDateDistance("payment_date"))[0];
        return { type: "purchase_payment", id: best.id, label: `Pago a ${sup(best.purchase_id)} — ${fmtMoney(best.amount)}` };
      }
      const expCandidates = otherExpenses.filter((e) => free("other_expense", e.id) && e.forma_pago !== "01" && closeAmount(e.amount, absAmt) && withinDays(e.expense_date, BANK_MATCH_WINDOW_DAYS));
      if (expCandidates.length > 0) {
        const best = expCandidates.sort(byDateDistance("expense_date"))[0];
        return { type: "other_expense", id: best.id, label: `Gasto: ${best.description} — ${fmtMoney(best.amount)}` };
      }
      return null;
    }
  };

  const reconcileTransaction = async (tx, matchedType, matchedId) => {
    const { data, error } = await supabase.from("bank_transactions").update({ is_reconciled: true, matched_type: matchedType, matched_id: matchedId }).eq("id", tx.id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setBankTransactions((prev) => prev.map((t) => (t.id === data.id ? data : t)));
  };
  const unreconcileTransaction = async (tx) => {
    const { data, error } = await supabase.from("bank_transactions").update({ is_reconciled: false, matched_type: null, matched_id: null }).eq("id", tx.id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setBankTransactions((prev) => prev.map((t) => (t.id === data.id ? data : t)));
  };
  const deleteBankTransaction = async (id) => {
    if (!window.confirm("¿Eliminar esta transacción bancaria importada?")) return;
    const { error } = await supabase.from("bank_transactions").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setBankTransactions((prev) => prev.filter((t) => t.id !== id));
  };

  // La anulación pide el motivo (va al 608) y la hace void_invoice en el servidor: solo admin,
  // devuelve el inventario en la misma transacción y no permite anular con cobros o notas de crédito.
  const voidInvoice = (invoice) => setVoidingInvoice(invoice);
  const confirmVoidInvoice = async (invoice, reasonCode, reason) => {
    setSaving(true);
    const { error } = await supabase.rpc("void_invoice", { p_invoice_id: invoice.id, p_reason_code: reasonCode, p_reason: reason || null });
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    setVoidingInvoice(null);
    setInvoiceDetail(null);
    loadAll();
  };

  // Junta los comprobantes (invoice_payment_attachments) a cada pago, agrupados por payment_id
  const attachPaymentAttachments = async (paymentsList) => {
    if (!paymentsList || paymentsList.length === 0) return paymentsList || [];
    const { data: attsRaw, error } = await supabase.from("invoice_payment_attachments").select("*").in("payment_id", paymentsList.map((p) => p.id)).order("uploaded_at");
    if (error) { setErrorMsg(error.message); return paymentsList; }
    const atts = await refreshSignedUrls(attsRaw || [], "file_path", "file_url");
    const byPayment = new Map();
    (atts || []).forEach((a) => {
      if (!byPayment.has(a.payment_id)) byPayment.set(a.payment_id, []);
      byPayment.get(a.payment_id).push(a);
    });
    const { data: cardRows } = await supabase.from("invoice_payment_card_details").select("*").in("payment_id", paymentsList.map((p) => p.id));
    const cardByPayment = new Map((cardRows || []).map((c) => [c.payment_id, c]));
    return paymentsList.map((p) => ({ ...p, attachments: byPayment.get(p.id) || [], card: cardByPayment.get(p.id) || null }));
  };

  const openInvoiceDetail = async (invoice) => {
    const { data: items } = await supabase.from("invoice_items").select("*").eq("invoice_id", invoice.id);
    const { data: payments } = await supabase.from("invoice_payments").select("*").eq("invoice_id", invoice.id).order("payment_date");
    const paymentsWithAttachments = await attachPaymentAttachments(payments || []);
    setInvoiceDetail({ invoice, items: items || [], payments: paymentsWithAttachments });
  };

  // ---- Notas de crédito ----
  const createCreditNote = async (payload, items) => {
    setSaving(true);
    // Mismo mecanismo atómico que en createInvoice — ver ese comentario.
    const { data: seqData, error: seqError } = await supabase.rpc("allocate_ncf", { p_sequence_id: payload.ncf_sequence_id });
    const allocated = Array.isArray(seqData) ? seqData[0] : seqData;
    if (seqError || !allocated) {
      setSaving(false);
      setErrorMsg("Esta secuencia NCF ya no tiene números disponibles.");
      return;
    }
    const ncf = allocated.ncf;

    const { data: note, error: noteError } = await supabase.from("credit_notes").insert({ ...payload, company_id: companyId, ncf, status: "emitida" }).select().single();
    if (noteError) {
      setSaving(false);
      setErrorMsg(`No se pudo crear la nota de crédito: ${noteError.message}. El NCF ${ncf} ya quedó reservado en la secuencia y no se reutilizará.`);
      return;
    }

    const itemRows = items.map((it) => ({
      credit_note_id: note.id,
      product_id: it.product_id || null,
      description: it.description,
      quantity: Number(it.quantity),
      unit_price: Number(it.unit_price),
      is_taxable: it.is_taxable,
      subtotal: Number(it.quantity) * Number(it.unit_price),
      foreign_unit_price: it.noteRate ? Number(it.unit_price) / it.noteRate : null,
      foreign_subtotal: it.noteRate ? (Number(it.quantity) * Number(it.unit_price)) / it.noteRate : null,
    }));
    const { error: itemsError } = await supabase.from("credit_note_items").insert(itemRows);
    if (itemsError) { setSaving(false); setErrorMsg(itemsError.message); return; }

    // apply_credit_to_invoice bloquea la fila de la factura (evitando que dos notas de
    // crédito simultáneas se pisen entre sí, igual que pasaba antes con el stock/NCF) y
    // rechaza la operación si el crédito aplicado dejaría el saldo de la factura en negativo
    // — antes esto se calculaba en el cliente sin ningún límite.
    const targetInvoice = invoices.find((i) => i.id === payload.invoice_id);
    if (targetInvoice) {
      const { data: updatedInvoice, error: creditError } = await supabase.rpc("apply_credit_to_invoice", { p_invoice_id: targetInvoice.id, p_amount: payload.total });
      if (creditError) {
        setSaving(false);
        setErrorMsg(`La nota de crédito ${ncf} se creó, pero no se pudo aplicar a la factura: ${creditError.message}. Revísalo manualmente.`);
        return;
      }
      if (updatedInvoice) setInvoices((prev) => prev.map((i) => (i.id === updatedInvoice.id ? updatedInvoice : i)));
    }

    setSaving(false);
    setShowAddCreditNote(false);
    loadAll();
  };

  const openCreditNoteDetail = async (note) => {
    const { data: items } = await supabase.from("credit_note_items").select("*").eq("credit_note_id", note.id);
    setCreditNoteDetail({ note, items: items || [] });
  };

  const registerPayment = async (invoice, payload, files) => {
    setSaving(true);
    // register_invoice_payment hace, de forma atómica y verificando permiso del lado del servidor
    // (en vez de confiar solo en el botón "Registrar pago" oculto por canEdit en la UI):
    // 1) confirma que quien llama tiene permiso de "invoices", 2) inserta el pago,
    // 3) recalcula amount_paid/payment_status de la factura. Esto también elimina la
    // condición de carrera que había al leer-y-recalcular el total pagado desde el cliente.
    const { data: result, error: payError } = await supabase.rpc("register_invoice_payment", {
      p_invoice_id: invoice.id,
      p_amount: payload.amount,
      p_method: payload.method,
      p_payment_date: payload.payment_date,
      p_notes: payload.notes,
      p_currency: payload.currency || "DOP",
      p_foreign_amount: payload.currency === "USD" ? payload.foreign_amount : null,
      p_payment_rate: payload.currency === "USD" ? payload.payment_rate : null,
      p_bank_account_id: payload.bank_account_id || null,
    });
    const resultRow = Array.isArray(result) ? result[0] : result;
    if (payError || !resultRow) { setSaving(false); setErrorMsg(payError?.message || "No se pudo registrar el pago."); return; }

    if (payload.card) {
      const { error: cardError } = await supabase.from("invoice_payment_card_details").insert({ ...payload.card, payment_id: resultRow.payment_id, company_id: companyId });
      if (cardError) setErrorMsg(`El pago se registró, pero no se guardaron los datos del voucher de tarjeta: ${cardError.message}`);
    }

    if (files && files.length > 0) {
      for (const file of files) {
        const upFile = await compressImage(file);
        const ext = upFile.name.split(".").pop();
        const path = `payments/${companyId}/${resultRow.payment_id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const { error: upError } = await supabase.storage.from("evidence").upload(path, upFile);
        if (upError) { setErrorMsg(`No se pudo subir ${file.name}: ${upError.message}`); continue; }
        const { data: signed, error: signError } = await supabase.storage.from("evidence").createSignedUrl(path, 604800);
        if (signError) { setErrorMsg(`Se subió ${file.name} pero no se pudo generar el enlace: ${signError.message}`); continue; }
        const { error: attError } = await supabase.from("invoice_payment_attachments").insert({ payment_id: resultRow.payment_id, file_url: signed.signedUrl, file_path: path, file_name: upFile.name });
        if (attError) setErrorMsg(`Se subió ${file.name} pero no se pudo vincular al pago: ${attError.message}`);
      }
    }

    const { data: allPayments } = await supabase.from("invoice_payments").select("*").eq("invoice_id", invoice.id).order("payment_date");
    const paymentsWithAttachments = await attachPaymentAttachments(allPayments || []);
    const { data: updated, error: updError } = await supabase.from("invoices").select("*").eq("id", invoice.id).single();
    setSaving(false);
    if (updError) { setErrorMsg(updError.message); return; }
    if (updated) setInvoices((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    setInvoiceDetail((prev) => (prev ? { ...prev, invoice: updated || prev.invoice, payments: paymentsWithAttachments } : prev));
  };

  const deletePayment = async (payment, invoice) => {
    if (!window.confirm("¿Eliminar este pago registrado? También se quitarán sus comprobantes.")) return;
    // Mismo respaldo del lado del servidor que register_invoice_payment — verifica permiso
    // "invoices" y recalcula el saldo de la factura de forma atómica.
    const { data: updated, error: delError } = await supabase.rpc("delete_invoice_payment", { p_payment_id: payment.id });
    if (delError) { setErrorMsg(delError.message); return; }

    const { data: allPayments } = await supabase.from("invoice_payments").select("*").eq("invoice_id", invoice.id).order("payment_date");
    const paymentsWithAttachments = await attachPaymentAttachments(allPayments || []);
    if (updated) setInvoices((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    setInvoiceDetail((prev) => (prev ? { ...prev, invoice: updated || prev.invoice, payments: paymentsWithAttachments } : prev));
  };

  const deletePaymentAttachment = async (attachment, payment) => {
    if (!window.confirm(`¿Quitar "${attachment.file_name || "este comprobante"}" del pago?`)) return;
    const { data, error } = await supabase.from("invoice_payment_attachments").delete().eq("id", attachment.id).select();
    if (error) { setErrorMsg(error.message); return; }
    if (!data || data.length === 0) {
      setErrorMsg("No se pudo quitar el comprobante: la base de datos no eliminó ningún registro (probablemente falta un permiso DELETE en invoice_payment_attachments).");
      return;
    }
    setInvoiceDetail((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        payments: prev.payments.map((p) => (p.id === payment.id ? { ...p, attachments: (p.attachments || []).filter((a) => a.id !== attachment.id) } : p)),
      };
    });
  };

  // ---- Caja (apertura/cierre y cuadre por sucursal) ----
  const openCashSession = async (branchId, openingAmount, openingUsd = 0) => {
    setSaving(true);
    // open_cash_session verifica del lado del servidor que quien llama tenga permiso de "caja"
    // y que no haya ya una caja abierta en esa sucursal, en vez de confiar solo en el botón
    // deshabilitado (disabled={!canEdit("caja")}) de la interfaz.
    const { data, error } = await supabase.rpc("open_cash_session", { p_branch_id: branchId, p_opening_amount: openingAmount, p_opening_amount_usd: openingUsd });
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    setCashSessions((prev) => [data, ...prev]);
    setShowOpenCaja(false);
  };

  const closeCashSession = async (session, declared) => {
    setSaving(true);
    // close_cash_session recalcula los montos esperados y verifica permiso de "caja" del lado
    // del servidor (mismo respaldo que open_cash_session).
    const { data, error } = await supabase.rpc("close_cash_session", {
      p_session_id: session.id,
      p_declared_cash: declared.cash,
      p_declared_card: declared.card,
      p_declared_transfer: declared.transfer,
      p_notes: declared.notes || null,
      p_declared_cash_usd: declared.cashUsd || 0,
    });
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    setCashSessions((prev) => prev.map((s) => (s.id === data.id ? data : s)));
    setShowCloseCaja(false);
  };

  useEffect(() => {
    if (view !== "caja") return;
    const activeBranchId = isVendedor ? profile.branch_id : (cajaBranch || branches[0]?.id);
    const openSession = cashSessions.find((s) => s.branch_id === activeBranchId && s.status === "abierta");
    if (!openSession) { setSessionPayments([]); return; }
    (async () => {
      const { data } = await fetchAllRows(() => supabase.from("invoice_payments").select("id, invoice_id, amount, method, payment_date, currency, foreign_amount, fx_difference").eq("cash_session_id", openSession.id).order("payment_date", { ascending: false }));
      const list = data || [];
      const cardIds = list.filter((p) => p.method === "Tarjeta").map((p) => p.id);
      let cardByPayment = new Map();
      if (cardIds.length > 0) {
        const { data: cardRows } = await supabase.from("invoice_payment_card_details").select("*").in("payment_id", cardIds);
        cardByPayment = new Map((cardRows || []).map((c) => [c.payment_id, c]));
      }
      setSessionPayments(list.map((p) => ({ ...p, card: cardByPayment.get(p.id) || null })));
    })();
  }, [view, cajaBranch, cashSessions, branches, isVendedor, profile.branch_id]);

  // ---- Cotizaciones ----
  const createQuote = async (payload, items, linkedIncidentId) => {
    setSaving(true);
    // Contador atómico en base de datos — igual que en createInvoice — en vez de
    // "quotes.length + 1", que se podía duplicar con dos pestañas/usuarios simultáneos.
    const { data: quoteNumData, error: quoteNumError } = await supabase.rpc("next_document_number", { p_doc_type: "quote" });
    if (quoteNumError) { setSaving(false); setErrorMsg(`No se pudo generar el número de cotización: ${quoteNumError.message}`); return; }
    const quote_number = `COT-${String(quoteNumData).padStart(4, "0")}`;
    const { data: quote, error: quoteError } = await supabase.from("quotes").insert({ ...payload, company_id: companyId, quote_number, status: "pendiente" }).select().single();
    if (quoteError) { setSaving(false); setErrorMsg(quoteError.message); return; }

    const itemRows = items.map((it) => ({
      quote_id: quote.id,
      product_id: it.product_id || null,
      description: it.description,
      quantity: Number(it.quantity),
      unit_price: Number(it.unit_price),
      is_taxable: it.is_taxable,
      subtotal: Number(it.quantity) * Number(it.unit_price),
      chapter: it.chapter?.trim() || null,
    }));
    const { error: itemsError } = await supabase.from("quote_items").insert(itemRows);
    setSaving(false);
    if (itemsError) { setErrorMsg(itemsError.message); return; }
    setShowAddQuote(false);
    setQuotePrefill(null);
    if (linkedIncidentId) {
      await supabase.from("incidents").update({ quote_id: quote.id, status: "convertido" }).eq("id", linkedIncidentId);
    }
    loadAll();
  };

  const markQuoteStatus = async (quote, status) => {
    const { data, error } = await supabase.from("quotes").update({ status }).eq("id", quote.id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setQuotes((prev) => prev.map((q) => (q.id === data.id ? data : q)));
    setQuoteDetail((prev) => (prev ? { ...prev, quote: data } : prev));
  };

  const deleteQuote = async (quote) => {
    if (!window.confirm(`¿Eliminar definitivamente la cotización ${quote.quote_number || ""}? Esta acción no se puede deshacer.`)) return;
    const { error } = await supabase.from("quotes").delete().eq("id", quote.id);
    if (error) { setErrorMsg(error.message); return; }
    setQuotes((prev) => prev.filter((q) => q.id !== quote.id));
    setQuoteDetail(null);
  };

  // ---- Órdenes comerciales (cotización aprobada -> orden -> factura) ----
  const convertQuoteToOrder = async (quote, items) => {
    setSaving(true);
    const { data: existing } = await supabase.from("sales_orders").select("id").eq("quote_id", quote.id).neq("status", "cancelada");
    if (existing && existing.length > 0) {
      setSaving(false);
      setErrorMsg("Esta cotización ya tiene una orden de venta activa.");
      setQuoteDetail(null);
      loadAll();
      return;
    }
    // Mismo contador atómico que factura/cotización, en vez de "salesOrders.length + 1".
    const { data: orderNumData, error: orderNumError } = await supabase.rpc("next_document_number", { p_doc_type: "sales_order" });
    if (orderNumError) { setSaving(false); setErrorMsg(`No se pudo generar el número de orden de venta: ${orderNumError.message}`); return; }
    const order_number = `ORD-${String(orderNumData).padStart(4, "0")}`;
    const { data: order, error: orderError } = await supabase.from("sales_orders").insert({
      company_id: companyId, client_id: quote.client_id, quote_id: quote.id, order_number, branch_id: quote.branch_id || null,
      title: quote.title, subtotal: quote.subtotal, itbis: quote.itbis, total: quote.total, status: "en_proceso", notes: quote.notes || null,
    }).select().single();
    if (orderError) { setSaving(false); setErrorMsg(orderError.message); return; }

    const itemRows = items.map((it) => ({
      sales_order_id: order.id,
      product_id: it.product_id || null,
      description: it.description,
      quantity: Number(it.quantity),
      unit_price: Number(it.unit_price),
      is_taxable: it.is_taxable,
      subtotal: Number(it.quantity) * Number(it.unit_price),
      chapter: it.chapter || null,
    }));
    const { error: itemsError } = await supabase.from("sales_order_items").insert(itemRows);
    if (itemsError) { setSaving(false); setErrorMsg(itemsError.message); return; }

    await supabase.from("quotes").update({ status: "en_orden" }).eq("id", quote.id);
    setSaving(false);
    setQuoteDetail(null);
    loadAll();
  };

  const openSalesOrderDetail = async (order) => {
    const { data: items } = await supabase.from("sales_order_items").select("*").eq("sales_order_id", order.id);
    setSalesOrderDetail({ order, items: items || [] });
  };

  const convertSalesOrderToWorkOrder = (order) => {
    setOrderFromSalesOrder({ salesOrderId: order.id, title: order.title || `Trabajo — ${order.order_number}`, branch_id: "", equipment_id: "", client_id: order.client_id || "" });
    setSalesOrderDetail(null);
  };

  const generateInvoiceFromOrder = (order, items) => {
    setInvoicePrefill({
      client_id: order.client_id,
      branch_id: order.branch_id || "",
      sourceOrderId: order.id,
      title: order.title,
      notes: order.notes || "",
      items: items.map((it) => ({ product_id: it.product_id || "", description: it.description, quantity: it.quantity, unit_price: it.unit_price, is_taxable: it.is_taxable, chapter: it.chapter || "" })),
    });
    setSalesOrderDetail(null);
    setShowAddInvoice(true);
  };

  const updateSalesOrderNotes = async (order, notes) => {
    const { data, error } = await supabase.from("sales_orders").update({ notes: notes.trim() || null }).eq("id", order.id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setSalesOrders((prev) => prev.map((o) => (o.id === data.id ? data : o)));
    setSalesOrderDetail((prev) => (prev ? { ...prev, order: data } : prev));
  };

  const cancelSalesOrder = async (order) => {
    if (!window.confirm("¿Cancelar esta orden de venta? Si viene de una cotización, esa cotización volverá a quedar editable.")) return;
    const { data, error } = await supabase.from("sales_orders").update({ status: "cancelada" }).eq("id", order.id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setSalesOrders((prev) => prev.map((o) => (o.id === data.id ? data : o)));
    setSalesOrderDetail(null);
    if (order.quote_id) {
      await supabase.rpc("revert_quote_on_order_cancel", { order_id_param: order.id });
      const { data: revertedQuote } = await supabase.from("quotes").select("*").eq("id", order.quote_id).single();
      if (revertedQuote) setQuotes((prev) => prev.map((q) => (q.id === revertedQuote.id ? revertedQuote : q)));
    }
  };

  const deleteSalesOrder = async (order) => {
    if (!window.confirm("¿Eliminar definitivamente esta orden de venta cancelada?")) return;
    const { error } = await supabase.from("sales_orders").delete().eq("id", order.id);
    if (error) { setErrorMsg(error.message); return; }
    setSalesOrders((prev) => prev.filter((o) => o.id !== order.id));
    setSalesOrderDetail(null);
  };

  const deleteSalesOrdersBulk = async (ids) => {
    if (ids.length === 0) return;
    if (!window.confirm(`¿Eliminar definitivamente ${ids.length} orden${ids.length !== 1 ? "es" : ""} de venta cancelada${ids.length !== 1 ? "s" : ""}?`)) return;
    const { error } = await supabase.from("sales_orders").delete().in("id", ids);
    if (error) { setErrorMsg(error.message); return; }
    setSalesOrders((prev) => prev.filter((o) => !ids.includes(o.id)));
    setSelectedSalesOrders(new Set());
  };

  const openQuoteDetail = async (quote) => {
    const { data: items } = await supabase.from("quote_items").select("*").eq("quote_id", quote.id);
    setQuoteDetail({ quote, items: items || [] });
  };

  const openEditQuote = (quote, items) => {
    setEditingQuote(quote);
    setEditingQuoteItems(items);
    setQuoteDetail(null);
  };

  const updateQuote = async (payload, items) => {
    setSaving(true);
    const { error: delError } = await supabase.from("quote_items").delete().eq("quote_id", editingQuote.id);
    if (delError) { setSaving(false); setErrorMsg(delError.message); return; }

    const itemRows = items.map((it) => ({
      quote_id: editingQuote.id,
      product_id: it.product_id || null,
      description: it.description,
      quantity: Number(it.quantity),
      unit_price: Number(it.unit_price),
      is_taxable: it.is_taxable,
      subtotal: Number(it.quantity) * Number(it.unit_price),
      chapter: it.chapter?.trim() || null,
    }));
    const { error: itemsError } = await supabase.from("quote_items").insert(itemRows);
    if (itemsError) { setSaving(false); setErrorMsg(itemsError.message); return; }

    const { error: updError } = await supabase.from("quotes").update(payload).eq("id", editingQuote.id);
    setSaving(false);
    if (updError) { setErrorMsg(updError.message); return; }
    setEditingQuote(null);
    setEditingQuoteItems(null);
    loadAll();
  };

  // ---- Incidentes ----
  const saveIncident = async (payload) => {
    setSaving(true);
    if (editingIncident) {
      const { data, error } = await supabase.from("incidents").update(payload).eq("id", editingIncident.id).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setIncidents((prev) => prev.map((i) => (i.id === data.id ? data : i)));
      setEditingIncident(null);
    } else {
      const { data, error } = await supabase.from("incidents").insert({ ...payload, company_id: companyId, status: "abierto" }).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setIncidents((prev) => [data, ...prev]);
      setShowAddIncident(false);
      setIncidentPrefill(null);
    }
  };

  // Se crea desde un punto de checklist "No OK" o con una lectura numérica fuera del rango
  // esperado, para que quede reportado sin que el técnico tenga que salir de la orden.
  const createIncidentFromChecklist = async (order, item, valueText) => {
    const rangeNote = (item.range_min != null || item.range_max != null)
      ? ` (rango esperado ${item.range_min ?? "—"} a ${item.range_max ?? "—"})`
      : "";
    const payload = {
      title: `Checklist — ${item.text}`.slice(0, 200),
      description: `Orden ${order.code}: el punto "${item.text}" del checklist se registró como "${valueText}"${rangeNote}.`,
      branch_id: order.branch_id || null,
      equipment_id: order.equipment_id || null,
      client_id: order.client_id || null,
      technician_id: order.technician_id || null,
      priority: "media",
    };
    const { data, error } = await supabase.from("incidents").insert({ ...payload, company_id: companyId, status: "abierto" }).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setIncidents((prev) => [data, ...prev]);
  };

  const deleteIncident = async (id) => {
    if (!window.confirm("¿Eliminar este incidente?")) return;
    const { error } = await supabase.from("incidents").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setIncidents((prev) => prev.filter((i) => i.id !== id));
    setIncidentDetail(null);
  };

  const markIncidentStatus = async (incident, status) => {
    const payload = { status };
    if (status === "en_revision" && !incident.attended_at) payload.attended_at = new Date().toISOString();
    const { data, error } = await supabase.from("incidents").update(payload).eq("id", incident.id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setIncidents((prev) => prev.map((i) => (i.id === data.id ? data : i)));
    setIncidentDetail((prev) => (prev ? data : prev));
  };
  const saveIncidentProgress = async (incident, findings) => {
    const { data, error } = await supabase.from("incidents").update({ findings }).eq("id", incident.id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setIncidents((prev) => prev.map((i) => (i.id === data.id ? data : i)));
    setIncidentDetail((prev) => (prev ? data : prev));
  };
  const assignIncidentTechnician = async (id, technicianId) => {
    const { data, error } = await supabase.from("incidents").update({ technician_id: technicianId || null }).eq("id", id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setIncidents((prev) => prev.map((i) => (i.id === data.id ? data : i)));
    setIncidentDetail((prev) => (prev ? data : prev));
    if (technicianId) {
      await notifyManyTechnicians([technicianId], {
        title: `Te asignaron el incidente: ${data.title}`,
        body: data.description || "",
        link_view: "incidents",
        category: "incident_assigned",
      });
    }
  };
  const completeIncident = async (incident, findings) => {
    const payload = { findings, status: "resuelto", completed_at: new Date().toISOString() };
    if (!incident.attended_at) payload.attended_at = payload.completed_at;
    const { data, error } = await supabase.from("incidents").update(payload).eq("id", incident.id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setIncidents((prev) => prev.map((i) => (i.id === data.id ? data : i)));
    setIncidentDetail((prev) => (prev ? data : prev));
  };
  const reopenIncident = async (incident) => {
    const { data, error } = await supabase.from("incidents").update({ status: "abierto", completed_at: null }).eq("id", incident.id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setIncidents((prev) => prev.map((i) => (i.id === data.id ? data : i)));
    setIncidentDetail((prev) => (prev ? data : prev));
  };

  const convertIncidentToOrder = (incident) => {
    setOrderFromIncident({ incidentId: incident.id, title: incident.title, branch_id: incident.branch_id || "", equipment_id: incident.equipment_id || "", client_id: incident.client_id || "" });
    setIncidentDetail(null);
  };

  const convertIncidentToQuote = (incident) => {
    setQuotePrefill({
      incidentId: incident.id,
      client_id: incident.client_id || "",
      items: [{ product_id: "", description: incident.title, quantity: 1, unit_price: 0, is_taxable: true }],
    });
    setIncidentDetail(null);
    setShowAddQuote(true);
  };

  const duplicateQuote = (quote, items) => {
    setQuotePrefill({
      client_id: quote.client_id,
      items: items.map((it) => ({
        product_id: it.product_id || "",
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unit_price,
        is_taxable: it.is_taxable,
        chapter: it.chapter || "",
      })),
    });
    setQuoteDetail(null);
    setShowAddQuote(true);
  };

  // ---- Técnicos ----
  const saveTech = async (name, specialty, branchId, canCreateIncidents, hourlyRate, extraBranchIds) => {
    setSaving(true);
    if (editingTech) {
      const { data, error } = await supabase.from("technicians").update({ name, specialty, branch_id: branchId, can_create_incidents: canCreateIncidents, hourly_rate: hourlyRate, extra_branch_ids: extraBranchIds || [] }).eq("id", editingTech.id).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setTechnicians((prev) => prev.map((t) => (t.id === data.id ? data : t)));
      setEditingTech(null);
    } else {
      const { data, error } = await supabase.from("technicians").insert({ company_id: companyId, branch_id: branchId, name, specialty, can_create_incidents: canCreateIncidents, hourly_rate: hourlyRate, extra_branch_ids: extraBranchIds || [] }).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setTechnicians((prev) => [...prev, data]);
      setShowAddTech(false);
    }
  };

  const deleteTech = async (id) => {
    const tech = technicians.find((t) => t.id === id);

    // Ya está dado de baja: este mismo botón lo reactiva.
    if (tech?.is_active === false) {
      const { data, error } = await supabase.from("technicians").update({ is_active: true }).eq("id", id).select().single();
      if (error) { setErrorMsg(error.message); return; }
      setTechnicians((prev) => prev.map((t) => (t.id === id ? data : t)));
      return;
    }

    // ¿Tiene historial que se perdería con un borrado real?
    const hasHistory =
      orders.some((o) => o.technician_id === id) ||
      orderTechnicians.some((wt) => wt.technician_id === id) ||
      incidents.some((i) => i.technician_id === id) ||
      tools.some((t) => t.technician_id === id) ||
      equipment.some((e) => e.default_technician_id === id) ||
      clientAssets.some((a) => a.default_technician_id === id) ||
      projects.some((p) => p.lead_technician_id === id);

    if (hasHistory) {
      if (!window.confirm(
        "Este técnico tiene órdenes, incidentes, herramientas, equipos o proyectos asociados — eliminarlo por completo borraría o dañaría ese historial (incluyendo costos ya facturados).\n\n¿Darlo de baja en su lugar? Dejará de aparecer para asignar trabajo nuevo, pero su nombre se conserva en el historial, órdenes y facturas ya existentes. Podrás reactivarlo después si vuelve a trabajar contigo."
      )) return;
      const { data, error } = await supabase.from("technicians").update({ is_active: false }).eq("id", id).select().single();
      if (error) { setErrorMsg(error.message); return; }
      setTechnicians((prev) => prev.map((t) => (t.id === id ? data : t)));
      // Las herramientas que tenía asignadas se liberan para que otro técnico las pueda tomar;
      // no se tocan sus órdenes, incidentes ni el resto del historial.
      const assignedTools = tools.filter((t) => t.technician_id === id);
      if (assignedTools.length > 0) {
        const { data: releasedTools, error: toolsError } = await supabase.from("tools")
          .update({ technician_id: null, status: "disponible" })
          .eq("technician_id", id)
          .select();
        if (toolsError) {
          setErrorMsg(`El técnico se dio de baja, pero no se pudieron liberar sus herramientas: ${toolsError.message}`);
        } else {
          setTools((prev) => prev.map((t) => releasedTools.find((u) => u.id === t.id) || t));
        }
      }
      // Si alguna de esas herramientas llegó por un préstamo aún no devuelto, se cierra ese
      // préstamo también — si no, quedaría "abierto" para siempre en el historial aunque la
      // herramienta ya se liberó arriba.
      const openLoanIds = toolLoans.filter((l) => l.to_technician_id === id && !l.returned_at).map((l) => l.id);
      if (openLoanIds.length > 0) {
        const { data: closedLoans, error: loanError } = await supabase.from("tool_loans")
          .update({ returned_at: new Date().toISOString() })
          .in("id", openLoanIds)
          .select();
        if (!loanError && closedLoans) {
          setToolLoans((prev) => prev.map((l) => closedLoans.find((u) => u.id === l.id) || l));
        }
      }
      return;
    }

    // Sin ningún historial asociado: se puede eliminar de verdad, sin dejar nada huérfano.
    if (!window.confirm("¿Eliminar este técnico? No tiene órdenes, incidentes ni otro historial asociado, así que se borrará por completo.")) return;
    const { error } = await supabase.from("technicians").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setTechnicians((prev) => prev.filter((t) => t.id !== id));
  };

  // ---- Equipos ----
  const saveEquipment = async (payload) => {
    setSaving(true);
    if (editingEquipment) {
      const { data, error } = await supabase.from("equipment").update(payload).eq("id", editingEquipment.id).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setEquipment((prev) => prev.map((e) => (e.id === data.id ? data : e)));
      setEditingEquipment(null);
    } else {
      const { data, error } = await supabase.from("equipment").insert({ ...payload, company_id: companyId }).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setEquipment((prev) => [...prev, data]);
      setShowAddEquipment(false);
    }
  };

  const deleteEquipment = async (id) => {
    if (!window.confirm("¿Eliminar este equipo?")) return;
    const { error } = await supabase.from("equipment").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setEquipment((prev) => prev.filter((e) => e.id !== id));
  };

  const bulkDeleteEquipment = async (ids) => {
    if (ids.length === 0) return;
    if (!window.confirm(`¿Eliminar ${ids.length} equipo${ids.length !== 1 ? "s" : ""} seleccionado${ids.length !== 1 ? "s" : ""}? Esta acción no se puede deshacer.`)) return;
    const { error } = await supabase.from("equipment").delete().in("id", ids);
    if (error) { setErrorMsg(error.message); return; }
    setEquipment((prev) => prev.filter((e) => !ids.includes(e.id)));
    setSelectedEquipment(new Set());
  };

  const addLocation = async (name, branchId) => {
    setSaving(true);
    const { data, error } = await supabase.from("locations").insert({ company_id: companyId, branch_id: branchId, name }).select().single();
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    setLocations((prev) => [...prev, data]);
    setShowAddLocation(false);
  };

  // ---- Usuarios / invitaciones ----
  // Las 5 funciones de abajo ahora pasan por RPCs "admin_*" que verifican, del lado del
  // servidor, que quien llama sea admin de la misma empresa del usuario objetivo — antes
  // solo dependían del botón oculto en la UI (canManage) y de lo que permitiera la RLS de
  // "profiles". Sin este respaldo, un usuario no-admin podía en teoría llamar
  // supabase.from("profiles").update({ role: "admin" }) directo desde la consola del
  // navegador y auto-asignarse privilegios (si la RLS le permite editar su propia fila,
  // algo común para que cada quien edite su nombre/foto).
  const updateMaxDiscount = async (userId, value) => {
    const n = Math.max(0, Math.min(100, Number(value) || 0));
    const { data, error } = await supabase.rpc("admin_update_user_max_discount", { p_user_id: userId, p_value: n });
    if (error) { setErrorMsg(error.message); return; }
    setProfiles((prev) => prev.map((p) => (p.id === data.id ? data : p)));
  };

  const updateUserBranch = async (userId, branchId, extraBranchIds) => {
    const { data, error } = await supabase.rpc("admin_update_user_branch", { p_user_id: userId, p_branch_id: branchId || null, p_extra_branch_ids: extraBranchIds || [] });
    if (error) { setErrorMsg(error.message); return false; }
    setProfiles((prev) => prev.map((p) => (p.id === data.id ? data : p)));
    return true;
  };

  const updateUserRole = async (userId, role) => {
    const { data, error } = await supabase.rpc("admin_update_user_role", { p_user_id: userId, p_role: role });
    if (error) return `${error.message}${error.code ? ` (código ${error.code})` : ""}`;
    if (!data) return "la actualización no devolvió ninguna fila.";
    setProfiles((prev) => prev.map((p) => (p.id === data.id ? data : p)));
    return true;
  };

  const toggleUserActive = async (user) => {
    const nextActive = !(user.is_active ?? true);
    if (!window.confirm(nextActive ? `¿Reactivar a ${user.full_name || user.email}?` : `¿Desactivar a ${user.full_name || user.email}? No podrá volver a entrar hasta que lo reactives.`)) return;
    const { data, error } = await supabase.rpc("admin_toggle_user_active", { p_user_id: user.id, p_is_active: nextActive });
    if (error) { setErrorMsg(error.message); return; }
    setProfiles((prev) => prev.map((p) => (p.id === data.id ? data : p)));
  };

  const updateUserPermissions = async (userId, permissions) => {
    setSaving(true);
    const { data, error } = await supabase.rpc("admin_update_user_permissions", { p_user_id: userId, p_permissions: permissions });
    setSaving(false);
    if (error) { setErrorMsg(error.message); return `${error.message}${error.code ? ` (código ${error.code})` : ""}`; }
    if (!data) return "la actualización no devolvió ninguna fila.";
    setProfiles((prev) => prev.map((p) => (p.id === data.id ? data : p)));
    return true;
  };

  const createInvite = async (email, role, technicianId, branchId, permissions) => {
    setSaving(true);
    // admin_create_invite verifica en el servidor que quien llama sea admin, y toma el
    // company_id de la empresa de quien llama (no del cliente) — antes esto era un insert
    // directo que dependía enteramente de la política RLS de "invites" para impedir que
    // alguien creara una invitación (incluso de admin) para otra empresa.
    const { data, error } = await supabase.rpc("admin_create_invite", {
      p_email: email, p_role: role, p_technician_id: technicianId || null, p_branch_id: branchId || null, p_permissions: permissions || null,
    });
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    setInvites((prev) => [...prev, data]);
    setInviteLink(`${APP_URL}/?invite=${data.token}`);
  };

  const cancelInvite = async (id) => {
    if (!window.confirm("¿Cancelar esta invitación?")) return;
    const { error } = await supabase.from("invites").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setInvites((prev) => prev.filter((i) => i.id !== id));
  };

  const INVENTORY_CHILD_KEYS = ["tools", "materials"];
  const CATALOG_CHILD_KEYS = ["clients", "products", "services", "warranty"];
  const SALES_CHILD_KEYS = ["quotes", "salesOrders", "invoices", "creditNotes", "recurringContracts", "caja"];
  const COMPRAS_CHILD_KEYS = ["suppliers", "purchaseOrders", "deliveryNotes", "purchases", "supplierReceipts", "otherExpenses", "purchaseLedger"];
  const CONTABLE_CHILD_KEYS = ["ncf", "receivables", "payables", "chartOfAccounts", "taxRates", "bankReconciliation", "dgiiCatalog"];
  const _urlView = new URLSearchParams(window.location.search).get("view") || "dashboard";
  const [openSubmenus, setOpenSubmenus] = useState(() => ({
    inventoryMenu: INVENTORY_CHILD_KEYS.includes(_urlView),
    catalog: CATALOG_CHILD_KEYS.includes(_urlView),
    salesMenu: SALES_CHILD_KEYS.includes(_urlView),
    purchasesMenu: COMPRAS_CHILD_KEYS.includes(_urlView),
    accountingMenu: CONTABLE_CHILD_KEYS.includes(_urlView),
  }));
  const toggleSubmenu = (key) => setOpenSubmenus((prev) => ({ ...prev, [key]: !prev[key] }));
  const [openSections, setOpenSections] = useState({ "Departamento Técnico": true, "Comercial": true, "Administración": true, "Gestión Contable": true, "Recursos Humanos": true });
  const toggleSection = (name) => setOpenSections((prev) => ({ ...prev, [name]: prev[name] === false ? true : false }));

  const RAW_NAV = [
    { key: "dashboard", label: "Panel", Icon: LayoutDashboard },
    { section: "Departamento Técnico" },
    { key: "reports", label: "Reportes", Icon: BarChart3 },
    { key: "incidents", label: "Incidentes", Icon: AlertTriangle },
    { key: "agenda", label: "Agenda", Icon: CalendarDays },
    { key: "orders", label: "Órdenes de trabajo", Icon: ClipboardList },
    { key: "projects", label: "Proyectos", Icon: FolderKanban },
    { key: "equipment", label: "Gestión de Equipos", Icon: Settings2 },
    { key: "checklists", label: "Checklists", Icon: ClipboardCheck },
    { key: "technicians", label: "Técnicos", Icon: Users },
    {
      key: "inventoryMenu", label: "Inventario", Icon: Package,
      children: [
        { key: "tools", label: "Herramientas", Icon: Wrench },
        { key: "materials", label: "Almacén", Icon: Boxes },
      ],
    },
    { key: "maintenanceSchedule", label: "Mantenimiento programado", Icon: CalendarDays },
    { section: "Comercial" },
    {
      key: "catalog", label: "Catálogo", Icon: Boxes,
      children: [
        { key: "clients", label: "Clientes", Icon: Users2 },
        { key: "products", label: "Productos", Icon: Boxes },
        { key: "services", label: "Servicios", Icon: Wrench },
        { key: "warranty", label: "Activos en Garantía", Icon: BadgeCheck },
      ],
    },
    {
      key: "purchasesMenu", label: "Compras", Icon: ShoppingCart,
      children: [
        { key: "suppliers", label: "Proveedores", Icon: Truck },
        { key: "purchaseOrders", label: "Pedidos a Proveedores", Icon: ClipboardList },
        { key: "deliveryNotes", label: "Nota de entrega proveedores", Icon: FileText },
        { key: "purchases", label: "Factura de proveedor", Icon: Receipt },
        { key: "supplierReceipts", label: "Recibos de proveedor", Icon: Receipt },
        { key: "otherExpenses", label: "Otros gastos", Icon: ShoppingCart },
        { key: "purchaseLedger", label: "Libro de facturas recibidas", Icon: FileText },
      ],
    },
    {
      key: "salesMenu", label: "Ventas", Icon: Layers,
      children: [
        { key: "quotes", label: "Cotizaciones", Icon: ClipboardCheck },
        { key: "salesOrders", label: "Órdenes de Venta", Icon: Layers },
        { key: "invoices", label: "Facturación", Icon: Receipt },
        { key: "creditNotes", label: "Notas de Crédito", Icon: RotateCcw },
        { key: "recurringContracts", label: "Contratos recurrentes", Icon: CalendarDays },
        { key: "caja", label: "Caja", Icon: Wallet },
      ],
    },
    { key: "salesReports", label: "Reportes de Ventas", Icon: BarChart3 },
    { section: "Gestión Contable" },
    { key: "financialReports", label: "Reportes Financieros", Icon: BarChart3 },
    { key: "fiscalReports", label: "Reportes Fiscales (DGII)", Icon: BarChart3 },
    {
      key: "accountingMenu", label: "Gestión Contable", Icon: Hash,
      children: [
        { key: "chartOfAccounts", label: "Catálogo de cuentas", Icon: Boxes },
        { key: "receivables", label: "Cuentas por Cobrar", Icon: Receipt },
        { key: "payables", label: "Cuentas por Pagar", Icon: ShoppingCart },
        { key: "taxRates", label: "Tasas impositivas", Icon: Hash },
        { key: "bankReconciliation", label: "Conciliación bancaria", Icon: Wallet },
        { key: "ncf", label: "Secuencia NCF", Icon: Hash },
        { key: "dgiiCatalog", label: "Catálogo RNC (DGII)", Icon: Search },
      ],
    },
    { section: "Recursos Humanos" },
    { key: "payroll", label: "Nómina", Icon: Banknote },
    { section: "Administración" },
    { key: "branches", label: "Sucursales", Icon: Building2 },
    { key: "users", label: "Usuarios", Icon: ShieldCheck },
    { key: "companyProfile", label: "Perfil de la empresa", Icon: Building2 },
    { key: "activityLog", label: "Historial de actividad", Icon: History },
    { key: "dataExport", label: "Exportar datos", Icon: Download },
  ];
  const NAV = [];
  {
    let pendingSection = null;
    RAW_NAV.forEach((item) => {
      if (item.section) { pendingSection = item.section; return; }
      let visibleItem = item;
      if (item.children) {
        const visibleChildren = item.children.filter((c) => hasPerm(c.key));
        if (visibleChildren.length === 0) return;
        visibleItem = { ...item, children: visibleChildren };
      } else if (!hasPerm(item.key)) {
        return;
      }
      if (pendingSection) { NAV.push({ section: pendingSection }); pendingSection = null; }
      NAV.push(visibleItem);
    });
  }

  const flattenNavKeys = (items) => items.flatMap((it) => (it.section ? [] : it.children ? it.children.map((c) => c.key) : [it.key]));

  // Accesos rápidos del Panel (estilo "launcher de apps" de Odoo), en dos niveles:
  // primero los 4 departamentos (secciones de NAV), y al entrar a uno, sus
  // subsecciones. "dashboard" ("Panel") no entra a ningún departamento porque
  // en RAW_NAV aparece antes del primer marcador de sección.
  const APP_TILE_COLORS = ["#7C6FE0", "#3E9BE0", "#4CAF6D", "#E0A83E", "#E0577C", "#8E5CE0", "#3EC7C2", "#E0733E", "#5C8FE0", "#C24CE0", "#4CC2A0", "#E0475C", "#6FA8E0", "#8FE04C", "#F2A93B", "#E05C9B"];
  const DEPARTMENT_CFG = {
    "Departamento Técnico": { Icon: Wrench, color: "#3E9BE0" },
    "Comercial": { Icon: ShoppingCart, color: "#4CAF6D" },
    "Gestión Contable": { Icon: Hash, color: "#8E5CE0" },
    "Recursos Humanos": { Icon: Briefcase, color: "#3EC7C2" },
    "Administración": { Icon: Building2, color: "#E0733E" },
  };
  // Se conserva la jerarquía (items con "children" quedan como tal, no se
  // aplanan) para que el Panel pueda mostrar un tercer nivel: los renglones de
  // un ítem con submenú (ej. "Inventario" → Herramientas/Almacén) aparecen al
  // entrar a ese ítem, igual que ya pasa en la columna de opciones lateral.
  const navSections = [];
  {
    let current = null;
    NAV.forEach((it) => {
      if (it.section) { current = { name: it.section, items: [] }; navSections.push(current); return; }
      if (!current) return;
      current.items.push(it);
    });
  }

  useEffect(() => {
    if (hasPerm(view)) return;
    const firstAllowed = flattenNavKeys(NAV)[0];
    if (firstAllowed) changeView(firstAllowed);
    // eslint-disable-next-line
  }, [view, JSON.stringify(effectivePermissions)]);

  // Unos segundos después de abrir, precarga en segundo plano los módulos de las secciones
  // que este usuario puede ver: así abren sin espera y una pestaña que quedó abierta sigue
  // funcionando aunque se publique una versión nueva (ver modulos/lazy.jsx).
  const navKeysForPrefetch = flattenNavKeys(NAV).join(",");
  useEffect(() => {
    if (loadingScope) return undefined;
    const t = setTimeout(() => prefetchForViews(navKeysForPrefetch.split(",")), 3000);
    return () => clearTimeout(t);
  }, [loadingScope, navKeysForPrefetch]);

  const renderToolRow = (t) => (
    <div key={t.id} className="p-4" style={{ background: C.panel, border: `1px solid ${selectedTools.has(t.id) ? C.amber : C.border}` }}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="min-w-0 flex items-start gap-2">
          {canDelete("tools") && (
            <input
              type="checkbox"
              className="mt-1"
              checked={selectedTools.has(t.id)}
              onChange={() => setSelectedTools((prev) => { const next = new Set(prev); next.has(t.id) ? next.delete(t.id) : next.add(t.id); return next; })}
            />
          )}
          <div className="min-w-0">
            <div className="font-medium truncate">{t.name}</div>
            {t.serial_number && <div className="text-xs" style={{ color: C.muted }}>S/N {t.serial_number}</div>}
            {t.category && <div className="text-xs" style={{ color: C.muted }}>{t.category}</div>}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {canEdit("tools") && <button onClick={() => setEditingTool(t)} style={iconBtnStyle}><Pencil size={14} /></button>}
          {canDelete("tools") && <button onClick={() => deleteTool(t.id)} style={iconBtnStyle}><Trash2 size={14} /></button>}
        </div>
      </div>
      <div className="text-xs mb-2" style={{ color: C.muted }}>{branchName(t.branch_id)}</div>
      <div className="flex items-center justify-between pt-2 mt-1" style={{ borderTop: `1px solid ${C.border}` }}>
        <Pill label={TOOL_STATUS_CFG[t.status]?.label || "Disponible"} color={TOOL_STATUS_CFG[t.status]?.color || C.green} />
        {canEdit("tools") ? (
          <select value={t.technician_id || ""} onChange={(e) => assignTool(t.id, e.target.value)} className="px-2 py-1.5 text-xs" style={{ background: C.panelAlt, border: `1px solid ${C.border}`, color: C.text }}>
            <option value="">Sin asignar</option>
            {technicians.filter((tech) => tech.is_active !== false || tech.id === t.technician_id).map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}
          </select>
        ) : (
          <span style={{ color: C.muted }}>{techName(t.technician_id)}</span>
        )}
      </div>
      {t.technician_id && (
        canEdit("tools") ? (
          <div className="text-[10px] mt-1 text-right" style={{ color: t.received_at ? C.green : C.amber }}>
            {t.received_at ? `Confirmada ${fmtDate(t.received_at.slice(0, 10))}` : "Pendiente de confirmación"}
          </div>
        ) : (
          t.received_at ? (
            <div className="text-[10px] mt-1 text-right" style={{ color: C.green }}>✓ Confirmada {fmtDate(t.received_at.slice(0, 10))}</div>
          ) : isTecnico && t.technician_id === profile.technician_id ? (
            <div className="text-right">
              <button onClick={() => confirmToolReceipt(t.id)} className="mt-1 inline-flex items-center gap-1 text-[11px] px-2 py-1" style={{ background: C.green + "20", color: C.green, border: `1px solid ${C.green}40` }}>
                <CheckCircle2 size={12} /> Confirmar recepción
              </button>
            </div>
          ) : (
            <div className="text-[10px] mt-1 text-right" style={{ color: C.amber }}>Pendiente de confirmación</div>
          )
        )
      )}
    </div>
  );

  return (
    <div className="w-full min-h-[720px] flex" style={{ background: C.bg, color: C.text, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {showMobileMenu && (
        <div className="fixed inset-0 z-40 md:hidden" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setShowMobileMenu(false)} />
      )}
      <div
        className={`${showMobileMenu ? "flex" : "hidden"} ${sidebarCollapsed ? "md:hidden" : "md:flex"} fixed md:relative inset-y-0 left-0 z-50 md:z-auto w-64 md:w-56 flex-shrink-0 flex-col overflow-y-auto`}
        style={{ background: C.panel, borderRight: `1px solid ${C.border}` }}
      >
        <div className="px-5 py-5 flex items-center justify-between gap-2" style={{ borderBottom: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 flex items-center justify-center" style={{ background: C.amber }}>
              <Wrench size={16} color="#1A1500" />
            </div>
            <div>
              <div className="font-bold text-sm tracking-tight leading-none">MantenPro</div>
              <div className="text-[10px] uppercase tracking-wide mt-0.5" style={{ color: C.muted }}>Multi-empresa</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setSidebarCollapsed(true)} title="Ocultar menú" className="hidden md:block p-1" style={{ color: C.muted }}>
              <ChevronLeft size={18} />
            </button>
            <button onClick={() => setShowMobileMenu(false)} className="md:hidden p-1" style={{ color: C.muted }}>
              <X size={18} />
            </button>
          </div>
        </div>
        <nav className="flex-1 py-3">
          {(() => {
            let currentSection = null;
            return NAV.map((item, i) => {
              if (item.section) {
                currentSection = item.section;
                const isOpen = openSections[item.section] !== false;
                return (
                  <button key={`section-${i}`} onClick={() => toggleSection(item.section)}
                    className="w-full flex items-center justify-between px-5 pt-4 pb-1 text-[10px] uppercase tracking-wide text-left"
                    style={{ color: C.muted, borderTop: `1px solid ${C.border}`, marginTop: 8 }}>
                    <span>{item.section}</span>
                    {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                );
              }
              const sectionOpen = currentSection ? openSections[currentSection] !== false : true;
              if (!sectionOpen) return null;
              if (item.children) {
                const isSubOpen = !!openSubmenus[item.key];
                return (
                  <div key={item.key}>
                    <button onClick={() => toggleSubmenu(item.key)} className="w-full flex items-center gap-3 px-5 py-2.5 text-sm text-left"
                      style={{ color: item.children.some((c) => c.key === view) ? C.text : C.muted, background: item.children.some((c) => c.key === view) ? C.panelAlt : "transparent", borderLeft: `2px solid ${item.children.some((c) => c.key === view) ? C.amber : "transparent"}` }}>
                      <item.Icon size={16} />
                      <span className="flex-1">{item.label}</span>
                      {isSubOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    {isSubOpen && item.children.map((child) => (
                      <button key={child.key} onClick={() => changeView(child.key)} className="w-full flex items-center gap-3 pl-9 pr-5 py-2 text-sm text-left"
                        style={{ color: view === child.key ? C.text : C.muted, background: view === child.key ? C.panelAlt : "transparent", borderLeft: `2px solid ${view === child.key ? C.amber : "transparent"}` }}>
                        <child.Icon size={14} />
                        {child.label}
                      </button>
                    ))}
                  </div>
                );
              }
              return (
                <button key={item.key} onClick={() => changeView(item.key)} className="w-full flex items-center gap-3 px-5 py-2.5 text-sm text-left"
                  style={{ color: view === item.key ? C.text : C.muted, background: view === item.key ? C.panelAlt : "transparent", borderLeft: `2px solid ${view === item.key ? C.amber : "transparent"}` }}>
                  <item.Icon size={16} />
                  {item.label}
                </button>
              );
            });
          })()}
        </nav>
        <div className="px-5 py-4" style={{ borderTop: `1px solid ${C.border}` }}>
          <div className="text-xs truncate" style={{ color: C.muted }}>{session.user.email}</div>
          <div className="text-[10px] mt-1 mb-2" style={{ color: ROLE_CFG[profile.role]?.color }}>{ROLE_CFG[profile.role]?.label}</div>
          {passwordChanged && <div className="text-[10px] mb-2" style={{ color: C.green }}>Contraseña actualizada.</div>}
          <button onClick={() => { setShowChangePassword(true); setPasswordChanged(false); }} className="flex items-center gap-2 text-xs mb-2" style={{ color: C.muted }}>
            <ShieldCheck size={13} /> Cambiar contraseña
          </button>
          <button onClick={() => setShowHelp(true)} className="flex items-center gap-2 text-xs mb-2" style={{ color: C.muted }}>
            <CircleHelp size={13} /> Ayuda
          </button>
          <ThemeToggleButton />
          <button onClick={onSignOut} className="flex items-center gap-2 text-xs" style={{ color: C.muted }}>
            <LogOut size={13} /> Cerrar sesión
          </button>
        </div>
      </div>

      {showHelp && <HelpCenter enabledModules={company?.enabled_modules || []} onClose={() => setShowHelp(false)} />}
      {showChangePassword && (
        <ChangePasswordModal
          onClose={() => setShowChangePassword(false)}
          onDone={() => { setShowChangePassword(false); setPasswordChanged(true); }}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {errorMsg && (
          <div className="px-4 py-2 text-xs flex items-center justify-between" style={{ background: C.redBg, color: C.red }}>
            <span>Error: {errorMsg}</span>
            <button onClick={() => setErrorMsg("")}><X size={14} /></button>
          </div>
        )}

        <div className="flex items-center justify-between px-6 py-3 flex-wrap gap-3" style={{ borderBottom: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowMobileMenu(true)} className="md:hidden p-2" style={{ color: C.text }}>
              <Menu size={20} />
            </button>
            {sidebarCollapsed && (
              <button onClick={() => setSidebarCollapsed(false)} title="Mostrar menú" className="hidden md:block p-2" style={{ color: C.text }}>
                <ChevronRight size={20} />
              </button>
            )}
            <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
              <Building2 size={14} color={C.amber} />
              {companyName}
            </div>
            <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panelAlt, border: `1px solid ${C.border}`, color: C.text }}>
              <option value="all">Todas las sucursales</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="flex gap-2 items-center">
            {companyHasModule("tecnico") && (
              <button onClick={() => setShowQrScanner(true)} className="p-2" style={{ color: C.text }} title="Escanear el QR de un equipo">
                <ScanLine size={20} />
              </button>
            )}
            <div className="relative">
              <button onClick={() => setShowNotifPanel((v) => !v)} className="relative p-2" style={{ color: C.text }}>
                <Bell size={20} />
                {notifications.filter((n) => !n.is_read).length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center text-[10px] font-bold rounded-full" style={{ background: C.red, color: "#fff", width: 16, height: 16 }}>
                    {notifications.filter((n) => !n.is_read).length > 9 ? "9+" : notifications.filter((n) => !n.is_read).length}
                  </span>
                )}
              </button>
              {showNotifPanel && (
                <div className="absolute right-0 mt-2 z-50" style={{ background: C.panel, border: `1px solid ${C.border}`, maxHeight: 480, overflowY: "auto", width: "min(24rem, 90vw)" }}>
                  <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
                    <div className="text-sm font-semibold">Notificaciones</div>
                    <div className="flex items-center gap-2">
                      <button onClick={markAllNotificationsRead} className="text-xs" style={{ color: C.amber }}>Marcar todas leídas</button>
                      <button onClick={() => setShowNotifPanel(false)} style={iconBtnStyle}><X size={14} /></button>
                    </div>
                  </div>
                  {notifications.length === 0 && <div className="px-4 py-6 text-center text-sm" style={{ color: C.muted }}>No tienes notificaciones todavía.</div>}
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => { markNotificationRead(n.id); if (n.link_view) { changeView(n.link_view); setShowNotifPanel(false); } }}
                      className="px-4 py-3 text-sm cursor-pointer"
                      style={{ borderBottom: `1px solid ${C.border}`, background: n.is_read ? "transparent" : C.panelAlt }}
                    >
                      <div className="flex items-start gap-2">
                        {!n.is_read && <span className="mt-1.5 flex-shrink-0" style={{ width: 6, height: 6, borderRadius: "50%", background: C.amber }} />}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{n.title}</div>
                          {n.body && <div className="text-xs truncate" style={{ color: C.muted }}>{n.body}</div>}
                          <div className="text-[10px] mt-0.5" style={{ color: C.muted }}>{new Date(n.created_at).toLocaleString("es-DO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="px-4 py-3" style={{ borderTop: `1px solid ${C.border}` }}>
                    {pushSubscribed ? (
                      <button onClick={disablePushNotifications} className="flex items-center gap-2 text-xs" style={{ color: C.muted }}><BellOff size={13} /> Desactivar notificaciones push en este dispositivo</button>
                    ) : (
                      <PushSetupInline onEnable={enablePushNotifications} />
                    )}
                  </div>
                </div>
              )}
            </div>
            {canManage && view === "orders" && (
              <>
                <button onClick={() => setShowBulkOrders(true)} disabled={branches.length === 0 || !canEdit("orders")} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold disabled:opacity-40" style={{ border: `1px solid ${C.border}`, color: C.text }}>
                  <Layers size={16} /> Crear varias
                </button>
                <button onClick={() => setShowOrderForm(true)} disabled={branches.length === 0 || !canEdit("orders")} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}>
                  <Plus size={16} /> Nueva orden
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loadingScope && <FullScreenLoader label="Cargando datos..." />}

          {!loadingScope && hasPerm("dashboard") && view === "dashboard" && (
            <div>
              {dashboardDept === null ? (
                <>
                  <div className="text-sm font-semibold mb-3" style={{ color: C.muted }}>Departamentos</div>
                  <div className="grid gap-5 mb-6" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
                    {navSections.map((sec) => {
                      const cfg = DEPARTMENT_CFG[sec.name] || { Icon: Layers, color: C.amber };
                      return (
                        <button
                          key={sec.name}
                          onClick={() => openDashboardDept(sec.name)}
                          className="flex flex-col items-center gap-2 p-2 text-center"
                          style={{ background: "transparent" }}
                        >
                          <div className="w-24 h-24 flex items-center justify-center" style={{ background: cfg.color, borderRadius: 20 }}>
                            <cfg.Icon size={44} color="#fff" />
                          </div>
                          <div className="text-sm font-medium leading-tight" style={{ color: C.text }}>{sec.name}</div>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : dashboardSubmenu === null ? (
                <>
                  <button onClick={closeDashboardDept} className="flex items-center gap-1 text-sm mb-4" style={{ color: C.muted }}>
                    <ChevronLeft size={16} /> Departamentos
                  </button>
                  <div className="text-sm font-semibold mb-3" style={{ color: C.muted }}>{dashboardDept}</div>
                  <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))" }}>
                    {(navSections.find((s) => s.name === dashboardDept)?.items || []).map((it, i) => (
                      <button
                        key={it.key}
                        onClick={() => (it.children ? openDashboardSubmenu(it.key) : changeView(it.key))}
                        className="flex flex-col items-center gap-2 p-2 text-center"
                        style={{ background: "transparent" }}
                      >
                        <div className="w-16 h-16 flex items-center justify-center" style={{ background: APP_TILE_COLORS[i % APP_TILE_COLORS.length], borderRadius: 14 }}>
                          <it.Icon size={30} color="#fff" />
                        </div>
                        <div className="text-xs leading-tight" style={{ color: C.text }}>{it.label}</div>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <button onClick={closeDashboardSubmenu} className="flex items-center gap-1 text-sm mb-4" style={{ color: C.muted }}>
                    <ChevronLeft size={16} /> {dashboardDept}
                  </button>
                  {(() => {
                    const parentItem = (navSections.find((s) => s.name === dashboardDept)?.items || []).find((it) => it.key === dashboardSubmenu);
                    return (
                      <>
                        <div className="text-sm font-semibold mb-3" style={{ color: C.muted }}>{parentItem?.label || dashboardSubmenu}</div>
                        <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))" }}>
                          {(parentItem?.children || []).map((child, i) => (
                            <button
                              key={child.key}
                              onClick={() => changeView(child.key)}
                              className="flex flex-col items-center gap-2 p-2 text-center"
                              style={{ background: "transparent" }}
                            >
                              <div className="w-16 h-16 flex items-center justify-center" style={{ background: APP_TILE_COLORS[i % APP_TILE_COLORS.length], borderRadius: 14 }}>
                                <child.Icon size={30} color="#fff" />
                              </div>
                              <div className="text-xs leading-tight" style={{ color: C.text }}>{child.label}</div>
                            </button>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </>
              )}
            </div>
          )}

          {!loadingScope && hasPerm("agenda") && view === "agenda" && (
            <VistaAgenda agendaTechFilter={agendaTechFilter} agendaViewMode={agendaViewMode} agendaWeekAnchor={agendaWeekAnchor} calendarMonth={calendarMonth} isTecnico={isTecnico} openOrderDetail={openOrderDetail} orderDayColor={orderDayColor} ordersByDate={ordersByDate} overdueOrders={overdueOrders} searchedDate={searchedDate} setAgendaTechFilter={setAgendaTechFilter} setAgendaViewMode={setAgendaViewMode} setAgendaWeekAnchor={setAgendaWeekAnchor} setCalendarMonth={setCalendarMonth} setSearchedDate={setSearchedDate} techName={techName} technicians={technicians} />
          )}

          {!loadingScope && hasPerm("orders") && view === "orders" && (
            <VistaOrders branchName={branchName} canDelete={canDelete} canEdit={canEdit} canManage={canManage} companyName={companyName} deleteOrder={deleteOrder} equipName={equipName} equipment={equipment} filteredOrders={filteredOrders} isTecnico={isTecnico} openEditOrder={openEditOrder} openOrderDetail={openOrderDetail} orderAttachmentIds={orderAttachmentIds} orderDateFrom={orderDateFrom} orderDateTo={orderDateTo} orderEquipmentFilter={orderEquipmentFilter} orderTechnicians={orderTechnicians} orders={orders} search={search} selectedOrders={selectedOrders} setOrderDateFrom={setOrderDateFrom} setOrderDateTo={setOrderDateTo} setOrderEquipmentFilter={setOrderEquipmentFilter} setOrderStatus={setOrderStatus} setSearch={setSearch} setSelectedOrders={setSelectedOrders} setStatusFilter={setStatusFilter} setTechnicianFilter={setTechnicianFilter} setTypeFilter={setTypeFilter} statusFilter={statusFilter} techName={techName} technicianFilter={technicianFilter} technicians={technicians} todayStr={todayStr} typeFilter={typeFilter} />
          )}

          {!loadingScope && hasPerm("incidents") && view === "incidents" && (
            <VistaIncidents branchName={branchName} canReportIncident={canReportIncident} clients={clients} companyName={companyName} equipment={equipment} incidentCompletedFrom={incidentCompletedFrom} incidentCompletedTo={incidentCompletedTo} incidentDateFrom={incidentDateFrom} incidentDateTo={incidentDateTo} incidentEquipmentFilter={incidentEquipmentFilter} incidentTechnicianFilter={incidentTechnicianFilter} incidentsFiltered={incidentsFiltered} isTecnico={isTecnico} selectedIncidents={selectedIncidents} setIncidentCompletedFrom={setIncidentCompletedFrom} setIncidentCompletedTo={setIncidentCompletedTo} setIncidentDateFrom={setIncidentDateFrom} setIncidentDateTo={setIncidentDateTo} setIncidentDetail={setIncidentDetail} setIncidentEquipmentFilter={setIncidentEquipmentFilter} setIncidentTechnicianFilter={setIncidentTechnicianFilter} setSelectedIncidents={setSelectedIncidents} setShowAddIncident={setShowAddIncident} techName={techName} technicians={technicians} />
          )}

          {!loadingScope && hasPerm("projects") && view === "projects" && (
            <VistaProjects branchName={branchName} canEdit={canEdit} clients={clients} orders={orders} projectMaterials={projectMaterials} projectSearch={projectSearch} projectStatusFilter={projectStatusFilter} projectsFiltered={projectsFiltered} salesOrders={salesOrders} setProjectDetail={setProjectDetail} setProjectSearch={setProjectSearch} setProjectStatusFilter={setProjectStatusFilter} setShowAddProject={setShowAddProject} />
          )}

          {!loadingScope && hasPerm("equipment") && view === "equipment" && (
            <VistaEquipment clients={clients} companyLogo={company?.logo_url} openEquipmentCard={setQrEquipmentId} branchFilter={branchFilter} branchName={branchName} branches={branches} bulkDeleteEquipment={bulkDeleteEquipment} canDelete={canDelete} canEdit={canEdit} companyId={companyId} companyName={companyName} deleteEquipment={deleteEquipment} equipment={equipment} equipmentFiltered={equipmentFiltered} equipmentSearch={equipmentSearch} equipmentStatusFilter={equipmentStatusFilter} equipmentTechFilter={equipmentTechFilter} equipmentTypeFilter={equipmentTypeFilter} equipmentTypes={equipmentTypes} locationName={locationName} locations={locations} orders={orders} selectedEquipment={selectedEquipment} setBranchFilter={setBranchFilter} setEditingEquipment={setEditingEquipment} setEquipment={setEquipment} setEquipmentSearch={setEquipmentSearch} setEquipmentStatusFilter={setEquipmentStatusFilter} setEquipmentTechFilter={setEquipmentTechFilter} setEquipmentTypeFilter={setEquipmentTypeFilter} setHistoryFor={setHistoryFor} setLocations={setLocations} setPendingLocationBranch={setPendingLocationBranch} setSelectedEquipment={setSelectedEquipment} setShowAddEquipment={setShowAddEquipment} setShowAddLocation={setShowAddLocation} technicians={technicians} />
          )}

          {!loadingScope && hasPerm("technicians") && view === "technicians" && (
            <VistaTechnicians branchFilter={branchFilter} branchName={branchName} branches={branches} canDelete={canDelete} canEdit={canEdit} deleteTech={deleteTech} orders={orders} setEditingTech={setEditingTech} setShowAddTech={setShowAddTech} technicians={technicians} />
          )}

          {!loadingScope && hasPerm("tools") && view === "tools" && (
            <VistaTools assignToolsByQuantity={assignToolsByQuantity} bulkDeleteTools={bulkDeleteTools} bulkRetireTools={bulkRetireTools} canDelete={canDelete} canEdit={canEdit} confirmToolReceipt={confirmToolReceipt} deleteToolList={deleteToolList} groupToolsByTechnician={groupToolsByTechnician} isTecnico={isTecnico} lendTool={lendTool} profile={profile} renderToolRow={renderToolRow} returnTool={returnTool} returnToolsByQuantity={returnToolsByQuantity} selectedTools={selectedTools} setEditingToolList={setEditingToolList} setGroupToolsByTechnician={setGroupToolsByTechnician} setSelectedTools={setSelectedTools} setShowAddTool={setShowAddTool} setShowAddToolList={setShowAddToolList} setShowBulkTools={setShowBulkTools} setToolSearch={setToolSearch} setToolStatusFilter={setToolStatusFilter} setToolTechnicianFilter={setToolTechnicianFilter} setToolViewMode={setToolViewMode} technicianToolGroups={technicianToolGroups} technicians={technicians} toolGroups={toolGroups} toolLists={toolLists} toolLoans={toolLoans} toolSearch={toolSearch} toolStatusFilter={toolStatusFilter} toolTechnicianFilter={toolTechnicianFilter} toolViewMode={toolViewMode} tools={tools} toolsFiltered={toolsFiltered} />
          )}

          {!loadingScope && hasPerm("materials") && view === "materials" && (
            <VistaMaterials branchName={branchName} canDelete={canDelete} canEdit={canEdit} deleteMaterial={deleteMaterial} lowStockMaterials={lowStockMaterials} materials={materials} materialsLowStockOnly={materialsLowStockOnly} setEditingMaterial={setEditingMaterial} setMaterialsLowStockOnly={setMaterialsLowStockOnly} setShowAddMaterial={setShowAddMaterial} techUsesProducts={techUsesProducts} products={products} productStock={productStock} branches={branches} orders={orders} projects={projects} />
          )}

          {!loadingScope && hasPerm("maintenanceSchedule") && view === "maintenanceSchedule" && (
            <VistaMaintenanceSchedule branchName={branchName} canEdit={canEdit} clients={clients} dueClientAssets={dueClientAssets} dueEquipment={dueEquipment} generateAllDueMaintenance={generateAllDueMaintenance} generateOneMaintenanceOrder={generateOneMaintenanceOrder} saving={saving} techName={techName} todayStr={todayStr} upcomingClientAssets={upcomingClientAssets} upcomingEquipment={upcomingEquipment} updateUsageReading={updateUsageReading} />
          )}

          {!loadingScope && hasPerm("branches") && view === "branches" && (
            <VistaBranches branches={branches} canDelete={canDelete} canEdit={canEdit} deleteBranch={deleteBranch} equipment={equipment} orders={orders} setEditingBranch={setEditingBranch} setShowAddBranch={setShowAddBranch} technicians={technicians} />
          )}

          {!loadingScope && hasPerm("warranty") && view === "warranty" && (
            <VistaWarranty activeWarrantyAssets={activeWarrantyAssets} canDelete={canDelete} canEdit={canEdit} clients={clients} deleteClientAsset={deleteClientAsset} setEditingAsset={setEditingAsset} setShowAddAsset={setShowAddAsset} />
          )}

          {!loadingScope && hasPerm("checklists") && view === "checklists" && (
            <VistaChecklists canDelete={canDelete} canEdit={canEdit} checklistTemplates={checklistTemplates} deleteChecklistTemplate={deleteChecklistTemplate} downloadChecklistsExcel={downloadChecklistsExcel} importChecklistsFromExcel={importChecklistsFromExcel} importingChecklists={importingChecklists} selectedChecklists={selectedChecklists} setEditingChecklist={setEditingChecklist} setSelectedChecklists={setSelectedChecklists} setShowAddChecklist={setShowAddChecklist} />
          )}

          {!loadingScope && hasPerm("reports") && view === "reports" && (
            <VistaReports avgRepairTime={avgRepairTime} branchFilter={branchFilter} branchName={branchName} checklistCompliance={checklistCompliance} deadlineCompliance={deadlineCompliance} equipChartData={equipChartData} equipStats={equipStats} incidentEquipChartData={incidentEquipChartData} incidentSlaStats={incidentSlaStats} mtbf={mtbf} overdueOpenOrders={overdueOpenOrders} preventiveCompliance={preventiveCompliance} reopenStats={reopenStats} reportsIncidents={reportsIncidents} reportsOrders={reportsOrders} setHistoryFor={setHistoryFor} setTechReportDateFrom={setTechReportDateFrom} setTechReportDateTo={setTechReportDateTo} techChartData={techChartData} techName={techName} techReportDateFrom={techReportDateFrom} techReportDateTo={techReportDateTo} techStats={techStats} />
          )}

          {!loadingScope && hasPerm("clients") && view === "clients" && (
            <VistaClients openClientPortal={setPortalClient} canDelete={canDelete} canEdit={canEdit} clientSearch={clientSearch} clients={clients} companyName={companyName} deleteClient={deleteClient} filteredClients={filteredClients} selectedClients={selectedClients} setClientSearch={setClientSearch} setEditingClient={setEditingClient} setSelectedClients={setSelectedClients} setShowAddClient={setShowAddClient} />
          )}

          {!loadingScope && (hasPerm("products") || hasPerm("services")) && (view === "products" || view === "services") && (
            <VistaProductsServices branches={branches} canDelete={canDelete} canEdit={canEdit} companyName={companyName} deleteProduct={deleteProduct} filteredProducts={filteredProducts} isServicesView={isServicesView} productBranchFilter={productBranchFilter} productCategories={productCategories} productCategoryFilter={productCategoryFilter} productComponents={productComponents} productSearch={productSearch} products={products} selectedProducts={selectedProducts} setEditingProduct={setEditingProduct} setProductBranchFilter={setProductBranchFilter} setProductCategoryFilter={setProductCategoryFilter} setProductSearch={setProductSearch} setSelectedProducts={setSelectedProducts} setShowAddProduct={setShowAddProduct} setShowStockTransfer={setShowStockTransfer} setStockAdjustFor={setStockAdjustFor} setStockMovementsFor={setStockMovementsFor} stockAt={stockAt} />
          )}

          {!loadingScope && hasPerm("suppliers") && view === "suppliers" && (
            <VistaSuppliers canDelete={canDelete} canEdit={canEdit} companyName={companyName} deleteSupplier={deleteSupplier} filteredSuppliers={filteredSuppliers} selectedSuppliers={selectedSuppliers} setEditingSupplier={setEditingSupplier} setSelectedSuppliers={setSelectedSuppliers} setShowAddSupplier={setShowAddSupplier} setSupplierSearch={setSupplierSearch} supplierSearch={supplierSearch} suppliers={suppliers} />
          )}

          {!loadingScope && hasPerm("purchases") && view === "purchases" && (
            <VistaPurchases canDelete={canDelete} canEdit={canEdit} deletePurchase={deletePurchase} filteredPurchases={filteredPurchases} openPurchaseDetail={openPurchaseDetail} products={products} purchaseSearch={purchaseSearch} purchaseSupplierFilter={purchaseSupplierFilter} purchases={purchases} setPurchaseSearch={setPurchaseSearch} setPurchaseSupplierFilter={setPurchaseSupplierFilter} setShowAddPurchase={setShowAddPurchase} suppliers={suppliers} />
          )}

          {!loadingScope && hasPerm("purchaseOrders") && view === "purchaseOrders" && (
            <VistaPurchaseOrders canDelete={canDelete} canEdit={canEdit} deletePurchaseOrder={deletePurchaseOrder} products={products} purchaseOrderItems={purchaseOrderItems} purchaseOrders={purchaseOrders} setPurchaseOrderDetail={setPurchaseOrderDetail} setReceiptFromOrder={setReceiptFromOrder} setShowAddPurchaseOrder={setShowAddPurchaseOrder} setShowAddReceipt={setShowAddReceipt} suppliers={suppliers} />
          )}

          {!loadingScope && hasPerm("deliveryNotes") && view === "deliveryNotes" && (
            <VistaDeliveryNotes canDelete={canDelete} canEdit={canEdit} deleteGoodsReceipt={deleteGoodsReceipt} goodsReceiptItems={goodsReceiptItems} goodsReceipts={goodsReceipts} products={products} purchaseOrders={purchaseOrders} purchases={purchases} setPrefillReceiptId={setPrefillReceiptId} setReceiptDetail={setReceiptDetail} setReceiptFromOrder={setReceiptFromOrder} setShowAddPurchase={setShowAddPurchase} setShowAddReceipt={setShowAddReceipt} suppliers={suppliers} />
          )}

          {!loadingScope && hasPerm("otherExpenses") && view === "otherExpenses" && (
            <VistaOtherExpenses canDelete={canDelete} canEdit={canEdit} deleteExpense={deleteExpense} otherExpenses={otherExpenses} setEditingExpense={setEditingExpense} setShowAddExpense={setShowAddExpense} suppliers={suppliers} />
          )}

          {!loadingScope && hasPerm("chartOfAccounts") && view === "chartOfAccounts" && (
            <VistaChartOfAccounts canDelete={canDelete} canEdit={canEdit} chartOfAccounts={chartOfAccounts} deleteAccount={deleteAccount} setEditingAccount={setEditingAccount} setShowAddAccount={setShowAddAccount} />
          )}

          {!loadingScope && hasPerm("taxRates") && view === "taxRates" && (
            <VistaTaxRates canDelete={canDelete} canEdit={canEdit} deleteTaxRate={deleteTaxRate} setEditingTaxRate={setEditingTaxRate} setShowAddTaxRate={setShowAddTaxRate} taxRates={taxRates} />
          )}

          {!loadingScope && hasPerm("fiscalReports") && view === "fiscalReports" && (
            <VistaFiscalReports clients={clients} company={company} creditNotes={creditNotes} invoices={invoices} otherExpenses={otherExpenses} products={products} purchases={purchases} setErrorMsg={setErrorMsg} setTaxReportPeriod={setTaxReportPeriod} suppliers={suppliers} taxReportPeriod={taxReportPeriod} />
          )}

          {!loadingScope && hasPerm("salesReports") && view === "salesReports" && (
            <VistaSalesReports salesReportData={salesReportData} salesReportDateFrom={salesReportDateFrom} salesReportDateTo={salesReportDateTo} setSalesReportDateFrom={setSalesReportDateFrom} setSalesReportDateTo={setSalesReportDateTo} />
          )}

          {!loadingScope && hasPerm("financialReports") && view === "financialReports" && (
            <VistaFinancialReports companyHasModule={companyHasModule} financialCashFlow={financialCashFlow} financialDateFrom={financialDateFrom} financialDateTo={financialDateTo} financialMonthlyChart={financialMonthlyChart} financialPnl={financialPnl} loadingFinancial={loadingFinancial} setFinancialDateFrom={setFinancialDateFrom} setFinancialDateTo={setFinancialDateTo} />
          )}

          {!loadingScope && hasPerm("payroll") && view === "payroll" && (
            <PayrollSection
              companyId={companyId} company={company} companyName={companyName} branches={branches} technicians={technicians}
              isAdmin={isAdmin} canEditPayroll={canEdit("payroll")} canDeletePayroll={canDelete("payroll")} setErrorMsg={setErrorMsg}
            />
          )}

          {!loadingScope && hasPerm("bankReconciliation") && view === "bankReconciliation" && (
            <VistaBankReconciliation bankAccountFilter={bankAccountFilter} bankImportMsg={bankImportMsg} bankMatchCandidate={bankMatchCandidate} bankTransactions={bankTransactions} canDelete={canDelete} canEdit={canEdit} companyBankAccounts={companyBankAccounts} deleteBankTransaction={deleteBankTransaction} financialDateFrom={financialDateFrom} financialDateTo={financialDateTo} importBankStatement={importBankStatement} importingBankStatement={importingBankStatement} loadingFinancial={loadingFinancial} reconcileTransaction={reconcileTransaction} setBankAccountFilter={setBankAccountFilter} setFinancialDateFrom={setFinancialDateFrom} setFinancialDateTo={setFinancialDateTo} unreconcileTransaction={unreconcileTransaction} />
          )}

          {!loadingScope && hasPerm("supplierReceipts") && view === "supplierReceipts" && (
            <VistaSupplierReceipts allPurchasePayments={allPurchasePayments} purchases={purchases} suppliers={suppliers} />
          )}

          {!loadingScope && hasPerm("purchaseLedger") && view === "purchaseLedger" && (
            <VistaPurchaseLedger openPurchaseDetail={openPurchaseDetail} purchases={purchases} suppliers={suppliers} />
          )}

          {!loadingScope && hasPerm("receivables") && view === "receivables" && (
            <VistaReceivables clients={clients} companyName={companyName} openInvoiceDetail={openInvoiceDetail} visibleInvoices={visibleInvoices} />
          )}

          {!loadingScope && hasPerm("payables") && view === "payables" && (
            <VistaPayables openPurchaseDetail={openPurchaseDetail} purchases={purchases} suppliers={suppliers} />
          )}

          {!loadingScope && hasPerm("ncf") && view === "ncf" && (
            <VistaNcf canDelete={canDelete} canEdit={canEdit} deleteNcfSequence={deleteNcfSequence} ncfSequences={ncfSequences} setEditingNcf={setEditingNcf} setShowAddNcf={setShowAddNcf} toggleNcfActive={toggleNcfActive} />
          )}

          {!loadingScope && hasPerm("dgiiCatalog") && view === "dgiiCatalog" && (
            <VistaDgiiCatalog canEdit={canEdit} dgiiCatalogCount={dgiiCatalogCount} dgiiCatalogUpdatedAt={dgiiCatalogUpdatedAt} dgiiImportProgress={dgiiImportProgress} dgiiImporting={dgiiImporting} importDgiiCatalogFile={importDgiiCatalogFile} />
          )}

          {!loadingScope && hasPerm("quotes") && view === "quotes" && (
            <VistaQuotes canEdit={canEdit} clients={clients} companyName={companyName} filteredQuotes={filteredQuotes} openQuoteDetail={openQuoteDetail} quoteSearch={quoteSearch} quoteStatusFilter={quoteStatusFilter} quotes={quotes} selectedQuotes={selectedQuotes} setQuoteSearch={setQuoteSearch} setQuoteStatusFilter={setQuoteStatusFilter} setSelectedQuotes={setSelectedQuotes} setShowAddQuote={setShowAddQuote} visibleQuotes={visibleQuotes} />
          )}

          {!loadingScope && hasPerm("salesOrders") && view === "salesOrders" && (
            <VistaSalesOrders canDelete={canDelete} clients={clients} deleteSalesOrder={deleteSalesOrder} deleteSalesOrdersBulk={deleteSalesOrdersBulk} openSalesOrderDetail={openSalesOrderDetail} salesOrders={salesOrders} selectedSalesOrders={selectedSalesOrders} setSelectedSalesOrders={setSelectedSalesOrders} />
          )}

          {!loadingScope && hasPerm("invoices") && view === "invoices" && (
            <VistaInvoices canEdit={canEdit} clients={clients} filteredInvoices={filteredInvoices} invoicePaymentFilter={invoicePaymentFilter} invoiceSearch={invoiceSearch} invoiceStatusFilter={invoiceStatusFilter} invoices={invoices} isAdmin={isAdmin} ncfSequences={ncfSequences} openInvoiceDetail={openInvoiceDetail} setInvoicePaymentFilter={setInvoicePaymentFilter} setInvoiceSearch={setInvoiceSearch} setInvoiceStatusFilter={setInvoiceStatusFilter} setShowAddInvoice={setShowAddInvoice} setShowStatement={setShowStatement} visibleInvoices={visibleInvoices} />
          )}

          {!loadingScope && hasPerm("caja") && view === "caja" && (
            <VistaCaja branches={branches} cajaBranch={cajaBranch} canEdit={canEdit} cardAcquirers={cardAcquirers} cashSessions={cashSessions} closeCashSession={closeCashSession} company={company} invoices={invoices} isAdmin={isAdmin} isVendedor={isVendedor} openCashSession={openCashSession} profile={profile} saveCardAcquirer={saveCardAcquirer} saving={saving} sessionPayments={sessionPayments} setCajaBranch={setCajaBranch} setShowAcquirers={setShowAcquirers} setShowCloseCaja={setShowCloseCaja} setShowOpenCaja={setShowOpenCaja} showAcquirers={showAcquirers} showCloseCaja={showCloseCaja} showOpenCaja={showOpenCaja} />
          )}

          {!loadingScope && hasPerm("creditNotes") && view === "creditNotes" && (
            <VistaCreditNotes canEdit={canEdit} clients={clients} creditNotes={creditNotes} invoices={invoices} openCreditNoteDetail={openCreditNoteDetail} setShowAddCreditNote={setShowAddCreditNote} />
          )}

          {!loadingScope && hasPerm("recurringContracts") && view === "recurringContracts" && (
            <VistaRecurringContracts canDelete={canDelete} canEdit={canEdit} clients={clients} deleteRecurringContract={deleteRecurringContract} dueContracts={dueContracts} generateAllDueContracts={generateAllDueContracts} generateOneContractInvoice={generateOneContractInvoice} recurringContracts={recurringContracts} saving={saving} setEditingContract={setEditingContract} setShowAddContract={setShowAddContract} todayStr={todayStr} />
          )}

          {!loadingScope && hasPerm("users") && view === "users" && (
            <VistaUsers branches={branches} canDelete={canDelete} canEdit={canEdit} cancelInvite={cancelInvite} invites={invites} profiles={profiles} setEditingPermissionsFor={setEditingPermissionsFor} setShowInvite={setShowInvite} toggleUserActive={toggleUserActive} updateMaxDiscount={updateMaxDiscount} />
          )}

          {!loadingScope && hasPerm("companyProfile") && view === "companyProfile" && (
            <CompanyProfileForm company={company} bankAccounts={companyBankAccounts} onSave={saveCompanyProfile} onSaveBankAccount={saveBankAccount} onDeleteBankAccount={deleteBankAccount} onSetDefaultBankAccount={setDefaultBankAccount} saving={saving} />
          )}

          {!loadingScope && hasPerm("dataExport") && view === "dataExport" && (
            <ExportDataPanel companyId={companyId} companyName={companyName} canSeePayroll={hasPerm("payroll")} />
          )}

          {!loadingScope && hasPerm("activityLog") && view === "activityLog" && (
            <VistaActivityLog canRestore={isAdmin} onRestoreDeleted={restoreDeletedRecord} activityActionFilter={activityActionFilter} activityDateFrom={activityDateFrom} activityDateTo={activityDateTo} activityLogFiltered={activityLogFiltered} activityTableFilter={activityTableFilter} activityTablesPresent={activityTablesPresent} activityUserFilter={activityUserFilter} activityUserName={activityUserName} activityUsers={activityUsers} companyName={companyName} describeActivityEntry={describeActivityEntry} loadingActivityLog={loadingActivityLog} setActivityActionFilter={setActivityActionFilter} setActivityDateFrom={setActivityDateFrom} setActivityDateTo={setActivityDateTo} setActivityTableFilter={setActivityTableFilter} setActivityUserFilter={setActivityUserFilter} />
          )}
        </div>
      </div>

      {showOrderForm && <OrderFormModal branches={branches} equipment={equipment} technicians={technicians} clients={clients} onClose={() => setShowOrderForm(false)} onSave={createOrder} saving={saving} />}
      {showBulkOrders && <BulkOrderFormModal branches={branches} equipment={equipment} technicians={technicians} onClose={() => setShowBulkOrders(false)} onSave={createBulkOrders} saving={saving} />}
      {editingOrder && <OrderFormModal branches={branches} equipment={equipment} technicians={technicians} clients={clients} initial={editingOrder} initialExtraTechIds={orderTechnicians.filter((wt) => wt.work_order_id === editingOrder.id).map((wt) => wt.technician_id)} attachments={editingOrderAttachments} onDeleteAttachment={deleteOrderAttachment} onClose={() => { setEditingOrder(null); setEditingOrderAttachments([]); }} onSave={updateOrder} saving={saving} />}
      {orderFromIncident && (
        <OrderFormModal
          branches={branches}
          equipment={equipment}
          technicians={technicians}
          clients={clients}
          initial={{ title: orderFromIncident.title, branch_id: orderFromIncident.branch_id, equipment_id: orderFromIncident.equipment_id, client_id: orderFromIncident.client_id }}
          onClose={() => setOrderFromIncident(null)}
          onSave={(payload, files, extraTechIds) => createOrder(payload, files, extraTechIds, orderFromIncident.incidentId)}
          saving={saving}
        />
      )}
      {orderFromSalesOrder && (
        <OrderFormModal
          branches={branches}
          equipment={equipment}
          technicians={technicians}
          clients={clients}
          initial={{ title: orderFromSalesOrder.title, branch_id: orderFromSalesOrder.branch_id, equipment_id: orderFromSalesOrder.equipment_id, client_id: orderFromSalesOrder.client_id }}
          onClose={() => setOrderFromSalesOrder(null)}
          onSave={(payload, files, extraTechIds) => createOrder(payload, files, extraTechIds, null, orderFromSalesOrder.salesOrderId)}
          saving={saving}
        />
      )}
      {detailOrder && (
        <OrderDetailModal
          order={detailOrder}
          attachments={detailOrderAttachments}
          checklistItems={detailOrderChecklist}
          checklistTemplates={checklistTemplates}
          companyName={companyName}
          branchName={branchName}
          equipName={equipName}
          techName={techName}
          technicians={technicians}
          extraTechnicianIds={orderTechnicians.filter((wt) => wt.work_order_id === detailOrder.id).map((wt) => wt.technician_id)}
          extraTechnicianRows={orderTechnicians.filter((wt) => wt.work_order_id === detailOrder.id)}
          onUpdateTechnicianHours={updateOrderTechnicianHours}
          materials={materials}
          onInventoryChanged={reloadInventory}
          onRegisterLeftover={registerLeftover}
          techUsesProducts={techUsesProducts}
          products={products}
          productStock={productStock}
          defaultBranchId={defaultBranchId}
          canManageWarehouse={canManage}
          onAddPhoto={addOrderPhoto}
          onDeletePhoto={deleteDetailAttachment}
          clients={clients}
          equipType={equipType}
          onCreateIncidentFromChecklist={createIncidentFromChecklist}
          onSaveSignature={saveClientSignature}
          onClose={() => { setDetailOrder(null); setDetailOrderAttachments([]); setDetailOrderChecklist([]); }}
          onSave={saveOrderDetail}
          saving={saving}
          readOnly={(isTecnico && detailOrder.status === "completada") || !canEdit("orders")}
          isTecnico={isTecnico}
          onLoadChecklist={loadChecklistFromTemplate}
          onToggleChecklistItem={toggleChecklistItem}
          onChecklistFieldChange={editChecklistItemField}
          onChecklistFieldBlur={saveChecklistItemField}
          onClearChecklist={clearOrderChecklist}
        />
      )}
      {showAddChecklist && <ChecklistTemplateFormModal onClose={() => setShowAddChecklist(false)} onSave={saveChecklistTemplate} saving={saving} />}
      {editingChecklist && <ChecklistTemplateFormModal initial={editingChecklist} onClose={() => setEditingChecklist(null)} onSave={saveChecklistTemplate} saving={saving} />}
      {showAddBranch && <BranchFormModal onClose={() => setShowAddBranch(false)} onSave={saveBranch} saving={saving} />}
      {editingBranch && <BranchFormModal initial={editingBranch} onClose={() => setEditingBranch(null)} onSave={saveBranch} saving={saving} />}
      {showAddTech && <TechFormModal branches={branches} onClose={() => setShowAddTech(false)} onSave={saveTech} saving={saving} />}
      {editingTech && <TechFormModal branches={branches} initial={editingTech} onClose={() => setEditingTech(null)} onSave={saveTech} saving={saving} />}
      {showAddEquipment && (
        <EquipmentFormModal branches={branches} locations={locations} technicians={technicians} clients={clients} onClose={() => setShowAddEquipment(false)} onSave={saveEquipment} saving={saving}
          onRequestNewLocation={(branchId) => { setPendingLocationBranch(branchId); setShowAddLocation(true); }} />
      )}
      {editingEquipment && (
        <EquipmentFormModal branches={branches} locations={locations} technicians={technicians} clients={clients} initial={editingEquipment} onClose={() => setEditingEquipment(null)} onSave={saveEquipment} saving={saving}
          onRequestNewLocation={(branchId) => { setPendingLocationBranch(branchId); setShowAddLocation(true); }} />
      )}
      {showAddLocation && <LocationFormModal branches={branches} defaultBranchId={pendingLocationBranch} onClose={() => setShowAddLocation(false)} onSave={addLocation} saving={saving} />}
      {historyFor && <HistoryModal title={historyFor.title} orders={historyFor.orders} branchName={branchName} equipName={equipName} techName={techName} onClose={() => setHistoryFor(null)} />}
      {qrEquipmentId && !loadingScope && companyHasModule("tecnico") && (
        <EquipmentQrModal
          equipment={equipment.find((e) => e.id === qrEquipmentId) || null}
          orders={orders}
          incidents={visibleIncidents}
          branchName={branchName}
          locationName={locationName}
          techName={techName}
          companyName={companyName}
          companyLogo={company?.logo_url}
          canCreateOrder={canEdit("orders") && branches.length > 0}
          canReportIncident={canReportIncident}
          onNewOrder={(eq) => { closeQrEquipment(); setOrderPrefill({ branch_id: eq.branch_id, equipment_id: eq.id, client_id: eq.client_id || "", type: "correctivo", technician_id: eq.default_technician_id || "", scheduled: todayStrRD() }); }}
          onReportIncident={(eq) => { closeQrEquipment(); setIncidentPrefill({ branch_id: eq.branch_id, equipment_id: eq.id, client_id: eq.client_id || "", technician_id: eq.default_technician_id || "" }); }}
          onShowHistory={(eq, list) => setHistoryFor({ title: `Historial de ${eq.name}`, orders: list })}
          onClose={closeQrEquipment}
        />
      )}
      {portalClient && <ClientPortalLinkModal client={portalClient} companyId={companyId} companyName={companyName} canManage={!isTecnico} onClose={() => setPortalClient(null)} />}
      {showQrScanner && <QrScannerModal onDetected={handleQrScan} onClose={() => setShowQrScanner(false)} />}
      {orderPrefill && <OrderFormModal branches={branches} equipment={equipment} technicians={technicians} clients={clients} initial={orderPrefill} onClose={() => setOrderPrefill(null)} onSave={createOrder} saving={saving} />}
      {showAddClient && <ClientFormModal onClose={() => setShowAddClient(false)} onSave={saveClient} saving={saving} />}
      {editingClient && <ClientFormModal initial={editingClient} onClose={() => setEditingClient(null)} onSave={saveClient} saving={saving} />}
      {showAddAsset && <ClientAssetFormModal clients={clients} branches={branches} technicians={technicians} onClose={() => setShowAddAsset(false)} onSave={saveClientAsset} saving={saving} onRequestNewClient={() => setShowAddClient(true)} autoSelectClientId={autoSelectClientId} autoSelectToken={autoSelectToken} />}
      {editingAsset && <ClientAssetFormModal clients={clients} branches={branches} technicians={technicians} initial={editingAsset} onClose={() => setEditingAsset(null)} onSave={saveClientAsset} saving={saving} onRequestNewClient={() => setShowAddClient(true)} autoSelectClientId={autoSelectClientId} autoSelectToken={autoSelectToken} />}
      {showAddProduct && (
        <ProductFormModal
          existingProducts={products.filter((p) => (p.item_type || "producto") === (view === "services" ? "servicio" : "producto"))}
          allProducts={products}
          branches={branches}
          restrictToBranchIds={!isAdmin && profile.branch_id ? [profile.branch_id, ...(profile.extra_branch_ids || [])] : null}
          showTechFlag={techUsesProducts}
          defaultItemType={view === "services" ? "servicio" : "producto"}
          onClose={() => setShowAddProduct(false)}
          onSave={saveProduct}
          saving={saving}
        />
      )}
      {editingProduct && (
        <ProductFormModal
          initial={editingProduct}
          initialComponents={productComponents.filter((c) => c.parent_product_id === editingProduct.id)}
          existingProducts={products.filter((p) => (p.item_type || "producto") === (editingProduct.item_type || "producto"))}
          allProducts={products}
          branches={branches}
          restrictToBranchIds={!isAdmin && profile.branch_id ? [profile.branch_id, ...(profile.extra_branch_ids || [])] : null}
          showTechFlag={techUsesProducts}
          onClose={() => setEditingProduct(null)}
          onSave={saveProduct}
          saving={saving}
        />
      )}
      {showAddSupplier && <SupplierFormModal onClose={() => setShowAddSupplier(false)} onSave={saveSupplier} saving={saving} />}
      {editingSupplier && <SupplierFormModal initial={editingSupplier} onClose={() => setEditingSupplier(null)} onSave={saveSupplier} saving={saving} />}
      {showAddExpense && <ExpenseFormModal suppliers={suppliers} ncfSequences={ncfSequences} onClose={() => setShowAddExpense(false)} onSave={saveExpense} saving={saving} />}
      {editingExpense && <ExpenseFormModal suppliers={suppliers} ncfSequences={ncfSequences} initial={editingExpense} onClose={() => setEditingExpense(null)} onSave={saveExpense} saving={saving} />}
      {showAddTool && <ToolFormModal branches={branches} technicians={technicians} onClose={() => setShowAddTool(false)} onSave={saveTool} saving={saving} />}
      {editingTool && <ToolFormModal branches={branches} technicians={technicians} initial={editingTool} onClose={() => setEditingTool(null)} onSave={saveTool} saving={saving} />}
      {showAddToolList && <ToolListFormModal tools={tools} technicians={technicians} onClose={() => setShowAddToolList(false)} onSave={saveToolList} saving={saving} />}
      {editingToolList && <ToolListFormModal tools={tools} technicians={technicians} initial={editingToolList} onClose={() => setEditingToolList(null)} onSave={saveToolList} saving={saving} />}
      {showBulkTools && <BulkToolFormModal branches={branches} technicians={technicians} onClose={() => setShowBulkTools(false)} onSave={createBulkTools} saving={saving} />}
      {showAddMaterial && <MaterialFormModal branches={branches} leftoverMode={techUsesProducts} onClose={() => setShowAddMaterial(false)} onSave={saveMaterial} saving={saving} />}
      {editingMaterial && <MaterialFormModal branches={branches} leftoverMode={techUsesProducts} initial={editingMaterial} onClose={() => setEditingMaterial(null)} onSave={saveMaterial} saving={saving} />}
      {showAddProject && <ProjectFormModal branches={branches} clients={clients} technicians={technicians} onClose={() => setShowAddProject(false)} onSave={saveProject} saving={saving} />}
      {editingProject && (
        <ProjectFormModal
          branches={branches} clients={clients} technicians={technicians} initial={editingProject}
          onClose={() => setEditingProject(null)} onSave={saveProject} saving={saving}
        />
      )}
      {projectDetail && (
        <ProjectDetailModal
          project={projectDetail} clients={clients} branches={branches} technicians={technicians}
          orders={orders} orderTechnicians={orderTechnicians} salesOrders={salesOrders} materials={materials} projectMaterials={projectMaterials}
          canEditProjects={canEdit("projects")} canDeleteProjects={canDelete("projects")} canManageWarehouse={canManage} saving={saving}
          onClose={() => setProjectDetail(null)}
          onEdit={(p) => { setProjectDetail(null); setEditingProject(p); }}
          onDelete={deleteProject}
          onSetStatus={setProjectStatus}
          onLinkOrder={linkOrderToProject}
          onUnlinkOrder={unlinkOrderFromProject}
          onLinkSalesOrder={linkSalesOrderToProject}
          onUnlinkSalesOrder={unlinkSalesOrderFromProject}
          onAddMaterial={addProjectMaterial}
          onRemoveMaterial={removeProjectMaterial}
          techUsesProducts={techUsesProducts}
          products={products}
          productStock={productStock}
          defaultBranchId={defaultBranchId}
          onRegisterLeftover={registerLeftover}
        />
      )}
      {showAddAccount && <AccountFormModal onClose={() => setShowAddAccount(false)} onSave={saveAccount} saving={saving} />}
      {editingAccount && <AccountFormModal initial={editingAccount} onClose={() => setEditingAccount(null)} onSave={saveAccount} saving={saving} />}
      {showAddTaxRate && <TaxRateFormModal onClose={() => setShowAddTaxRate(false)} onSave={saveTaxRate} saving={saving} />}
      {editingTaxRate && <TaxRateFormModal initial={editingTaxRate} onClose={() => setEditingTaxRate(null)} onSave={saveTaxRate} saving={saving} />}
      {editingPermissionsFor && <UserPermissionsModal user={editingPermissionsFor} branches={branches} onClose={() => setEditingPermissionsFor(null)} onSave={updateUserPermissions} onUpdateBranch={updateUserBranch} onUpdateRole={updateUserRole} onToggleActive={toggleUserActive} saving={saving} />}
      {showAddPurchase && (() => {
        const receipt = prefillReceiptId ? goodsReceipts.find((r) => r.id === prefillReceiptId) : null;
        const prefill = receipt
          ? {
              supplier_id: receipt.supplier_id,
              goods_receipt_id: receipt.id,
              branch_id: receipt.branch_id || null,
              receiptLabel: receipt.receipt_number,
              items: goodsReceiptItems.filter((it) => it.goods_receipt_id === receipt.id).map((it) => ({ product_id: it.product_id, quantity: it.quantity, unit_cost: it.unit_cost })),
            }
          : null;
        return (
          <PurchaseFormModal
            suppliers={suppliers}
            products={products}
            ncfSequences={ncfSequences}
            branches={vendorScopedBranches}
            defaultBranchId={profile.branch_id || null}
            prefill={prefill}
            onClose={() => { setShowAddPurchase(false); setPrefillReceiptId(null); }}
            onSave={createPurchase}
            saving={saving}
            onRequestNewSupplier={() => setShowAddSupplier(true)}
            onEnsureGenericProduct={ensureGenericPurchaseProduct}
          />
        );
      })()}
      {purchaseDetail && (
        <PurchaseDetailModal
          purchase={purchaseDetail.purchase}
          items={purchaseDetail.items}
          payments={purchaseDetail.payments}
          supplierName={suppliers.find((s) => s.id === purchaseDetail.purchase.supplier_id)?.name || "—"}
          supplierRnc={suppliers.find((s) => s.id === purchaseDetail.purchase.supplier_id)?.rnc || ""}
          companyName={companyName}
          company={company}
          canEdit={canEdit("purchases")}
          canDelete={canDelete("purchases")}
          onClose={() => setPurchaseDetail(null)}
          onRegisterPayment={registerPurchasePayment}
          onDeletePayment={deletePurchasePayment}
          onUpdate606={updatePurchase606}
          b11Sequences={issuableSequences(ncfSequences, "B11", purchaseDetail.purchase.purchase_date)}
          onIssueB11={(purchase, seqId) => issueDocumentNcf("purchase", purchase, seqId)}
        />
      )}
      {showAddPurchaseOrder && (
        <PurchaseOrderFormModal
          suppliers={suppliers}
          branches={branches}
          products={products}
          onClose={() => setShowAddPurchaseOrder(false)}
          onSave={createPurchaseOrder}
          saving={saving}
          onRequestNewSupplier={() => setShowAddSupplier(true)}
        />
      )}
      {purchaseOrderDetail && (
        <PurchaseOrderDetailModal
          po={purchaseOrderDetail}
          items={purchaseOrderItems.filter((it) => it.purchase_order_id === purchaseOrderDetail.id).map((it) => ({ ...it, productName: products.find((p) => p.id === it.product_id)?.name || "Producto eliminado" }))}
          supplierName={suppliers.find((s) => s.id === purchaseOrderDetail.supplier_id)?.name || "—"}
          branchName={branches.find((b) => b.id === purchaseOrderDetail.branch_id)?.name || ""}
          canEdit={canEdit("purchaseOrders")}
          onClose={() => setPurchaseOrderDetail(null)}
          onCancel={cancelPurchaseOrder}
          onDelete={deletePurchaseOrder}
          onReceive={(po) => { setReceiptFromOrder(po); setShowAddReceipt(true); }}
        />
      )}
      {showAddReceipt && (
        <GoodsReceiptFormModal
          suppliers={suppliers}
          branches={branches}
          products={products}
          openOrders={purchaseOrders.filter((po) => po.status === "pendiente" || po.status === "parcial")}
          orderItemsFor={(poId) => purchaseOrderItems.filter((it) => it.purchase_order_id === poId)}
          fromOrder={receiptFromOrder}
          onClose={() => { setShowAddReceipt(false); setReceiptFromOrder(null); }}
          onSave={createGoodsReceipt}
          saving={saving}
        />
      )}
      {receiptDetail && (
        <GoodsReceiptDetailModal
          receipt={receiptDetail}
          items={goodsReceiptItems.filter((it) => it.goods_receipt_id === receiptDetail.id).map((it) => ({ ...it, productName: products.find((p) => p.id === it.product_id)?.name || "Producto eliminado" }))}
          supplierName={suppliers.find((s) => s.id === receiptDetail.supplier_id)?.name || "—"}
          branchName={branches.find((b) => b.id === receiptDetail.branch_id)?.name || ""}
          orderNumber={purchaseOrders.find((po) => po.id === receiptDetail.purchase_order_id)?.order_number || ""}
          invoiced={purchases.some((p) => p.goods_receipt_id === receiptDetail.id)}
          canEdit={canEdit("deliveryNotes")}
          onClose={() => setReceiptDetail(null)}
          onDelete={deleteGoodsReceipt}
          onInvoice={(r) => { setPrefillReceiptId(r.id); setShowAddPurchase(true); }}
        />
      )}
      {showAddNcf && <NCFSequenceFormModal onClose={() => setShowAddNcf(false)} onSave={saveNcfSequence} saving={saving} />}
      {editingNcf && <NCFSequenceFormModal initial={editingNcf} onClose={() => setEditingNcf(null)} onSave={saveNcfSequence} saving={saving} />}
      {showAddInvoice && (
        <InvoiceFormModal
          clients={clients}
          products={products}
          ncfSequences={ncfSequences}
          branches={vendorScopedBranches}
          bankAccounts={companyBankAccounts}
          defaultBranchId={profile.branch_id}
          prefill={invoicePrefill}
          maxDiscountPct={maxDiscountPct}
          onClose={() => { setShowAddInvoice(false); setInvoicePrefill(null); }}
          onSave={createInvoice}
          saving={saving}
          onRequestNewClient={() => setShowAddClient(true)}
          autoSelectClientId={autoSelectClientId}
          autoSelectToken={autoSelectToken}
        />
      )}
      {showAddQuote && (
        <QuoteFormModal
          clients={clients}
          products={products}
          branches={vendorScopedBranches}
          defaultBranchId={profile.branch_id}
          prefill={quotePrefill}
          maxDiscountPct={maxDiscountPct}
          onClose={() => { setShowAddQuote(false); setQuotePrefill(null); }}
          onSave={(payload, items) => createQuote(payload, items, quotePrefill?.incidentId)}
          saving={saving}
          onRequestNewClient={() => setShowAddClient(true)}
          onCreateClientFromDgii={createClientFromDgii}
          autoSelectClientId={autoSelectClientId}
          autoSelectToken={autoSelectToken}
        />
      )}
      {quoteDetail && (
        <QuoteDetailModal
          quote={quoteDetail.quote}
          items={quoteDetail.items}
          clientName={clients.find((c) => c.id === quoteDetail.quote.client_id)?.name || "—"}
          clientRnc={clients.find((c) => c.id === quoteDetail.quote.client_id)?.rnc_cedula || ""}
          clientAddress={clients.find((c) => c.id === quoteDetail.quote.client_id)?.address || ""}
          companyName={companyName}
          company={company}
          bankAccounts={companyBankAccounts}
          orderInfo={salesOrders.find((o) => o.quote_id === quoteDetail.quote.id) || null}
          canEdit={canEdit("quotes")}
          canDelete={canDelete("quotes")}
          onClose={() => setQuoteDetail(null)}
          onMarkStatus={markQuoteStatus}
          onConvertToOrder={convertQuoteToOrder}
          onEdit={openEditQuote}
          onDuplicate={duplicateQuote}
          onDelete={deleteQuote}
        />
      )}
      {salesOrderDetail && (
        <SalesOrderDetailModal
          order={salesOrderDetail.order}
          items={salesOrderDetail.items}
          clientName={clients.find((c) => c.id === salesOrderDetail.order.client_id)?.name || "—"}
          clientRnc={clients.find((c) => c.id === salesOrderDetail.order.client_id)?.rnc_cedula || ""}
          companyName={companyName}
          company={company}
          workOrderInfo={orders.find((o) => o.id === salesOrderDetail.order.work_order_id) || null}
          canEdit={canEdit("salesOrders")}
          canDelete={canDelete("salesOrders")}
          onClose={() => setSalesOrderDetail(null)}
          onGenerateInvoice={generateInvoiceFromOrder}
          onGenerateWorkOrder={convertSalesOrderToWorkOrder}
          onCancel={cancelSalesOrder}
          onDelete={deleteSalesOrder}
          onUpdateNotes={updateSalesOrderNotes}
        />
      )}
      {editingQuote && (
        <QuoteFormModal
          clients={clients}
          products={products}
          branches={vendorScopedBranches}
          defaultBranchId={profile.branch_id}
          initial={editingQuote}
          initialItems={editingQuoteItems}
          maxDiscountPct={maxDiscountPct}
          onClose={() => { setEditingQuote(null); setEditingQuoteItems(null); }}
          onSave={updateQuote}
          saving={saving}
          onRequestNewClient={() => setShowAddClient(true)}
          onCreateClientFromDgii={createClientFromDgii}
          autoSelectClientId={autoSelectClientId}
          autoSelectToken={autoSelectToken}
        />
      )}
      {(showAddIncident || incidentPrefill) && (
        <IncidentFormModal
          branches={branches}
          equipment={equipment}
          clients={clients}
          technicians={technicians}
          initial={incidentPrefill || undefined}
          onClose={() => { setShowAddIncident(false); setIncidentPrefill(null); }}
          onSave={saveIncident}
          saving={saving}
          onRequestNewClient={() => setShowAddClient(true)}
          autoSelectClientId={autoSelectClientId}
          autoSelectToken={autoSelectToken}
        />
      )}
      {editingIncident && (
        <IncidentFormModal
          branches={branches}
          equipment={equipment}
          clients={clients}
          technicians={technicians}
          initial={editingIncident}
          onClose={() => setEditingIncident(null)}
          onSave={saveIncident}
          saving={saving}
          onRequestNewClient={() => setShowAddClient(true)}
          autoSelectClientId={autoSelectClientId}
          autoSelectToken={autoSelectToken}
        />
      )}
      {incidentDetail && (
        <IncidentDetailModal
          incident={incidentDetail}
          branchName={branchName}
          equipName={equipName}
          clientName={(id) => clients.find((c) => c.id === id)?.name || "—"}
          techName={techName}
          technicians={technicians}
          orders={orders}
          quotes={quotes}
          canEdit={canEdit("incidents")}
          canDelete={canDelete("incidents")}
          isTecnico={isTecnico}
          onClose={() => setIncidentDetail(null)}
          onMarkStatus={markIncidentStatus}
          onConvertOrder={convertIncidentToOrder}
          onConvertQuote={convertIncidentToQuote}
          onDelete={deleteIncident}
          onSaveProgress={saveIncidentProgress}
          onComplete={completeIncident}
          onEdit={(inc) => { setIncidentDetail(null); setEditingIncident(inc); }}
          onAssignTechnician={assignIncidentTechnician}
          onReopen={reopenIncident}
        />
      )}
      {showStatement && <StatementModal clients={clients} invoices={invoices} companyName={companyName} onClose={() => setShowStatement(false)} />}
      {invoiceDetail && (
        <InvoiceDetailModal
          invoice={invoiceDetail.invoice}
          items={invoiceDetail.items}
          payments={invoiceDetail.payments}
          clientName={clients.find((c) => c.id === invoiceDetail.invoice.client_id)?.name || "—"}
          clientRnc={clients.find((c) => c.id === invoiceDetail.invoice.client_id)?.rnc_cedula || ""}
          clientAddress={clients.find((c) => c.id === invoiceDetail.invoice.client_id)?.address || ""}
          companyName={companyName}
          company={company}
          bankAccounts={companyBankAccounts}
          cardAcquirers={cardAcquirers}
          canEdit={canEdit("invoices")}
          canDelete={canDelete("invoices")}
          isAdmin={isAdmin}
          onClose={() => setInvoiceDetail(null)}
          onVoid={voidInvoice}
          onRegisterPayment={registerPayment}
          onDeletePayment={deletePayment}
          onDeletePaymentAttachment={deletePaymentAttachment}
        />
      )}
      {showStockTransfer && (
        <StockTransferModal branches={branches} products={products} stockAt={stockAt} defaultFromId={profile.branch_id || null} saving={saving} onClose={() => setShowStockTransfer(false)} onSave={transferStock} />
      )}
      {stockAdjustFor && (
        <StockAdjustModal branches={vendorScopedBranches} products={products} stockAt={stockAt} initialProductId={stockAdjustFor === true ? "" : stockAdjustFor.id} defaultBranchId={profile.branch_id || null} saving={saving} onClose={() => setStockAdjustFor(null)} onSave={adjustStock} />
      )}
      {stockMovementsFor && (
        <StockMovementsModal product={products.find((x) => x.id === stockMovementsFor.id) || stockMovementsFor} branches={branches} onClose={() => setStockMovementsFor(null)} />
      )}
      {voidingInvoice && (
        <VoidInvoiceModal invoice={voidingInvoice} saving={saving} onClose={() => setVoidingInvoice(null)} onConfirm={confirmVoidInvoice} />
      )}
      {showAddCreditNote && (
        <CreditNoteFormModal
          invoices={invoices}
          clients={clients}
          ncfSequences={ncfSequences}
          onClose={() => setShowAddCreditNote(false)}
          onSave={createCreditNote}
          saving={saving}
        />
      )}
      {showAddContract && (
        <RecurringContractFormModal
          clients={clients}
          branches={branches}
          ncfSequences={ncfSequences}
          onClose={() => setShowAddContract(false)}
          onSave={saveRecurringContract}
          saving={saving}
        />
      )}
      {editingContract && (
        <RecurringContractFormModal
          clients={clients}
          branches={branches}
          ncfSequences={ncfSequences}
          initial={editingContract}
          onClose={() => setEditingContract(null)}
          onSave={saveRecurringContract}
          saving={saving}
        />
      )}
      {exchangeRatePrompt && (
        <ExchangeRatePromptModal
          contracts={exchangeRatePrompt.contracts}
          onClose={() => setExchangeRatePrompt(null)}
          onConfirm={confirmExchangeRatePrompt}
          saving={saving}
        />
      )}
      {creditNoteDetail && (
        <CreditNoteDetailModal
          note={creditNoteDetail.note}
          items={creditNoteDetail.items}
          invoice={invoices.find((i) => i.id === creditNoteDetail.note.invoice_id) || null}
          clientName={clients.find((c) => c.id === creditNoteDetail.note.client_id)?.name || "—"}
          clientRnc={clients.find((c) => c.id === creditNoteDetail.note.client_id)?.rnc_cedula || ""}
          companyName={companyName}
          company={company}
          onClose={() => setCreditNoteDetail(null)}
        />
      )}
      {showInvite && (
        <InviteFormModal
          technicians={technicians}
          branches={branches}
          saving={saving}
          generatedLink={inviteLink}
          onClose={() => setShowInvite(false)}
          onSave={createInvite}
          onCloseAfterLink={() => { setShowInvite(false); setInviteLink(""); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Punto de entrada: controla sesión / perfil / invitación / onboarding / app
// ---------------------------------------------------------------------------
export default function MantenProApp() {
  const [inviteToken] = useState(() => new URLSearchParams(window.location.search).get("invite"));
  // Portal del cliente: con ?portal=<token> se muestra el portal sin pedir inicio de sesión.
  const [portalToken] = useState(() => new URLSearchParams(window.location.search).get("portal"));
  const [authLoading, setAuthLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(undefined);
  const [company, setCompany] = useState(null);
  const [inviteInfo, setInviteInfo] = useState(undefined); // undefined = sin cargar, null = no hay/invalida
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  const loadProfile = async (userId) => {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error) { console.error(error); setProfile(null); return; }
    setProfile(data || null);
    if (data?.company_id) {
      const { data: comp } = await supabase.from("companies").select("*").eq("id", data.company_id).single();
      // Logos viejos guardados como enlace "público" del almacenamiento privado no abren:
      // se ignoran (no sale una imagen rota) hasta que se vuelva a subir el logo.
      if (comp?.logo_url && comp.logo_url.includes("/storage/v1/object/public/evidence/")) comp.logo_url = null;
      setCompany(comp || null);
    }
  };

  const checkPlatformAdmin = async (userId) => {
    const { data } = await supabase.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
    setIsPlatformAdmin(!!data);
  };

  const loadInvite = async () => {
    if (!inviteToken) { setInviteInfo(null); return; }
    // get_invite_by_token reemplaza el "select * from invites where token = ..." directo.
    // Antes la tabla "invites" tenía una política RLS que permitía leer TODAS las filas
    // (de cualquier empresa) a cualquiera, autenticado o no — necesaria para que esta
    // pantalla, que se carga antes de iniciar sesión, pudiera buscar por token. El problema
    // es que esa misma política dejaba a cualquiera hacer un "select *" sin filtro y ver
    // los correos, roles y tokens de TODAS las invitaciones pendientes de TODAS las
    // empresas. Esta función solo devuelve la invitación puntual que coincide con el token,
    // así que ya se puede (y se debe) quitar esa política abierta.
    const { data, error } = await supabase.rpc("get_invite_by_token", { p_token: inviteToken });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) { setInviteInfo(null); return; }
    setInviteInfo({ ...row, companyName: row.company_name || "tu nueva empresa" });
  };

  // Usuario cuyo perfil ya está cargado. Supabase vuelve a avisar "hay sesión" cada vez que
  // renueva el token (más o menos cada hora) y cuando la pestaña o la app vuelve a tener el
  // foco. Antes cada aviso ponía la pantalla de "Cargando..." y volvía a montar toda la app:
  // se cerraban los formularios abiertos y se perdía lo que se estaba escribiendo. Ahora solo
  // se recarga el perfil si de verdad entró OTRO usuario (o si se cerró la sesión).
  const loadedUserIdRef = useRef(null);
  useEffect(() => {
    loadInvite();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session && loadedUserIdRef.current !== session.user.id) {
        loadedUserIdRef.current = session.user.id;
        await loadProfile(session.user.id);
        await checkPlatformAdmin(session.user.id);
      }
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      setSession(session);
      if (!session) {
        loadedUserIdRef.current = null;
        setProfile(undefined);
        setCompany(null);
        setIsPlatformAdmin(false);
        return;
      }
      if (loadedUserIdRef.current === session.user.id) return; // mismo usuario: token renovado o foco
      loadedUserIdRef.current = session.user.id;
      // Fuera del callback: Supabase recomienda no esperar otras llamadas suyas dentro de
      // onAuthStateChange (puede trabarse).
      setTimeout(async () => {
        setAuthLoading(true);
        await loadProfile(session.user.id);
        await checkPlatformAdmin(session.user.id);
        setAuthLoading(false);
      }, 0);
    });
    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line
  }, []);

  const signOut = () => supabase.auth.signOut();

  if (portalToken) return <ClientPortal token={portalToken} />;
  if (authLoading || inviteInfo === undefined) return <FullScreenLoader label="Cargando..." />;
  if (!session) return <AuthScreen inviteInfo={inviteInfo} />;

  if (passwordRecovery) {
    return <ChangePasswordModal title="Pon tu nueva contraseña" onDone={() => setPasswordRecovery(false)} />;
  }

  if (profile === undefined) return <FullScreenLoader label="Cargando tu perfil..." />;

  if (profile === null && inviteInfo) {
    return <InviteAcceptScreen session={session} inviteInfo={inviteInfo} onDone={() => loadProfile(session.user.id)} onSignOut={signOut} />;
  }
  if (profile === null && isPlatformAdmin) {
    return <SupportViewer onSignOut={signOut} />;
  }
  if (profile === null) return <OnboardingScreen userId={session.user.id} userEmail={session.user.email} onDone={() => loadProfile(session.user.id)} />;

  if (profile.is_active === false) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center" style={{ background: C.bg, color: C.text, fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <div className="max-w-sm text-center p-6">
          <div className="text-lg font-bold mb-2">Cuenta desactivada</div>
          <div className="text-sm mb-5" style={{ color: C.muted }}>Tu acceso fue desactivado por un administrador de tu empresa. Si crees que es un error, contáctalo directamente.</div>
          <button onClick={signOut} className="px-4 py-2 text-sm font-semibold" style={{ background: "#8FD14F", color: "#1A1500" }}>Cerrar sesión</button>
        </div>
      </div>
    );
  }

  // Suspensión de la empresa por cobro (billing_status manual, gestionado desde
  // Modo Soporte). Aplica a cualquier rol, incluido Admin: si un admin de empresa
  // pudiera saltarse esto, no serviría como bloqueo real. El backend además impide
  // que alguien que no sea platform_admin reactive la empresa por su cuenta
  // (trigger protect_company_billing_status), así que este bloqueo no depende
  // solo de que la UI lo respete.
  if (company?.billing_status === "suspendida") {
    return (
      <div className="w-full min-h-screen flex items-center justify-center" style={{ background: C.bg, color: C.text, fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <div className="max-w-sm text-center p-6">
          <div className="text-lg font-bold mb-2">Acceso suspendido</div>
          <div className="text-sm mb-3" style={{ color: C.muted }}>El acceso de tu empresa a MantenPro está suspendido por un tema de facturación.</div>
          {company.billing_note && (
            <div className="text-sm mb-5 p-3 text-left" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }}>{company.billing_note}</div>
          )}
          <div className="text-xs mb-5" style={{ color: C.muted }}>Contacta a quien administra tu suscripción de MantenPro para reactivar el acceso.</div>
          <button onClick={signOut} className="px-4 py-2 text-sm font-semibold" style={{ background: "#8FD14F", color: "#1A1500" }}>Cerrar sesión</button>
        </div>
      </div>
    );
  }

  return <Dashboard session={session} profile={profile} company={company} onUpdateCompany={setCompany} onSignOut={signOut} />;
}
