const {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useDeferredValue
} = React;
const CFG = {
  currency: '$',
  currencyCode: 'USD',
  taxRate: 0,
  taxInclusive: false,
  invoicePrefix: 'INV-',
  lowStockDefault: 5,
  receiptHeader: '',
  receiptFooter: 'Faleminderit për blerjen!',
  business: {
    name: 'My Business',
    address: '',
    phone: '',
    email: '',
    nipt: ''
  },
  logoUrl: '',
  paymentMethods: null,
  warehouses: [],
  customUnits: [],
  expenseCategories: null
};
function applySettings(s) {
  if (!s) return;
  CFG.currency = s.currencySymbol || CFG.currency;
  CFG.currencyCode = s.currencyCode || CFG.currencyCode;
  CFG.taxRate = Number(s.taxRate) || 0;
  CFG.taxInclusive = !!s.taxInclusive;
  CFG.invoicePrefix = s.invoicePrefix || CFG.invoicePrefix;
  CFG.lowStockDefault = s.lowStockDefault != null && s.lowStockDefault !== '' ? Number(s.lowStockDefault) : CFG.lowStockDefault;
  CFG.receiptHeader = s.receiptHeader || '';
  CFG.receiptFooter = s.receiptFooter || CFG.receiptFooter;
  CFG.logoUrl = s.logoUrl || '';
  CFG.business = {
    name: s.businessName || CFG.business.name,
    address: s.address || '',
    phone: s.phone || '',
    email: s.email || '',
    nipt: s.nipt || s.nipti || CFG.business.nipt || ''
  };
  CFG.nipt = s.nipt || s.nipti || CFG.nipt || '';
  CFG.paymentMethods = Array.isArray(s.paymentMethods) ? s.paymentMethods : CFG.paymentMethods || null;
  CFG.warehouses = Array.isArray(s.warehouses) ? s.warehouses : CFG.warehouses || [];
  CFG.customUnits = Array.isArray(s.customUnits) ? s.customUnits : CFG.customUnits || [];
  CFG.expenseCategories = Array.isArray(s.expenseCategories) ? s.expenseCategories : CFG.expenseCategories || null;
}
const ConfigContext = React.createContext({
  settings: {},
  categories: [],
  refreshConfig: () => {},
  setActiveMenu: null,
  requestCreate: null
});
const useConfig = () => React.useContext(ConfigContext);
function useAppNav() {
  const cfg = useConfig();
  return {
    go: (menuId, create) => {
      try {
        if (create) localStorage.setItem('erp_open_create', create);
        if (cfg && typeof cfg.setActiveMenu === 'function') cfg.setActiveMenu(menuId);
      } catch (e) {}
    },
    consumeCreate: key => {
      try {
        const v = localStorage.getItem('erp_open_create');
        if (v === key) {
          localStorage.removeItem('erp_open_create');
          return true;
        }
      } catch (e) {}
      return false;
    }
  };
}
function usePaymentOpts() {
  const {
    settings
  } = useConfig();
  return useMemo(() => {
    const fromSettings = settings && settings.paymentMethods || CFG.paymentMethods;
    if (Array.isArray(fromSettings) && fromSettings.length) {
      return fromSettings.map(function (p) {
        if (typeof p === 'string') return {
          value: p,
          label: p
        };
        return {
          value: p.value || p.label,
          label: p.label || p.value
        };
      });
    }
    return PAYMENT_OPTS;
  }, [settings]);
}
function useExpenseCategoryOpts() {
  const {
    settings
  } = useConfig();
  return useMemo(() => {
    const fromSettings = settings && settings.expenseCategories || CFG.expenseCategories;
    if (Array.isArray(fromSettings) && fromSettings.length) {
      return fromSettings.map(function (c) {
        const name = typeof c === 'string' ? c : c.name || c.label || c.value;
        return {
          value: name,
          label: name
        };
      });
    }
    return EXPENSE_CATEGORY_OPTS;
  }, [settings]);
}
function useWarehouseOpts(products) {
  const {
    settings
  } = useConfig();
  return useMemo(() => {
    const set = new Set(['Magazina Kryesore']);
    (settings && settings.warehouses || CFG.warehouses || []).forEach(function (w) {
      if (w) set.add(String(w));
    });
    (products || []).forEach(function (p) {
      if (p.location) set.add(p.location);
      if (p.warehouse) set.add(p.warehouse);
    });
    return Array.from(set).filter(Boolean).map(function (w) {
      return {
        value: w,
        label: w
      };
    });
  }, [settings, products]);
}
function useUnitNameOpts() {
  const {
    settings
  } = useConfig();
  return useMemo(() => {
    const base = ['copë', 'kg', 'L', 'm', 'koli', 'pako', 'kuti', 'paletë', 'set'];
    const extra = (settings && settings.customUnits || CFG.customUnits || []).map(String);
    const all = Array.from(new Set(base.concat(extra).filter(Boolean)));
    return all.map(function (u) {
      return {
        value: u,
        label: u
      };
    });
  }, [settings]);
}
async function ieQuickAddSettingList(field, value, user) {
  const val = String(value || '').trim();
  if (!val) return {
    success: false,
    message: 'Vlera bosh'
  };
  const cur = await fbGetSettings();
  const data = cur && cur.success && cur.data ? Object.assign({}, cur.data) : {};
  const list = Array.isArray(data[field]) ? data[field].slice() : [];
  const exists = list.some(function (x) {
    const n = typeof x === 'string' ? x : x && (x.name || x.label || x.value);
    return String(n || '').toLowerCase() === val.toLowerCase();
  });
  if (!exists) {
    if (field === 'paymentMethods') list.push({
      value: val,
      label: val
    });else list.push(val);
  }
  data[field] = list;
  const res = await fbSaveSettings(data, user || {
    email: 'system'
  });
  if (res.success) {
    if (field === 'paymentMethods') CFG.paymentMethods = list;
    if (field === 'warehouses') CFG.warehouses = list;
    if (field === 'customUnits') CFG.customUnits = list;
    if (field === 'expenseCategories') CFG.expenseCategories = list;
  }
  return res.success ? {
    success: true,
    value: val,
    list: list
  } : res;
}
const useCategoryOpts = () => {
  const {
    categories
  } = useConfig();
  return useMemo(() => categories.length ? categories.map(c => ({
    value: c.name,
    label: c.name
  })) : CATEGORY_OPTS, [categories]);
};
const LOGO_URL = 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiGXxCe0WNNedmFqSWeF761f7Kshhc-NP5ChRQKz9fr97cO8VaarvD0KlCwqHojJVBWv-RAxfOqMI5rD4H78KnARyOc6QgwL1nRRFWf5xNQ1d9F9HfAoLPPGlTyP0GwNl4n-INMEsWLQ4Y7zJtz5bOdAnc2ePH9-uCRgshlo6BsS6gJEz6fhrxL-5U5O3sX/s160/channels4_profile.jpg';
const CATEGORY_OPTS = [{
  value: 'Electronics',
  label: 'Electronics'
}, {
  value: 'Clothing',
  label: 'Clothing'
}, {
  value: 'Food',
  label: 'Food'
}, {
  value: 'Services',
  label: 'Services'
}, {
  value: 'Other',
  label: 'Other'
}];
const ACTIVE_OPTS = [{
  value: '1',
  label: 'Active'
}, {
  value: '0',
  label: 'Inactive'
}];
const LOW_STOCK_OPTS = [{
  value: '1',
  label: 'Low Stock Only'
}];
const ROLE_OPTS = [{
  value: 'Admin',
  label: 'Admin (të gjitha të drejtat)'
}, {
  value: 'Manager',
  label: 'Menaxher'
}, {
  value: 'Sales',
  label: 'Shitës / POS'
}, {
  value: 'Warehouse',
  label: 'Magazinier'
}, {
  value: 'User',
  label: 'Përdorues (i kufizuar)'
}];
const ROLE_RIGHTS = {
  Admin: {
    all: true
  },
  Manager: {
    dashboard: true,
    pos: true,
    products: true,
    stock: true,
    'sales-history': true,
    reports: true,
    records: true,
    suppliers: true,
    'purchase-orders': true,
    'warehouse-receipts-in': true,
    expenses: true,
    users: false,
    settings: false,
    logs: true,
    about: true,
    'import-export': true,
    canCreate: true,
    canEdit: true,
    canDelete: true,
    canExport: true
  },
  Sales: {
    dashboard: true,
    pos: true,
    products: true,
    stock: false,
    'sales-history': true,
    reports: true,
    records: true,
    suppliers: false,
    'purchase-orders': false,
    'warehouse-receipts-in': false,
    expenses: false,
    users: false,
    settings: false,
    logs: false,
    about: true,
    'import-export': false,
    canCreate: true,
    canEdit: true,
    canDelete: false,
    canExport: true
  },
  Warehouse: {
    dashboard: true,
    pos: false,
    products: true,
    stock: true,
    'sales-history': false,
    reports: true,
    records: false,
    suppliers: true,
    'purchase-orders': true,
    'warehouse-receipts-in': true,
    expenses: false,
    users: false,
    settings: false,
    logs: false,
    about: true,
    'import-export': false,
    canCreate: true,
    canEdit: true,
    canDelete: false,
    canExport: true
  },
  User: {
    dashboard: false,
    pos: true,
    products: true,
    stock: false,
    'sales-history': true,
    reports: false,
    records: true,
    suppliers: false,
    'purchase-orders': false,
    'warehouse-receipts-in': false,
    expenses: false,
    users: false,
    settings: false,
    logs: false,
    about: true,
    'import-export': false,
    canCreate: true,
    canEdit: true,
    canDelete: false,
    canExport: false
  }
};
const RIGHT_LABELS = {
  dashboard: 'Paneli',
  pos: 'POS / Shitje',
  products: 'Produktet',
  stock: 'Inventari',
  'sales-history': 'Porositë',
  reports: 'Raportet',
  'alpha-reports': 'Raporte Alpha',
  records: 'Klientët',
  suppliers: 'Furnitorët',
  'purchase-orders': 'Porosi blerje',
  'warehouse-receipts-in': 'Fletë Hyrje',
  expenses: 'Shpenzimet',
  users: 'Përdoruesit',
  settings: 'Cilësimet',
  logs: 'Aktiviteti',
  about: 'Rreth',
  'import-export': 'Import/Eksport',
  canCreate: 'Krijon',
  canEdit: 'Ndryshon',
  canDelete: 'Fshin',
  canExport: 'Eksport PDF/Excel'
};
function getRights(role) {
  const r = ROLE_RIGHTS[role] || ROLE_RIGHTS.User;
  if (r.all) {
    const full = {
      all: true
    };
    Object.keys(RIGHT_LABELS).forEach(k => {
      full[k] = true;
    });
    return full;
  }
  return Object.assign({
    dashboard: false,
    pos: false,
    products: false,
    stock: false,
    'sales-history': false,
    reports: false,
    records: false,
    suppliers: false,
    'purchase-orders': false,
    'warehouse-receipts-in': false,
    expenses: false,
    users: false,
    settings: false,
    logs: false,
    about: true,
    'import-export': false,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canExport: false
  }, r);
}
function canAccessMenu(role, menuId) {
  if (role === 'Admin') return true;
  const rights = getRights(role);
  return !!rights[menuId];
}
function mergeUserRights(user) {
  const base = getRights(user && user.role);
  if (user && user.rights && typeof user.rights === 'object') {
    return Object.assign({}, base, user.rights, {
      all: user.role === 'Admin'
    });
  }
  return base;
}
const STATUS_OPTS = [{
  value: 'active',
  label: 'Active'
}, {
  value: 'discontinued',
  label: 'Discontinued'
}];
const PRODUCT_STATUS_FILTER = [{
  value: 'active',
  label: 'Active Only'
}, {
  value: 'discontinued',
  label: 'Discontinued Only'
}];
const CUSTOMER_TYPE_OPTS = [{
  value: 'Retail',
  label: 'Retail'
}, {
  value: 'Wholesale',
  label: 'Wholesale'
}, {
  value: 'Lead',
  label: 'Lead'
}, {
  value: 'VIP',
  label: 'VIP'
}];
const EXPENSE_CATEGORY_OPTS = ['Rent', 'Utilities', 'Salaries', 'Supplies', 'Marketing', 'Transport', 'Maintenance', 'Fees & Taxes', 'Other'].map(c => ({
  value: c,
  label: c
}));
function suggestedReorder(p, qtyOnHand) {
  const rl = Number(p.reorderLevel || 0),
    max = Number(p.maxStock || 0),
    rq = Number(p.reorderQty || 0);
  if (rq > 0) return rq;
  if (max > 0) return Math.max(0, max - qtyOnHand);
  return Math.max(0, rl * 2 - qtyOnHand);
}
const PAYMENT_OPTS = [{
  value: 'Cash',
  label: 'Cash'
}, {
  value: 'Card',
  label: 'Card'
}, {
  value: 'Mobile',
  label: 'Mobile / Wallet'
}, {
  value: 'Bank',
  label: 'Bank Transfer'
}, {
  value: 'Credit',
  label: 'Credit (unpaid)'
}];
const DISCOUNT_TYPE_OPTS = [{
  value: 'flat',
  label: 'Amount'
}, {
  value: 'percent',
  label: 'Percent %'
}];
const REASON_IN_OPTS = ['Purchase', 'Return', 'Adjustment', 'Opening Stock', 'Production', 'Transfer In'].map(r => ({
  value: r,
  label: r
}));
const REASON_OUT_OPTS = ['Sale', 'Damage', 'Loss / Theft', 'Adjustment', 'Expired', 'Transfer Out'].map(r => ({
  value: r,
  label: r
}));
function productTaxRate(product) {
  return (product && product.taxRate != null && product.taxRate !== '' ? Number(product.taxRate) : Number(CFG.taxRate)) || 0;
}
function autoUnitNetPrice(product, unitKey, taxable = true) {
  const grossOrNet = round2(Number(unitPrice(product || {}, unitKey || 'base')) || 0);
  const rate = productTaxRate(product || {});
  if (taxable && CFG.taxInclusive && rate > 0) return round2(grossOrNet / (1 + rate / 100));
  return grossOrNet;
}
let __lastDocSale = null;
function setLastDocSale(sale) {
  __lastDocSale = sale || null;
}
function openHtmlDocument(title, htmlBody, autoPrint) {
  const w = window.open('', '_blank');
  if (!w) {
    if (window.Swal) Swal.fire({
      icon: 'warning',
      title: 'Popup i bllokuar',
      text: 'Lejo popup për print/preview të dokumentit.'
    });
    return null;
  }
  w.document.open();
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + String(title || 'Dokument').replace(/</g, '&lt;') + '</title>' + '<style>' + 'html,body{margin:0;padding:0;background:#f0f0f0;color:#000;font-family:Arial,Helvetica,sans-serif}' + '.toolbar{position:sticky;top:0;z-index:9;display:flex;gap:8px;flex-wrap:wrap;padding:10px;background:#fff;border-bottom:1px solid #ddd}' + '.toolbar button{padding:8px 12px;border:0;border-radius:4px;font-weight:600;cursor:pointer}' + '.toolbar .p{background:#714B67;color:#fff}.toolbar .c{background:#e9ecef}' + '.sheet{background:#fff;margin:12px auto;box-shadow:0 2px 10px rgba(0,0,0,.12)}' + '@media print{body{background:#fff}.toolbar{display:none!important}.sheet{margin:0;box-shadow:none}}' + '.doc-thermal{width:80mm;max-width:100%;padding:4mm;font-size:12px;line-height:1.3}' + '.doc-thermal .c{text-align:center}.doc-thermal .b{font-weight:800}.doc-thermal .row{display:flex;justify-content:space-between;gap:6px;font-size:11.5px}' + '.doc-thermal .rule{border-top:1px solid #000;margin:5px 0}.doc-thermal .total{font-size:16px;font-weight:900;display:flex;justify-content:space-between;margin:6px 0}' + '.doc-thermal .nslf{text-align:center;font-size:10px;word-break:break-all;margin-top:6px}' + '.doc-a4{width:210mm;max-width:100%;padding:10mm;box-sizing:border-box;font-size:10.5px}' + '.doc-a4 h1{text-align:center;font-size:20px;margin:0 0 8px;letter-spacing:1px}' + '.doc-a4 .box{border:1.4px solid #111;margin:0 0 6px}.doc-a4 .box .h{background:#f2f2f2;font-weight:700;padding:4px 6px;border-bottom:1px solid #111}' + '.doc-a4 .r{display:grid;grid-template-columns:42% 58%;border-bottom:1px solid #111}.doc-a4 .r:last-child{border-bottom:0}.doc-a4 .r>div{padding:4px 6px}' + '.doc-a4 table{width:100%;border-collapse:collapse;font-size:9px;margin-top:6px}' + '.doc-a4 th,.doc-a4 td{border:1px solid #111;padding:3px;text-align:center}.doc-a4 th{background:#eee}.doc-a4 td.l{text-align:left}' + '.doc-a4 .totals{width:52%;margin-left:auto}.doc-a4 .vat{width:75%;margin-top:8px}' + '.doc-a4 .pay th{background:#d9e8f5}.doc-a4 .sign{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-top:24px;text-align:center;font-weight:700}' + '.doc-a4 .sign div{border-top:1px solid #111;padding-top:4px;margin-top:28px}' + '.doc-a4 .tlabel{text-align:right}' + '.doc-a4 .b{font-weight:700}' + '.doc-a4 .vathead{margin:10px 0 2px;font-size:9.5px}' + '.doc-a4 .vat{width:70%;margin-top:2px}' + '.doc-a4 .vat td.rate{background:#cfe0ef}' + '.doc-a4 .fl{margin:6px 0 0;font-size:9.5px}' + '.doc-a4 .fl span{margin-left:10px}' + '.doc-fd{width:148mm;max-width:100%;min-height:210mm;padding:7mm;box-sizing:border-box;font-size:11px}' + '.doc-fd .fd-head{display:grid;grid-template-columns:1fr 1.15fr 1fr;border:2px solid #111}' + '.doc-fd .fd-head>div{min-height:18mm;border-right:2px solid #111;padding:4px;box-sizing:border-box}' + '.doc-fd .fd-head>div:last-child{border-right:none}' + '.doc-fd .fd-title{font-size:28px;font-weight:900;text-align:center;line-height:1}' + '.doc-fd .fd-topline{border-bottom:1px solid #111;height:8mm;margin-bottom:2mm}' + '.doc-fd .fd-subhead{display:grid;grid-template-columns:2fr 1fr 1fr;border:2px solid #111;border-top:0}' + '.doc-fd .fd-subhead>div{padding:6px;border-right:1px solid #111;box-sizing:border-box}' + '.doc-fd .fd-subhead>div:last-child{border-right:none}' + '.doc-fd .fd-serial{color:#c00;font-size:22px;text-align:center;font-weight:800}' + '.doc-fd .fd-table{width:100%;border-collapse:collapse;margin-top:3mm;font-size:11.5px}' + '.doc-fd .fd-table th,.doc-fd .fd-table td{border:1px solid #111;padding:4px 5px;height:7mm;box-sizing:border-box}' + '.doc-fd .fd-table th{background:#fff;font-weight:800;text-align:center}' + '.doc-fd .fd-table td:nth-child(1),.doc-fd .fd-table td:nth-child(3),.doc-fd .fd-table td:nth-child(4),.doc-fd .fd-table td:nth-child(5),.doc-fd .fd-table td:nth-child(6){text-align:center}' + '.doc-fd .fd-subhead{display:grid;grid-template-columns:1.25fr .85fr 1.1fr 1fr;border:2px solid #111;border-top:0}' + '.doc-fd .fd-subhead>div{padding:6px;border-right:1px solid #111;box-sizing:border-box}' + '.doc-fd .fd-subhead>div:last-child{border-right:none}' + '.doc-fd .fd-subhead .fd-serial{color:#c00;font-size:22px;text-align:center;font-weight:800}' + '.doc-fd .fd-signs{width:100%;border-collapse:collapse;border:2px solid #111;border-top:0}' + '.doc-fd .fd-signs td{border:1px solid #111;padding:3px 4px;text-align:center;font-weight:700;font-size:10px}' + '.doc-fd .fd-signs td.a{text-align:left}' + '.doc-fd .fd-signs tr.s td{height:9mm;font-weight:400}' + '</style></head><body>' + '<div class="toolbar"><button class="p" onclick="window.print()">Printo</button><button class="c" onclick="window.close()">Mbyll</button></div>' + htmlBody + '</body></html>');
  w.document.close();
  try {
    w.focus();
  } catch (e) {}
  if (autoPrint) {
    setTimeout(function () {
      try {
        w.print();
      } catch (e) {}
    }, 300);
  }
  return w;
}
function buildThermalHtml(sale) {
  if (!sale) return '';
  const items = sale.items || [];
  const taxRows = typeof saleTaxBreakdown === 'function' ? saleTaxBreakdown(sale) : [{
    rate: 20,
    net: sale.subtotal || 0,
    tax: sale.tax || 0
  }];
  const mainTax = taxRows[0] || {
    rate: 20,
    net: 0,
    tax: 0
  };
  const escL = typeof esc === 'function' ? esc : function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };
  const fL = typeof fmtLek === 'function' ? fmtLek : function (n) {
    return Number(n || 0).toFixed(2);
  };
  const fQ = typeof fmtQty === 'function' ? fmtQty : function (n) {
    return String(n || 0);
  };
  let itemsHtml = '';
  items.forEach(function (it) {
    const qty = Number(it.displayQty != null ? it.displayQty : it.qty) || 0;
    const free = Number(it.freeDisplayQty || 0) || 0;
    const price = Number(it.unitSalePrice != null ? it.unitSalePrice : it.price) || 0;
    const line = Number(it.lineTotal != null ? it.lineTotal : Number(it.lineNet || 0) + Number(it.lineTax || 0)) || 0;
    itemsHtml += '<div style="margin-top:4px"><div class="b">' + escL(it.name) + '</div>' + '<div class="row"><span>' + escL(fQ(qty)) + (free > 0 ? ' + ' + fQ(free) + ' falas' : '') + ' ' + escL(it.unitName || 'copë') + ' X ' + escL(fL(price)) + '</span><span>' + escL(fL(line)) + '</span></div></div>';
  });
  return '<div class="sheet doc-thermal">' + '<div class="c b" style="font-size:15px">KOPJE FATURE</div>' + '<div class="c b" style="font-size:16px">Faturë Tatimore</div>' + '<div class="c b">' + escL(businessName()) + '</div>' + (businessAddress() ? '<div class="c" style="font-size:11px">' + escL(businessAddress()) + '</div>' : '') + '<div class="c" style="margin:3px 0">' + escL(saleBuyerName(sale)) + '</div>' + (saleBuyerAddress(sale) ? '<div class="c" style="font-size:11px">' + escL(saleBuyerAddress(sale)) + '</div>' : '') + '<div class="rule"></div>' + '<div class="row"><b>NIPT:</b><span>' + escL(businessNipt() || '—') + '</span></div>' + '<div class="row"><b>Data/Ora:</b><span>' + escL(formatDateForDisplay(sale.createdAt || nowIso())) + '</span></div>' + '<div class="row"><b>Fatura Nr:</b><span>' + escL(saleDocNo(sale)) + '</span></div>' + '<div class="row"><b>Kodi i Operatorit:</b><span>' + escL(saleOperatorCode(sale)) + '</span></div>' + '<div class="row"><b>Njësia e biznesit:</b><span>' + escL(saleBusinessUnitCode(sale)) + '</span></div>' + '<div class="row"><b>POS:</b><span>' + escL(salePosName(sale)) + '</span></div>' + '<div class="row"><b>Mënyrat e pagesës:</b><span>' + escL(salePaymentLabel(sale)) + '</span></div>' + '<div class="rule"></div>' + itemsHtml + '<div class="rule"></div>' + '<div class="total"><span>TOTAL LEK</span><span>' + escL(fL(sale.total || 0)) + '</span></div>' + '<div class="row"><b>' + escL(salePaymentLabel(sale)) + '</b><span>' + escL(fL(sale.total || 0)) + '</span></div>' + '<div class="rule"></div>' + '<div class="row"><b>Pa TVSH ' + escL(fL(mainTax.rate)) + '%</b><span>' + escL(fL(sale.subtotal || mainTax.net || 0)) + '</span></div>' + '<div class="row"><b>TVSH ' + escL(fL(mainTax.rate)) + '%</b><span>' + escL(fL(sale.tax || mainTax.tax || 0)) + '</span></div>' + '<div class="rule"></div>' + '<div class="nslf">NSLF: ' + escL(saleNslf(sale)) + '<br>NIVF: ' + escL(saleNivf(sale)) + '</div>' + '<div class="c" style="font-size:10px;margin-top:6px">' + escL(CFG.receiptFooter || 'Faleminderit!') + '</div>' + '</div>';
}
function f2(n) {
  return Number(n || 0).toFixed(2);
}
function f1(n) {
  return Number(n || 0).toFixed(1);
}
function fatureDateFmt(iso) {
  const d = new Date(iso || Date.now());
  if (isNaN(d.getTime())) return String(iso || '');
  const p = function (n) {
    return String(n).padStart(2, '0');
  };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + '.0';
}
function payDateFmt(iso) {
  const d = new Date(iso || Date.now());
  if (isNaN(d.getTime())) return String(iso || '');
  const p = function (n) {
    return String(n).padStart(2, '0');
  };
  let h = d.getHours();
  const am = h < 12 ? 'AM' : 'PM';
  h = h % 12;
  return d.getMonth() + 1 + '/' + d.getDate() + '/' + String(d.getFullYear()).slice(-2) + ' ' + p(h) + ':' + p(d.getMinutes()) + ' ' + am;
}
function hashHex32(seed) {
  const s = String(seed || '');
  let out = '';
  for (let round = 0; round < 4; round++) {
    let h = (0x811c9dc5 ^ Math.imul(round + 1, 0x9e3779b9)) >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    out += ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }
  return out.slice(0, 32);
}
function nslfFor(id) {
  return (hashHex32('NSLF|' + id) + hashHex32('NSLF2|' + id)).slice(0, 32).toUpperCase();
}
function nivfFor(id) {
  const h = (hashHex32('NIVF|' + id) + hashHex32('NIVF2|' + id)).slice(0, 32);
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20, 32);
}
function saleInvoiceTypeOfficial(sale) {
  return salePaymentLabel(sale) === 'Kredi' ? 'Faturë pa para' : 'Fatura e parave të gatshme';
}
const FATURE_A4_CSS = '<style>' + '.doc-a4{width:210mm;max-width:100%;padding:10mm;box-sizing:border-box;font-size:10.5px;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif}' + '.doc-a4 h1{text-align:center;font-size:20px;margin:0 0 8px;letter-spacing:1px}' + '.doc-a4 .box{border:1.4px solid #111;margin:0 0 6px}' + '.doc-a4 .r{display:grid;grid-template-columns:42% 58%;border-bottom:1px solid #111}.doc-a4 .r:last-child{border-bottom:0}.doc-a4 .r>div{padding:4px 6px}' + '.doc-a4 table{width:100%;border-collapse:collapse;font-size:9px;margin-top:6px}' + '.doc-a4 th,.doc-a4 td{border:1px solid #111;padding:3px;text-align:center}.doc-a4 th{background:#eee}.doc-a4 td.l{text-align:left}' + '.doc-a4 .tlabel{text-align:right}' + '.doc-a4 .b{font-weight:700}' + '.doc-a4 .vathead{margin:10px 0 2px;font-size:9.5px}' + '.doc-a4 .vat{width:70%;margin-top:2px}' + '.doc-a4 .vat td.rate{background:#cfe0ef}' + '.doc-a4 .fl{margin:6px 0 0;font-size:9.5px}' + '.doc-a4 .fl span{margin-left:10px}' + '</style>';
function buildFatureHtml(d) {
  const escL = typeof esc === 'function' ? esc : function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };
  let rows = (d.items || []).map(function (it) {
    return '<tr><td class="l">' + escL(it.name) + '</td><td>' + escL(it.unit || 'copë') + '</td><td>' + escL(f1(it.qty)) + '</td><td>' + escL(f2(it.priceNet)) + '</td><td>' + escL(f2(it.discountPct || 0)) + '</td><td>' + escL(f2(it.rate)) + '</td><td>' + escL(f2(it.net)) + '</td><td>' + escL(f2(it.vat)) + '</td><td>' + escL(f2(it.total)) + '</td></tr>';
  }).join('');
  for (let i = 0; i < 2; i++) rows += '<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>';
  const totRow = function (label, val, bold) {
    return '<tr><td></td><td></td><td></td><td></td><td colspan="4" class="tlabel' + (bold ? ' b' : '') + '">' + escL(label) + '</td><td' + (bold ? ' class="b"' : '') + '>' + escL(f2(val)) + '</td></tr>';
  };
  const vat = (d.vatRows || []).map(function (r) {
    return '<tr><td class="rate">' + escL(f2(r.rate)) + '</td><td>' + escL(f2(r.base)) + '</td><td>' + escL(f2(r.vat)) + '</td></tr>';
  }).join('');
  return FATURE_A4_CSS + '<div class="sheet doc-a4">' + '<h1>FATURË</h1>' + '<div class="box">' + '<div class="r"><div><b>Shitësi:</b></div><div>' + escL(d.seller.name || '') + '</div></div>' + '<div class="r"><div><b>Adresa:</b></div><div>' + escL(d.seller.address || '') + '</div></div>' + '<div class="r"><div><b>Numri Unik i Identifikimit :</b></div><div>' + escL(d.seller.nipt || '') + '</div></div></div>' + '<div class="box">' + '<div class="r"><div>Data dhe ora e lëshimit të faturës:</div><div>' + escL(fatureDateFmt(d.issueIso)) + '</div></div>' + '<div class="r"><div>Numri i Faturës:</div><div>' + escL(d.invoiceNo || '') + '</div></div>' + '<div class="r"><div>Operatori:</div><div>' + escL(d.operator || '') + '</div></div>' + '<div class="r"><div>Kodin e vendit të ushtrimit të veprimtarisë:</div><div>' + escL(d.unitCode || '') + '</div></div>' + '<div class="r"><div>Lloji i Faturës:</div><div>' + escL(d.typeLabel || '') + '</div></div></div>' + '<div class="box">' + '<div class="r"><div><b>Blerësi:</b></div><div>' + escL(d.buyer.name || '') + '</div></div>' + '<div class="r"><div><b>Adresa:</b></div><div>' + escL(d.buyer.address || '') + '</div></div>' + '<div class="r"><div><b>Numri Unik i Identifikimit:</b></div><div>' + escL(d.buyer.nipt || '') + '</div></div></div>' + '<table><thead><tr><th>Përshkrimi i Mallit ose Shërbimit</th><th>Njësia e Matjes</th><th>Sasia</th><th>Cmimi për njësi pa tvsh</th><th>Zbritje %</th><th>Norma e TVSH</th><th>Vlera pa TVSH (sasi x çmimi)</th><th>TVSH (Vlera)</th><th>Vlera Totale</th></tr></thead><tbody>' + rows + totRow('Vlera pa TVSH', d.subtotal, false) + totRow('Vlera totale e TVSH-së', d.vatTotal, false) + totRow('Totali per tu paguar (LEK)', d.grandTotal, true) + '</tbody></table>' + '<p class="vathead">Shpërndarja e TVSH-së</p>' + '<table class="vat"><thead><tr><th>Norma e TVSH-se</th><th>Baza e tatueshme (LEK)</th><th>Vlera e TVSH-se(LEK)</th></tr></thead><tbody>' + vat + '</tbody></table>' + '<p class="fl">Data dhe ora e kryerjes së pagesës:<span>' + escL(payDateFmt(d.payIso)) + '</span></p>' + '<p class="fl">Numri i sigurisë së lëshuesit të faturës (NSLF):<span>' + escL(d.nslf || '') + '</span></p>' + '<p class="fl">Numri identifikues të veçantë të faturës (NIVF):<span>' + escL(d.nivf || '') + '</span></p>' + '</div>';
}
function alphaCss() {
  return '<style>' + '.alpha-wrap{background:#fff;padding:18px 22px;font-family:Calibri,Arial,sans-serif;color:#008000;max-width:1160px;margin:0 auto}' + '.alpha-title{font-weight:700;color:#008000;font-size:26px;text-align:center;margin:6px 0 14px}' + '.alpha-filters{font-family:"Times New Roman",serif;color:#808080;font-size:12px;display:flex;flex-wrap:wrap;gap:4px 28px;margin:0 0 10px}' + '.alpha-table{border-collapse:collapse;width:100%}' + '.alpha-table th,.alpha-table td{border:1px solid #808080;color:#008000;font-size:10.5px;padding:3px 6px;text-align:center}' + '.alpha-table th{background:#F0FFF0;font-weight:700}' + '.alpha-table td.l,.alpha-table th.l{text-align:left}' + '.alpha-table td.r{text-align:right}' + '.alpha-total td{border-top:2px solid #000;font-weight:700}' + '.alpha-foot{display:flex;justify-content:space-between;margin-top:26px;font-size:10px}' + '.alpha-foot .fl{font-style:italic;color:#008000}.alpha-foot .pg{color:#008000}' + '</style>';
}
function alphaF2(n) {
  return Number(n || 0).toFixed(2);
}
function alphaEsc(x) {
  return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function alphaReportHtml(spec, rows, totals) {
  const lead = spec.leadCols || [];
  let head1 = '',
    head2 = '';
  if (spec.groups && spec.groups.length) {
    head1 = '<tr>' + lead.map(c => '<th rowspan="2" class="l">' + alphaEsc(c.label) + '</th>').join('') + spec.groups.map(g => '<th colspan="' + g.span + '">' + alphaEsc(g.label) + '</th>').join('') + '</tr>';
    head2 = '<tr>' + spec.columns.map(c => '<th class="' + (c.num ? 'r' : c.align || '') + '">' + alphaEsc(c.label) + '</th>').join('') + '</tr>';
  } else {
    head2 = '<tr>' + lead.map(c => '<th class="l">' + alphaEsc(c.label) + '</th>').join('') + spec.columns.map(c => '<th class="' + (c.num ? 'r' : c.align || '') + '">' + alphaEsc(c.label) + '</th>').join('') + '</tr>';
  }
  const body = (rows || []).map(r => '<tr>' + lead.map(c => '<td class="l">' + alphaEsc(r[c.key]) + '</td>').join('') + spec.columns.map(c => '<td class="' + (c.num ? 'r' : c.align || '') + '">' + (c.num ? alphaF2(r[c.key]) : alphaEsc(r[c.key])) + '</td>').join('') + '</tr>').join('');
  let totRow = '';
  if (totals) {
    totRow = '<tr class="alpha-total"><td class="l" colspan="' + (lead.length + 1) + '">Total:</td>' + spec.columns.map(c => '<td class="r">' + (totals[c.key] != null ? alphaF2(totals[c.key]) : '') + '</td>').join('') + '</tr>';
  }
  const filters = (spec.filters || []).map(f => '<span><b>' + alphaEsc(f.label) + '</b> ' + alphaEsc(f.value) + '</span>').join('');
  return alphaCss() + '<div class="alpha-wrap sheet">' + '<div class="alpha-title">' + alphaEsc(spec.title) + '</div>' + '<div class="alpha-filters">' + filters + '</div>' + '<table class="alpha-table"><thead>' + head1 + head2 + '</thead><tbody>' + body + totRow + '</tbody></table>' + '<div class="alpha-foot"><div class="fl">Copyright © 2026<br>Dokument i mbikëqyrur në bazë të dhënave të sistemit<br>Sistemi Genit</div><div class="pg">1/1</div></div>' + '</div>';
}
function alphaInPeriod(diso, fil) {
  const d = String(diso || '').slice(0, 10);
  return (!fil.from || d >= fil.from) && (!fil.to || d <= fil.to);
}
function alphaVatSplit(total, rate) {
  rate = rate || 20;
  const tvsh = round2(Number(total || 0) * rate / (100 + rate));
  return {
    tvsh: tvsh,
    net: round2(Number(total || 0) - tvsh)
  };
}
function buildAlphaReport(id, fil, D) {
  const F = [{
    label: 'Fillimi:',
    value: fil.from
  }, {
    label: 'Përfundimi:',
    value: fil.to
  }, {
    label: 'Monedha:',
    value: 'LEK'
  }, {
    label: 'Kursi:',
    value: '1'
  }];
  let spec = null,
    rows = [],
    totals = null;
  if (id === 'Rap_BlerjeRegjistriPermbledhes') {
    spec = {
      title: 'Regjistri Përmbledhës i blerjeve',
      filters: F,
      leadCols: [{
        key: 'rend',
        label: 'Nr. Rend'
      }],
      groups: [{
        label: 'Dokumenti',
        span: 7
      }, {
        label: 'Monedha Fature',
        span: 4
      }, {
        label: 'Monedha Baze',
        span: 2
      }],
      columns: [{
        key: 'lloji',
        label: 'Lloji'
      }, {
        key: 'nr',
        label: 'Nr.'
      }, {
        key: 'dt',
        label: 'Dt. Dok'
      }, {
        key: 'mon',
        label: 'Monedha'
      }, {
        key: 'kursi',
        label: 'Kursi',
        num: 1
      }, {
        key: 'kodi',
        label: 'Kodi'
      }, {
        key: 'emertimi',
        label: 'Emertimi',
        align: 'l'
      }, {
        key: 'nentotal',
        label: 'Nentotal',
        num: 1
      }, {
        key: 'zbritje',
        label: 'Zbritje',
        num: 1
      }, {
        key: 'tvsh',
        label: 'TVSH',
        num: 1
      }, {
        key: 'totali',
        label: 'Totali',
        num: 1
      }, {
        key: 'tvshb',
        label: 'TVSH',
        num: 1
      }, {
        key: 'totalib',
        label: 'Totali',
        num: 1
      }]
    };
    totals = {
      nentotal: 0,
      zbritje: 0,
      tvsh: 0,
      totali: 0,
      tvshb: 0,
      totalib: 0
    };
    (D.pos || []).filter(p => p.status === 'received' && alphaInPeriod(p.createdAt, fil)).forEach(p => {
      const v = alphaVatSplit(p.total);
      rows.push({
        rend: rows.length + 1,
        lloji: 'FB',
        nr: p.poNumber || '',
        dt: String(p.createdAt || '').slice(0, 10),
        mon: 'LEK',
        kursi: 1,
        kodi: p.supplierId || '',
        emertimi: p.supplierName || '',
        nentotal: v.net,
        zbritje: 0,
        tvsh: v.tvsh,
        totali: Number(p.total || 0),
        tvshb: v.tvsh,
        totalib: Number(p.total || 0)
      });
      totals.nentotal += v.net;
      totals.tvsh += v.tvsh;
      totals.totali += Number(p.total || 0);
      totals.tvshb += v.tvsh;
      totals.totalib += Number(p.total || 0);
    });
  } else if (id === 'Rap_BlerjeRegjistriAnalitik') {
    spec = {
      title: 'Regjistri Analitik i blerjeve',
      filters: F,
      leadCols: [{
        key: 'rend',
        label: 'Nr. Rend'
      }],
      columns: [{
        key: 'nr',
        label: 'Nr. Dok'
      }, {
        key: 'dt',
        label: 'Dt. Dok'
      }, {
        key: 'emertimi',
        label: 'Furnitori',
        align: 'l'
      }, {
        key: 'artikulli',
        label: 'Artikulli',
        align: 'l'
      }, {
        key: 'njesia',
        label: 'Njësia'
      }, {
        key: 'sasia',
        label: 'Sasia',
        num: 1
      }, {
        key: 'cmimi',
        label: 'Çmimi',
        num: 1
      }, {
        key: 'vlera',
        label: 'Vlera',
        num: 1
      }, {
        key: 'tvsh',
        label: 'TVSH',
        num: 1
      }, {
        key: 'totali',
        label: 'Totali',
        num: 1
      }]
    };
    totals = {
      sasia: 0,
      vlera: 0,
      tvsh: 0,
      totali: 0
    };
    (D.pos || []).filter(p => p.status === 'received' && alphaInPeriod(p.createdAt, fil)).forEach(p => {
      (p.items || []).forEach(it => {
        const qty = Number(it.enteredQty != null ? it.enteredQty : it.qty) || 0;
        const cost = Number(it.enteredUnitCost || it.unitCost) || 0;
        const line = Number(it.lineTotal != null ? it.lineTotal : qty * cost) || 0;
        const v = alphaVatSplit(line);
        rows.push({
          rend: rows.length + 1,
          nr: p.poNumber || '',
          dt: String(p.createdAt || '').slice(0, 10),
          emertimi: p.supplierName || '',
          artikulli: it.name || '',
          njesia: it.unitName || 'copë',
          sasia: qty,
          cmimi: cost,
          vlera: v.net,
          tvsh: v.tvsh,
          totali: line
        });
        totals.sasia += qty;
        totals.vlera += v.net;
        totals.tvsh += v.tvsh;
        totals.totali += line;
      });
    });
  } else if (id === 'Rap_LibriShitjes') {
    spec = {
      title: 'Libri i Shitjeve',
      filters: F,
      leadCols: [{
        key: 'rend',
        label: 'Nr. Rend'
      }],
      groups: [{
        label: 'Dokumenti',
        span: 5
      }, {
        label: 'Monedha Fature',
        span: 3
      }, {
        label: 'Monedha Baze',
        span: 2
      }],
      columns: [{
        key: 'lloji',
        label: 'Lloji'
      }, {
        key: 'nr',
        label: 'Nr.'
      }, {
        key: 'dt',
        label: 'Dt. Dok'
      }, {
        key: 'klienti',
        label: 'Klienti',
        align: 'l'
      }, {
        key: 'mon',
        label: 'Monedha'
      }, {
        key: 'nentotal',
        label: 'Nentotal',
        num: 1
      }, {
        key: 'tvsh',
        label: 'TVSH',
        num: 1
      }, {
        key: 'totali',
        label: 'Totali',
        num: 1
      }, {
        key: 'tvshb',
        label: 'TVSH',
        num: 1
      }, {
        key: 'totalib',
        label: 'Totali',
        num: 1
      }]
    };
    totals = {
      nentotal: 0,
      tvsh: 0,
      totali: 0,
      tvshb: 0,
      totalib: 0
    };
    (D.sales || []).filter(x => x.status !== 'cancelled' && alphaInPeriod(x.createdAt, fil)).forEach(x => {
      rows.push({
        rend: rows.length + 1,
        lloji: 'FAT',
        nr: x.invoiceNo || '',
        dt: String(x.createdAt || '').slice(0, 10),
        klienti: x.customerName || 'Walk-in',
        mon: 'LEK',
        nentotal: Number(x.subtotal || 0),
        tvsh: Number(x.tax || 0),
        totali: Number(x.total || 0),
        tvshb: Number(x.tax || 0),
        totalib: Number(x.total || 0)
      });
      totals.nentotal += Number(x.subtotal || 0);
      totals.tvsh += Number(x.tax || 0);
      totals.totali += Number(x.total || 0);
      totals.tvshb += Number(x.tax || 0);
      totals.totalib += Number(x.total || 0);
    });
  } else if (id === 'Rap_ArtikujTeShitur') {
    spec = {
      title: 'Artikuj të shitur',
      filters: F,
      leadCols: [],
      columns: [{
        key: 'kodi',
        label: 'Kodi'
      }, {
        key: 'artikulli',
        label: 'Artikulli',
        align: 'l'
      }, {
        key: 'njesia',
        label: 'Njësia'
      }, {
        key: 'sasia',
        label: 'Sasia',
        num: 1
      }, {
        key: 'vlerant',
        label: 'Vlera pa TVSH',
        num: 1
      }, {
        key: 'tvsh',
        label: 'TVSH',
        num: 1
      }, {
        key: 'totali',
        label: 'Totali',
        num: 1
      }]
    };
    totals = {
      sasia: 0,
      vlerant: 0,
      tvsh: 0,
      totali: 0
    };
    const map = {};
    (D.sales || []).filter(x => x.status !== 'cancelled' && alphaInPeriod(x.createdAt, fil)).forEach(x => {
      (x.items || []).forEach(it => {
        const k = it.productId || it.name;
        if (!map[k]) map[k] = {
          kodi: it.sku || it.productId || '',
          artikulli: it.name || '',
          njesia: it.unitName || 'copë',
          sasia: 0,
          vlerant: 0,
          tvsh: 0,
          totali: 0
        };
        map[k].sasia += Number(it.displayQty != null ? it.displayQty : it.qty) || 0;
        map[k].vlerant += Number(it.lineNet || 0);
        map[k].tvsh += Number(it.lineTax || 0);
        map[k].totali += Number(it.lineTotal != null ? it.lineTotal : 0);
      });
    });
    rows = Object.keys(map).sort((a, b) => map[a].artikulli.localeCompare(map[b].artikulli)).map(k => map[k]);
    rows.forEach(r => {
      totals.sasia += r.sasia;
      totals.vlerant += r.vlerant;
      totals.tvsh += r.tvsh;
      totals.totali += r.totali;
    });
  } else if (id === 'Rap_GjendjaArtikujveSasiVlere') {
    spec = {
      title: 'Gjendja e artikujve në sasi dhe vlerë',
      filters: F,
      leadCols: [],
      columns: [{
        key: 'kodi',
        label: 'Kodi'
      }, {
        key: 'artikulli',
        label: 'Artikulli',
        align: 'l'
      }, {
        key: 'njesia',
        label: 'Njësia'
      }, {
        key: 'sasia',
        label: 'Sasia',
        num: 1
      }, {
        key: 'vlerab',
        label: 'Vlera e blerjes',
        num: 1
      }, {
        key: 'vleras',
        label: 'Vlera e shitjes',
        num: 1
      }]
    };
    totals = {
      sasia: 0,
      vlerab: 0,
      vleras: 0
    };
    (D.products || []).forEach(pr => {
      const qty = Number(pr.stock || 0);
      rows.push({
        kodi: pr.sku || pr.barcode || '',
        artikulli: pr.name || '',
        njesia: pr.unit || 'copë',
        sasia: qty,
        vlerab: qty * Number(pr.cost || 0),
        vleras: qty * Number(pr.price || 0)
      });
      totals.sasia += qty;
      totals.vlerab += qty * Number(pr.cost || 0);
      totals.vleras += qty * Number(pr.price || 0);
    });
  } else {
    spec = {
      title: 'Ditari Klasik i arkës',
      filters: F,
      leadCols: [{
        key: 'rend',
        label: 'Nr.'
      }],
      columns: [{
        key: 'dt',
        label: 'Data'
      }, {
        key: 'pershkrimi',
        label: 'Përshkrimi',
        align: 'l'
      }, {
        key: 'hyrje',
        label: 'Hyrje',
        num: 1
      }, {
        key: 'dalje',
        label: 'Dalje',
        num: 1
      }, {
        key: 'balanca',
        label: 'Balanca',
        num: 1
      }]
    };
    totals = {
      hyrje: 0,
      dalje: 0,
      balanca: 0
    };
    const ev = [];
    (D.sales || []).filter(x => x.status !== 'cancelled' && x.paymentMethod !== 'Credit' && alphaInPeriod(x.createdAt, fil)).forEach(x => ev.push({
      dt: String(x.createdAt || '').slice(0, 10),
      pershkrimi: 'Faturë ' + (x.invoiceNo || '') + ' — ' + (x.customerName || 'Walk-in'),
      hyrje: Number(x.total || 0),
      dalje: 0
    }));
    (D.expenses || []).filter(e => alphaInPeriod(e.date || e.createdAt, fil)).forEach(e => ev.push({
      dt: String(e.date || e.createdAt || '').slice(0, 10),
      pershkrimi: 'Shpenzim: ' + (e.category || '') + (e.note ? ' — ' + e.note : ''),
      hyrje: 0,
      dalje: Number(e.amount || 0)
    }));
    ev.sort((a, b) => a.dt.localeCompare(b.dt));
    let bal = 0;
    ev.forEach(e => {
      bal = round2(bal + e.hyrje - e.dalje);
      rows.push({
        rend: rows.length + 1,
        dt: e.dt,
        pershkrimi: e.pershkrimi,
        hyrje: e.hyrje,
        dalje: e.dalje,
        balanca: bal
      });
      totals.hyrje += e.hyrje;
      totals.dalje += e.dalje;
    });
    totals.balanca = bal;
  }
  const html = alphaReportHtml(spec, rows, totals);
  return {
    spec: spec,
    rows: rows,
    totals: totals,
    html: html
  };
}
function saleFatureData(sale) {
  const items = (sale.items || []).map(function (it) {
    const rate = Number(it.taxRate != null ? it.taxRate : CFG.taxRate || 0) || 0;
    const net = Number(it.lineNet || 0);
    const vat = Number(it.lineTax || 0);
    return {
      name: it.name,
      unit: it.unitName || 'copë',
      qty: Number(it.displayQty != null ? it.displayQty : it.qty) || 0,
      priceNet: Number(it.unitSalePrice != null ? it.unitSalePrice : it.price || 0),
      discountPct: 0,
      rate: rate,
      net: net,
      vat: vat,
      total: Number(it.lineTotal != null ? it.lineTotal : net + vat)
    };
  });
  const taxRows = typeof saleTaxBreakdown === 'function' ? saleTaxBreakdown(sale) : [{
    rate: Number(CFG.taxRate || 20),
    net: sale.subtotal || 0,
    tax: sale.tax || 0
  }];
  return {
    seller: {
      name: businessName(),
      address: businessAddress(),
      nipt: businessNipt()
    },
    buyer: {
      name: saleBuyerName(sale),
      address: saleBuyerAddress(sale),
      nipt: saleBuyerNipt(sale)
    },
    issueIso: sale.createdAt || nowIso(),
    invoiceNo: saleDocNo(sale),
    operator: saleOperatorCode(sale),
    unitCode: saleBusinessUnitCode(sale),
    typeLabel: saleInvoiceTypeOfficial(sale),
    items: items,
    subtotal: Number(sale.subtotal || 0),
    vatTotal: Number(sale.tax || 0),
    grandTotal: Number(sale.total || 0),
    vatRows: taxRows.map(function (r) {
      return {
        rate: r.rate,
        base: r.net,
        vat: r.tax
      };
    }),
    payIso: sale.paidAt || sale.createdAt || nowIso(),
    nslf: sale.nslf || sale.NSLF || nslfFor(sale.id || sale.invoiceNo),
    nivf: sale.nivf || sale.NIVF || nivfFor(sale.invoiceNo || sale.id)
  };
}
function purchaseFatureData(po, supplier) {
  const sup = supplier || {};
  const items = (po.items || []).map(function (it) {
    const rate = Number(it.taxRate != null ? it.taxRate : CFG.taxRate || 20) || 0;
    const qty = Number(it.enteredQty != null ? it.enteredQty : it.qty) || 0;
    const gross = Number(it.enteredUnitCost != null ? it.enteredUnitCost : it.unitCost || 0) || 0;
    const total = Number(it.lineTotal != null ? it.lineTotal : qty * gross) || 0;
    const net = round2(total / (1 + rate / 100));
    return {
      name: it.name,
      unit: it.unitName || 'copë',
      qty: qty,
      priceNet: qty ? round2(net / qty) : 0,
      discountPct: 0,
      rate: rate,
      net: net,
      vat: round2(total - net),
      total: total
    };
  });
  const map = {};
  items.forEach(function (it) {
    const k = String(it.rate);
    if (!map[k]) map[k] = {
      rate: it.rate,
      base: 0,
      vat: 0
    };
    map[k].base += it.net;
    map[k].vat += it.vat;
  });
  const taxRows = Object.keys(map).map(function (k) {
    return {
      rate: map[k].rate,
      base: round2(map[k].base),
      vat: round2(map[k].vat)
    };
  });
  if (!taxRows.length) {
    const rate = Number(CFG.taxRate || 20);
    const total = Number(po.total || 0);
    const base = round2(total / (1 + rate / 100));
    taxRows.push({
      rate: rate,
      base: base,
      vat: round2(total - base)
    });
  }
  return {
    seller: {
      name: po.supplierName || sup.name || '',
      address: sup.address || '',
      nipt: sup.nipt || sup.nipti || ''
    },
    buyer: {
      name: businessName(),
      address: businessAddress(),
      nipt: businessNipt()
    },
    issueIso: po.createdAt || nowIso(),
    invoiceNo: po.poNumber || '',
    operator: po.createdBy || po.createdByName || '',
    unitCode: saleBusinessUnitCode({}),
    typeLabel: 'Fatura e parave të gatshme',
    items: items,
    subtotal: round2(taxRows.reduce(function (a, r) {
      return a + r.base;
    }, 0)),
    vatTotal: round2(taxRows.reduce(function (a, r) {
      return a + r.vat;
    }, 0)),
    grandTotal: Number(po.total || 0),
    vatRows: taxRows,
    payIso: po.createdAt || nowIso(),
    nslf: nslfFor(po.id || po.poNumber),
    nivf: nivfFor(po.poNumber || po.id)
  };
}
function fatureXlsMatrix(d) {
  const M = [];
  M.push(['FATURË']);
  M.push([]);
  M.push(['Shitësi:', d.seller.name || '']);
  M.push(['Adresa:', d.seller.address || '']);
  M.push(['Numri Unik i Identifikimit :', d.seller.nipt || '']);
  M.push([]);
  M.push(['Data dhe ora e lëshimit të faturës:', fatureDateFmt(d.issueIso)]);
  M.push(['Numri i Faturës:', d.invoiceNo || '']);
  M.push(['Operatori:', d.operator || '']);
  M.push(['Kodin e vendit të ushtrimit të veprimtarisë:', d.unitCode || '']);
  M.push(['Lloji i Faturës:', d.typeLabel || '']);
  M.push([]);
  M.push(['Blerësi:', d.buyer.name || '']);
  M.push(['Adresa:', d.buyer.address || '']);
  M.push(['Numri Unik i Identifikimit:', d.buyer.nipt || '']);
  M.push([]);
  const headerIdx = M.length;
  M.push(['Përshkrimi i Mallit ose Shërbimit', 'Njësia e Matjes', 'Sasia', 'Cmimi për njësi pa tvsh', 'Zbritje %', 'Norma e TVSH', 'Vlera pa TVSH (sasi x çmimi)', 'TVSH (Vlera)', 'Vlera Totale']);
  (d.items || []).forEach(function (it) {
    M.push([it.name, it.unit || 'copë', Number(it.qty) || 0, Number(it.priceNet) || 0, Number(it.discountPct || 0), Number(it.rate) || 0, Number(it.net) || 0, Number(it.vat) || 0, Number(it.total) || 0]);
  });
  M.push([]);
  M.push(['', '', '', '', 'Vlera pa TVSH', '', '', '', Number(d.subtotal)]);
  M.push(['', '', '', '', 'Vlera totale e TVSH-së', '', '', '', Number(d.vatTotal)]);
  const totalsIdx = M.length;
  M.push(['', '', '', '', 'Totali per tu paguar (LEK)', '', '', '', Number(d.grandTotal)]);
  M.push([]);
  M.push(['Shpërndarja e TVSH-së']);
  M.push(['Norma e TVSH-se', 'Baza e tatueshme (LEK)', 'Vlera e TVSH-se(LEK)']);
  (d.vatRows || []).forEach(function (r) {
    M.push([Number(r.rate), Number(r.base), Number(r.vat)]);
  });
  M.push([]);
  M.push(['Data dhe ora e kryerjes së pagesës:', payDateFmt(d.payIso)]);
  M.push(['Numri i sigurisë së lëshuesit të faturës (NSLF):', d.nslf || '']);
  M.push(['Numri identifikues të veçantë të faturës (NIVF):', d.nivf || '']);
  return {
    matrix: M,
    headerIdx: headerIdx,
    totalsIdx: totalsIdx
  };
}
function saveFatureXlsx(d, defaultName) {
  const built = fatureXlsMatrix(d);
  const API = window.sistemiGenitAPI;
  if (API && API.exportXlsx) {
    return API.exportXlsx({
      matrix: built.matrix,
      options: {
        sheetName: 'Faturë',
        headerRowIndex: built.headerIdx,
        totalsRowIndex: built.totalsIdx,
        borderAll: true
      },
      defaultName: defaultName
    }).then(function (res) {
      if (res && res.success) {
        if (window.Swal) Swal.fire({
          icon: 'success',
          title: 'Excel u ruajt',
          text: res.path,
          timer: 2500
        });
      } else if (res && !/Anuluar/.test(res.message || '')) {
        if (window.Swal) Swal.fire({
          icon: 'error',
          title: 'Excel nuk u ruajt',
          text: res.message || ''
        });
      }
    });
  }
  if (typeof erpExportXlsx === 'function') {
    const headers = ['Përshkrimi i Mallit ose Shërbimit', 'Njësia e Matjes', 'Sasia', 'Cmimi për njësi pa tvsh', 'Zbritje %', 'Norma e TVSH', 'Vlera pa TVSH (sasi x çmimi)', 'TVSH (Vlera)', 'Vlera Totale'];
    const rows = (d.items || []).map(function (it) {
      return {
        'Përshkrimi i Mallit ose Shërbimit': it.name,
        'Njësia e Matjes': it.unit,
        'Sasia': it.qty,
        'Cmimi për njësi pa tvsh': it.priceNet,
        'Zbritje %': it.discountPct,
        'Norma e TVSH': it.rate,
        'Vlera pa TVSH (sasi x çmimi)': it.net,
        'TVSH (Vlera)': it.vat,
        'Vlera Totale': it.total
      };
    });
    return erpExportXlsx(defaultName, headers, rows, null, {
      'Shitësi': d.seller.name,
      'Blerësi': d.buyer.name,
      'Nr Fature': d.invoiceNo,
      'NSLF': d.nslf,
      'NIVF': d.nivf
    });
  }
}
function fleteXlsMatrix(o) {
  const M = [];
  M.push([o.leftLine || '', '', o.kind === 'HYRJE' ? 'FLETË - HYRJE' : 'FLETË DALJE', '', o.rightLabel || '', o.rightLine || '']);
  M.push(['', '', 'Nr: ' + (o.docNo || '') + '   Dt: ' + (o.dateStr || ''), '', '', '']);
  M.push(['Emri, mbiemri pers. Autorizuar', '', '', 'Lloji e targa e Mjeti transp.', '', o.serial || '']);
  const headerIdx = M.length;
  M.push(['Nr', 'Emërtimi i mallit', 'Njësia', 'Sasia', 'Çmimi', 'Vlefta']);
  (o.rows || []).slice(0, 21).forEach(function (r, i) {
    M.push([i + 1, r.name || '', r.unit || '', Number(r.qty) || 0, Number(r.price) || 0, Number(r.value) || 0]);
  });
  for (let i = (o.rows || []).length; i < 21; i++) M.push([i + 1, '', '', '', '', '']);
  M.push(['Emri, mbiemri', 'Magazinieri', 'Marrësi në dorëzim', 'Transportuesi', 'Llogaritari', '']);
  M.push(['Nënshkrimi', '', '', '', '', '']);
  return {
    matrix: M,
    headerIdx: headerIdx,
    totalsIdx: null
  };
}
function saveFleteXlsx(o, defaultName) {
  const built = fleteXlsMatrix(o);
  const API = window.sistemiGenitAPI;
  if (API && API.exportXlsx) {
    return API.exportXlsx({
      matrix: built.matrix,
      options: {
        sheetName: 'Fletë',
        headerRowIndex: built.headerIdx,
        borderAll: true
      },
      defaultName: defaultName
    }).then(function (res) {
      if (res && res.success) {
        if (window.Swal) Swal.fire({
          icon: 'success',
          title: 'Excel u ruajt',
          text: res.path,
          timer: 2500
        });
      } else if (res && !/Anuluar/.test(res.message || '')) {
        if (window.Swal) Swal.fire({
          icon: 'error',
          title: 'Excel nuk u ruajt',
          text: res.message || ''
        });
      }
    });
  }
}
function fleteSerial(docNo) {
  return (String(docNo || '').replace(/[^0-9]/g, '') || '0').padStart(7, '0').slice(-7);
}
function fleteDataFromReceipt(r) {
  const docNo = typeof warehouseDocNoFromReceipt === 'function' ? warehouseDocNoFromReceipt(r) : 'FH-' + String(r.id || '').slice(-6).toUpperCase();
  return {
    kind: 'HYRJE',
    docNo: docNo,
    dateStr: reportDateOnly(r.createdAt || nowIso()),
    leftLine: r.supplierName || '',
    rightLabel: 'Adresa nga vjen malli',
    rightLine: r.sourceAddress || r.supplierAddress || (r.warehouse ? 'Magazina: ' + r.warehouse : ''),
    serial: fleteSerial(docNo),
    rows: typeof warehouseRowsFromPO === 'function' ? warehouseRowsFromPO(r) : r.items || []
  };
}
function fleteDataFromMovement(m, p) {
  const pr = p || {};
  const isIn = String(m.type || '').toLowerCase() === 'in';
  const docNo = (isIn ? 'FH-' : 'FD-') + String(m.id || '').slice(-6).toUpperCase();
  const qty = m.enteredQty != null ? m.enteredQty : m.qty;
  const cost = Number(m.unitCost || pr.cost || 0);
  return {
    kind: isIn ? 'HYRJE' : 'DALJE',
    docNo: docNo,
    dateStr: reportDateOnly(m.createdAt || nowIso()),
    leftLine: isIn ? m.supplierName || m.note || '' : '',
    rightLabel: isIn ? 'Adresa nga vjen malli' : 'Adresa ku shkon malli',
    rightLine: m.reference || m.note || '',
    serial: fleteSerial(docNo),
    rows: [{
      name: pr.name || m.productName || m.productId || '-',
      unit: m.unitName || pr.unit || 'copë',
      qty: qty,
      price: cost,
      value: qty * cost
    }]
  };
}
function exportMovementPdf(movement, product) {
  if (!movement) return;
  const isIn = String(movement.type || '').toLowerCase() === 'in';
  return saveFaturePdf(buildMovementWarehouseHtml(movement, product), (isIn ? 'Flete_Hyrje_' : 'Flete_Dalje_') + String(movement.id || '').slice(-6).toUpperCase() + '.pdf');
}
function exportMovementXlsx(movement, product) {
  if (!movement) return;
  const isIn = String(movement.type || '').toLowerCase() === 'in';
  return saveFleteXlsx(fleteDataFromMovement(movement, product), (isIn ? 'Flete_Hyrje_' : 'Flete_Dalje_') + String(movement.id || '').slice(-6).toUpperCase() + '.xlsx');
}
function saveFaturePdf(html, defaultName) {
  const API = window.sistemiGenitAPI;
  if (API && API.printToPdf && API.savePdf) {
    return API.printToPdf({
      html: html,
      profile: {
        format: 'A4',
        landscape: false,
        printBackground: true
      }
    }).then(function (r) {
      if (r && r.success) return API.savePdf({
        base64: r.base64,
        defaultName: defaultName
      });
      return r;
    }).then(function (sv) {
      if (sv && sv.success) {
        if (window.Swal) Swal.fire({
          icon: 'success',
          title: 'PDF u ruajt',
          text: sv.path,
          timer: 2500
        });
      } else if (sv && !/Anuluar/.test(sv.message || '')) {
        if (window.Swal) Swal.fire({
          icon: 'error',
          title: 'PDF nuk u ruajt',
          text: sv.message || ''
        });
      }
    });
  }
  return Promise.resolve(openHtmlDocument(defaultName, html, true));
}
function buildA4Html(sale) {
  if (!sale) return '';
  return buildFatureHtml(saleFatureData(sale));
}
function buildPurchaseA4Html(po, supplier) {
  if (!po) return '';
  return buildFatureHtml(purchaseFatureData(po, supplier));
}
function openPurchaseDocument(po, supplier, autoPrint) {
  if (!po) {
    if (window.Swal) Swal.fire({
      icon: 'info',
      title: 'Nuk ka faturë blerje',
      text: 'Zgjidh një blerje së pari.'
    });
    return null;
  }
  const html = buildPurchaseA4Html(po, supplier);
  return openHtmlDocument('Faturë Blerje ' + (po.poNumber || ''), html, !!autoPrint);
}
function exportPurchasePdf(po, supplier) {
  if (!po) return;
  return saveFaturePdf(buildPurchaseA4Html(po, supplier), 'Fature_Blerje_' + String(po.poNumber || '').replace(/[^\w\-]+/g, '_') + '.pdf');
}
function exportPurchaseXlsx(po, supplier) {
  if (!po) return;
  return saveFatureXlsx(purchaseFatureData(po, supplier), 'Fature_Blerje_' + String(po.poNumber || '').replace(/[^\w\-]+/g, '_') + '.xlsx');
}
function buildWarehouseHtml(sale) {
  if (!sale) return '';
  const rows = typeof warehouseRowsFromSale === 'function' ? warehouseRowsFromSale(sale) : (sale.items || []).map(function (it, i) {
    return {
      nr: i + 1,
      name: it.name,
      unit: it.unitName || 'copë',
      qty: it.displayQty || it.qty,
      price: it.unitSalePrice || it.price,
      value: it.lineNet || 0,
      warehouse: it.warehouse || ''
    };
  });
  const escL = typeof esc === 'function' ? esc : function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };
  const fL = typeof fmtLek === 'function' ? fmtLek : function (n) {
    return Number(n || 0).toFixed(2);
  };
  const fQ = typeof fmtQty === 'function' ? fmtQty : function (n) {
    return String(n || 0);
  };
  const docNo = typeof warehouseDocNoFromSale === 'function' ? warehouseDocNoFromSale(sale) : 'FD-' + saleDocNo(sale);
  const serial = (String(docNo || '').replace(/[^0-9]/g, '') || '0').padStart(7, '0').slice(-7);
  let body = '';
  rows.slice(0, 21).forEach(function (r, index) {
    body += '<tr><td>' + escL(index + 1) + '</td><td style="text-align:left">' + escL(r.name) + '</td><td>' + escL(r.unit) + '</td><td>' + escL(fQ(r.qty)) + '</td><td>' + (Number(r.price || 0) ? escL(fL(r.price)) : '') + '</td><td>' + (Number(r.value || 0) ? escL(fL(r.value)) : '') + '</td></tr>';
  });
  for (let i = Math.min(rows.length, 21); i < 21; i += 1) {
    body += '<tr><td>' + (i + 1) + '</td><td></td><td></td><td></td><td></td><td></td></tr>';
  }
  return '<style>@page{size:A5 portrait;margin:0}</style><div class="sheet doc-fd">' + '<div class="fd-head">' + '<div><div class="fd-topline">' + escL(saleBuyerName(sale) || '') + '</div><div class="fd-topline"></div></div>' + '<div><div class="fd-title">FLETË DALJE</div><div style="display:flex;justify-content:space-around;margin-top:8px"><b>Nr. ' + escL(docNo) + '</b><b>Dt: ' + escL(reportDateOnly(sale.createdAt || nowIso())) + '</b></div></div>' + '<div><b>Adresa ku shkon malli</b><div class="fd-topline" style="margin-top:8px">' + escL(saleBuyerAddress(sale) || saleBuyerName(sale) || '') + '</div></div>' + '</div>' + '<div class="fd-subhead"><div>Emri, mbiemri pers. Autorizuar</div><div></div><div>Lloji e targa e Mjeti transp.</div><div class="fd-serial">' + escL(serial) + '</div></div>' + '<table class="fd-table"><thead><tr><th>Nr</th><th>Emërtimi i mallit</th><th>Njësia</th><th>Sasia</th><th>Çmimi</th><th>Vlefta</th></tr></thead><tbody>' + body + '</tbody></table>' + '<table class="fd-signs"><tr><td class="a">Emri, mbiemri</td><td>Magazinieri</td><td>Marrësi në dorëzim</td><td>Transportuesi</td><td>Llogaritari</td></tr><tr class="s"><td class="a">Nënshkrimi</td><td></td><td></td><td></td><td></td></tr></table>' + '</div>';
}
function buildWarehouseInHtml(receipt) {
  if (!receipt) return '';
  const rows = typeof warehouseRowsFromPO === 'function' ? warehouseRowsFromPO(receipt) : (receipt.items || []).map(function (it, i) {
    return {
      nr: i + 1,
      name: it.name || '',
      unit: it.unitName || 'copë',
      qty: it.enteredQty != null ? it.enteredQty : it.qty,
      price: it.enteredUnitCost || it.unitCost || 0,
      value: it.lineTotal || 0,
      warehouse: it.warehouse || receipt.warehouse || ''
    };
  });
  const escL = typeof esc === 'function' ? esc : function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };
  const fL = typeof fmtLek === 'function' ? fmtLek : function (n) {
    return Number(n || 0).toFixed(2);
  };
  const fQ = typeof fmtQty === 'function' ? fmtQty : function (n) {
    return String(n || 0);
  };
  const docNo = typeof warehouseDocNoFromReceipt === 'function' ? warehouseDocNoFromReceipt(receipt) : 'FH-' + String(receipt.id || '').slice(-6).toUpperCase();
  const serial = (String(docNo || '').replace(/[^0-9]/g, '') || '0').padStart(7, '0').slice(-7);
  let body = '';
  rows.slice(0, 21).forEach(function (r, index) {
    body += '<tr><td>' + escL(index + 1) + '</td><td style="text-align:left">' + escL(r.name) + '</td><td>' + escL(r.unit) + '</td><td>' + escL(fQ(r.qty)) + '</td><td>' + (Number(r.price || 0) ? escL(fL(r.price)) : '') + '</td><td>' + (Number(r.value || 0) ? escL(fL(r.value)) : '') + '</td></tr>';
  });
  for (let i = Math.min(rows.length, 21); i < 21; i += 1) {
    body += '<tr><td>' + (i + 1) + '</td><td></td><td></td><td></td><td></td><td></td></tr>';
  }
  return '<style>@page{size:A5 portrait;margin:0}</style><div class="sheet doc-fd">' + '<div class="fd-head">' + '<div><div class="fd-topline">' + escL(receipt.supplierName || '') + '</div><div class="fd-topline"></div></div>' + '<div><div class="fd-title">FLETË - HYRJE</div><div style="display:flex;justify-content:space-around;margin-top:8px"><b>Nr. ' + escL(docNo) + '</b><b>Dt: ' + escL(reportDateOnly(receipt.createdAt || nowIso())) + '</b></div></div>' + '<div><b>Adresa nga vjen malli</b><div class="fd-topline" style="margin-top:8px">' + escL(receipt.sourceAddress || receipt.supplierAddress || (receipt.warehouse ? 'Magazina: ' + receipt.warehouse : '')) + '</div></div>' + '</div>' + '<div class="fd-subhead"><div>Emri, mbiemri pers. Autorizuar</div><div></div><div>Lloji e targa e Mjeti transp.</div><div class="fd-serial">' + escL(serial) + '</div></div>' + '<table class="fd-table"><thead><tr><th>Nr</th><th>Emërtimi i mallit</th><th>Njësia</th><th>Sasia</th><th>Çmimi</th><th>Vlefta</th></tr></thead><tbody>' + body + '</tbody></table>' + '<table class="fd-signs"><tr><td class="a">Emri, mbiemri</td><td>Magazinieri</td><td>Marrësi në dorëzim</td><td>Transportuesi</td><td>Llogaritari</td></tr><tr class="s"><td class="a">Nënshkrimi</td><td></td><td></td><td></td><td></td></tr></table>' + '</div>';
}
async function openWarehouseReceiptInDocument(receiptOrId, autoPrint) {
  let receipt = receiptOrId;
  try {
    if (typeof receiptOrId === 'string') {
      const snap = await db.ref('warehouse_receipts_in/' + receiptOrId).once('value');
      const value = snap.val();
      receipt = value ? {
        id: receiptOrId,
        ...value
      } : null;
    }
    if (!receipt) {
      if (window.Swal) Swal.fire({
        icon: 'info',
        title: 'Fletë Hyrje nuk u gjet',
        text: 'Dokumenti nuk ekziston ose nuk është ruajtur.'
      });
      return null;
    }
    return openHtmlDocument('Fletë Hyrje ' + warehouseDocNoFromReceipt(receipt), buildWarehouseInHtml(receipt), !!autoPrint);
  } catch (e) {
    if (window.Swal) Swal.fire({
      icon: 'error',
      title: 'Gabim',
      text: e.message || String(e)
    });
    return null;
  }
}
function openSaleDocument(sale, mode, autoPrint) {
  if (!sale) {
    if (window.Swal) Swal.fire({
      icon: 'info',
      title: 'Nuk ka faturë',
      text: 'Hap një shitje/faturë së pari.'
    });
    return;
  }
  setLastDocSale(sale);
  const m = mode || 'a4';
  let html = '';
  let title = 'Faturë ' + saleDocNo(sale);
  if (m === 'thermal') {
    html = buildThermalHtml(sale);
    title = 'Termik ' + saleDocNo(sale);
  } else if (m === 'warehouse') {
    html = buildWarehouseHtml(sale);
    title = 'Fletë Dalje ' + saleDocNo(sale);
  } else {
    html = buildA4Html(sale);
    title = 'Faturë A4 ' + saleDocNo(sale);
  }
  return openHtmlDocument(title, html, !!autoPrint);
}
function buildMovementWarehouseHtml(movement, product, docNoOverride) {
  if (!movement) return '';
  const escL = typeof esc === 'function' ? esc : function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };
  const fL = typeof fmtLek === 'function' ? fmtLek : function (n) {
    return Number(n || 0).toFixed(2);
  };
  const fQ = typeof fmtQty === 'function' ? fmtQty : function (n) {
    return String(n || 0);
  };
  const p = product || {};
  const qty = movement.enteredQty != null ? movement.enteredQty : movement.qty;
  const unit = movement.unitName || p.unit || 'copë';
  const name = p.name || movement.productName || movement.productId || '-';
  const cost = Number(movement.unitCost || p.cost || 0);
  const val = Number(qty || 0) * cost;
  const isIn = String(movement.type || '').toLowerCase() === 'in';
  const doc = docNoOverride || (isIn ? 'FH-' : 'FD-') + String(movement.id || '').slice(-6).toUpperCase();
  const serial = (String(doc || '').replace(/[^0-9]/g, '') || '0').padStart(7, '0').slice(-7);
  let body = '<tr><td>1</td><td style="text-align:left">' + escL(name) + '</td><td>' + escL(unit) + '</td><td>' + escL(fQ(qty)) + '</td><td>' + (cost ? escL(fL(cost)) : '') + '</td><td>' + (val ? escL(fL(val)) : '') + '</td></tr>';
  for (let i = 1; i < 21; i += 1) {
    body += '<tr><td>' + (i + 1) + '</td><td></td><td></td><td></td><td></td><td></td></tr>';
  }
  return '<style>@page{size:A5 portrait;margin:0}</style><div class="sheet doc-fd">' + '<div class="fd-head">' + '<div><div class="fd-title">' + (isIn ? 'FLETË - HYRJE' : 'FLETË DALJE') + '</div><div style="display:flex;justify-content:space-around;margin-top:8px"><b>Nr. ' + escL(doc) + '</b><b>Dt: ' + escL(reportDateOnly(movement.createdAt || nowIso())) + '</b></div></div>' + '<div><b>' + (isIn ? 'Adresa nga vjen malli' : 'Adresa ku shkon malli') + '</b><div class="fd-topline" style="margin-top:8px">' + escL(movement.reference || movement.note || '') + '</div></div>' + '</div>' + '<div class="fd-subhead"><div>Emri, mbiemri pers. Autorizuar</div><div></div><div>Lloji e targa e Mjeti transp.</div><div class="fd-serial">' + escL(serial) + '</div></div>' + '<table class="fd-table"><thead><tr><th>Nr</th><th>Emërtimi i mallit</th><th>Njësia</th><th>Sasia</th><th>Çmimi</th><th>Vlefta</th></tr></thead><tbody>' + body + '</tbody></table>' + '<table class="fd-signs"><tr><td class="a">Emri, mbiemri</td><td>Magazinieri</td><td>Marrësi në dorëzim</td><td>Transportuesi</td><td>Llogaritari</td></tr><tr class="s"><td class="a">Nënshkrimi</td><td></td><td></td><td></td><td></td></tr></table>' + '</div>';
}
async function openMovementDocument(movement, product, autoPrint) {
  if (!movement) return;
  const isIn = String(movement.type || '').toLowerCase() === 'in';
  const autoNo = (isIn ? 'FH-' : 'FD-') + String(movement.id || '').slice(-6).toUpperCase();
  let docNo = autoNo;
  if (window.Swal && !autoPrint) {
    const r = await Swal.fire({
      icon: 'question',
      title: 'Numri i Fletës së Daljes',
      html: 'Automatik (<b>' + autoNo + '</b>), ose shkruaje manualisht:',
      input: 'text',
      inputValue: autoNo,
      showCancelButton: true,
      confirmButtonText: 'Vazhdo',
      cancelButtonText: 'Anulo',
      confirmButtonColor: '#714B67'
    });
    if (!r.isConfirmed) return;
    docNo = String(r.value || '').trim() || autoNo;
  }
  openHtmlDocument((isIn ? 'Fletë Hyrje ' : 'Fletë Dalje ') + docNo, buildMovementWarehouseHtml(movement, product, docNo), !!autoPrint);
}
function printWithMode(mode, sale) {
  const s = sale || __lastDocSale;
  if (s) {
    openSaleDocument(s, mode, true);
    return;
  }
  document.body.setAttribute('data-print-mode', mode);
  setTimeout(function () {
    window.print();
    setTimeout(function () {
      document.body.removeAttribute('data-print-mode');
    }, 500);
  }, 50);
}
function previewSaleInvoice(sale) {
  openSaleDocument(sale || __lastDocSale, 'a4', false);
}
function previewSaleThermal(sale) {
  openSaleDocument(sale || __lastDocSale, 'thermal', false);
}
function previewSaleWarehouse(sale) {
  openSaleDocument(sale || __lastDocSale, 'warehouse', false);
}
function fiscalCode(prefix, value) {
  return prefix + '-' + String(value || '').replace(/[^a-zA-Z0-9]/g, '').slice(-24).toUpperCase();
}
function docDate() {
  return new Date().toLocaleString('sq-AL');
}
function businessName() {
  return CFG.business && CFG.business.name || CFG.businessName || 'Sistemi Genit';
}
function businessAddress() {
  return CFG.business && CFG.business.address || CFG.address || '';
}
function businessNipt() {
  return CFG.business && (CFG.business.nipt || CFG.business.nipti) || CFG.nipt || CFG.nipti || '';
}
function saleDocNo(sale) {
  return sale && (sale.invoiceNo || 'FAT-' + String(sale.id || '').slice(-6).toUpperCase());
}
function warehouseDocNoFromSale(sale) {
  return sale && (sale.warehouseDocNo || 'FD-' + String(sale.id || sale.invoiceNo || '').slice(-6).toUpperCase());
}
function warehouseDocNoFromReceipt(receipt) {
  return receipt && (receipt.docNo || 'FH-' + String(receipt.id || '').slice(-6).toUpperCase());
}
function warehouseRowsFromPO(po) {
  return (po.items || []).map((it, i) => ({
    nr: i + 1,
    name: it.name || '',
    unit: it.unitName || 'copë',
    qty: it.enteredQty != null ? it.enteredQty : it.qty,
    price: it.enteredUnitCost || it.unitCost || 0,
    value: it.lineTotal || 0,
    warehouse: it.warehouse || ''
  }));
}
function lineUnitPriceGross(it) {
  return round2(Number(it.unitSalePrice || 0) * (1 + Number(it.taxRate || 0) / 100));
}
function saleColumnsForExport() {
  return [{
    key: 'name',
    label: 'Përshkrimi i mallit'
  }, {
    key: 'unitName',
    label: 'Njësia'
  }, {
    key: 'displayQty',
    label: 'Sasia'
  }, {
    key: 'freeDisplayQty',
    label: 'Falas'
  }, {
    key: 'unitSalePrice',
    label: 'Çmimi pa TVSH'
  }, {
    key: 'taxRate',
    label: 'TVSH %'
  }, {
    key: 'lineNet',
    label: 'Vlera pa TVSH'
  }, {
    key: 'lineTax',
    label: 'TVSH'
  }, {
    key: 'lineTotal',
    label: 'Vlera me TVSH'
  }, {
    key: 'warehouse',
    label: 'Magazina'
  }];
}
function rowsFromSaleItems(sale) {
  return (sale.items || []).map(it => ({
    name: it.name || '',
    unitName: it.unitName || '',
    displayQty: Number(it.displayQty || 0),
    freeDisplayQty: Number(it.freeDisplayQty || 0),
    unitSalePrice: Number(it.unitSalePrice || 0),
    taxRate: Number(it.taxRate || 0),
    lineNet: Number(it.lineNet || 0),
    lineTax: Number(it.lineTax || 0),
    lineTotal: Number(it.lineTotal || 0),
    warehouse: it.warehouse || 'Magazina Kryesore'
  }));
}
function exportTablePdf(title, meta, columns, rows, totals) {
  const headers = columns.map(c => c.label);
  const dataRows = (rows || []).map(r => {
    const o = {};
    columns.forEach(c => {
      o[c.label] = r[c.key];
    });
    return o;
  });
  const totalsRow = totals ? (() => {
    const o = {};
    columns.forEach((c, i) => {
      o[c.label] = i === 0 ? totals[c.key] != null ? totals[c.key] : 'TOTAL' : totals[c.key] != null ? totals[c.key] : '';
    });
    return o;
  })() : null;
  const filters = meta ? {
    Info: meta
  } : {};
  if (typeof erpExportPdf === 'function') return erpExportPdf(title, headers, dataRows, totalsRow, filters);
  Swal.fire({
    icon: 'error',
    title: 'PDF nuk është gati',
    text: 'Motori i eksportit nuk u ngarkua.'
  });
}
async function exportTableXlsx(filename, sheetName, title, meta, columns, rows, totals) {
  const headers = columns.map(c => c.label);
  const dataRows = (rows || []).map(r => {
    const o = {};
    columns.forEach(c => {
      o[c.label] = r[c.key];
    });
    return o;
  });
  const totalsRow = totals ? (() => {
    const o = {};
    columns.forEach((c, i) => {
      o[c.label] = i === 0 ? totals[c.key] != null ? totals[c.key] : 'TOTAL' : totals[c.key] != null ? totals[c.key] : '';
    });
    return o;
  })() : null;
  const filters = meta ? {
    Info: meta
  } : {};
  if (typeof erpExportXlsx === 'function') return erpExportXlsx(title, headers, dataRows, totalsRow, filters);
  Swal.fire({
    icon: 'error',
    title: 'Excel nuk është gati',
    text: 'Motori i eksportit nuk u ngarkua.'
  });
}
function saleExportMeta(sale) {
  return 'Nr: ' + saleDocNo(sale) + ' | Data: ' + formatDateForDisplay(sale.createdAt || nowIso()) + ' | Blerësi: ' + saleBuyerName(sale) + ' | NIPT: ' + (businessNipt() || '-');
}
function exportSalePdf(sale) {
  if (!sale) return;
  return saveFaturePdf(buildA4Html(sale), 'Fature_' + String(saleDocNo(sale)).replace(/[^\w\-]+/g, '_') + '.pdf');
}
function exportSaleXlsx(sale) {
  if (!sale) return;
  return saveFatureXlsx(saleFatureData(sale), 'Fature_' + String(saleDocNo(sale)).replace(/[^\w\-]+/g, '_') + '.xlsx');
}
function warehouseRowsFromSale(sale) {
  return (sale.items || []).map((it, i) => ({
    nr: i + 1,
    name: it.name || '',
    unit: it.unitName || '',
    qty: Number(it.displayQty || 0) + (Number(it.freeDisplayQty || 0) || 0),
    price: Number(it.unitSalePrice || 0),
    value: Number(it.lineNet || 0),
    warehouse: it.warehouse || 'Magazina Kryesore'
  }));
}
function exportWarehousePdf(sale) {
  const cols = [{
    key: 'nr',
    label: 'Nr'
  }, {
    key: 'name',
    label: 'Emërtimi i mallit'
  }, {
    key: 'unit',
    label: 'Njësia'
  }, {
    key: 'qty',
    label: 'Sasia'
  }, {
    key: 'price',
    label: 'Çmimi'
  }, {
    key: 'value',
    label: 'Vlefta'
  }, {
    key: 'warehouse',
    label: 'Magazina'
  }];
  exportTablePdf('Fletë Dalje', 'Nr: ' + warehouseDocNoFromSale(sale) + ' | Data: ' + formatDateForDisplay(sale.createdAt || nowIso()), cols, warehouseRowsFromSale(sale), {
    value: money((sale.items || []).reduce((a, it) => a + Number(it.lineNet || 0), 0))
  });
}
function exportWarehouseXlsx(sale) {
  const cols = [{
    key: 'nr',
    label: 'Nr'
  }, {
    key: 'name',
    label: 'Emërtimi i mallit'
  }, {
    key: 'unit',
    label: 'Njësia'
  }, {
    key: 'qty',
    label: 'Sasia'
  }, {
    key: 'price',
    label: 'Çmimi'
  }, {
    key: 'value',
    label: 'Vlefta'
  }, {
    key: 'warehouse',
    label: 'Magazina'
  }];
  exportTableXlsx('Flete_Dalje_' + warehouseDocNoFromSale(sale) + '.xlsx', 'Flete Dalje', 'Fletë Dalje', 'Nr: ' + warehouseDocNoFromSale(sale) + ' | Data: ' + formatDateForDisplay(sale.createdAt || nowIso()), cols, warehouseRowsFromSale(sale), {
    value: money((sale.items || []).reduce((a, it) => a + Number(it.lineNet || 0), 0))
  });
}
function exportWarehouseInPdf(receipt) {
  return saveFaturePdf(buildWarehouseInHtml(receipt), 'Flete_Hyrje_' + String(warehouseDocNoFromReceipt(receipt)).replace(/[^\w\-]+/g, '_') + '.pdf');
}
function exportWarehouseInXlsx(receipt) {
  return saveFleteXlsx(fleteDataFromReceipt(receipt), 'Flete_Hyrje_' + String(warehouseDocNoFromReceipt(receipt)).replace(/[^\w\-]+/g, '_') + '.xlsx');
}
function getWarehousesForProduct(product, products) {
  const set = new Set(['Magazina Kryesore', 'Furgon']);
  if (product) {
    if (product.location) set.add(product.location);
    if (product.warehouse) set.add(product.warehouse);
  }
  (products || []).forEach(p => {
    if (p.location) set.add(p.location);
    if (p.warehouse) set.add(p.warehouse);
  });
  return Array.from(set).filter(Boolean);
}
function computeSaleTotals(cart, prodById, discount) {
  const lineDrafts = cart.map(l => {
    const p = prodById[l.productId] || {};
    const unit = getProductUnit(p, l.unitKey || 'base');
    const unitMult = Number(l.unitMultiplier || unit.multiplier || 1);
    const paidDisplay = Number(l.displayQty || 0);
    const freeDisplay = Number(l.freeDisplayQty || 0);
    const taxable = l.taxEnabled !== false;
    const rate = taxable ? productTaxRate(p) : 0;
    const unitNet = round2(Number(l.unitSalePrice != null ? l.unitSalePrice : autoUnitNetPrice(p, unit.value, taxable)) || 0);
    const lineNet = round2(paidDisplay * unitNet);
    return {
      l,
      p,
      unit,
      unitMult,
      paidDisplay,
      freeDisplay,
      taxable,
      rate,
      unitNet,
      lineNet
    };
  });
  const subtotal = round2(lineDrafts.reduce((s, x) => s + x.lineNet, 0));
  let discAmt = 0;
  if (discount && Number(discount.value) > 0) discAmt = discount.type === 'percent' ? subtotal * Math.min(Number(discount.value), 100) / 100 : Math.min(Number(discount.value), subtotal);
  discAmt = round2(discAmt);
  const factor = subtotal > 0 ? (subtotal - discAmt) / subtotal : 1;
  let taxTotal = 0;
  const lines = lineDrafts.map(x => {
    const paidQty = round2(x.paidDisplay * x.unitMult);
    const freeQty = round2(x.freeDisplay * x.unitMult);
    const totalQty = round2(paidQty + freeQty);
    const lineNetAfterDiscount = round2(x.lineNet * factor);
    const lineTax = round2(x.taxable ? lineNetAfterDiscount * x.rate / 100 : 0);
    const lineGross = round2(lineNetAfterDiscount + lineTax);
    taxTotal += lineTax;
    const baseNetPrice = round2(x.unitNet / x.unitMult);
    return {
      productId: x.l.productId,
      name: x.l.name,
      sku: x.l.sku,
      qty: totalQty,
      paidQty,
      freeQty,
      displayQty: x.paidDisplay,
      freeDisplayQty: x.freeDisplay,
      unitKey: x.unit.value,
      unitName: x.unit.name,
      unitMultiplier: x.unitMult,
      taxEnabled: x.taxable,
      unitSalePrice: x.unitNet,
      netUnitPrice: x.unitNet,
      price: baseNetPrice,
      priceWithTax: round2(x.unitNet * (1 + x.rate / 100)),
      cost: Number(x.p.cost) || 0,
      taxRate: x.rate,
      lineNet: lineNetAfterDiscount,
      lineNetBeforeDiscount: x.lineNet,
      lineTax: lineTax,
      lineTotal: lineGross,
      lineGross: lineGross,
      warehouse: x.l.warehouse || x.p.location || '-'
    };
  });
  const grand = round2(subtotal - discAmt + taxTotal);
  return {
    subtotal,
    discount: discAmt,
    tax: round2(taxTotal),
    grand,
    lines
  };
}
const money = n => CFG.currency + Number(n || 0).toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const round2 = n => Math.round((Number(n) || 0) * 100) / 100;
const formatDateForDisplay = iso => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('sq-AL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};
function erpEnsureLibs() {
  try {
    if (window.pdfMake) {
      if (!pdfMake.vfs && window.pdfMake && window.pdfMake.vfs) pdfMake.vfs = window.pdfMake.vfs;
    }
  } catch (e) {}
  return {
    zip: !!window.JSZip,
    pdf: !!(window.pdfMake && (pdfMake.vfs || pdfMake.createPdf))
  };
}
function erpStripHtml(v) {
  return String(v == null ? '' : v).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/\s+/g, ' ').trim();
}
function erpFileSlug(title) {
  return String(title || 'raport').toLowerCase().replace(/[ëË]/g, 'e').replace(/[çÇ]/g, 'c').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'raport';
}
function erpFileName(title, ext) {
  return erpFileSlug(title) + '_' + new Date().toISOString().slice(0, 10) + '.' + ext;
}
function erpDownloadBlob(filename, blob) {
  try {
    const b = blob instanceof Blob ? blob : new Blob([blob]);
    if (window.navigator && window.navigator.msSaveOrOpenBlob) {
      window.navigator.msSaveOrOpenBlob(b, filename);
      return;
    }
    const url = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      try {
        document.body.removeChild(a);
      } catch (e) {}
      try {
        URL.revokeObjectURL(url);
      } catch (e) {}
    }, 1500);
  } catch (e) {
    console.error(e);
    if (window.Swal) Swal.fire({
      icon: 'error',
      title: 'Shkarkimi dështoi',
      text: String(e && e.message || e)
    });
  }
}
function erpXmlEsc(v) {
  return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function erpColName(n) {
  let s = '';
  let x = n + 1;
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}
function erpPlain(v) {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? v : '';
  if (typeof v === 'boolean') return v ? 'Po' : 'Jo';
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString();
  return erpStripHtml(v);
}
function erpBusinessHeader() {
  const b = typeof CFG !== 'undefined' && CFG.business ? CFG.business : {};
  return {
    name: b && b.name || typeof CFG !== 'undefined' && CFG.business && CFG.business.name || 'Sistemi Genit',
    address: b && b.address || '',
    phone: b && b.phone || '',
    email: b && b.email || '',
    currency: typeof CFG !== 'undefined' && CFG.currency || '',
    when: new Date().toLocaleString('sq-AL')
  };
}
function erpSheetName(title) {
  let s = String(title || 'Raporti').replace(/[\\\/\?\*\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) s = 'Raporti';
  return s.slice(0, 31);
}
function erpBuildMatrix(title, headers, rows, totalsRow, filters) {
  const biz = erpBusinessHeader();
  const data = [];
  data.push([title]);
  data.push([biz.name + (biz.address ? ' · ' + biz.address : '') + (biz.phone ? ' · ' + biz.phone : '')]);
  data.push(['Gjeneruar: ' + biz.when]);
  if (filters) {
    const parts = Object.keys(filters).filter(function (k) {
      const v = filters[k];
      return v !== '' && v != null && v !== false;
    }).map(function (k) {
      return k + ': ' + filters[k];
    });
    if (parts.length) data.push(['Filtrat: ' + parts.join(' | ')]);
  }
  data.push(['Rreshta: ' + (rows ? rows.length : 0) + ' (pas filtrave / kërkimit)']);
  data.push([]);
  const headerRow = (headers || []).map(function (h) {
    return String(h);
  });
  data.push(headerRow);
  (rows || []).forEach(function (r) {
    data.push(headerRow.map(function (h) {
      return erpPlain(r[h]);
    }));
  });
  if (totalsRow && rows && rows.length) {
    data.push(headerRow.map(function (h, i) {
      if (totalsRow[h] != null && totalsRow[h] !== '') return erpPlain(totalsRow[h]);
      return i === 0 ? 'TOTAL' : '';
    }));
  }
  return data;
}
async function erpExportXlsx(title, headers, rows, totalsRow, filters) {
  try {
    erpEnsureLibs();
    if (!rows || !rows.length) {
      if (window.Swal) Swal.fire({
        icon: 'info',
        title: 'Nuk ka të dhëna',
        text: 'Nuk ka rreshta për eksport pas filtrave.'
      });
      return;
    }
    if (!window.JSZip) {
      if (window.Swal) Swal.fire({
        icon: 'error',
        title: 'Excel nuk u eksportua',
        text: 'JSZip nuk u ngarkua. Hap me internet dhe rifresko faqen.'
      });
      return;
    }
    const hdrs = (headers || []).map(function (h) {
      return String(h == null ? '' : h);
    });
    if (!hdrs.length) {
      if (window.Swal) Swal.fire({
        icon: 'error',
        title: 'Excel',
        text: 'Nuk ka kolona për eksport.'
      });
      return;
    }
    const shared = [];
    const sharedIndex = Object.create(null);
    function ss(val) {
      const s = String(val == null ? '' : val);
      if (Object.prototype.hasOwnProperty.call(sharedIndex, s)) return sharedIndex[s];
      const idx = shared.length;
      shared.push(s);
      sharedIndex[s] = idx;
      return idx;
    }
    const matrix = erpBuildMatrix(title, hdrs, rows, totalsRow, filters);
    const maxCols = Math.max(hdrs.length, 1);
    let headerIdx = -1;
    for (let i = 0; i < matrix.length; i++) {
      const row = matrix[i] || [];
      if (row.length === hdrs.length && row.every(function (v, j) {
        return String(v) === String(hdrs[j]);
      })) {
        headerIdx = i;
        break;
      }
    }
    const totalIdx = totalsRow && rows.length ? matrix.length - 1 : -1;
    const sheetRows = [];
    for (let rIdx = 0; rIdx < matrix.length; rIdx++) {
      const row = matrix[rIdx] || [];
      const cells = [];
      for (let cIdx = 0; cIdx < Math.max(row.length, rIdx === 0 ? 1 : 0); cIdx++) {
        const val = cIdx < row.length ? row[cIdx] : '';
        const ref = erpColName(cIdx) + (rIdx + 1);
        let style = 0;
        if (rIdx === 0) style = 1;else if (rIdx === headerIdx) style = 3;else if (rIdx === totalIdx) style = 4;else if (headerIdx > 0 && rIdx > 0 && rIdx < headerIdx) style = 2;
        if (typeof val === 'number' && Number.isFinite(val)) {
          cells.push('<c r="' + ref + '" s="' + style + '"><v>' + val + '</v></c>');
        } else {
          const idx = ss(val == null ? '' : val);
          cells.push('<c r="' + ref + '" s="' + style + '" t="s"><v>' + idx + '</v></c>');
        }
      }
      if (!cells.length) {
        const idx = ss('');
        cells.push('<c r="A' + (rIdx + 1) + '" t="s"><v>' + idx + '</v></c>');
      }
      sheetRows.push('<row r="' + (rIdx + 1) + '">' + cells.join('') + '</row>');
    }
    const lastCol = erpColName(maxCols - 1);
    const lastRow = Math.max(matrix.length, 1);
    const dimension = 'A1:' + lastCol + lastRow;
    const colsXml = '<cols>' + Array.from({
      length: maxCols
    }).map(function (_, i) {
      const w = i === 0 ? 28 : i === 1 ? 20 : 16;
      return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
    }).join('') + '</cols>';
    const mergeXml = maxCols > 1 ? '<mergeCells count="1"><mergeCell ref="A1:' + lastCol + '1"/></mergeCells>' : '';
    const sharedXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' + shared.length + '" uniqueCount="' + shared.length + '">' + shared.map(function (s) {
      const needSpace = /^\s|\s$/.test(s) || s.indexOf('  ') >= 0;
      return '<si><t' + (needSpace ? ' xml:space="preserve"' : '') + '>' + erpXmlEsc(s) + '</t></si>';
    }).join('') + '</sst>';
    const stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + '<fonts count="4">' + '<font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>' + '<font><b/><sz val="16"/><color rgb="FF714B67"/><name val="Calibri"/><family val="2"/></font>' + '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>' + '<font><b/><sz val="11"/><color rgb="FF714B67"/><name val="Calibri"/><family val="2"/></font>' + '</fonts>' + '<fills count="4">' + '<fill><patternFill patternType="none"/></fill>' + '<fill><patternFill patternType="gray125"/></fill>' + '<fill><patternFill patternType="solid"><fgColor rgb="FF714B67"/><bgColor indexed="64"/></patternFill></fill>' + '<fill><patternFill patternType="solid"><fgColor rgb="FFF3EEF2"/><bgColor indexed="64"/></patternFill></fill>' + '</fills>' + '<borders count="2">' + '<border><left/><right/><top/><bottom/><diagonal/></border>' + '<border>' + '<left style="thin"><color rgb="FFDEE2E6"/></left>' + '<right style="thin"><color rgb="FFDEE2E6"/></right>' + '<top style="thin"><color rgb="FFDEE2E6"/></top>' + '<bottom style="thin"><color rgb="FFDEE2E6"/></bottom>' + '<diagonal/>' + '</border>' + '</borders>' + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' + '<cellXfs count="5">' + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' + '<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' + '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' + '<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' + '</cellXfs>' + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' + '</styleSheet>';
    const sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' + '<dimension ref="' + dimension + '"/>' + '<sheetViews><sheetView workbookViewId="0"/></sheetViews>' + '<sheetFormatPr defaultRowHeight="18"/>' + colsXml + '<sheetData>' + sheetRows.join('') + '</sheetData>' + mergeXml + '<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' + '</worksheet>';
    const workbookXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' + '<sheets><sheet name="' + erpXmlEsc(erpSheetName(title)) + '" sheetId="1" r:id="rId1"/></sheets>' + '</workbook>';
    const workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>' + '</Relationships>';
    const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' + '</Relationships>';
    const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' + '<Default Extension="xml" ContentType="application/xml"/>' + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' + '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' + '</Types>';
    const now = new Date().toISOString();
    const coreXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' + '<dc:title>' + erpXmlEsc(title) + '</dc:title>' + '<dc:creator>Sistemi Genit</dc:creator>' + '<cp:lastModifiedBy>Sistemi Genit</cp:lastModifiedBy>' + '<dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created>' + '<dcterms:modified xsi:type="dcterms:W3CDTF">' + now + '</dcterms:modified>' + '</cp:coreProperties>';
    const appXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' + '<Application>Sistemi Genit</Application><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant></vt:vector></HeadingPairs>' + '<TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>' + erpXmlEsc(erpSheetName(title)) + '</vt:lpstr></vt:vector></TitlesOfParts>' + '</Properties>';
    const zip = new JSZip();
    zip.file('[Content_Types].xml', contentTypes);
    zip.folder('_rels').file('.rels', rootRels);
    zip.folder('docProps').file('core.xml', coreXml);
    zip.folder('docProps').file('app.xml', appXml);
    const xl = zip.folder('xl');
    xl.file('workbook.xml', workbookXml);
    xl.file('styles.xml', stylesXml);
    xl.file('sharedStrings.xml', sharedXml);
    xl.folder('_rels').file('workbook.xml.rels', workbookRels);
    xl.folder('worksheets').file('sheet1.xml', sheetXml);
    const blob = await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      compression: 'DEFLATE',
      compressionOptions: {
        level: 6
      }
    });
    erpDownloadBlob(erpFileName(title, 'xlsx'), blob);
  } catch (e) {
    console.error('erpExportXlsx', e);
    if (window.Swal) Swal.fire({
      icon: 'error',
      title: 'Excel dështoi',
      text: String(e && e.message || e)
    });
  }
}
function erpExportPdf(title, headers, rows, totalsRow, filters) {
  try {
    erpEnsureLibs();
    if (!rows || !rows.length) {
      if (window.Swal) Swal.fire({
        icon: 'info',
        title: 'Nuk ka të dhëna',
        text: 'Nuk ka rreshta për eksport pas filtrave.'
      });
      return;
    }
    if (!window.pdfMake || typeof pdfMake.createPdf !== 'function') {
      if (window.Swal) Swal.fire({
        icon: 'error',
        title: 'PDF nuk u eksportua',
        text: 'pdfMake nuk u ngarkua. Hap me internet dhe rifresko faqen.'
      });
      return;
    }
    const biz = erpBusinessHeader();
    const hdrs = (headers || []).map(function (h) {
      return String(h == null ? '' : h);
    });
    if (!hdrs.length) {
      if (window.Swal) Swal.fire({
        icon: 'error',
        title: 'PDF',
        text: 'Nuk ka kolona për eksport.'
      });
      return;
    }
    const filterLine = filters ? Object.keys(filters).filter(function (k) {
      return filters[k] !== '' && filters[k] != null;
    }).map(function (k) {
      return k + ': ' + filters[k];
    }).join(' | ') : '';
    function cellText(v) {
      const p = erpPlain(v);
      if (typeof p === 'number') return Number(p).toLocaleString('sq-AL', {
        maximumFractionDigits: 2
      });
      return String(p).slice(0, 500);
    }
    const body = [];
    body.push(hdrs.map(function (h) {
      return {
        text: cellText(h),
        style: 'th',
        fillColor: '#714B67',
        color: '#ffffff'
      };
    }));
    rows.forEach(function (r, ri) {
      body.push(hdrs.map(function (h) {
        return {
          text: cellText(r[h]),
          style: 'td',
          fillColor: ri % 2 === 0 ? '#ffffff' : '#fafbfc'
        };
      }));
    });
    if (totalsRow && rows.length) {
      body.push(hdrs.map(function (h, i) {
        const t = i === 0 ? totalsRow[h] != null && totalsRow[h] !== '' ? cellText(totalsRow[h]) : 'TOTAL' : cellText(totalsRow[h] != null ? totalsRow[h] : '');
        return {
          text: t,
          style: 'tf',
          fillColor: '#f3eef2'
        };
      }));
    }
    body.forEach(function (row) {
      while (row.length < hdrs.length) row.push({
        text: '',
        style: 'td'
      });
      if (row.length > hdrs.length) row.length = hdrs.length;
    });
    const orientation = hdrs.length > 6 ? 'landscape' : 'portrait';
    const pageSize = hdrs.length > 10 ? 'A3' : 'A4';
    const fontSize = hdrs.length > 9 ? 7 : hdrs.length > 6 ? 8 : 9;
    const doc = {
      pageSize: pageSize,
      pageOrientation: orientation,
      pageMargins: [24, 36, 24, 36],
      defaultStyle: {
        fontSize: fontSize,
        color: '#212529'
      },
      content: [{
        text: String(biz.name || 'Sistemi Genit'),
        style: 'biz'
      }, {
        text: String(title || 'Raport'),
        style: 'title'
      }, {
        text: [biz.address, biz.phone, biz.email].filter(Boolean).join(' · ') || ' ',
        style: 'sub'
      }, {
        text: 'Gjeneruar: ' + biz.when + '  |  Rreshta: ' + rows.length + (filterLine ? '  |  ' + filterLine : ''),
        style: 'sub',
        margin: [0, 0, 0, 10]
      }, {
        table: {
          headerRows: 1,
          widths: hdrs.map(function () {
            return '*';
          }),
          body: body,
          dontBreakRows: false
        },
        layout: {
          hLineWidth: function () {
            return 0.5;
          },
          vLineWidth: function () {
            return 0.5;
          },
          hLineColor: function () {
            return '#dee2e6';
          },
          vLineColor: function () {
            return '#dee2e6';
          },
          paddingLeft: function () {
            return 4;
          },
          paddingRight: function () {
            return 4;
          },
          paddingTop: function () {
            return 3;
          },
          paddingBottom: function () {
            return 3;
          }
        }
      }],
      footer: function (currentPage, pageCount) {
        return {
          text: String(biz.name || 'Sistemi Genit') + '  ·  Faqe ' + currentPage + ' / ' + pageCount,
          alignment: 'center',
          fontSize: 8,
          color: '#6c757d',
          margin: [0, 8, 0, 0]
        };
      },
      styles: {
        biz: {
          fontSize: 10,
          color: '#6c757d',
          margin: [0, 0, 0, 2]
        },
        title: {
          fontSize: 16,
          bold: true,
          color: '#714B67',
          margin: [0, 0, 0, 2]
        },
        sub: {
          fontSize: 9,
          color: '#555555'
        },
        th: {
          bold: true,
          color: '#ffffff',
          fontSize: fontSize
        },
        td: {
          fontSize: fontSize,
          color: '#212529'
        },
        tf: {
          bold: true,
          fontSize: fontSize,
          color: '#714B67'
        }
      }
    };
    const pdf = pdfMake.createPdf(doc);
    const fname = erpFileName(title, 'pdf');
    if (pdf.download) {
      pdf.download(fname);
    } else if (pdf.getBlob) {
      pdf.getBlob(function (blob) {
        erpDownloadBlob(fname, blob);
      });
    } else if (pdf.open) {
      pdf.open();
    }
  } catch (e) {
    console.error('erpExportPdf', e);
    if (window.Swal) Swal.fire({
      icon: 'error',
      title: 'PDF dështoi',
      text: String(e && e.message || e)
    });
  }
}
function erpPrintPreview(title, headers, rows, totalsRow, filters) {
  try {
    if (!rows || !rows.length) {
      if (window.Swal) Swal.fire({
        icon: 'info',
        title: 'Nuk ka të dhëna',
        text: 'Nuk ka rreshta për printim pas filtrave.'
      });
      return;
    }
    const biz = erpBusinessHeader();
    const hdrs = (headers || []).map(function (h) {
      return String(h == null ? '' : h);
    });
    const filterLine = filters ? Object.keys(filters).filter(function (k) {
      return filters[k] !== '' && filters[k] != null;
    }).map(function (k) {
      return k + ': ' + filters[k];
    }).join(' | ') : '';
    const escLocal = typeof esc === 'function' ? esc : function (s) {
      return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };
    const th = hdrs.map(function (h) {
      return '<th>' + escLocal(h) + '</th>';
    }).join('');
    const tb = rows.map(function (r) {
      return '<tr>' + hdrs.map(function (h) {
        const v = erpPlain(r[h]);
        return '<td>' + escLocal(typeof v === 'number' ? Number(v).toLocaleString('sq-AL') : v) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    const tf = totalsRow ? '<tfoot><tr>' + hdrs.map(function (h, i) {
      const t = i === 0 ? totalsRow[h] != null && totalsRow[h] !== '' ? erpPlain(totalsRow[h]) : 'TOTAL' : erpPlain(totalsRow[h] != null ? totalsRow[h] : '');
      return '<td>' + escLocal(t) + '</td>';
    }).join('') + '</tr></tfoot>' : '';
    const w = window.open('', '_blank');
    if (!w) {
      if (window.Swal) Swal.fire({
        icon: 'warning',
        title: 'Popup i bllokuar',
        text: 'Lejo popup për preview/print.'
      });
      return;
    }
    w.document.open();
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escLocal(title) + '</title><style>' + 'body{font-family:Arial,Helvetica,sans-serif;padding:16px;color:#212529;margin:0}h1{margin:0 0 4px;color:#714B67;font-size:20px;font-weight:500}.biz{color:#6c757d;font-size:12px;margin-bottom:2px}.sub{color:#555;font-size:12px;margin-bottom:14px}' + 'table{width:100%;border-collapse:collapse;font-size:12px}th{background:#714B67;color:#fff;text-align:left;padding:8px;border:1px solid #714B67}' + 'td{border:1px solid #dee2e6;padding:7px}tfoot td{font-weight:700;background:#f3eef2}' + '.actions{margin:0 0 12px;display:flex;gap:8px;position:sticky;top:0;background:#fff;padding:8px 0;z-index:2}button{padding:8px 14px;border:0;border-radius:3px;cursor:pointer;font-weight:600}' + '.print{background:#714B67;color:#fff}.close{background:#e9ecef;color:#212529}' + '@media print{body{padding:8px}.actions{display:none!important}}' + '</style></head><body>' + '<div class="actions"><button class="print" onclick="window.print()">Printo</button><button class="close" onclick="window.close()">Mbyll</button></div>' + '<div class="biz">' + escLocal(biz.name) + (biz.address ? ' · ' + escLocal(biz.address) : '') + '</div>' + '<h1>' + escLocal(title) + '</h1>' + '<div class="sub">Gjeneruar: ' + escLocal(biz.when) + ' | Rreshta: ' + rows.length + (filterLine ? ' | ' + escLocal(filterLine) : '') + '</div>' + '<table><thead><tr>' + th + '</tr></thead><tbody>' + tb + '</tbody>' + tf + '</table>' + '</body></html>');
    w.document.close();
    try {
      w.focus();
    } catch (e) {}
  } catch (e) {
    console.error(e);
    if (window.Swal) Swal.fire({
      icon: 'error',
      title: 'Preview dështoi',
      text: String(e && e.message || e)
    });
  }
}
function erpFromDataTable(table, opts) {
  opts = opts || {};
  if (!table) return {
    headers: [],
    rows: [],
    filters: {},
    totalsRow: null,
    scope: 'none',
    selectedCount: 0
  };
  var excludeLast = opts.excludeLast !== false;
  var scope = opts.scope || 'auto';
  var settings;
  try {
    settings = table.settings()[0];
  } catch (e) {
    return {
      headers: [],
      rows: [],
      filters: {},
      totalsRow: null,
      scope: 'none',
      selectedCount: 0
    };
  }
  var colCount = settings.aoColumns.length;
  var endCol = excludeLast ? Math.max(0, colCount - 1) : colCount;
  var headers = [];
  for (var i = 0; i < endCol; i++) {
    var c = settings.aoColumns[i];
    headers.push(erpStripHtml(c.sTitle || c.data || 'Col' + (i + 1)) || 'Col' + (i + 1));
  }
  var selectedIndexes = [];
  try {
    table.rows({
      search: 'applied'
    }).every(function () {
      var node = this.node();
      if (node && window.jQuery && jQuery(node).find('input.o-row-check').prop('checked')) {
        selectedIndexes.push(this.index());
      }
    });
    if (!selectedIndexes.length && window.jQuery) {
      var $tbl = jQuery(table.table().node());
      $tbl.find('tbody tr').each(function () {
        if (jQuery(this).find('input.o-row-check').prop('checked')) {
          try {
            var idx = table.row(this).index();
            if (idx != null && idx >= 0 && selectedIndexes.indexOf(idx) < 0) selectedIndexes.push(idx);
          } catch (e) {}
        }
      });
    }
  } catch (e) {
    selectedIndexes = [];
  }
  if (scope === 'auto') scope = selectedIndexes.length ? 'selected' : 'filtered';
  var indexes = [];
  try {
    if (scope === 'selected') indexes = selectedIndexes.slice();else if (scope === 'all') indexes = table.rows({
      search: 'none'
    }).indexes().toArray();else indexes = table.rows({
      search: 'applied'
    }).indexes().toArray();
  } catch (e) {
    indexes = [];
  }
  var cleanRows = indexes.map(function (idx) {
    var rowData = table.row(idx).data() || {};
    var obj = {};
    for (var i = 0; i < endCol; i++) {
      var c = settings.aoColumns[i];
      var val = null;
      var dataSrc = c.mData;
      if (dataSrc != null && dataSrc !== '' && typeof dataSrc !== 'function') {
        try {
          val = rowData[dataSrc];
        } catch (e) {
          val = null;
        }
      }
      if (val == null || typeof val === 'object' || typeof val === 'string' && /</.test(val)) {
        try {
          val = erpStripHtml(table.cell(idx, i).render('display'));
        } catch (e) {
          try {
            val = erpStripHtml(table.cell(idx, i).render('export'));
          } catch (e2) {
            val = '';
          }
        }
      }
      if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
        try {
          val = formatDateForDisplay(val);
        } catch (e) {}
      }
      if (typeof val === 'boolean') val = val ? 'Po' : 'Jo';
      if (typeof val === 'string') {
        val = val.replace(/^[\s\u00a0]*[\u2610\u2611\u9744\u9745]?\s*/, '');
      }
      obj[headers[i]] = val;
    }
    return obj;
  });
  var totalsRow = {};
  headers.forEach(function (h, i) {
    var sum = 0,
      count = 0;
    cleanRows.forEach(function (r) {
      var v = r[h];
      if (typeof v === 'number' && Number.isFinite(v)) {
        sum += v;
        count++;
        return;
      }
      var s = String(v == null ? '' : v).trim();
      if (/^[\$€£Lek\s]*-?[\d]{1,3}(?:[.,\d]*)$/i.test(s) || /^-?\d+(?:[.,]\d+)?$/.test(s)) {
        var n = Number(s.replace(/[^0-9.\-]/g, ''));
        if (Number.isFinite(n)) {
          sum += n;
          count++;
        }
      }
    });
    var moneyLike = /balanc|total|çmim|cmim|shum|amount|price|cost|profit|value|detyrim|fitim|vler|pages|grade/i.test(h);
    if (count > 0 && count >= Math.max(1, Math.floor(cleanRows.length * 0.4))) {
      totalsRow[h] = moneyLike && typeof money === 'function' ? money(sum) : Math.round(sum * 100) / 100;
    } else {
      totalsRow[h] = i === 0 ? 'TOTAL' : '';
    }
  });
  var search = table.search && table.search() || '';
  var filters = {};
  if (scope === 'selected') filters['Eksport'] = 'Vetëm të selektuarit (' + cleanRows.length + ')';else if (scope === 'all') filters['Eksport'] = 'Të gjitha (' + cleanRows.length + ')';else filters['Eksport'] = 'Të filtruarit (' + cleanRows.length + ')';
  if (search) filters['Kërkim'] = search;
  filters['Rreshta'] = cleanRows.length;
  return {
    headers: headers,
    rows: cleanRows,
    totalsRow: totalsRow,
    filters: filters,
    scope: scope,
    selectedCount: selectedIndexes.length
  };
}
function erpExportFromDataTable(table, title, mode, scope) {
  var pack = erpFromDataTable(table, {
    scope: scope || 'auto'
  });
  if (!pack.rows || !pack.rows.length) {
    var msg = scope === 'selected' || pack.scope === 'selected' ? 'Nuk ka rreshta të selektuar. Zgjidh me checkbox, ose hiq selektimin për të eksportuar të filtruarit.' : 'Nuk ka rreshta për eksport.';
    if (window.Swal) Swal.fire({
      icon: 'info',
      title: 'Eksport bosh',
      text: msg
    });
    return;
  }
  try {
    if (window.Swal) {
      var label = pack.scope === 'selected' ? 'Selektuar: ' + pack.rows.length : pack.scope === 'all' ? 'Të gjitha: ' + pack.rows.length : 'Të filtruar: ' + pack.rows.length;
      Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 1600
      }).fire({
        icon: 'info',
        title: label
      });
    }
  } catch (e) {}
  if (mode === 'xlsx') return erpExportXlsx(title, pack.headers, pack.rows, pack.totalsRow, pack.filters);
  if (mode === 'pdf') return erpExportPdf(title, pack.headers, pack.rows, pack.totalsRow, pack.filters);
  return erpPrintPreview(title, pack.headers, pack.rows, pack.totalsRow, pack.filters);
}
function erpDtButtons(title) {
  return [{
    text: '<i class="fas fa-file-excel"></i> Excel',
    className: 'erp-btn-excel',
    titleAttr: 'Selektuarit (nëse ka) · përndryshe të filtruarit',
    action: function (e, dt) {
      erpExportFromDataTable(dt, title, 'xlsx', 'auto');
    }
  }, {
    text: '<i class="fas fa-file-pdf"></i> PDF',
    className: 'erp-btn-pdf',
    titleAttr: 'Selektuarit (nëse ka) · përndryshe të filtruarit',
    action: function (e, dt) {
      erpExportFromDataTable(dt, title, 'pdf', 'auto');
    }
  }, {
    text: '<i class="fas fa-print"></i> Preview',
    className: 'erp-btn-preview',
    titleAttr: 'Preview i selektuarve ose të filtruarve',
    action: function (e, dt) {
      erpExportFromDataTable(dt, title, 'print', 'auto');
    }
  }, {
    text: '<i class="fas fa-database"></i> Të gjitha',
    className: 'erp-btn-preview',
    titleAttr: 'Eksporto të gjitha (pa filter)',
    action: function (e, dt) {
      if (window.Swal) {
        Swal.fire({
          title: 'Eksporto të gjitha',
          text: 'Pa filter dhe pa selektim — i gjithë moduli',
          showDenyButton: true,
          showCancelButton: true,
          confirmButtonText: 'Excel',
          denyButtonText: 'PDF',
          cancelButtonText: 'Anulo',
          confirmButtonColor: '#0f7b3a',
          denyButtonColor: '#c62828'
        }).then(function (res) {
          if (res.isConfirmed) erpExportFromDataTable(dt, title, 'xlsx', 'all');else if (res.isDenied) erpExportFromDataTable(dt, title, 'pdf', 'all');
        });
      } else erpExportFromDataTable(dt, title, 'xlsx', 'all');
    }
  }];
}
function GoogleSearchBox({
  value,
  onChange,
  placeholder
}) {
  return React.createElement("div", {
    className: 'google-search-wrap' + (value ? ' has-value' : '')
  }, React.createElement("i", {
    className: "fas fa-search gs-icon"
  }), React.createElement("input", {
    type: "search",
    value: value || '',
    placeholder: placeholder || 'Kërko si Google… emër, kod, telefon, kategori…',
    onChange: e => onChange(e.target.value),
    autoComplete: "off"
  }), React.createElement("button", {
    type: "button",
    className: "gs-clear",
    title: "Pastro",
    onClick: () => onChange('')
  }, React.createElement("i", {
    className: "fas fa-times"
  })));
}
function OdooViewSwitcher({
  mode,
  onChange
}) {
  return React.createElement("div", {
    className: "o-view-switcher",
    title: "Pamja"
  }, React.createElement("button", {
    type: "button",
    className: mode === 'list' ? 'active' : '',
    onClick: () => onChange('list'),
    title: "List\xEB"
  }, React.createElement("i", {
    className: "fas fa-list"
  })), React.createElement("button", {
    type: "button",
    className: mode === 'kanban' ? 'active' : '',
    onClick: () => onChange('kanban'),
    title: "Kanban"
  }, React.createElement("i", {
    className: "fas fa-table-columns"
  })));
}
function OdooSearchFacets({
  value,
  onChange,
  placeholder,
  facets,
  onRemoveFacet,
  filterChips,
  onToggleChip
}) {
  return React.createElement("div", {
    style: {
      width: '100%'
    }
  }, React.createElement("div", {
    className: "o-searchview"
  }, (facets || []).map((f, i) => React.createElement("span", {
    className: "o-facet",
    key: f.id || i
  }, f.label && React.createElement("span", {
    className: "o-facet-label"
  }, f.label, ":"), React.createElement("span", {
    className: "o-facet-value"
  }, f.value), React.createElement("button", {
    type: "button",
    onClick: () => onRemoveFacet && onRemoveFacet(f),
    title: "Hiq"
  }, React.createElement("i", {
    className: "fas fa-times"
  })))), React.createElement("input", {
    className: "o-searchview-input",
    type: "search",
    value: value || '',
    placeholder: placeholder || 'Kërko...',
    onChange: e => onChange(e.target.value),
    autoComplete: "off"
  }), (value || facets && facets.length > 0) && React.createElement("button", {
    type: "button",
    className: "gs-clear",
    style: {
      position: 'static',
      transform: 'none'
    },
    title: "Pastro",
    onClick: () => {
      onChange('');
      if (onRemoveFacet) (facets || []).forEach(f => onRemoveFacet(f));
    }
  }, React.createElement("i", {
    className: "fas fa-times"
  }))), filterChips && filterChips.length > 0 && React.createElement("div", {
    className: "o-search-filters"
  }, filterChips.map(c => React.createElement("button", {
    type: "button",
    key: c.id,
    className: 'o-filter-chip' + (c.active ? ' active' : ''),
    onClick: () => onToggleChip && onToggleChip(c)
  }, c.label))));
}
function OdooStatusbar({
  stages,
  value
}) {
  const list = stages || [];
  const idx = Math.max(0, list.findIndex(s => s.id === value));
  return React.createElement("div", {
    className: "o-statusbar"
  }, list.map((s, i) => {
    let cls = 'o-arrow';
    if (s.id === value) cls += ' active';else if (i < idx) cls += ' done';
    return React.createElement("span", {
      key: s.id,
      className: cls
    }, s.label);
  }));
}
function OdooFormField({
  label,
  value
}) {
  return React.createElement("div", {
    className: "o-form-field"
  }, React.createElement("div", {
    className: "o-label"
  }, label), React.createElement("div", {
    className: "o-value"
  }, value === 0 ? '0' : value || '—'));
}
function OdooFormSheet({
  title,
  statusbar,
  children,
  actions
}) {
  return React.createElement("div", {
    className: "o-form-view"
  }, statusbar, React.createElement("div", {
    className: "o-form-sheet"
  }, actions && React.createElement("div", {
    style: {
      marginBottom: 10
    }
  }, actions), title && React.createElement("h1", {
    className: "o-form-title"
  }, title), children));
}
function OdooFormOverlay({
  breadcrumb,
  title,
  onClose,
  children,
  buttons
}) {
  return React.createElement("div", {
    className: "o-form-overlay"
  }, React.createElement("div", {
    className: "o-form-topbar"
  }, React.createElement("div", {
    className: "left"
  }, buttons, React.createElement("span", {
    className: "o-breadcrumb"
  }, breadcrumb || 'Regjistri', " / ", React.createElement("b", null, title))), React.createElement("div", {
    className: "right"
  }, React.createElement("button", {
    type: "button",
    className: "btn btn-secondary",
    onClick: onClose
  }, React.createElement("i", {
    className: "fas fa-times"
  }), " Mbyll"))), children);
}
function OdooKanban({
  columns,
  onDropCard
}) {
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const onDragStart = (e, card, colId) => {
    setDragId(card.id);
    try {
      e.dataTransfer.setData('text/plain', JSON.stringify({
        cardId: card.id,
        fromColId: colId
      }));
      e.dataTransfer.effectAllowed = 'move';
    } catch (err) {}
    e.currentTarget.classList.add('o-dragging');
  };
  const onDragEnd = e => {
    e.currentTarget.classList.remove('o-dragging');
    setDragId(null);
    setOverCol(null);
  };
  const onDragOver = (e, colId) => {
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = 'move';
    } catch (err) {}
    if (overCol !== colId) setOverCol(colId);
  };
  const onDragLeave = (e, colId) => {
    if (overCol === colId) setOverCol(null);
  };
  const onDrop = (e, toColId) => {
    e.preventDefault();
    setOverCol(null);
    let payload = null;
    try {
      payload = JSON.parse(e.dataTransfer.getData('text/plain') || '{}');
    } catch (err) {
      payload = {};
    }
    const cardId = payload.cardId || dragId;
    const fromColId = payload.fromColId;
    if (!cardId || !toColId || fromColId === toColId) return;
    let card = null;
    (columns || []).forEach(c => (c.cards || []).forEach(x => {
      if (x.id === cardId) card = x;
    }));
    if (onDropCard) onDropCard(cardId, fromColId, toColId, card);
    setDragId(null);
  };
  return React.createElement("div", {
    className: "o-kanban"
  }, (columns || []).map(col => React.createElement("div", {
    className: 'o-kanban-col' + (overCol === col.id ? ' o-col-hover' : ''),
    key: col.id
  }, React.createElement("div", {
    className: "o-kanban-col-header"
  }, React.createElement("span", null, col.title), React.createElement("span", {
    className: "count"
  }, (col.cards || []).length)), React.createElement("div", {
    className: 'o-kanban-col-body' + (overCol === col.id ? ' o-drop-hover' : ''),
    onDragOver: e => onDragOver(e, col.id),
    onDragLeave: e => onDragLeave(e, col.id),
    onDrop: e => onDrop(e, col.id)
  }, (col.cards || []).length === 0 && React.createElement("div", {
    className: "o-kanban-empty"
  }, "Hiq k\xEBtu / Nuk ka regjistrime"), (col.cards || []).map(card => React.createElement("div", {
    className: 'o-kanban-card' + (dragId === card.id ? ' o-dragging' : ''),
    key: card.id,
    draggable: !!onDropCard,
    onDragStart: e => onDragStart(e, card, col.id),
    onDragEnd: onDragEnd,
    onClick: () => card.onClick && card.onClick(card)
  }, React.createElement("div", {
    className: "k-title"
  }, card.title), card.sub && React.createElement("div", {
    className: "k-sub"
  }, card.sub), card.meta && React.createElement("div", {
    className: "k-sub"
  }, card.meta), (card.tags || []).length > 0 && React.createElement("div", {
    className: "k-tags"
  }, card.tags.map((t, i) => React.createElement("span", {
    className: "k-tag",
    key: i
  }, t))), React.createElement("div", {
    className: "k-meta"
  }, React.createElement("span", null, card.footer || ''), card.amount != null && card.amount !== '' && React.createElement("span", {
    className: "k-amount"
  }, card.amount))))))));
}
function useDtLiveSearch(tableRef, query) {
  useEffect(() => {
    let alive = true;
    const apply = () => {
      if (!alive) return false;
      const t = tableRef && (tableRef.current || tableRef);
      if (!t || !t.search) return false;
      const q = query == null ? '' : String(query);
      try {
        if (t.search() !== q) t.search(q).draw(false);
      } catch (e) {}
      return true;
    };
    if (apply()) return () => {
      alive = false;
    };
    const id = setInterval(() => {
      if (apply()) clearInterval(id);
    }, 120);
    const stop = setTimeout(() => clearInterval(id), 4000);
    return () => {
      alive = false;
      clearInterval(id);
      clearTimeout(stop);
    };
  }, [query, tableRef]);
}
function FilteredSummaryBar({
  tableRef,
  itemsBuilder,
  deps
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    let bound = null;
    const redraw = () => {
      if (alive) setTick(x => x + 1);
    };
    const tryBind = () => {
      const t = tableRef && tableRef.current;
      if (!t || !t.on) return false;
      if (bound === t) return true;
      if (bound && bound.off) {
        try {
          bound.off('draw.erpSum search.erpSum', redraw);
        } catch (e) {}
      }
      t.on('draw.erpSum search.erpSum', redraw);
      bound = t;
      redraw();
      return true;
    };
    if (!tryBind()) {
      const id = setInterval(() => {
        if (tryBind()) clearInterval(id);
      }, 150);
      var stop = setTimeout(() => clearInterval(id), 5000);
    }
    return () => {
      alive = false;
      if (bound && bound.off) {
        try {
          bound.off('draw.erpSum search.erpSum', redraw);
        } catch (e) {}
      }
    };
  }, [...(deps || [])]);
  const t = tableRef && tableRef.current;
  if (!t) return React.createElement(SummaryBar, {
    items: [{
      label: 'Të filtruar',
      value: '…'
    }]
  });
  let filtered = [];
  try {
    filtered = t.rows({
      search: 'applied'
    }).data().toArray();
  } catch (e) {
    filtered = [];
  }
  const items = itemsBuilder ? itemsBuilder(filtered, t) : [{
    label: 'Të filtruar',
    value: filtered.length
  }];
  return React.createElement(React.Fragment, null, React.createElement(SummaryBar, {
    items: items
  }));
}
const getTimeAgo = iso => {
  const s = Math.floor((new Date() - new Date(iso)) / 1000);
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
};
function computeQtyOnHand(productId, movements) {
  return (movements || []).reduce((qty, m) => m.productId === productId ? qty + (m.type === 'in' ? m.qty : -m.qty) : qty, 0);
}
function unitBaseName(product) {
  return String(product && (product.unit || product.baseUnit) || 'copë').trim() || 'copë';
}
function safeMultiplier(v, fallback = 1) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
function unit3EffectiveMultiplier(product) {
  const c3 = safeMultiplier(product && product.unit3Coef, 0);
  const c2 = safeMultiplier(product && product.unit2Coef, 1);
  if (!(c3 > 1)) return 0;
  if (product && product.unit2Name && c2 > 1 && c3 < c2 * 10) return round2(c3 * c2);
  return c3;
}
function getProductUnitOptions(product) {
  const base = unitBaseName(product);
  const opts = [{
    value: 'base',
    key: 'base',
    name: base,
    multiplier: 1,
    label: base + ' (bazë)'
  }];
  if (product && product.unit2Name && safeMultiplier(product.unit2Coef, 0) > 1) {
    const m = safeMultiplier(product.unit2Coef);
    opts.push({
      value: 'unit2',
      key: 'unit2',
      name: String(product.unit2Name).trim(),
      multiplier: m,
      label: String(product.unit2Name).trim() + ' = ' + m + ' ' + base
    });
  }
  if (product && product.unit3Name && safeMultiplier(product.unit3Coef, 0) > 1) {
    const raw3 = safeMultiplier(product.unit3Coef);
    const m = unit3EffectiveMultiplier(product);
    const u3 = String(product.unit3Name).trim();
    const u2 = product.unit2Name ? String(product.unit2Name).trim() : '';
    const c2 = safeMultiplier(product.unit2Coef, 1);
    const label = u2 && c2 > 1 && m !== raw3 ? u3 + ' = ' + raw3 + ' ' + u2 + ' × ' + c2 + ' ' + base + ' = ' + m + ' ' + base : u3 + ' = ' + m + ' ' + base;
    opts.push({
      value: 'unit3',
      key: 'unit3',
      name: u3,
      multiplier: m,
      label
    });
  }
  return opts;
}
function getProductUnit(product, unitKey) {
  return getProductUnitOptions(product).find(u => u.value === unitKey) || getProductUnitOptions(product)[0];
}
function toBaseQty(product, qty, unitKey) {
  return round2((Number(qty) || 0) * safeMultiplier(getProductUnit(product, unitKey).multiplier));
}
function unitPrice(product, unitKey) {
  const unit = getProductUnit(product, unitKey || 'base');
  if (unit.value === 'unit2' && product && Number(product.unit2Price) > 0) return round2(Number(product.unit2Price));
  if (unit.value === 'unit3' && product && Number(product.unit3Price) > 0) return round2(Number(product.unit3Price));
  return round2((Number(product && product.price) || 0) * safeMultiplier(unit.multiplier));
}
function unitBasePrice(product, unitKey) {
  const unit = getProductUnit(product, unitKey || 'base');
  const up = unitPrice(product, unit.value);
  return round2(up / safeMultiplier(unit.multiplier));
}
function formatUnitStructure(product) {
  const base = unitBaseName(product);
  const bits = [base + ' bazë'];
  if (product && product.unit2Name && safeMultiplier(product.unit2Coef, 0) > 1) bits.push('1 ' + product.unit2Name + ' = ' + safeMultiplier(product.unit2Coef) + ' ' + base);
  if (product && product.unit3Name && safeMultiplier(product.unit3Coef, 0) > 1) {
    const raw3 = safeMultiplier(product.unit3Coef);
    const m = unit3EffectiveMultiplier(product);
    if (product.unit2Name && safeMultiplier(product.unit2Coef, 1) > 1 && m !== raw3) bits.push('1 ' + product.unit3Name + ' = ' + raw3 + ' ' + product.unit2Name + ' = ' + m + ' ' + base);else bits.push('1 ' + product.unit3Name + ' = ' + m + ' ' + base);
  }
  return bits.join(' • ');
}
function formatQtyWithUnits(baseQty, product) {
  const q = Number(baseQty) || 0;
  const base = unitBaseName(product);
  const opts = getProductUnitOptions(product).filter(u => u.multiplier > 1).sort((a, b) => b.multiplier - a.multiplier);
  const alt = opts.find(u => q && Number.isFinite(q / u.multiplier) && Math.abs(q / u.multiplier - Math.round(q / u.multiplier)) < 0.000001);
  return q + ' ' + base + (alt ? ' (' + round2(q / alt.multiplier) + ' ' + alt.name + ')' : '');
}
function formatQtyTwoUnits(baseQty, product, preferredUnitKey) {
  const q = Number(baseQty) || 0;
  const base = unitBaseName(product);
  const preferred = preferredUnitKey ? getProductUnit(product, preferredUnitKey) : null;
  let alt = preferred && preferred.multiplier > 1 ? preferred : null;
  if (!alt) alt = getProductUnitOptions(product).filter(u => u.multiplier > 1).sort((a, b) => a.multiplier - b.multiplier)[0];
  return q + ' ' + base + (alt && alt.multiplier > 1 ? ' / ' + round2(q / alt.multiplier) + ' ' + alt.name : '');
}
function getDtRowData(table, el) {
  let tr = $(el).closest('tr');
  if (tr.hasClass('child')) tr = tr.prev();
  let rowData = table.row(tr).data();
  if (!rowData) {
    const parent = $(el).closest('tr').prevAll('tr').filter(function () {
      return !$(this).hasClass('child');
    }).first();
    if (parent.length) rowData = table.row(parent).data();
  }
  return rowData || null;
}
function docLinkHtml(action, id, label) {
  const escL = typeof esc === 'function' ? esc : function (x) {
    return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  return '<button type="button" class="doc-link" data-action="' + action + '" data-id="' + escL(id) + '"><i class="fas fa-arrow-right"></i>' + escL(label) + '</button>';
}
function actionBtn(action, icon, label, extraClass) {
  return `<button type="button" class="product-action-btn odoo-row-btn ${extraClass || ''}" data-action="${action}" title="${label}"><i class="fas ${icon}"></i><span class="btn-label"> ${label}</span></button>`;
}
function statusTextSq(value) {
  const m = {
    ordered: 'Porositur',
    received: 'Marrë në stok',
    draft: 'Draft',
    cancelled: 'Anuluar',
    completed: 'Përfunduar',
    credit: 'Kredi'
  };
  return m[value] || value || '-';
}
function stockTypeText(type) {
  return type === 'in' ? 'HYRJE' : 'DALJE';
}
function displayEnteredQty(row, product) {
  const entered = row && row.enteredQty != null ? Number(row.enteredQty) : row && row.unitMultiplier ? round2((Number(row.qty) || 0) / Number(row.unitMultiplier || 1)) : Number(row && row.qty || 0);
  const unitName = row && row.unitName || (product ? unitBaseName(product) : 'copë');
  return round2(entered) + ' ' + unitName;
}
function displayBaseQty(row, product) {
  const q = Number(row && row.qty || 0);
  if (!product && row && Number(row.unitMultiplier) > 1 && row.unitName) return q + ' copë (' + round2(q / Number(row.unitMultiplier)) + ' ' + row.unitName + ')';
  return formatQtyWithUnits(q, product || null);
}
function computeReturnedQty(saleId, productId, returns) {
  return (returns || []).reduce((qty, r) => r.saleId === saleId ? qty + (r.items || []).filter(it => it.productId === productId).reduce((s, it) => s + it.qty, 0) : qty, 0);
}
function buildCodeIndex(products) {
  const m = new Map();
  (products || []).forEach(p => {
    [p.id, p.sku, p.barcode].forEach(k => {
      if (k) m.set(String(k).trim().toLowerCase(), p);
    });
  });
  return m;
}
function useFetch(fn, deps = []) {
  const [s, setS] = useState({
    loading: true,
    data: null,
    err: null
  });
  const tok = useRef(0);
  useEffect(() => {
    const id = ++tok.current;
    setS(p => ({
      ...p,
      loading: true
    }));
    Promise.resolve(fn()).then(r => {
      if (id === tok.current) setS({
        loading: false,
        data: r,
        err: null
      });
    }).catch(e => {
      if (id === tok.current) setS({
        loading: false,
        data: null,
        err: e
      });
    });
    return () => {
      tok.current++;
    };
  }, deps);
  return s;
}
const DropdownItem = React.memo(function DropdownItem({
  option,
  selected,
  onSelect
}) {
  return React.createElement("div", {
    className: `searchable-dropdown-item ${selected ? 'selected' : ''}`,
    onClick: () => onSelect(option)
  }, option.label);
});
function SearchableDropdown({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  label,
  icon,
  required = false,
  creatable = false,
  createLabel,
  onCreate,
  allowClear = true
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const dropdownRef = useRef(null);
  const selectedLabel = (options || []).find(o => String(o.value) === String(value))?.label || '';
  const optIdx = useMemo(() => (options || []).map(o => ({
    o,
    k: String(o.label || '').toLowerCase()
  })), [options]);
  const dq = useDeferredValue(search).toLowerCase();
  const filtered = useMemo(() => optIdx.filter(x => !dq || x.k.includes(dq)).map(x => x.o), [optIdx, dq]);
  const exact = useMemo(() => {
    const s = String(search || '').trim().toLowerCase();
    if (!s) return false;
    return (options || []).some(o => String(o.label || '').toLowerCase() === s || String(o.value || '').toLowerCase() === s);
  }, [options, search]);
  const showCreate = creatable && String(search || '').trim() && !exact;
  useEffect(() => {
    const handleClickOutside = e => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  const handleSelect = useCallback(option => {
    onChange(option.value, option);
    setIsOpen(false);
    setSearch('');
  }, [onChange]);
  const handleInputChange = e => {
    setSearch(e.target.value);
    if (!isOpen) setIsOpen(true);
  };
  const handleInputClick = () => {
    setIsOpen(!isOpen);
    if (!isOpen) setSearch('');
  };
  const handleCreate = async () => {
    const term = String(search || '').trim();
    if (!term || !onCreate) return;
    setCreating(true);
    try {
      const res = await onCreate(term);
      if (res && res.value != null) {
        onChange(res.value, res);
      } else if (res !== false && res != null && res !== undefined && typeof res !== 'object') {
        onChange(res);
      }
      setIsOpen(false);
      setSearch('');
    } catch (e) {
      if (window.Swal) Swal.fire({
        icon: 'error',
        title: 'Shtimi dështoi',
        text: e.message || String(e)
      });
    }
    setCreating(false);
  };
  return React.createElement("div", {
    className: "form-group"
  }, label && React.createElement("label", null, icon && React.createElement("i", {
    className: icon
  }), " ", label, required && ' *'), React.createElement("div", {
    className: "searchable-dropdown",
    ref: dropdownRef
  }, React.createElement("input", {
    type: "text",
    className: "searchable-dropdown-input",
    placeholder: placeholder,
    value: isOpen ? search : selectedLabel,
    onChange: handleInputChange,
    onClick: handleInputClick,
    required: required && !value,
    autoComplete: "off"
  }), React.createElement("span", {
    className: `searchable-dropdown-arrow ${isOpen ? 'open' : ''}`
  }, React.createElement("i", {
    className: "fas fa-chevron-down"
  })), isOpen && React.createElement("div", {
    className: "searchable-dropdown-list"
  }, allowClear && React.createElement("div", {
    className: `searchable-dropdown-item ${!value ? 'selected' : ''}`,
    onClick: () => handleSelect({
      value: '',
      label: ''
    })
  }, placeholder), filtered.length > 0 ? filtered.map((option, idx) => React.createElement(DropdownItem, {
    key: String(option.value) + '-' + idx,
    option: option,
    selected: String(value) === String(option.value),
    onSelect: handleSelect
  })) : !showCreate && React.createElement("div", {
    className: "searchable-dropdown-item no-results"
  }, "Nuk u gjet asgj\xEB"), showCreate && React.createElement("div", {
    className: "searchable-dropdown-item create-new",
    onClick: creating ? undefined : handleCreate
  }, React.createElement("i", {
    className: creating ? 'fas fa-spinner fa-spin' : 'fas fa-plus-circle'
  }), createLabel ? createLabel.replace('{q}', search) : 'Shto: ' + search))));
}
const MultiItem = React.memo(function MultiItem({
  option,
  checked,
  onToggle
}) {
  return React.createElement("div", {
    className: `searchable-dropdown-item ${checked ? 'checked' : ''}`,
    onClick: () => onToggle(option.value)
  }, option.label);
});
function SearchableMultiSelect({
  options,
  values = [],
  onChange,
  placeholder = 'Select...',
  label,
  icon,
  required = false
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef(null);
  const sel = useMemo(() => new Set(values), [values]);
  const selectedLabels = useMemo(() => options.filter(o => sel.has(o.value)), [options, sel]);
  const optIdx = useMemo(() => options.map(o => ({
    o,
    k: o.label.toLowerCase()
  })), [options]);
  const dq = useDeferredValue(search).toLowerCase();
  const filtered = useMemo(() => optIdx.filter(x => x.k.includes(dq)).map(x => x.o), [optIdx, dq]);
  useEffect(() => {
    const handleClickOutside = e => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  const toggleOption = useCallback(optionValue => {
    const newValues = sel.has(optionValue) ? values.filter(v => v !== optionValue) : [...values, optionValue];
    onChange(newValues);
  }, [values, sel, onChange]);
  const removeTag = optionValue => onChange(values.filter(v => v !== optionValue));
  return React.createElement("div", {
    className: "form-group"
  }, label && React.createElement("label", null, icon && React.createElement("i", {
    className: icon
  }), " ", label, required && ' *'), selectedLabels.length > 0 && React.createElement("div", {
    className: "searchable-multi-tags"
  }, selectedLabels.map((o, i) => React.createElement("span", {
    key: i,
    className: "searchable-multi-tag"
  }, o.label, React.createElement("button", {
    type: "button",
    className: "searchable-multi-tag-remove",
    onClick: () => removeTag(o.value)
  }, React.createElement("i", {
    className: "fas fa-times"
  }))))), React.createElement("div", {
    className: "searchable-dropdown",
    ref: dropdownRef
  }, React.createElement("input", {
    type: "text",
    className: "searchable-dropdown-input",
    placeholder: values.length > 0 ? `${values.length} selected` : placeholder,
    value: isOpen ? search : '',
    onChange: e => {
      setSearch(e.target.value);
      if (!isOpen) setIsOpen(true);
    },
    onClick: () => {
      setIsOpen(!isOpen);
      if (!isOpen) setSearch('');
    },
    required: required && values.length === 0
  }), React.createElement("span", {
    className: `searchable-dropdown-arrow ${isOpen ? 'open' : ''}`
  }, React.createElement("i", {
    className: "fas fa-chevron-down"
  })), isOpen && React.createElement("div", {
    className: "searchable-dropdown-list"
  }, filtered.length > 0 ? filtered.map((option, idx) => React.createElement(MultiItem, {
    key: idx,
    option: option,
    checked: sel.has(option.value),
    onToggle: toggleOption
  })) : React.createElement("div", {
    className: "searchable-dropdown-item no-results"
  }, "No results found"))));
}
function TopLoadingBar() {
  return React.createElement("div", {
    className: "top-load"
  }, React.createElement("div", {
    className: "top-load-bar"
  }));
}
function SummaryBar({
  items
}) {
  return React.createElement("div", {
    className: "table-summary"
  }, items.filter(Boolean).map((it, i) => React.createElement("div", {
    className: "table-summary-item",
    key: i
  }, React.createElement("div", {
    className: "ts-label"
  }, it.label), React.createElement("div", {
    className: "ts-value"
  }, it.value))));
}
function RefreshBtn({
  onClick
}) {
  return React.createElement("button", {
    className: "btn btn-secondary btn-refresh",
    onClick: onClick,
    title: "Refresh"
  }, React.createElement("i", {
    className: "fas fa-rotate"
  }));
}
const HubField = ({
  label,
  value
}) => React.createElement("div", {
  className: "hub-field"
}, React.createElement("span", {
  className: "hf-label"
}, label), React.createElement("span", {
  className: "hf-value"
}, value === 0 ? '0' : value || '-'));
const HubKpis = ({
  items
}) => React.createElement("div", {
  className: "hub-kpis"
}, items.map((it, i) => React.createElement("div", {
  className: "hub-kpi",
  key: i
}, React.createElement("div", {
  className: "k-label"
}, it.label), React.createElement("div", {
  className: "k-value"
}, it.value))));
function HubTimeline({
  logs,
  match
}) {
  const m = String(match || '').toLowerCase();
  const rows = (logs || []).filter(l => !m || `${l.detail || ''} ${l.user || ''}`.toLowerCase().includes(m));
  if (!rows.length) return React.createElement("div", {
    className: "hub-empty"
  }, "No activity recorded.");
  return React.createElement("ul", {
    className: "hub-timeline"
  }, rows.map(l => React.createElement("li", {
    key: l.id
  }, React.createElement("span", {
    className: "tl-icon"
  }, React.createElement("i", {
    className: "fas fa-clock-rotate-left"
  })), React.createElement("div", {
    className: "tl-body"
  }, React.createElement("strong", null, l.action), " \u2014 ", l.detail, React.createElement("div", {
    className: "tl-when"
  }, l.user, " \xB7 ", getTimeAgo(l.ts))))));
}
function TabbedModal({
  title,
  icon,
  header,
  tabs,
  onClose
}) {
  const [active, setActive] = useState(tabs[0] && tabs[0].id);
  const cur = tabs.find(t => t.id === active) || tabs[0];
  return React.createElement("div", {
    className: "modal-overlay",
    onClick: onClose
  }, React.createElement("div", {
    className: "modal",
    onClick: e => e.stopPropagation()
  }, React.createElement("div", {
    className: "modal-header"
  }, React.createElement("h3", null, React.createElement("i", {
    className: `fas ${icon}`
  }), " ", title), React.createElement("button", {
    className: "close-btn",
    onClick: onClose
  }, React.createElement("i", {
    className: "fas fa-times"
  }))), React.createElement("div", {
    className: "modal-body"
  }, header, React.createElement("div", {
    className: "modal-tabs"
  }, tabs.map(t => React.createElement("button", {
    key: t.id,
    className: `modal-tab ${active === t.id ? 'active' : ''}`,
    onClick: () => setActive(t.id)
  }, React.createElement("i", {
    className: `fas ${t.icon}`
  }), " ", t.label))), React.createElement("div", null, cur && cur.content))));
}
function CustomerHubModal({
  customer,
  onClose
}) {
  const {
    loading,
    data
  } = useFetch(() => Promise.all([fbGetSales(), fbGetLogs()]), []);
  const sales = useMemo(() => data && data[0] && data[0].success ? data[0].data.filter(s => s.customerId === customer.id) : [], [data, customer.id]);
  const logs = useMemo(() => data && data[1] && data[1].success ? data[1].data : [], [data]);
  const spent = sales.reduce((a, s) => a + Number(s.total || 0), 0);
  const header = React.createElement(React.Fragment, null, React.createElement("div", {
    className: "hub-id-card"
  }, React.createElement("div", {
    className: "hub-avatar"
  }, React.createElement("i", {
    className: "fas fa-user-tag"
  })), React.createElement("div", null, React.createElement("div", {
    className: "hub-name"
  }, customer.name), React.createElement("div", {
    className: "hub-sub"
  }, customer.customerType || 'Retail', customer.company ? ' · ' + customer.company : ''))), React.createElement(HubKpis, {
    items: [{
      label: 'Balance',
      value: money(customer.amount)
    }, {
      label: 'Orders',
      value: sales.length
    }, {
      label: 'Total Spent',
      value: money(spent)
    }, {
      label: 'Credit Limit',
      value: money(customer.creditLimit)
    }]
  }));
  const tabs = [{
    id: 'overview',
    label: 'Overview',
    icon: 'fa-circle-info',
    content: React.createElement("div", null, React.createElement(HubField, {
      label: "Phone",
      value: customer.phone
    }), React.createElement(HubField, {
      label: "Email",
      value: customer.email
    }), React.createElement(HubField, {
      label: "City",
      value: customer.city
    }), React.createElement(HubField, {
      label: "Country",
      value: customer.country
    }), React.createElement(HubField, {
      label: "Group",
      value: customer.category
    }), React.createElement(HubField, {
      label: "Assigned To",
      value: customer.assignedTo
    }), React.createElement(HubField, {
      label: "Loyalty Points",
      value: customer.loyaltyPoints
    }), React.createElement(HubField, {
      label: "Tags",
      value: customer.tags
    }), React.createElement(HubField, {
      label: "Notes",
      value: customer.notes
    }))
  }, {
    id: 'sales',
    label: 'Sales',
    icon: 'fa-receipt',
    content: loading ? React.createElement("div", {
      className: "hub-empty"
    }, "Loading\u2026") : sales.length ? React.createElement("table", {
      className: "hub-mini-table"
    }, React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", null, "Invoice"), React.createElement("th", null, "Date"), React.createElement("th", null, "Total"), React.createElement("th", null, "Pay"))), React.createElement("tbody", null, sales.map(s => React.createElement("tr", {
      key: s.id
    }, React.createElement("td", null, s.invoiceNo || String(s.id).slice(-6).toUpperCase()), React.createElement("td", null, formatDateForDisplay(s.createdAt)), React.createElement("td", null, money(s.total)), React.createElement("td", null, s.paymentMethod || '-'))))) : React.createElement("div", {
      className: "hub-empty"
    }, "No sales for this customer.")
  }, {
    id: 'timeline',
    label: 'Timeline',
    icon: 'fa-stream',
    content: loading ? React.createElement("div", {
      className: "hub-empty"
    }, "Loading\u2026") : React.createElement(HubTimeline, {
      logs: logs,
      match: customer.name
    })
  }];
  return React.createElement(TabbedModal, {
    title: customer.name,
    icon: "fa-user-tag",
    header: header,
    tabs: tabs,
    onClose: onClose
  });
}
function ProductHubModal({
  product,
  onClose
}) {
  const {
    loading,
    data
  } = useFetch(() => Promise.all([fbGetStockMovements(), fbGetSales()]), []);
  const moves = useMemo(() => data && data[0] && data[0].success ? data[0].data.filter(m => m.productId === product.id) : [], [data, product.id]);
  const allSales = useMemo(() => data && data[1] && data[1].success ? data[1].data : [], [data]);
  const qty = computeQtyOnHand(product.id, moves);
  const soldLines = useMemo(() => allSales.flatMap(s => (s.items || []).filter(it => it.productId === product.id).map((it, idx) => {
    const unitName = it.unitName || product.unitBase || product.unit || 'copë';
    const paidQty = Number(it.displayQty != null ? it.displayQty : it.paidQty != null ? it.paidQty : it.qty) || 0;
    const freeQty = Number(it.freeDisplayQty != null ? it.freeDisplayQty : it.freeQty) || 0;
    const unitPrice = Number(it.unitSalePrice != null ? it.unitSalePrice : it.price) || 0;
    const lineValue = Number(it.lineTotal != null ? it.lineTotal : paidQty * unitPrice) || 0;
    return {
      id: s.id + '_' + it.productId + '_' + idx,
      when: s.createdAt,
      customer: s.customerName,
      qty: paidQty,
      freeQty,
      unitName,
      price: unitPrice,
      value: lineValue
    };
  })), [allSales, product.id, product.unit, product.unitBase]);
  const soldQty = soldLines.reduce((a, l) => a + Number(l.qty || 0), 0);
  const margin = Number(product.price) > 0 ? Math.round((Number(product.price) - Number(product.cost || 0)) / Number(product.price) * 100) : 0;
  const header = React.createElement(React.Fragment, null, React.createElement("div", {
    className: "hub-id-card"
  }, React.createElement("div", {
    className: "hub-avatar"
  }, React.createElement("i", {
    className: "fas fa-box"
  })), React.createElement("div", null, React.createElement("div", {
    className: "hub-name"
  }, product.name), React.createElement("div", {
    className: "hub-sub"
  }, "SKU ", product.sku, product.category ? ' · ' + product.category : ''))), React.createElement(HubKpis, {
    items: [{
      label: 'On Hand',
      value: qty
    }, {
      label: 'Stock Value',
      value: money(qty * (Number(product.cost) || 0))
    }, {
      label: 'Sold',
      value: soldQty
    }, {
      label: 'Margin',
      value: margin + '%'
    }]
  }));
  const tabs = [{
    id: 'details',
    label: 'Details',
    icon: 'fa-circle-info',
    content: React.createElement("div", null, React.createElement(HubField, {
      label: "Price",
      value: money(product.price)
    }), React.createElement(HubField, {
      label: "Cost",
      value: money(product.cost)
    }), React.createElement(HubField, {
      label: "Barcode",
      value: product.barcode
    }), React.createElement(HubField, {
      label: "Brand",
      value: product.brand
    }), React.createElement(HubField, {
      label: "Unit",
      value: product.unit
    }), React.createElement(HubField, {
      label: "Reorder Level",
      value: product.reorderLevel
    }), React.createElement(HubField, {
      label: "Location",
      value: product.location
    }), React.createElement(HubField, {
      label: "Statusi",
      value: product.status || 'active'
    }))
  }, {
    id: 'stock',
    label: 'Stock Movement',
    icon: 'fa-dolly',
    content: loading ? React.createElement("div", {
      className: "hub-empty"
    }, "Loading\u2026") : moves.length ? React.createElement("table", {
      className: "hub-mini-table"
    }, React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", null, "Date"), React.createElement("th", null, "Type"), React.createElement("th", null, "Qty"), React.createElement("th", null, "Reason"))), React.createElement("tbody", null, moves.map(m => React.createElement("tr", {
      key: m.id
    }, React.createElement("td", null, formatDateForDisplay(m.createdAt)), React.createElement("td", null, m.type === 'in' ? 'IN' : 'OUT'), React.createElement("td", null, m.qty), React.createElement("td", null, m.reason || '-'))))) : React.createElement("div", {
      className: "hub-empty"
    }, "No stock movements.")
  }, {
    id: 'sales',
    label: 'Historiku i Shitjeve',
    icon: 'fa-receipt',
    content: loading ? React.createElement("div", {
      className: "hub-empty"
    }, "Duke ngarkuar\u2026") : soldLines.length ? React.createElement("table", {
      className: "hub-mini-table"
    }, React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", null, "Data"), React.createElement("th", null, "Klienti"), React.createElement("th", null, "Sasia"), React.createElement("th", null, "Falas"), React.createElement("th", null, "Nj\xEBsia"), React.createElement("th", null, "\xC7mimi"), React.createElement("th", null, "Vlera"))), React.createElement("tbody", null, soldLines.map(l => React.createElement("tr", {
      key: l.id
    }, React.createElement("td", null, formatDateForDisplay(l.when)), React.createElement("td", null, l.customer || 'Walk-in'), React.createElement("td", null, l.qty), React.createElement("td", null, l.freeQty || 0), React.createElement("td", null, l.unitName), React.createElement("td", null, money(l.price)), React.createElement("td", null, money(l.value)))))) : React.createElement("div", {
      className: "hub-empty"
    }, "Nuk \xEBsht\xEB shitur ende.")
  }];
  return React.createElement(TabbedModal, {
    title: product.name,
    icon: "fa-box",
    header: header,
    tabs: tabs,
    onClose: onClose
  });
}
function SupplierHubModal({
  supplier,
  onClose
}) {
  const {
    loading,
    data
  } = useFetch(() => Promise.all([fbGetPurchaseOrders(), fbGetLogs()]), []);
  const supPOs = useMemo(() => data && data[0] && data[0].success ? data[0].data.filter(p => p.supplierName === supplier.name) : [], [data, supplier.name]);
  const logs = useMemo(() => data && data[1] && data[1].success ? data[1].data : [], [data]);
  const poValue = supPOs.reduce((a, p) => a + Number(p.total || 0), 0);
  const header = React.createElement(React.Fragment, null, React.createElement("div", {
    className: "hub-id-card"
  }, React.createElement("div", {
    className: "hub-avatar"
  }, React.createElement("i", {
    className: "fas fa-truck-field"
  })), React.createElement("div", null, React.createElement("div", {
    className: "hub-name"
  }, supplier.name), React.createElement("div", {
    className: "hub-sub"
  }, supplier.contact || 'Supplier'))), React.createElement(HubKpis, {
    items: [{
      label: 'Payable',
      value: money(supplier.openingBalance)
    }, {
      label: 'POs',
      value: supPOs.length
    }, {
      label: 'PO Value',
      value: money(poValue)
    }]
  }));
  const tabs = [{
    id: 'overview',
    label: 'Overview',
    icon: 'fa-circle-info',
    content: React.createElement("div", null, React.createElement(HubField, {
      label: "Contact",
      value: supplier.contact
    }), React.createElement(HubField, {
      label: "Phone",
      value: supplier.phone
    }), React.createElement(HubField, {
      label: "Email",
      value: supplier.email
    }), React.createElement(HubField, {
      label: "Terms",
      value: supplier.terms
    }), React.createElement(HubField, {
      label: "Address",
      value: supplier.address
    }), React.createElement(HubField, {
      label: "Notes",
      value: supplier.notes
    }))
  }, {
    id: 'pos',
    label: 'Purchase Orders',
    icon: 'fa-file-invoice-dollar',
    content: loading ? React.createElement("div", {
      className: "hub-empty"
    }, "Loading\u2026") : supPOs.length ? React.createElement("table", {
      className: "hub-mini-table"
    }, React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", null, "PO #"), React.createElement("th", null, "Date"), React.createElement("th", null, "Total"), React.createElement("th", null, "Status"))), React.createElement("tbody", null, supPOs.map(p => React.createElement("tr", {
      key: p.id
    }, React.createElement("td", null, p.poNumber), React.createElement("td", null, formatDateForDisplay(p.createdAt)), React.createElement("td", null, money(p.total)), React.createElement("td", null, p.status || 'draft'))))) : React.createElement("div", {
      className: "hub-empty"
    }, "No purchase orders.")
  }, {
    id: 'timeline',
    label: 'Timeline',
    icon: 'fa-stream',
    content: loading ? React.createElement("div", {
      className: "hub-empty"
    }, "Loading\u2026") : React.createElement(HubTimeline, {
      logs: logs,
      match: supplier.name
    })
  }];
  return React.createElement(TabbedModal, {
    title: supplier.name,
    icon: "fa-truck-field",
    header: header,
    tabs: tabs,
    onClose: onClose
  });
}
function UserHubModal({
  account,
  onClose
}) {
  const {
    loading,
    data
  } = useFetch(() => fbGetLogs(), []);
  const logs = useMemo(() => data && data.success ? data.data : [], [data]);
  const mine = logs.filter(l => l.user === account.name || l.user === account.email);
  const header = React.createElement(React.Fragment, null, React.createElement("div", {
    className: "hub-id-card"
  }, React.createElement("div", {
    className: "hub-avatar"
  }, React.createElement("i", {
    className: "fas fa-user-gear"
  })), React.createElement("div", null, React.createElement("div", {
    className: "hub-name"
  }, account.name), React.createElement("div", {
    className: "hub-sub"
  }, account.email))), React.createElement(HubKpis, {
    items: [{
      label: 'Role',
      value: account.role
    }, {
      label: 'Recent Actions',
      value: mine.length
    }]
  }));
  const tabs = [{
    id: 'profile',
    label: 'Profile',
    icon: 'fa-circle-info',
    content: React.createElement("div", null, React.createElement(HubField, {
      label: "Name",
      value: account.name
    }), React.createElement(HubField, {
      label: "Email",
      value: account.email
    }), React.createElement(HubField, {
      label: "Role",
      value: account.role
    }))
  }, {
    id: 'activity',
    label: 'Activity',
    icon: 'fa-clock-rotate-left',
    content: loading ? React.createElement("div", {
      className: "hub-empty"
    }, "Loading\u2026") : React.createElement(HubTimeline, {
      logs: mine,
      match: ""
    })
  }];
  return React.createElement(TabbedModal, {
    title: account.name,
    icon: "fa-user-gear",
    header: header,
    tabs: tabs,
    onClose: onClose
  });
}
function TableSkeleton({
  rows = 5,
  columns = 6
}) {
  return React.createElement("div", {
    className: "skeleton-table"
  }, React.createElement("div", {
    className: "skeleton-table-row"
  }, [...Array(columns)].map((_, i) => React.createElement("div", {
    key: i,
    className: "skeleton skeleton-table-cell",
    style: {
      flex: 1
    }
  }))), [...Array(rows)].map((_, r) => React.createElement("div", {
    key: r,
    className: "skeleton-table-row"
  }, [...Array(columns)].map((_, c) => React.createElement("div", {
    key: c,
    className: "skeleton skeleton-table-cell",
    style: {
      flex: 1
    }
  })))));
}
function DashboardCardSkeleton() {
  return React.createElement("div", {
    className: "skeleton-card"
  }, React.createElement("div", {
    className: "skeleton skeleton-icon"
  }), React.createElement("div", {
    className: "skeleton skeleton-text-large",
    style: {
      width: '60%'
    }
  }), React.createElement("div", {
    className: "skeleton skeleton-text",
    style: {
      width: '80%'
    }
  }));
}
function SmallBox({
  value,
  label,
  icon,
  color,
  onMore
}) {
  return React.createElement("div", {
    className: `small-box ${color || 'bg-navy'}`
  }, React.createElement("div", {
    className: "inner"
  }, React.createElement("h3", null, value), React.createElement("p", null, label)), React.createElement("div", {
    className: "icon"
  }, React.createElement("i", {
    className: `fas ${icon}`
  })), onMore && React.createElement("button", {
    className: "small-box-footer",
    onClick: onMore
  }, "More info ", React.createElement("i", {
    className: "fas fa-arrow-circle-right"
  })));
}
function LteCard({
  title,
  icon,
  children
}) {
  const [open, setOpen] = useState(true);
  return React.createElement("div", {
    className: `lte-card${open ? '' : ' collapsed'}`
  }, React.createElement("div", {
    className: "lte-card-header"
  }, React.createElement("h3", {
    className: "lte-card-title"
  }, React.createElement("i", {
    className: `fas ${icon}`
  }), " ", title), React.createElement("div", {
    className: "lte-card-tools"
  }, React.createElement("button", {
    onClick: () => setOpen(!open),
    title: open ? 'Collapse' : 'Expand'
  }, React.createElement("i", {
    className: `fas fa-${open ? 'minus' : 'plus'}`
  })))), React.createElement("div", {
    className: "lte-card-body"
  }, children));
}
function NavDropdown({
  trigger,
  children
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const close = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  return React.createElement("div", {
    className: `nav-dd${open ? ' open' : ''}`,
    ref: ref,
    style: {
      height: '100%',
      display: 'flex',
      alignItems: 'stretch'
    }
  }, React.createElement("div", {
    onClick: () => setOpen(!open),
    style: {
      display: 'flex',
      alignItems: 'stretch',
      height: '100%',
      cursor: 'pointer'
    }
  }, trigger), React.createElement("div", {
    className: "nav-dd-menu",
    onClick: () => setOpen(false)
  }, children));
}
function OdooTopbar({
  title,
  userName,
  role,
  notifs = [],
  onLogout,
  setActiveMenu,
  toggleSidebar,
  onOpenApps
}) {
  return React.createElement("div", {
    className: "o-topbar"
  }, React.createElement("button", {
    type: "button",
    className: "o-apps-btn",
    title: "Aplikacionet",
    onClick: onOpenApps
  }, React.createElement("i", {
    className: "fas fa-th"
  })), React.createElement("button", {
    type: "button",
    className: "o-apps-btn",
    title: "Menu",
    onClick: toggleSidebar
  }, React.createElement("i", {
    className: "fas fa-bars"
  })), React.createElement("div", {
    className: "o-brand-block"
  }, React.createElement("img", {
    src: LOGO_URL,
    alt: "",
    className: "o-brand-logo"
  }), React.createElement("span", {
    className: "o-brand-name"
  }, "Sistemi Genit"), React.createElement("span", {
    className: "o-current-app"
  }, title)), React.createElement("div", {
    className: "o-topbar-spacer"
  }), React.createElement("div", {
    className: "o-systray"
  }, React.createElement(NavDropdown, {
    trigger: React.createElement("button", {
      type: "button",
      className: "o-systray-item",
      title: "Njoftime"
    }, React.createElement("i", {
      className: "fas fa-bell"
    }), notifs.length > 0 && React.createElement("span", {
      className: "badge"
    }, notifs.length))
  }, React.createElement("div", {
    className: "nav-dd-head"
  }, React.createElement("div", {
    className: "dd-title"
  }, notifs.length, " Njoftime"), notifs[0] && React.createElement("div", {
    className: "dd-sub"
  }, notifs[0].text)), notifs.slice(0, 5).map((n, i) => React.createElement("div", {
    className: "nav-notif",
    key: i
  }, React.createElement("i", {
    className: `fas ${n.icon || 'fa-circle-info'}`
  }), React.createElement("span", null, n.text))), React.createElement("div", {
    className: "nav-dd-foot"
  }, React.createElement("button", {
    className: "btn-block",
    onClick: () => setActiveMenu('logs')
  }, React.createElement("i", {
    className: "fas fa-list"
  }), " Shiko t\xEB gjitha"))), React.createElement(NavDropdown, {
    trigger: React.createElement("button", {
      type: "button",
      className: "o-user-chip",
      title: "Llogaria"
    }, React.createElement("img", {
      className: "o-user-avatar",
      src: LOGO_URL,
      alt: ""
    }), React.createElement("span", {
      className: "o-user-meta"
    }, React.createElement("strong", null, userName), React.createElement("small", null, role)))
  }, React.createElement("a", {
    onClick: () => setActiveMenu('about')
  }, React.createElement("span", null, React.createElement("i", {
    className: "fas fa-user"
  }), " Profili"), React.createElement("span", {
    className: "dd-badge"
  }, role)), React.createElement("a", {
    onClick: () => setActiveMenu('settings')
  }, React.createElement("span", null, React.createElement("i", {
    className: "fas fa-gear"
  }), " Cil\xEBsimet")), React.createElement("button", {
    onClick: onLogout
  }, React.createElement("span", null, React.createElement("i", {
    className: "fas fa-right-from-bracket"
  }), " Dil")))));
}
function Navbar(props) {
  return null;
}
const ODOO_APPS = [{
  id: 'dashboard',
  label: 'Paneli',
  sub: 'Përmbledhje',
  icon: 'fa-gauge-high',
  color: '#714B67',
  admin: true
}, {
  id: 'pos',
  label: 'POS / Shitje',
  sub: 'Arka QR',
  icon: 'fa-cash-register',
  color: '#017e84'
}, {
  id: 'sales-history',
  label: 'Porositë',
  sub: 'Historiku',
  icon: 'fa-file-invoice',
  color: '#00a09d'
}, {
  id: 'records',
  label: 'Kontaktet',
  sub: 'Klientët',
  icon: 'fa-address-book',
  color: '#875a7b'
}, {
  id: 'products',
  label: 'Produktet',
  sub: 'Artikujt',
  icon: 'fa-boxes-stacked',
  color: '#5d8da8'
}, {
  id: 'stock',
  label: 'Inventari',
  sub: 'Hyrje/Dalje',
  icon: 'fa-warehouse',
  color: '#aa4b6e'
}, {
  id: 'suppliers',
  label: 'Furnitorët',
  sub: 'Blerje',
  icon: 'fa-truck-field',
  color: '#c47c2b',
  admin: true
}, {
  id: 'purchase-orders',
  label: 'Porosi Blerje',
  sub: 'PO',
  icon: 'fa-bag-shopping',
  color: '#e67e22',
  admin: true
}, {
  id: 'warehouse-receipts-in',
  label: 'Fletë Hyrje',
  sub: 'Dokumente blerjeje',
  icon: 'fa-box-open',
  color: '#2e8b57',
  admin: true
}, {
  id: 'expenses',
  label: 'Shpenzimet',
  sub: 'Kontabilitet',
  icon: 'fa-money-bill-wave',
  color: '#d9534f',
  admin: true
}, {
  id: 'reports',
  label: 'Raportet',
  sub: 'Analiza ERP',
  icon: 'fa-chart-pie',
  color: '#5c6bc0'
}, {
  id: 'users',
  label: 'Përdoruesit',
  sub: 'Aksesi',
  icon: 'fa-users-cog',
  color: '#6d597a',
  admin: true
}, {
  id: 'settings',
  label: 'Cilësimet',
  sub: 'Kompania',
  icon: 'fa-gear',
  color: '#607d8b',
  admin: true
}, {
  id: 'import-export',
  label: 'Import / Eksport',
  sub: 'Template & Backup',
  icon: 'fa-file-import',
  color: '#2c7873',
  admin: true
}, {
  id: 'logs',
  label: 'Aktiviteti',
  sub: 'Logs',
  icon: 'fa-clock-rotate-left',
  color: '#8d6e63',
  admin: true
}, {
  id: 'about',
  label: 'Rreth',
  sub: 'Aplikacioni',
  icon: 'fa-circle-info',
  color: '#9e9e9e'
}];
ODOO_APPS.forEach(a => {
  if (a.id === 'purchase-orders' && (!a.color || a.color.length < 4)) a.color = '#e67e22';
});
function OdooAppsMenu({
  role,
  setActiveMenu,
  onClose,
  user
}) {
  const apps = ODOO_APPS.filter(a => canAccessMenu(role, a.id) || a.id === 'about');
  return React.createElement("div", {
    className: "o-apps-overlay",
    onClick: onClose
  }, React.createElement("div", {
    className: "o-apps-panel",
    onClick: e => e.stopPropagation()
  }, React.createElement("h3", null, "Aplikacionet ", React.createElement("button", {
    type: "button",
    className: "o-apps-close",
    onClick: onClose
  }, React.createElement("i", {
    className: "fas fa-times"
  }))), React.createElement("div", {
    className: "o-apps-grid"
  }, apps.map(a => React.createElement("div", {
    key: a.id,
    className: "o-app-tile",
    onClick: () => {
      setActiveMenu(a.id);
      onClose();
    }
  }, React.createElement("div", {
    className: "o-app-icon",
    style: {
      background: a.color
    }
  }, React.createElement("i", {
    className: `fas ${a.icon}`
  })), React.createElement("div", {
    className: "o-app-name"
  }, a.label), React.createElement("div", {
    className: "o-app-sub"
  }, a.sub))))));
}
function Sidebar({
  activeMenu,
  setActiveMenu,
  role,
  user,
  onLogout,
  collapsed
}) {
  const rights = mergeUserRights({
    role,
    rights: user && user.rights
  });
  const can = id => role === 'Admin' || !!rights[id] || !!rights.all;
  const Item = ({
    id,
    icon,
    label
  }) => can(id) ? React.createElement("li", null, React.createElement("button", {
    className: activeMenu === id ? 'active' : '',
    onClick: () => setActiveMenu(id)
  }, React.createElement("i", {
    className: `fas ${icon}`
  }), React.createElement("span", null, label))) : null;
  const Section = ({
    title,
    children
  }) => {
    const kids = React.Children.toArray(children).filter(Boolean);
    if (!kids.length) return null;
    return React.createElement(React.Fragment, null, React.createElement("div", {
      className: "sidebar-menu-title"
    }, title), React.createElement("ul", {
      className: "sidebar-menu"
    }, kids));
  };
  return React.createElement("div", {
    className: 'sidebar o-sidebar' + (collapsed ? ' collapsed' : '')
  }, React.createElement("div", {
    className: "sidebar-menu-section"
  }, React.createElement(Section, {
    title: "Favoritet"
  }, React.createElement(Item, {
    id: "dashboard",
    icon: "fa-gauge-high",
    label: "Paneli"
  }), React.createElement(Item, {
    id: "pos",
    icon: "fa-cash-register",
    label: "POS / Shitje"
  }), React.createElement(Item, {
    id: "sales-history",
    icon: "fa-file-invoice",
    label: "Porosit\xEB"
  })), React.createElement(Section, {
    title: "Shitjet"
  }, React.createElement(Item, {
    id: "records",
    icon: "fa-address-book",
    label: "Klient\xEBt"
  }), React.createElement(Item, {
    id: "sales-history",
    icon: "fa-receipt",
    label: "Historiku i shitjeve"
  }), React.createElement(Item, {
    id: "reports",
    icon: "fa-chart-pie",
    label: "Raportet"
  }), React.createElement(Item, {
    id: "alpha-reports",
    icon: "fa-table-list",
    label: "Raporte Alpha"
  })), React.createElement(Section, {
    title: "Inventari"
  }, React.createElement(Item, {
    id: "products",
    icon: "fa-boxes-stacked",
    label: "Produktet"
  }), React.createElement(Item, {
    id: "stock",
    icon: "fa-dolly",
    label: "Hyrje / Dalje"
  })), React.createElement(Section, {
    title: "Blerjet"
  }, React.createElement(Item, {
    id: "suppliers",
    icon: "fa-truck-field",
    label: "Furnitor\xEBt"
  }), React.createElement(Item, {
    id: "purchase-orders",
    icon: "fa-bag-shopping",
    label: "Porosi blerje"
  }), React.createElement(Item, {
    id: "warehouse-receipts-in",
    icon: "fa-box-open",
    label: "Flet\xEB Hyrje"
  })), React.createElement(Section, {
    title: "Kontabilitet"
  }, React.createElement(Item, {
    id: "expenses",
    icon: "fa-money-bill-wave",
    label: "Shpenzimet"
  })), React.createElement(Section, {
    title: "Konfigurimi"
  }, React.createElement(Item, {
    id: "users",
    icon: "fa-users-cog",
    label: "P\xEBrdoruesit"
  }), React.createElement(Item, {
    id: "settings",
    icon: "fa-gear",
    label: "Cil\xEBsimet"
  }), React.createElement(Item, {
    id: "import-export",
    icon: "fa-file-import",
    label: "Import / Eksport"
  }), React.createElement(Item, {
    id: "logs",
    icon: "fa-clock-rotate-left",
    label: "Aktiviteti"
  })), React.createElement(Section, {
    title: "T\xEB tjera"
  }, React.createElement(Item, {
    id: "about",
    icon: "fa-circle-info",
    label: "Rreth aplikacionit"
  }))), React.createElement("div", {
    className: "sidebar-logout"
  }, React.createElement("button", {
    onClick: onLogout
  }, React.createElement("i", {
    className: "fas fa-sign-out-alt"
  }), React.createElement("span", null, "Dil"))));
}
function InitialSetupPage({
  onComplete
}) {
  const [form, setForm] = useState({
    businessName: '',
    nipt: '',
    address: '',
    phone: '',
    warehouse: 'Magazina Kryesore',
    adminName: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const upd = (key, value) => setForm(prev => Object.assign({}, prev, {
    [key]: value
  }));
  const submit = async e => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) {
      setError('Fjalëkalimet nuk përputhen.');
      return;
    }
    setLoading(true);
    try {
      const result = await fbCreateInitialSetup(form);
      setLoading(false);
      if (!result.success) {
        setError(result.message || 'Konfigurimi dështoi.');
        return;
      }
      if (result.data) onComplete(result.data, result.data.role || 'Admin');else window.location.reload();
    } catch (err) {
      setLoading(false);
      setError('Konfigurimi dështoi: ' + (err.message || err));
    }
  };
  return React.createElement("div", {
    className: "login-container"
  }, React.createElement("div", {
    className: "login-box",
    style: {
      maxWidth: '640px',
      textAlign: 'left'
    }
  }, React.createElement("div", {
    style: {
      textAlign: 'center'
    }
  }, React.createElement("img", {
    src: LOGO_URL,
    alt: "Logo",
    className: "login-logo"
  }), React.createElement("h2", {
    style: {
      marginBottom: '10px'
    }
  }, "Konfigurimi i par\xEB"), React.createElement("p", {
    style: {
      color: '#667085',
      marginBottom: '24px'
    }
  }, "Sistemi \xEBsht\xEB bosh. Krijoni kompanin\xEB dhe administratorin e par\xEB.")), React.createElement("form", {
    onSubmit: submit
  }, React.createElement("div", {
    className: "form-grid"
  }, React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Emri i kompanis\xEB *"), React.createElement("input", {
    value: form.businessName,
    onChange: e => upd('businessName', e.target.value),
    required: true
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "NIPT"), React.createElement("input", {
    value: form.nipt,
    onChange: e => upd('nipt', e.target.value)
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Adresa"), React.createElement("input", {
    value: form.address,
    onChange: e => upd('address', e.target.value)
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Telefoni"), React.createElement("input", {
    value: form.phone,
    onChange: e => upd('phone', e.target.value)
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Magazina kryesore *"), React.createElement("input", {
    value: form.warehouse,
    onChange: e => upd('warehouse', e.target.value),
    required: true
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Emri i administratorit *"), React.createElement("input", {
    value: form.adminName,
    onChange: e => upd('adminName', e.target.value),
    required: true
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Email-i i administratorit *"), React.createElement("input", {
    type: "email",
    value: form.email,
    onChange: e => upd('email', e.target.value),
    required: true
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Fjal\xEBkalimi *"), React.createElement("input", {
    type: "password",
    minLength: "6",
    value: form.password,
    onChange: e => upd('password', e.target.value),
    required: true
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Konfirmo fjal\xEBkalimin *"), React.createElement("input", {
    type: "password",
    minLength: "6",
    value: form.confirmPassword,
    onChange: e => upd('confirmPassword', e.target.value),
    required: true
  }))), React.createElement("button", {
    type: "submit",
    className: "btn btn-primary",
    disabled: loading,
    style: {
      width: '100%',
      marginTop: '6px'
    }
  }, loading ? React.createElement(React.Fragment, null, React.createElement("i", {
    className: "fas fa-spinner fa-spin"
  }), " Duke ruajtur...") : React.createElement(React.Fragment, null, React.createElement("i", {
    className: "fas fa-check"
  }), " Krijo sistemin bosh")), error && React.createElement("div", {
    className: "error"
  }, error))));
}
function LoginPage({
  onLogin
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await fbLogin(email, password);
      setLoading(false);
      if (result.success) onLogin(result.data, result.data.role);else setError(result.message);
    } catch (err) {
      setLoading(false);
      setError('Connection error. Please try again.');
    }
  };
  return React.createElement("div", {
    className: "login-container"
  }, React.createElement("div", {
    className: "login-box"
  }, React.createElement("img", {
    src: LOGO_URL,
    alt: "Logo",
    className: "login-logo"
  }), React.createElement("h2", null, "Sistemi Genit"), React.createElement("form", {
    onSubmit: handleSubmit
  }, React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Email"), React.createElement("input", {
    type: "email",
    value: email,
    onChange: e => setEmail(e.target.value),
    required: true
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Fjal\xEBkalimi"), React.createElement("input", {
    type: "password",
    value: password,
    onChange: e => setPassword(e.target.value),
    required: true
  })), React.createElement("button", {
    type: "submit",
    className: "btn btn-primary",
    disabled: loading,
    style: {
      width: '100%'
    }
  }, loading ? React.createElement(React.Fragment, null, React.createElement("i", {
    className: "fas fa-spinner fa-spin"
  }), " Duke hyr\xEB...") : React.createElement(React.Fragment, null, React.createElement("i", {
    className: "fas fa-sign-in-alt"
  }), " Hyr")), error && React.createElement("div", {
    className: "error"
  }, error))));
}
function RecordModal({
  record,
  onClose,
  onSave
}) {
  const catOpts = useCategoryOpts();
  const [formData, setFormData] = useState({
    name: record?.name || function () {
      try {
        const n = localStorage.getItem('erp_new_customer_name');
        if (n) {
          localStorage.removeItem('erp_new_customer_name');
          return n;
        }
      } catch (e) {}
      return '';
    }(),
    email: record?.email || '',
    phone: record?.phone || '',
    company: record?.company || '',
    customerType: record?.customerType || 'Retail',
    taxId: record?.taxId || '',
    category: record?.category || '',
    address: record?.address || '',
    city: record?.city || '',
    country: record?.country || '',
    amount: record?.amount ?? '',
    creditLimit: record?.creditLimit ?? '',
    loyaltyPoints: record?.loyaltyPoints ?? '',
    assignedTo: record?.assignedTo || '',
    source: record?.source || '',
    nextFollowUp: record?.nextFollowUp || '',
    tags: record?.tags || '',
    active: record?.active ?? true,
    notes: record?.notes || ''
  });
  const [saving, setSaving] = useState(false);
  const num = v => Number(v) || 0;
  return React.createElement("div", {
    className: "modal-overlay",
    onClick: onClose
  }, React.createElement("div", {
    className: "modal",
    onClick: e => e.stopPropagation()
  }, React.createElement("div", {
    className: "modal-header"
  }, React.createElement("h3", null, React.createElement("i", {
    className: "fas fa-user-tag"
  }), " ", record ? 'Edit' : 'Add', " Customer"), React.createElement("button", {
    className: "close-btn",
    onClick: onClose
  }, React.createElement("i", {
    className: "fas fa-times"
  }))), React.createElement("div", {
    className: "modal-body"
  }, React.createElement("form", {
    onSubmit: e => {
      e.preventDefault();
      setSaving(true);
      onSave({
        ...formData,
        amount: num(formData.amount),
        creditLimit: num(formData.creditLimit),
        loyaltyPoints: num(formData.loyaltyPoints)
      });
    }
  }, React.createElement("div", {
    className: "form-grid"
  }, React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Name *"), React.createElement("input", {
    type: "text",
    value: formData.name,
    onChange: e => setFormData(p => ({
      ...p,
      name: e.target.value
    })),
    required: true
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Company"), React.createElement("input", {
    type: "text",
    value: formData.company,
    onChange: e => setFormData(p => ({
      ...p,
      company: e.target.value
    }))
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Phone"), React.createElement("input", {
    type: "text",
    value: formData.phone,
    onChange: e => setFormData(p => ({
      ...p,
      phone: e.target.value
    }))
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Email"), React.createElement("input", {
    type: "email",
    value: formData.email,
    onChange: e => setFormData(p => ({
      ...p,
      email: e.target.value
    }))
  })), React.createElement(SearchableDropdown, {
    label: "Customer Type",
    icon: "fas fa-user-group",
    options: CUSTOMER_TYPE_OPTS,
    value: formData.customerType,
    onChange: val => setFormData(p => ({
      ...p,
      customerType: val
    })),
    placeholder: "Retail"
  }), React.createElement(SearchableDropdown, {
    label: "Group / Category",
    icon: "fas fa-tag",
    options: catOpts,
    value: formData.category,
    onChange: val => setFormData(p => ({
      ...p,
      category: val
    })),
    placeholder: "Select group..."
  }), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Tax ID / GST No"), React.createElement("input", {
    type: "text",
    value: formData.taxId,
    onChange: e => setFormData(p => ({
      ...p,
      taxId: e.target.value
    }))
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "City"), React.createElement("input", {
    type: "text",
    value: formData.city,
    onChange: e => setFormData(p => ({
      ...p,
      city: e.target.value
    }))
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Country"), React.createElement("input", {
    type: "text",
    value: formData.country,
    onChange: e => setFormData(p => ({
      ...p,
      country: e.target.value
    }))
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Opening Balance"), React.createElement("input", {
    type: "number",
    step: "0.01",
    value: formData.amount,
    onChange: e => setFormData(p => ({
      ...p,
      amount: e.target.value
    }))
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Credit Limit"), React.createElement("input", {
    type: "number",
    step: "0.01",
    min: "0",
    value: formData.creditLimit,
    onChange: e => setFormData(p => ({
      ...p,
      creditLimit: e.target.value
    }))
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Loyalty Points"), React.createElement("input", {
    type: "number",
    step: "1",
    min: "0",
    value: formData.loyaltyPoints,
    onChange: e => setFormData(p => ({
      ...p,
      loyaltyPoints: e.target.value
    }))
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Assigned To"), React.createElement("input", {
    type: "text",
    placeholder: "Salesperson",
    value: formData.assignedTo,
    onChange: e => setFormData(p => ({
      ...p,
      assignedTo: e.target.value
    }))
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Source"), React.createElement("input", {
    type: "text",
    placeholder: "Walk-in, Referral, Web...",
    value: formData.source,
    onChange: e => setFormData(p => ({
      ...p,
      source: e.target.value
    }))
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, React.createElement("i", {
    className: "fas fa-calendar-check"
  }), " Next Follow-up"), React.createElement("input", {
    type: "date",
    value: formData.nextFollowUp,
    onChange: e => setFormData(p => ({
      ...p,
      nextFollowUp: e.target.value
    }))
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Tags"), React.createElement("input", {
    type: "text",
    placeholder: "comma,separated",
    value: formData.tags,
    onChange: e => setFormData(p => ({
      ...p,
      tags: e.target.value
    }))
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, React.createElement("i", {
    className: "fas fa-toggle-on"
  }), " Active"), React.createElement("div", null, React.createElement("input", {
    type: "checkbox",
    className: "toggle",
    checked: formData.active,
    onChange: e => setFormData(p => ({
      ...p,
      active: e.target.checked
    }))
  })))), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Address"), React.createElement("textarea", {
    rows: "2",
    value: formData.address,
    onChange: e => setFormData(p => ({
      ...p,
      address: e.target.value
    }))
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Notes"), React.createElement("textarea", {
    rows: "2",
    value: formData.notes,
    onChange: e => setFormData(p => ({
      ...p,
      notes: e.target.value
    }))
  })), React.createElement("div", {
    className: "form-actions"
  }, React.createElement("button", {
    type: "submit",
    className: "btn btn-primary",
    disabled: saving
  }, saving ? React.createElement(React.Fragment, null, React.createElement("i", {
    className: "fas fa-spinner fa-spin"
  }), " Duke ruajtur...") : React.createElement(React.Fragment, null, React.createElement("i", {
    className: "fas fa-save"
  }), " Ruaj")), React.createElement("button", {
    type: "button",
    className: "btn btn-secondary",
    onClick: onClose
  }, React.createElement("i", {
    className: "fas fa-times"
  }), " Anulo"))))));
}
function RecordsView({
  user,
  role,
  setActiveMenu
}) {
  const nav = useAppNav();
  const [qSearch, setQSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  useEffect(() => {
    if (nav && nav.consumeCreate && nav.consumeCreate('records')) {
      setEditingId(null);
      setShowModal(true);
    }
  }, []);
  const [editingId, setEditingId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    active: '',
    addedBy: '',
    customerType: ''
  });
  const [load, setLoad] = useState('');
  const tableInstanceRef = useRef(null);
  useDtLiveSearch(tableInstanceRef, qSearch);
  const searchFnRef = useRef(null);
  const [viewCust, setViewCust] = useState(null);
  const {
    loading,
    data,
    err
  } = useFetch(() => fbGetRecords(), [reloadKey]);
  const records = useMemo(() => data && data.success ? data.data : [], [data]);
  const reload = () => setReloadKey(k => k + 1);
  window.refreshRecords = reload;
  const byId = useMemo(() => records.reduce((m, r) => (m[r.id] = r, m), {}), [records]);
  const uniqueUsers = useMemo(() => [...new Set(records.map(r => r.addedBy).filter(Boolean))], [records]);
  const openEdit = useCallback(id => {
    setEditingId(id);
    setShowModal(true);
  }, []);
  useEffect(() => {
    if (err || data && !data.success) Swal.fire({
      icon: 'error',
      title: 'Error',
      text: data && data.message || 'Failed to load records'
    });
  }, [err, data]);
  useEffect(() => {
    if (loading) return;
    let table = tableInstanceRef.current;
    if (table) {
      table.clear().rows.add(records).draw(false);
    } else {
      table = $('#recordsTable').DataTable({
        data: records,
        columnDefs: [{
          targets: '_all',
          defaultContent: ''
        }],
        createdRow: (row, d) => {
          if (!d.active) $(row).addClass('row-muted');
        },
        columns: [{
          data: 'id',
          title: 'ID',
          render: (d, t) => t === 'display' ? d.slice(-6).toUpperCase() : d
        }, {
          data: 'name',
          title: 'Emri',
          render: (d, t, row) => t === 'display' ? esc(d) + (row.company ? `<div class="cell-sub">${esc(row.company)}</div>` : '') : d
        }, {
          data: 'phone',
          title: 'Telefoni',
          render: (d, t) => t === 'display' ? esc(d || '') : d
        }, {
          data: 'customerType',
          title: 'Tipi',
          render: (d, t) => t === 'display' ? '<span class="type-chip">' + esc(d || 'Retail') + '</span>' : d
        }, {
          data: 'category',
          title: 'Grupi',
          render: (d, t) => t === 'display' ? esc(d || '') : d
        }, {
          data: 'amount',
          title: 'Balanca',
          render: (d, t) => t === 'display' ? money(d) : d
        }, {
          data: 'active',
          title: 'Aktiv',
          render: (d, t, row) => t === 'display' ? `<input type="checkbox" ${d ? 'checked' : ''} class="toggle" onchange="toggleActive('${row.id}', this.checked ? 1 : 0)">` : d
        }, {
          data: 'createdAt',
          title: 'Krijuar',
          render: (d, t) => t === 'display' ? formatDateForDisplay(d) : d
        }, {
          data: null,
          title: 'Veprime',
          orderable: false,
          render: () => actionBtn('view', 'fa-eye', 'Shiko') + actionBtn('edit', 'fa-edit', 'Ndrysho', 'edit') + (role === 'Admin' ? actionBtn('delete', 'fa-trash', 'Fshi', 'delete') : '')
        }],
        pageLength: 80,
        lengthMenu: [[10, 25, 50, -1], [10, 25, 50, 'All']],
        responsive: true,
        dom: 'Blfrtip',
        buttons: erpDtButtons('Klientët'),
        order: [[7, 'desc']]
      });
      tableInstanceRef.current = table;
    }
    $('#recordsTable').off('click', '[data-action]').on('click', '[data-action]', function () {
      const rowData = getDtRowData(table, this);
      if (!rowData || !rowData.id) return;
      const id = rowData.id;
      const act = $(this).data('action');
      if (act === 'view') setViewCust(byId[id] || rowData);else if (act === 'edit') openEdit(id);else handleDelete(byId[id] || rowData);
    });
  }, [loading, records, role]);
  useEffect(() => () => {
    const ext = $.fn.dataTable.ext.search;
    const i = ext.indexOf(searchFnRef.current);
    if (i !== -1) ext.splice(i, 1);
    if (tableInstanceRef.current) {
      try {
        tableInstanceRef.current.destroy();
        tableInstanceRef.current = null;
      } catch (e) {}
    }
  }, []);
  const applyFilters = () => {
    if (!tableInstanceRef.current) return;
    const dt = tableInstanceRef.current;
    const ext = $.fn.dataTable.ext.search;
    const prev = ext.indexOf(searchFnRef.current);
    if (prev !== -1) ext.splice(prev, 1);
    const fn = (settings, dataRow, dataIndex) => {
      const rec = records[dataIndex];
      if (!rec) return true;
      const created = new Date(rec.createdAt);
      const from = filters.dateFrom ? new Date(filters.dateFrom) : null;
      const to = filters.dateTo ? new Date(filters.dateTo + 'T23:59:59') : null;
      if (from && created < from) return false;
      if (to && created > to) return false;
      if (filters.active !== '' && Boolean(rec.active) !== (filters.active === '1')) return false;
      if (filters.addedBy && rec.addedBy !== filters.addedBy) return false;
      if (filters.customerType && (rec.customerType || 'Retail') !== filters.customerType) return false;
      return true;
    };
    searchFnRef.current = fn;
    ext.push(fn);
    dt.draw();
  };
  const clearFilters = () => {
    setFilters({
      dateFrom: '',
      dateTo: '',
      active: '',
      addedBy: '',
      customerType: ''
    });
    const ext = $.fn.dataTable.ext.search;
    const i = ext.indexOf(searchFnRef.current);
    if (i !== -1) ext.splice(i, 1);
    searchFnRef.current = null;
    if (tableInstanceRef.current) tableInstanceRef.current.draw();
  };
  useEffect(() => {
    if (tableInstanceRef.current && records.length > 0) applyFilters();
  }, [filters, records]);
  const handleSave = async formData => {
    setLoad(editingId ? 'Updating record...' : 'Saving record...');
    const result = editingId ? await fbUpdateRecord(editingId, formData, user) : await fbAddRecord(formData, user);
    setLoad('');
    if (result.success) {
      setShowModal(false);
      setEditingId(null);
      Swal.fire({
        icon: 'success',
        title: 'Success!',
        text: result.message,
        timer: 2000,
        showConfirmButton: false
      });
      reload();
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: result.message
      });
    }
  };
  const handleDelete = record => {
    Swal.fire({
      icon: 'warning',
      title: 'Delete?',
      text: 'This cannot be undone',
      showCancelButton: true,
      confirmButtonColor: '#ea4335',
      confirmButtonText: 'Delete'
    }).then(async result => {
      if (!result.isConfirmed) return;
      setLoad('Deleting record...');
      const r = await fbDeleteRecord(record.id, record.name, user);
      setLoad('');
      if (r.success) {
        Swal.fire({
          icon: 'success',
          text: r.message,
          timer: 2000,
          showConfirmButton: false
        });
        reload();
      } else Swal.fire({
        icon: 'error',
        title: 'Error',
        text: r.message
      });
    });
  };
  return React.createElement("div", {
    className: "data-section"
  }, load && React.createElement(TopLoadingBar, null), React.createElement("div", {
    className: "section-header"
  }, React.createElement("h2", null, React.createElement("i", {
    className: "fas fa-address-book"
  }), " Klient\xEBt"), React.createElement("div", {
    style: {
      display: 'flex',
      gap: '10px'
    }
  }, React.createElement(RefreshBtn, {
    onClick: reload
  }), React.createElement("button", {
    className: "btn btn-success",
    onClick: () => {
      setEditingId(null);
      setShowModal(true);
    }
  }, React.createElement("i", {
    className: "fas fa-plus"
  }), " I ri"))), !loading && React.createElement("div", {
    className: "filters-section"
  }, React.createElement("div", {
    className: "filters-header"
  }, React.createElement("h3", null, React.createElement("i", {
    className: "fas fa-filter"
  }), " Filtrat & K\xEBrkimi"), React.createElement("button", {
    className: "btn btn-secondary btn-sm",
    onClick: () => {
      clearFilters();
      setQSearch('');
    }
  }, React.createElement("i", {
    className: "fas fa-times-circle"
  }), " Pastro t\xEB gjitha")), React.createElement("div", {
    className: "o-cp-tools",
    style: {
      paddingLeft: 0,
      paddingRight: 0,
      borderBottom: 'none'
    }
  }, React.createElement(OdooSearchFacets, {
    value: qSearch,
    onChange: setQSearch,
    placeholder: "K\xEBrko klient\u2026 em\xEBr, telefon, kompani, tip\u2026",
    facets: [filters.customerType ? {
      id: 'type',
      label: 'Tipi',
      value: filters.customerType
    } : null, filters.active !== '' ? {
      id: 'active',
      label: 'Aktiv',
      value: filters.active === '1' ? 'Po' : 'Jo'
    } : null, filters.addedBy ? {
      id: 'by',
      label: 'Shtuar nga',
      value: filters.addedBy
    } : null, qSearch ? {
      id: 'q',
      label: 'Kërkim',
      value: qSearch
    } : null].filter(Boolean),
    onRemoveFacet: f => {
      if (f.id === 'type') setFilters(x => ({
        ...x,
        customerType: ''
      }));
      if (f.id === 'active') setFilters(x => ({
        ...x,
        active: ''
      }));
      if (f.id === 'by') setFilters(x => ({
        ...x,
        addedBy: ''
      }));
      if (f.id === 'q') setQSearch('');
    },
    filterChips: [{
      id: 'Retail',
      label: 'Retail',
      active: filters.customerType === 'Retail'
    }, {
      id: 'Wholesale',
      label: 'Wholesale',
      active: filters.customerType === 'Wholesale'
    }, {
      id: 'VIP',
      label: 'VIP',
      active: filters.customerType === 'VIP'
    }, {
      id: 'act1',
      label: 'Aktivë',
      active: filters.active === '1'
    }, {
      id: 'act0',
      label: 'Jo aktivë',
      active: filters.active === '0'
    }],
    onToggleChip: c => {
      if (c.id === 'act1') setFilters(x => ({
        ...x,
        active: x.active === '1' ? '' : '1'
      }));else if (c.id === 'act0') setFilters(x => ({
        ...x,
        active: x.active === '0' ? '' : '0'
      }));else setFilters(x => ({
        ...x,
        customerType: x.customerType === c.id ? '' : c.id
      }));
    }
  })), React.createElement("div", {
    className: "filters-grid"
  }, React.createElement("div", {
    className: "filter-group"
  }, React.createElement("label", null, React.createElement("i", {
    className: "fas fa-calendar-alt"
  }), " Date From"), React.createElement("input", {
    type: "date",
    className: "filter-input",
    value: filters.dateFrom,
    onChange: e => setFilters(f => ({
      ...f,
      dateFrom: e.target.value
    }))
  })), React.createElement("div", {
    className: "filter-group"
  }, React.createElement("label", null, React.createElement("i", {
    className: "fas fa-calendar-alt"
  }), " Date To"), React.createElement("input", {
    type: "date",
    className: "filter-input",
    value: filters.dateTo,
    onChange: e => setFilters(f => ({
      ...f,
      dateTo: e.target.value
    }))
  })), React.createElement(SearchableDropdown, {
    label: "Active",
    icon: "fas fa-check-circle",
    options: ACTIVE_OPTS,
    value: filters.active,
    onChange: val => setFilters(f => ({
      ...f,
      active: val
    })),
    placeholder: "T\xEB gjith\xEB klient\xEBt"
  }), React.createElement(SearchableDropdown, {
    label: "Customer Type",
    icon: "fas fa-user-group",
    options: CUSTOMER_TYPE_OPTS,
    value: filters.customerType,
    onChange: val => setFilters(f => ({
      ...f,
      customerType: val
    })),
    placeholder: "T\xEB gjitha tipet"
  }), React.createElement(SearchableDropdown, {
    label: "Added By",
    icon: "fas fa-user",
    options: uniqueUsers.map(u => ({
      value: u,
      label: u
    })),
    value: filters.addedBy,
    onChange: val => setFilters(f => ({
      ...f,
      addedBy: val
    })),
    placeholder: "T\xEB gjith\xEB p\xEBrdoruesit"
  }))), loading && React.createElement(TableSkeleton, {
    rows: 8,
    columns: 8
  }), React.createElement("div", {
    style: {
      display: loading ? 'none' : 'block'
    }
  }, React.createElement("table", {
    id: "recordsTable",
    className: "display",
    style: {
      width: '100%'
    }
  }), records.length > 0 && React.createElement(FilteredSummaryBar, {
    tableRef: tableInstanceRef,
    deps: [records, filters, qSearch],
    itemsBuilder: rows => [{
      label: 'Të filtruar',
      value: rows.length
    }, {
      label: 'Aktivë',
      value: rows.filter(r => r.active).length
    }, {
      label: 'Balanca (filtruar)',
      value: money(rows.reduce((s, r) => s + Number(r.amount || 0), 0))
    }]
  })), viewCust && React.createElement(CustomerHubModal, {
    customer: viewCust,
    onClose: () => setViewCust(null)
  }), showModal && React.createElement(RecordModal, {
    record: byId[editingId],
    onClose: () => {
      setShowModal(false);
      setEditingId(null);
    },
    onSave: handleSave
  }));
}
function ProductModal({
  product,
  onClose,
  onSave
}) {
  const catOpts = useCategoryOpts();
  const unitNameOpts = useUnitNameOpts();
  const {
    settings,
    refreshConfig
  } = useConfig();
  const [formData, setFormData] = useState({
    name: product?.name || function () {
      try {
        const n = localStorage.getItem('erp_new_product_name');
        if (n) {
          localStorage.removeItem('erp_new_product_name');
          return n;
        }
      } catch (e) {}
      return '';
    }(),
    category: product?.category || '',
    price: product?.price ?? '',
    cost: product?.cost ?? '',
    reorderLevel: product?.reorderLevel ?? '',
    unit: product?.unit || 'copë',
    unit2Name: product?.unit2Name ?? 'koli',
    unit2Coef: product?.unit2Coef ?? '12',
    unit2Price: product?.unit2Price ?? '',
    unit3Name: product?.unit3Name ?? 'paletë',
    unit3Coef: product?.unit3Coef ?? '1368',
    unit3Price: product?.unit3Price ?? '',
    barcode: product?.barcode || '',
    brand: product?.brand || '',
    supplier: product?.supplier || '',
    taxRate: product?.taxRate ?? '',
    status: product?.status || 'active',
    wholesalePrice: product?.wholesalePrice ?? '',
    mrp: product?.mrp ?? '',
    maxStock: product?.maxStock ?? '',
    reorderQty: product?.reorderQty ?? '',
    location: product?.location || '',
    batchNo: product?.batchNo || '',
    expiryDate: product?.expiryDate || '',
    imageUrl: product?.imageUrl || '',
    description: product?.description || ''
  });
  const [saving, setSaving] = useState(false);
  const num = v => Number(v) || 0;
  const basePricePreview = num(formData.price);
  const unit2CoefPreview = num(formData.unit2Coef);
  const unit3CoefPreview = num(formData.unit3Coef);
  const autoUnit2Price = unit2CoefPreview > 1 ? round2(basePricePreview * unit2CoefPreview) : 0;
  const autoUnit3Price = unit3CoefPreview > 1 ? round2(basePricePreview * unit3CoefPreview) : 0;
  const finalUnit2Price = num(formData.unit2Price) > 0 ? num(formData.unit2Price) : autoUnit2Price;
  const finalUnit3Price = num(formData.unit3Price) > 0 ? num(formData.unit3Price) : autoUnit3Price;
  const submit = async e => {
    e.preventDefault();
    setSaving(true);
    const unit2Coef = num(formData.unit2Coef);
    const unit3Coef = num(formData.unit3Coef);
    if (!String(formData.name || '').trim()) {
      setSaving(false);
      return Swal.fire({
        icon: 'warning',
        title: 'Emri mungon',
        text: 'Vendos emrin e artikullit.'
      });
    }
    if (String(formData.unit2Name || '').trim() && unit2Coef <= 1) {
      setSaving(false);
      return Swal.fire({
        icon: 'warning',
        title: 'Koeficient i pasaktë',
        text: 'Njësia 2 duhet të ketë koeficient më të madh se 1.'
      });
    }
    if (String(formData.unit3Name || '').trim() && unit3Coef <= 1) {
      setSaving(false);
      return Swal.fire({
        icon: 'warning',
        title: 'Koeficient i pasaktë',
        text: 'Njësia 3 duhet të ketë koeficient më të madh se 1.'
      });
    }
    const names = [formData.unit, formData.unit2Name, formData.unit3Name].map(x => String(x || '').trim().toLowerCase()).filter(Boolean);
    if (new Set(names).size !== names.length) {
      setSaving(false);
      return Swal.fire({
        icon: 'warning',
        title: 'Njësi të përsëritura',
        text: 'Njësia bazë, Njësia 2 dhe Njësia 3 nuk duhet të kenë të njëjtin emër.'
      });
    }
    await onSave({
      ...formData,
      unit: String(formData.unit || 'copë').trim() || 'copë',
      unit2Name: String(formData.unit2Name || '').trim(),
      unit2Coef: unit2Coef,
      unit2Price: num(formData.unit2Price),
      unit3Name: String(formData.unit3Name || '').trim(),
      unit3Coef: unit3Coef,
      unit3Price: num(formData.unit3Price),
      price: num(formData.price),
      cost: num(formData.cost),
      reorderLevel: num(formData.reorderLevel),
      taxRate: formData.taxRate === '' ? null : num(formData.taxRate),
      wholesalePrice: num(formData.wholesalePrice),
      mrp: num(formData.mrp),
      maxStock: num(formData.maxStock),
      reorderQty: num(formData.reorderQty),
      status: formData.status || 'active'
    });
    setSaving(false);
  };
  return React.createElement("div", {
    className: "modal-overlay",
    onClick: onClose
  }, React.createElement("div", {
    className: "modal",
    onClick: e => e.stopPropagation()
  }, React.createElement("div", {
    className: "modal-header"
  }, React.createElement("h3", null, React.createElement("i", {
    className: "fas fa-box"
  }), " ", product ? 'Ndrysho Artikullin' : 'Krijo'), React.createElement("button", {
    className: "close-btn",
    onClick: onClose
  }, React.createElement("i", {
    className: "fas fa-times"
  }))), React.createElement("div", {
    className: "modal-body"
  }, React.createElement("form", {
    onSubmit: submit
  }, React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, React.createElement("i", {
    className: "fas fa-barcode"
  }), " Kodi / SKU"), React.createElement("input", {
    type: "text",
    value: product ? product.sku : 'Gjenerohet automatikisht kur ruhet',
    disabled: true
  })), formData.imageUrl ? React.createElement("div", {
    className: "prod-img-preview"
  }, React.createElement("img", {
    src: formData.imageUrl,
    alt: "",
    onError: e => {
      e.target.style.display = 'none';
    }
  })) : null, React.createElement("div", {
    className: "form-grid"
  }, React.createElement("div", {
    className: "product-modal-section-title"
  }, "T\xEB dh\xEBnat kryesore"), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Emri i artikullit *"), React.createElement("input", {
    type: "text",
    value: formData.name,
    onChange: e => setFormData(p => ({
      ...p,
      name: e.target.value
    })),
    required: true
  })), React.createElement(SearchableDropdown, {
    label: "Kategoria",
    icon: "fas fa-tag",
    options: catOpts,
    value: formData.category,
    onChange: val => setFormData(p => ({
      ...p,
      category: val
    })),
    placeholder: "Zgjidh kategorin\xEB...",
    required: true,
    creatable: true,
    createLabel: "Shto kategori: {q}",
    onCreate: async q => {
      let u = null;
      try {
        u = JSON.parse(localStorage.getItem('fb_user') || 'null');
      } catch (e) {}
      const res = await fbAddCategory(q, u || {
        email: 'system',
        name: 'System'
      });
      if (!res.success) throw new Error(res.message || 'Dështoi');
      try {
        if (refreshConfig) refreshConfig();
      } catch (e) {}
      return {
        value: q,
        label: q
      };
    }
  }), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Marka"), React.createElement("input", {
    type: "text",
    value: formData.brand,
    onChange: e => setFormData(p => ({
      ...p,
      brand: e.target.value
    }))
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, React.createElement("i", {
    className: "fas fa-barcode"
  }), " Barkodi (UPC/EAN)"), React.createElement("input", {
    type: "text",
    placeholder: "Skano ose shkruaj barkodin",
    value: formData.barcode,
    onChange: e => setFormData(p => ({
      ...p,
      barcode: e.target.value
    }))
  })), React.createElement("div", {
    className: "product-modal-section-title"
  }, "\xC7mime dhe taksa"), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "\xC7mimi shitjes p\xEBr nj\xEBsi baz\xEB *"), React.createElement("input", {
    type: "number",
    step: "0.01",
    min: "0",
    value: formData.price,
    onChange: e => setFormData(p => ({
      ...p,
      price: e.target.value
    })),
    required: true
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Kosto p\xEBr nj\xEBsi baz\xEB"), React.createElement("input", {
    type: "number",
    step: "0.01",
    min: "0",
    value: formData.cost,
    onChange: e => setFormData(p => ({
      ...p,
      cost: e.target.value
    }))
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "\xC7mimi shumic\xEB"), React.createElement("input", {
    type: "number",
    step: "0.01",
    min: "0",
    value: formData.wholesalePrice,
    onChange: e => setFormData(p => ({
      ...p,
      wholesalePrice: e.target.value
    }))
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "\xC7mimi list\xEB / MRP"), React.createElement("input", {
    type: "number",
    step: "0.01",
    min: "0",
    value: formData.mrp,
    onChange: e => setFormData(p => ({
      ...p,
      mrp: e.target.value
    }))
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "TVSH % ", settings?.taxRate ? `(default ${settings.taxRate}%)` : ''), React.createElement("input", {
    type: "number",
    step: "0.01",
    min: "0",
    placeholder: "bosh = p\xEBrdor default",
    value: formData.taxRate,
    onChange: e => setFormData(p => ({
      ...p,
      taxRate: e.target.value
    }))
  })), React.createElement("div", {
    className: "product-modal-section-title"
  }, "Nj\xEBsit\xEB konvertuese"), React.createElement(SearchableDropdown, {
    label: "Nj\xEBsia baz\xEB / stoku",
    icon: "fas fa-scale-balanced",
    options: unitNameOpts,
    value: formData.unit,
    onChange: val => setFormData(p => ({
      ...p,
      unit: val || 'copë'
    })),
    placeholder: "cop\xEB",
    creatable: true,
    createLabel: "Shto nj\xEBsi: {q}",
    onCreate: async q => {
      const res = await ieQuickAddSettingList('customUnits', q, JSON.parse(localStorage.getItem('fb_user') || 'null'));
      if (!res.success) throw new Error(res.message || 'Dështoi');
      try {
        refreshConfig && refreshConfig();
      } catch (e) {}
      return {
        value: q,
        label: q
      };
    }
  }), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Nj\xEBsia 2"), React.createElement("input", {
    type: "text",
    placeholder: "koli",
    value: formData.unit2Name,
    onChange: e => setFormData(p => ({
      ...p,
      unit2Name: e.target.value
    }))
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Koeficienti Nj\xEBsia 2"), React.createElement("input", {
    type: "number",
    step: "0.01",
    min: "0",
    placeholder: "12 = 1 koli ka 12 cop\xEB",
    value: formData.unit2Coef,
    onChange: e => setFormData(p => ({
      ...p,
      unit2Coef: e.target.value
    }))
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "\xC7mimi Nj\xEBsia 2"), React.createElement("input", {
    type: "number",
    step: "0.01",
    min: "0",
    placeholder: autoUnit2Price ? `auto ${money(autoUnit2Price)}` : 'auto nga çmimi bazë',
    value: formData.unit2Price,
    onChange: e => setFormData(p => ({
      ...p,
      unit2Price: e.target.value
    }))
  }), React.createElement("div", {
    className: "unit-price-preview"
  }, "N\xEB shitje: ", formData.unit2Name || 'Njësia 2', " = ", money(finalUnit2Price || 0))), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Nj\xEBsia 3"), React.createElement("input", {
    type: "text",
    placeholder: "palet\xEB",
    value: formData.unit3Name,
    onChange: e => setFormData(p => ({
      ...p,
      unit3Name: e.target.value
    }))
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Koeficienti Nj\xEBsia 3"), React.createElement("input", {
    type: "number",
    step: "0.01",
    min: "0",
    placeholder: "1368 = 1 palet\xEB ka 1368 cop\xEB",
    value: formData.unit3Coef,
    onChange: e => setFormData(p => ({
      ...p,
      unit3Coef: e.target.value
    }))
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "\xC7mimi Nj\xEBsia 3"), React.createElement("input", {
    type: "number",
    step: "0.01",
    min: "0",
    placeholder: autoUnit3Price ? `auto ${money(autoUnit3Price)}` : 'auto nga çmimi bazë',
    value: formData.unit3Price,
    onChange: e => setFormData(p => ({
      ...p,
      unit3Price: e.target.value
    }))
  }), React.createElement("div", {
    className: "unit-price-preview"
  }, "N\xEB shitje: ", formData.unit3Name || 'Njësia 3', " = ", money(finalUnit3Price || 0))), React.createElement("div", {
    className: "product-modal-section-title"
  }, "Stoku dhe magazina"), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Minimumi furnizimit *"), React.createElement("input", {
    type: "number",
    step: "1",
    min: "0",
    value: formData.reorderLevel,
    onChange: e => setFormData(p => ({
      ...p,
      reorderLevel: e.target.value
    })),
    required: true
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Stoku maksimal"), React.createElement("input", {
    type: "number",
    step: "1",
    min: "0",
    value: formData.maxStock,
    onChange: e => setFormData(p => ({
      ...p,
      maxStock: e.target.value
    }))
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Sasia p\xEBr furnizim"), React.createElement("input", {
    type: "number",
    step: "1",
    min: "0",
    placeholder: "sasia fikse q\xEB do porositet",
    value: formData.reorderQty,
    onChange: e => setFormData(p => ({
      ...p,
      reorderQty: e.target.value
    }))
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Furnitori"), React.createElement("input", {
    type: "text",
    value: formData.supplier,
    onChange: e => setFormData(p => ({
      ...p,
      supplier: e.target.value
    }))
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, React.createElement("i", {
    className: "fas fa-location-dot"
  }), " Vendndodhja / Rafti"), React.createElement("input", {
    type: "text",
    placeholder: "Raft-Sektor-Kuti",
    value: formData.location,
    onChange: e => setFormData(p => ({
      ...p,
      location: e.target.value
    }))
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Partia / Lot No"), React.createElement("input", {
    type: "text",
    value: formData.batchNo,
    onChange: e => setFormData(p => ({
      ...p,
      batchNo: e.target.value
    }))
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, React.createElement("i", {
    className: "fas fa-calendar-xmark"
  }), " Data skadenc\xEBs"), React.createElement("input", {
    type: "date",
    value: formData.expiryDate,
    onChange: e => setFormData(p => ({
      ...p,
      expiryDate: e.target.value
    }))
  })), React.createElement(SearchableDropdown, {
    label: "Statusi",
    icon: "fas fa-toggle-on",
    options: STATUS_OPTS,
    value: formData.status,
    onChange: val => setFormData(p => ({
      ...p,
      status: val
    })),
    placeholder: "Aktiv"
  })), React.createElement("div", {
    className: "unit-logic-box"
  }, React.createElement("strong", null, "Rregull:"), " stoku ruhet gjithmon\xEB n\xEB nj\xEBsin\xEB baz\xEB. Shembull: 1 koli = 12 cop\xEB; 1 palet\xEB = 1368 cop\xEB. N\xEB shitje/hyrje/dalje mund t\xEB zgjedh\xEBsh koli ose palet\xEB dhe sistemi e kthen automatikisht n\xEB cop\xEB."), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, React.createElement("i", {
    className: "fas fa-image"
  }), " URL Foto"), React.createElement("input", {
    type: "text",
    placeholder: "https://...",
    value: formData.imageUrl,
    onChange: e => setFormData(p => ({
      ...p,
      imageUrl: e.target.value
    }))
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "P\xEBrshkrimi"), React.createElement("textarea", {
    rows: "2",
    value: formData.description,
    onChange: e => setFormData(p => ({
      ...p,
      description: e.target.value
    }))
  })), React.createElement("div", {
    className: "form-actions"
  }, React.createElement("button", {
    type: "submit",
    className: "btn btn-primary",
    disabled: saving
  }, saving ? React.createElement(React.Fragment, null, React.createElement("i", {
    className: "fas fa-spinner fa-spin"
  }), " Duke ruajtur...") : React.createElement(React.Fragment, null, React.createElement("i", {
    className: "fas fa-save"
  }), " Ruaj")), React.createElement("button", {
    type: "button",
    className: "btn btn-secondary",
    onClick: onClose
  }, React.createElement("i", {
    className: "fas fa-times"
  }), " Anulo"))))));
}
function QRModal({
  product,
  onClose
}) {
  const previewRef = useRef(null);
  const printRef = useRef(null);
  useEffect(() => {
    if (!product) return;
    QRCode.toCanvas(previewRef.current, product.id, {
      width: 220,
      margin: 1,
      color: {
        dark: '#001f3f',
        light: '#ffffff'
      }
    }, () => {});
    QRCode.toCanvas(printRef.current, product.id, {
      width: 300,
      margin: 0
    }, () => {});
  }, [product]);
  if (!product) return null;
  return React.createElement("div", {
    className: "modal-overlay",
    onClick: onClose
  }, React.createElement("div", {
    className: "modal",
    style: {
      maxWidth: '380px'
    },
    onClick: e => e.stopPropagation()
  }, React.createElement("div", {
    className: "modal-header"
  }, React.createElement("h3", null, React.createElement("i", {
    className: "fas fa-qrcode"
  }), " Product QR Code"), React.createElement("button", {
    className: "close-btn",
    onClick: onClose
  }, React.createElement("i", {
    className: "fas fa-times"
  }))), React.createElement("div", {
    className: "modal-body",
    style: {
      textAlign: 'center'
    }
  }, React.createElement("canvas", {
    ref: previewRef
  }), React.createElement("p", {
    style: {
      marginTop: '14px',
      fontWeight: 700,
      color: 'var(--navy-primary)',
      fontSize: '16px',
      letterSpacing: '.5px'
    }
  }, product.sku), React.createElement("p", {
    style: {
      color: '#999',
      fontSize: '13px',
      marginTop: '4px'
    }
  }, product.name), React.createElement("div", {
    className: "form-actions",
    style: {
      justifyContent: 'center',
      marginTop: '24px'
    }
  }, React.createElement("button", {
    className: "btn btn-primary",
    onClick: () => window.print()
  }, React.createElement("i", {
    className: "fas fa-print"
  }), " Print Label"), React.createElement("button", {
    className: "btn btn-secondary",
    onClick: onClose
  }, React.createElement("i", {
    className: "fas fa-times"
  }), " Close"))), React.createElement("div", {
    className: "qr-print-stage"
  }, React.createElement("div", {
    className: "qr-label-print"
  }, React.createElement("canvas", {
    ref: printRef
  }), React.createElement("div", {
    className: "qr-label-sku"
  }, product.sku)))));
}
function PrintAllLabels({
  products,
  onDone
}) {
  const canvasRefs = useRef({});
  useEffect(() => {
    let cancelled = false;
    Promise.all(products.map(p => QRCode.toCanvas(canvasRefs.current[p.id], p.id, {
      width: 300,
      margin: 0
    }))).then(() => {
      if (!cancelled) window.print();
    }).catch(e => console.error('qr render failed', e));
    return () => {
      cancelled = true;
    };
  }, [products]);
  useEffect(() => {
    const afterPrint = () => onDone();
    window.addEventListener('afterprint', afterPrint);
    return () => window.removeEventListener('afterprint', afterPrint);
  }, [onDone]);
  return React.createElement("div", {
    className: "qr-print-stage"
  }, products.map(p => React.createElement("div", {
    className: "qr-label-print",
    key: p.id
  }, React.createElement("canvas", {
    ref: el => {
      canvasRefs.current[p.id] = el;
    }
  }), React.createElement("div", {
    className: "qr-label-sku"
  }, p.sku))));
}
function ReorderReportPrint({
  rows,
  onDone
}) {
  useEffect(() => {
    window.print();
  }, []);
  useEffect(() => {
    const afterPrint = () => onDone();
    window.addEventListener('afterprint', afterPrint);
    return () => window.removeEventListener('afterprint', afterPrint);
  }, [onDone]);
  return React.createElement("div", {
    className: "reorder-report-print"
  }, React.createElement("div", {
    className: "rr-header"
  }, React.createElement("img", {
    src: LOGO_URL,
    alt: "",
    className: "rr-logo"
  }), React.createElement("div", null, React.createElement("div", {
    className: "rr-title"
  }, "Reorder Report"), React.createElement("div", {
    className: "rr-sub"
  }, "Generated ", formatDateForDisplay(new Date().toISOString())))), React.createElement("table", {
    className: "rr-table"
  }, React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", null, "Name"), React.createElement("th", null, "SKU"), React.createElement("th", null, "Category"), React.createElement("th", null, "Qty On Hand"), React.createElement("th", null, "Reorder Level"), React.createElement("th", null, "Suggested Reorder"))), React.createElement("tbody", null, rows.map(r => React.createElement("tr", {
    key: r.id
  }, React.createElement("td", null, r.name), React.createElement("td", null, r.sku), React.createElement("td", null, r.category), React.createElement("td", null, r.qtyOnHand), React.createElement("td", null, r.reorderLevel), React.createElement("td", null, suggestedReorder(r, r.qtyOnHand)))))));
}
function ProductsView({
  user,
  role,
  setActiveMenu
}) {
  const nav = useAppNav();
  const [qSearch, setQSearch] = useState('');
  const catOpts = useCategoryOpts();
  const [showModal, setShowModal] = useState(false);
  useEffect(() => {
    if (nav && nav.consumeCreate && nav.consumeCreate('products')) {
      setEditingId(null);
      setShowModal(true);
    }
  }, []);
  const [editingId, setEditingId] = useState(null);
  const [qrProductId, setQrProductId] = useState(null);
  const [viewProd, setViewProd] = useState(null);
  const [printAll, setPrintAll] = useState(false);
  const [printRows, setPrintRows] = useState([]);
  const [showReorderReport, setShowReorderReport] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    const fn = e => {
      if (!e.detail || e.detail.tableId === 'productsTable') setReloadKey(k => k + 1);
    };
    window.addEventListener('erp-data-changed', fn);
    return () => window.removeEventListener('erp-data-changed', fn);
  }, []);
  const [filters, setFilters] = useState({
    category: '',
    lowStock: '',
    status: ''
  });
  const [load, setLoad] = useState('');
  const tableInstanceRef = useRef(null);
  useDtLiveSearch(tableInstanceRef, qSearch);
  const searchFnRef = useRef(null);
  const {
    loading,
    data,
    err
  } = useFetch(() => Promise.all([fbGetProducts(), fbGetStockMovements()]), [reloadKey]);
  const products = useMemo(() => data && data[0] && data[0].success ? data[0].data : [], [data]);
  const movements = useMemo(() => data && data[1] && data[1].success ? data[1].data : [], [data]);
  const reload = () => setReloadKey(k => k + 1);
  const tableData = useMemo(() => products.map(p => Object.assign({}, p, {
    qtyOnHand: computeQtyOnHand(p.id, movements)
  })), [products, movements]);
  const byId = useMemo(() => products.reduce((m, p) => (m[p.id] = p, m), {}), [products]);
  const openEdit = useCallback(id => {
    setEditingId(id);
    setShowModal(true);
  }, []);
  useEffect(() => {
    if (err || data && data[0] && !data[0].success) Swal.fire({
      icon: 'error',
      title: 'Error',
      text: data && data[0] && data[0].message || 'Failed to load products'
    });
  }, [err, data]);
  useEffect(() => {
    if (loading) return;
    let table = tableInstanceRef.current;
    if (table) {
      table.clear().rows.add(tableData).draw(false);
    } else {
      table = $('#productsTable').DataTable({
        data: tableData,
        columnDefs: [{
          targets: '_all',
          defaultContent: ''
        }],
        createdRow: (row, d) => {
          if (Number(d.qtyOnHand) <= Number(d.reorderLevel || 0)) $(row).addClass('row-warn');
        },
        columns: [{
          data: 'imageUrl',
          title: '',
          orderable: false,
          render: (d, t) => t === 'display' ? d ? `<img class="prod-thumb" src="${esc(d)}" onerror="this.style.visibility='hidden'">` : `<span class="prod-thumb empty"><i class="fas fa-box"></i></span>` : ''
        }, {
          data: 'name',
          title: 'Emri',
          render: (d, t, row) => t === 'display' ? esc(d) + (row.brand ? `<div class="cell-sub">${esc(row.brand)}</div>` : '') : d
        }, {
          data: 'sku',
          title: 'SKU',
          render: (d, t) => t === 'display' ? '<code>' + esc(d) + '</code>' : d
        }, {
          data: 'barcode',
          title: 'Barkodi',
          render: (d, t) => t === 'display' ? d ? '<code>' + esc(d) + '</code>' : '<span style="color:#bbb">—</span>' : d || ''
        }, {
          data: 'category',
          title: 'Kategoria',
          render: (d, t) => t === 'display' ? esc(d) : d
        }, {
          data: 'price',
          title: 'Çmimi',
          render: (d, t) => t === 'display' ? money(d) : d
        }, {
          data: null,
          title: 'Njësitë',
          render: (d, t, row) => t === 'display' ? esc(formatUnitStructure(row)) : formatUnitStructure(row)
        }, {
          data: 'qtyOnHand',
          title: 'Gjendje',
          render: (d, t, row) => t === 'display' ? Number(d) <= Number(row.reorderLevel || 0) ? '<span class="status-badge status-inactive">' + esc(formatQtyWithUnits(d, row)) + '</span>' : esc(formatQtyWithUnits(d, row)) : d
        }, {
          data: 'reorderLevel',
          title: 'Nivel furnizimi'
        }, {
          data: 'status',
          title: 'Statusi',
          render: (d, t) => t === 'display' ? d === 'discontinued' ? '<span class="status-badge status-inactive">Ndërprerë</span>' : '<span class="status-badge status-active">Aktiv</span>' : d || 'active'
        }, {
          data: null,
          title: 'Veprime',
          orderable: false,
          render: () => `<button class="product-action-btn" data-action="view" title="Shiko"><i class="fas fa-eye"></i> Shiko</button><button class="product-action-btn edit" data-action="edit" title="Ndrysho"><i class="fas fa-pen"></i> Ndrysho</button><button class="product-action-btn qr" data-action="qr" title="QR"><i class="fas fa-qrcode"></i> QR</button>` + (role === 'Admin' ? `<button class="product-action-btn delete" data-action="delete" title="Fshi"><i class="fas fa-trash"></i> Fshi</button>` : '')
        }],
        pageLength: 80,
        lengthMenu: [[10, 25, 50, -1], [10, 25, 50, 'All']],
        responsive: true,
        dom: 'Blfrtip',
        buttons: erpDtButtons('Artikujt'),
        order: [[1, 'asc']]
      });
      tableInstanceRef.current = table;
    }
    $('#productsTable').off('click', '[data-action]').on('click', '[data-action]', function () {
      let tr = $(this).closest('tr');
      if (tr.hasClass('child')) tr = tr.prev();
      const rowData = table.row(tr).data();
      if (!rowData || !rowData.id) return;
      const id = rowData.id;
      const action = $(this).data('action');
      if (action === 'view') setViewProd(byId[id] || rowData);else if (action === 'edit') openEdit(id);else if (action === 'qr') setQrProductId(id);else if (action === 'delete') handleDelete(byId[id] || rowData);
    });
  }, [loading, tableData, role]);
  useEffect(() => () => {
    const ext = $.fn.dataTable.ext.search;
    const i = ext.indexOf(searchFnRef.current);
    if (i !== -1) ext.splice(i, 1);
    if (tableInstanceRef.current) {
      try {
        tableInstanceRef.current.destroy();
        tableInstanceRef.current = null;
      } catch (e) {}
    }
  }, []);
  const applyFilters = () => {
    if (!tableInstanceRef.current) return;
    const dt = tableInstanceRef.current;
    const ext = $.fn.dataTable.ext.search;
    const prev = ext.indexOf(searchFnRef.current);
    if (prev !== -1) ext.splice(prev, 1);
    const fn = (settings, dataRow, dataIndex) => {
      const p = tableData[dataIndex];
      if (!p) return true;
      if (filters.category && p.category !== filters.category) return false;
      if (filters.lowStock === '1' && !(Number(p.qtyOnHand) <= Number(p.reorderLevel || 0))) return false;
      if (filters.status && (p.status || 'active') !== filters.status) return false;
      return true;
    };
    searchFnRef.current = fn;
    ext.push(fn);
    dt.draw();
  };
  const clearFilters = () => {
    setFilters({
      category: '',
      lowStock: '',
      status: ''
    });
    const ext = $.fn.dataTable.ext.search;
    const i = ext.indexOf(searchFnRef.current);
    if (i !== -1) ext.splice(i, 1);
    searchFnRef.current = null;
    if (tableInstanceRef.current) tableInstanceRef.current.draw();
  };
  useEffect(() => {
    if (tableInstanceRef.current && tableData.length > 0) applyFilters();
  }, [filters, tableData]);
  const isFiltered = !!(filters.category || filters.lowStock || filters.status);
  const reorderRows = useMemo(() => tableData.filter(p => Number(p.qtyOnHand) <= Number(p.reorderLevel || 0)), [tableData]);
  const stockValue = useMemo(() => tableData.reduce((s, p) => s + Number(p.qtyOnHand || 0) * (Number(p.cost) || 0), 0), [tableData]);
  const handlePrintLabels = () => {
    const dt = tableInstanceRef.current;
    setPrintRows(dt ? dt.rows({
      search: 'applied'
    }).data().toArray() : tableData);
    setPrintAll(true);
  };
  const handleSave = async formData => {
    setLoad(editingId ? 'Updating product...' : 'Saving product...');
    const result = editingId ? await fbUpdateProduct(editingId, formData, user) : await fbAddProduct(formData, user);
    setLoad('');
    if (result.success) {
      setShowModal(false);
      setEditingId(null);
      Swal.fire({
        icon: 'success',
        title: 'Success!',
        text: result.message,
        timer: 2000,
        showConfirmButton: false
      });
      reload();
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: result.message
      });
    }
  };
  const handleDelete = product => {
    Swal.fire({
      icon: 'warning',
      title: 'Delete?',
      text: 'This cannot be undone',
      showCancelButton: true,
      confirmButtonColor: '#ea4335',
      confirmButtonText: 'Delete'
    }).then(async result => {
      if (!result.isConfirmed) return;
      setLoad('Deleting product...');
      const r = await fbDeleteProduct(product.id, product.name, user);
      setLoad('');
      if (r.success) {
        Swal.fire({
          icon: 'success',
          text: r.message,
          timer: 2000,
          showConfirmButton: false
        });
        reload();
      } else Swal.fire({
        icon: 'error',
        title: 'Error',
        text: r.message
      });
    });
  };
  return React.createElement("div", {
    className: "data-section"
  }, load && React.createElement(TopLoadingBar, null), React.createElement("div", {
    className: "section-header"
  }, React.createElement("h2", null, React.createElement("i", {
    className: "fas fa-boxes-stacked"
  }), " Produktet"), React.createElement("div", {
    style: {
      display: 'flex',
      gap: '10px'
    }
  }, React.createElement(RefreshBtn, {
    onClick: reload
  }), React.createElement("button", {
    className: "btn btn-secondary",
    onClick: () => setShowReorderReport(true),
    disabled: reorderRows.length === 0
  }, React.createElement("i", {
    className: "fas fa-triangle-exclamation"
  }), " Printo K\xEBrkes\xEB Furnizimi"), React.createElement("button", {
    className: "btn btn-secondary",
    onClick: handlePrintLabels,
    disabled: products.length === 0
  }, React.createElement("i", {
    className: "fas fa-print"
  }), " ", isFiltered ? 'Printo etiketat e filtruara' : 'Printo të gjitha etiketat QR'), React.createElement("button", {
    className: "btn btn-success",
    onClick: () => {
      setEditingId(null);
      setShowModal(true);
    }
  }, React.createElement("i", {
    className: "fas fa-plus"
  }), " I ri"))), !loading && React.createElement("div", {
    className: "filters-section"
  }, React.createElement("div", {
    className: "filters-header"
  }, React.createElement("h3", null, React.createElement("i", {
    className: "fas fa-filter"
  }), " Filtrat & K\xEBrkimi"), React.createElement("button", {
    className: "btn btn-secondary btn-sm",
    onClick: () => {
      clearFilters();
      setQSearch('');
    }
  }, React.createElement("i", {
    className: "fas fa-times-circle"
  }), " Pastro t\xEB gjitha")), React.createElement("div", {
    className: "o-cp-tools",
    style: {
      paddingLeft: 0,
      paddingRight: 0,
      borderBottom: 'none'
    }
  }, React.createElement(OdooSearchFacets, {
    value: qSearch,
    onChange: setQSearch,
    placeholder: "K\xEBrko artikull\u2026 em\xEBr, SKU, barkod, kategori\u2026",
    facets: [filters.category ? {
      id: 'cat',
      label: 'Kategoria',
      value: filters.category
    } : null, filters.lowStock ? {
      id: 'low',
      label: 'Stoku',
      value: 'I ulët'
    } : null, filters.status ? {
      id: 'st',
      label: 'Statusi',
      value: filters.status
    } : null, qSearch ? {
      id: 'q',
      label: 'Kërkim',
      value: qSearch
    } : null].filter(Boolean),
    onRemoveFacet: f => {
      if (f.id === 'cat') setFilters(x => ({
        ...x,
        category: ''
      }));
      if (f.id === 'low') setFilters(x => ({
        ...x,
        lowStock: ''
      }));
      if (f.id === 'st') setFilters(x => ({
        ...x,
        status: ''
      }));
      if (f.id === 'q') setQSearch('');
    },
    filterChips: [{
      id: 'low',
      label: 'Stok i ulët',
      active: !!filters.lowStock
    }, {
      id: 'active',
      label: 'Aktivë',
      active: filters.status === 'active'
    }, {
      id: 'discontinued',
      label: 'Ndërprerë',
      active: filters.status === 'discontinued'
    }],
    onToggleChip: c => {
      if (c.id === 'low') setFilters(x => ({
        ...x,
        lowStock: x.lowStock ? '' : '1'
      }));else if (c.id === 'active') setFilters(x => ({
        ...x,
        status: x.status === 'active' ? '' : 'active'
      }));else if (c.id === 'discontinued') setFilters(x => ({
        ...x,
        status: x.status === 'discontinued' ? '' : 'discontinued'
      }));
    }
  })), React.createElement("div", {
    className: "filters-grid"
  }, React.createElement(SearchableDropdown, {
    label: "Kategoria",
    icon: "fas fa-tag",
    options: catOpts,
    value: filters.category,
    onChange: val => setFilters(f => ({
      ...f,
      category: val
    })),
    placeholder: "All Categories"
  }), React.createElement(SearchableDropdown, {
    label: "Stock Status",
    icon: "fas fa-triangle-exclamation",
    options: LOW_STOCK_OPTS,
    value: filters.lowStock,
    onChange: val => setFilters(f => ({
      ...f,
      lowStock: val
    })),
    placeholder: "All Stock Levels"
  }), React.createElement(SearchableDropdown, {
    label: "Statusi",
    icon: "fas fa-toggle-on",
    options: PRODUCT_STATUS_FILTER,
    value: filters.status,
    onChange: val => setFilters(f => ({
      ...f,
      status: val
    })),
    placeholder: "All Statuses"
  }))), loading && React.createElement(TableSkeleton, {
    rows: 8,
    columns: 7
  }), React.createElement("div", {
    style: {
      display: loading ? 'none' : 'block'
    }
  }, React.createElement("table", {
    id: "productsTable",
    className: "display",
    style: {
      width: '100%'
    }
  }), products.length > 0 && React.createElement(FilteredSummaryBar, {
    tableRef: tableInstanceRef,
    deps: [tableData, filters, qSearch],
    itemsBuilder: rows => [{
      label: 'Të filtruar',
      value: rows.length
    }, {
      label: 'Vlera stokut (filtruar)',
      value: money(rows.reduce((s, r) => s + Number(r.price || 0) * Number(r.qtyOnHand || 0), 0))
    }, {
      label: 'Stok i ulët',
      value: rows.filter(r => Number(r.qtyOnHand) <= Number(r.reorderLevel || 0)).length
    }]
  })), showModal && React.createElement(ProductModal, {
    product: byId[editingId],
    onClose: () => {
      setShowModal(false);
      setEditingId(null);
    },
    onSave: handleSave
  }), viewProd && React.createElement(ProductHubModal, {
    product: viewProd,
    onClose: () => setViewProd(null)
  }), qrProductId && React.createElement(QRModal, {
    product: byId[qrProductId],
    onClose: () => setQrProductId(null)
  }), printAll && React.createElement(PrintAllLabels, {
    products: printRows,
    onDone: () => setPrintAll(false)
  }), showReorderReport && React.createElement(ReorderReportPrint, {
    rows: reorderRows,
    onDone: () => setShowReorderReport(false)
  }));
}
function StockMovementModal({
  type,
  products,
  movements,
  onClose,
  onSave
}) {
  const nav = useAppNav();
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('');
  const [unitKey, setUnitKey] = useState('base');
  const [reason, setReason] = useState(type === 'out' ? 'Damage' : 'Purchase');
  const [reference, setReference] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [updateCost, setUpdateCost] = useState(true);
  const [supplier, setSupplier] = useState('');
  const [batchNo, setBatchNo] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const isOut = type === 'out';
  const productOpts = useMemo(() => (products || []).map(p => ({
    value: p.id,
    label: `${p.name} (${p.sku})`
  })), [products]);
  const selectedProduct = (products || []).find(p => p.id === productId);
  const unitOpts = useMemo(() => selectedProduct ? getProductUnitOptions(selectedProduct) : [{
    value: 'base',
    label: 'copë (bazë)'
  }], [selectedProduct]);
  const selectedUnit = selectedProduct ? getProductUnit(selectedProduct, unitKey) : unitOpts[0];
  const baseQty = selectedProduct ? toBaseQty(selectedProduct, qty, unitKey) : Number(qty) || 0;
  const onHand = useMemo(() => productId ? computeQtyOnHand(productId, movements) : 0, [productId, movements]);
  useEffect(() => {
    setUnitKey('base');
    if (selectedProduct && !isOut) {
      setUnitCost(c => c || (selectedProduct.cost ?? ''));
      setLocation(l => l || selectedProduct.location || '');
    }
  }, [productId]);
  const handleSubmit = async e => {
    e.preventDefault();
    const q = Number(qty);
    if (!productId) return Swal.fire({
      icon: 'warning',
      title: 'Pick a Product',
      text: 'Select a product first'
    });
    if (!Number.isFinite(q) || q <= 0) return Swal.fire({
      icon: 'warning',
      title: 'Sasi e pasaktë',
      text: 'Sasia duhet të jetë më e madhe se 0.'
    });
    if (baseQty <= 0) return Swal.fire({
      icon: 'warning',
      title: 'Sasi e pasaktë',
      text: 'Konvertimi në njësinë bazë duhet të jetë më i madh se 0.'
    });
    if (isOut && baseQty > onHand) {
      const confirm = await Swal.fire({
        icon: 'warning',
        title: 'Qty On Hand Warning',
        text: `Gjendje aktuale: ${formatQtyWithUnits(onHand, selectedProduct)}. Kjo dalje do ta çojë gjendjen në ${formatQtyWithUnits(onHand - baseQty, selectedProduct)}. Të vazhdoj?`,
        showCancelButton: true,
        confirmButtonColor: '#ea4335',
        confirmButtonText: 'Continue',
        cancelButtonText: 'Cancel'
      });
      if (!confirm.isConfirmed) return;
    }
    setSaving(true);
    const move = {
      productId,
      type,
      qty: baseQty,
      enteredQty: q,
      unitKey,
      unitName: selectedUnit.name,
      unitMultiplier: selectedUnit.multiplier,
      reason,
      reference: reference.trim() || null,
      location: location.trim() || null,
      notes: notes.trim() || null
    };
    if (!isOut) {
      move.enteredUnitCost = Number(unitCost) || 0;
      move.unitCost = selectedUnit.multiplier > 0 ? round2((Number(unitCost) || 0) / selectedUnit.multiplier) : Number(unitCost) || 0;
      move.supplier = supplier.trim() || null;
      move.batchNo = batchNo.trim() || null;
      move.expiryDate = expiryDate || null;
      move.updateCost = updateCost && Number(unitCost) > 0;
    }
    await onSave(move, selectedProduct?.name || 'Unknown Product');
    setSaving(false);
  };
  return React.createElement("div", {
    className: "modal-overlay",
    onClick: onClose
  }, React.createElement("div", {
    className: "modal",
    onClick: e => e.stopPropagation()
  }, React.createElement("div", {
    className: "modal-header"
  }, React.createElement("h3", null, React.createElement("i", {
    className: `fas ${isOut ? 'fa-arrow-up' : 'fa-arrow-down'}`
  }), " ", isOut ? 'Dalje stoku' : 'Hyrje stoku'), React.createElement("button", {
    className: "close-btn",
    onClick: onClose
  }, React.createElement("i", {
    className: "fas fa-times"
  }))), React.createElement("div", {
    className: "modal-body"
  }, React.createElement("form", {
    onSubmit: handleSubmit
  }, React.createElement("div", {
    className: "form-grid"
  }, React.createElement(SearchableDropdown, {
    label: "Artikulli",
    icon: "fas fa-box",
    options: productOpts,
    value: productId,
    onChange: setProductId,
    placeholder: "K\xEBrko artikull me em\xEBr/kod...",
    required: true,
    creatable: true,
    createLabel: "Shto artikull: {q}",
    onCreate: async q => {
      try {
        localStorage.setItem('erp_new_product_name', q);
      } catch (e) {}
      nav.go('products', 'products');
      return false;
    }
  }), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Sasia *"), React.createElement("input", {
    type: "number",
    min: "0",
    step: "0.01",
    value: qty,
    onChange: e => setQty(e.target.value),
    required: true
  })), React.createElement(SearchableDropdown, {
    label: "Nj\xEBsia",
    icon: "fas fa-scale-balanced",
    options: unitOpts,
    value: unitKey,
    onChange: setUnitKey,
    placeholder: "Zgjidh nj\xEBsin\xEB...",
    required: true
  })), productId && React.createElement("p", {
    className: "stock-onhand-hint"
  }, "Gjendje: ", React.createElement("strong", null, formatQtyWithUnits(onHand, selectedProduct)), Number(qty) > 0 ? ` • Regjistrohet: ${formatQtyWithUnits(baseQty, selectedProduct)}${!isOut ? ` → ${formatQtyWithUnits(onHand + baseQty, selectedProduct)}` : ''}` : ''), React.createElement("div", {
    className: "form-grid"
  }, React.createElement(SearchableDropdown, {
    label: "Arsyeja",
    icon: "fas fa-clipboard-list",
    options: isOut ? REASON_OUT_OPTS : REASON_IN_OPTS,
    value: reason,
    onChange: setReason,
    placeholder: "Zgjidh arsyen...",
    required: true
  }), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Referenc\xEB"), React.createElement("input", {
    type: "text",
    value: reference,
    onChange: e => setReference(e.target.value),
    placeholder: "Fatur\xEB / dokument / shitje"
  })), !isOut && React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Kosto / nj\xEBsi e zgjedhur"), React.createElement("input", {
    type: "number",
    min: "0",
    step: "0.01",
    value: unitCost,
    onChange: e => setUnitCost(e.target.value)
  })), !isOut && React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Furnitori"), React.createElement("input", {
    type: "text",
    value: supplier,
    onChange: e => setSupplier(e.target.value)
  })), !isOut && React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Partia / Lot No"), React.createElement("input", {
    type: "text",
    value: batchNo,
    onChange: e => setBatchNo(e.target.value)
  })), !isOut && React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, React.createElement("i", {
    className: "fas fa-calendar-xmark"
  }), " Data skadenc\xEBs"), React.createElement("input", {
    type: "date",
    value: expiryDate,
    onChange: e => setExpiryDate(e.target.value)
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, React.createElement("i", {
    className: "fas fa-location-dot"
  }), " Vendndodhja / Rafti"), React.createElement("input", {
    type: "text",
    value: location,
    onChange: e => setLocation(e.target.value)
  }))), !isOut && React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", {
    className: "stock-cost-check"
  }, React.createElement("input", {
    type: "checkbox",
    checked: updateCost,
    onChange: e => setUpdateCost(e.target.checked)
  }), " P\xEBrdit\xEBso koston e artikullit me k\xEBt\xEB kosto baz\xEB")), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Sh\xEBnime"), React.createElement("textarea", {
    rows: "2",
    value: notes,
    onChange: e => setNotes(e.target.value)
  })), React.createElement("div", {
    className: "form-actions"
  }, React.createElement("button", {
    type: "submit",
    className: `btn ${isOut ? 'btn-danger' : 'btn-success'}`,
    disabled: saving
  }, saving ? React.createElement(React.Fragment, null, React.createElement("i", {
    className: "fas fa-spinner fa-spin"
  }), " Duke ruajtur...") : React.createElement(React.Fragment, null, React.createElement("i", {
    className: "fas fa-save"
  }), " ", isOut ? 'Regjistro daljen' : 'Regjistro hyrjen')), React.createElement("button", {
    type: "button",
    className: "btn btn-secondary",
    onClick: onClose
  }, React.createElement("i", {
    className: "fas fa-times"
  }), " Anulo"))))));
}
function BulkStockInModal({
  products,
  onClose,
  onSave
}) {
  const [lines, setLines] = useState([]);
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('');
  const [unitKey, setUnitKey] = useState('base');
  const [unitCost, setUnitCost] = useState('');
  const [supplier, setSupplier] = useState('');
  const [reason, setReason] = useState('Dorëzim furnitori');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  const productOpts = useMemo(() => (products || []).map(p => ({
    value: p.id,
    label: `${p.name} (${p.sku})`
  })), [products]);
  const byId = useMemo(() => (products || []).reduce((m, p) => (m[p.id] = p, m), {}), [products]);
  const selectedProduct = productId ? byId[productId] : null;
  const unitOpts = useMemo(() => selectedProduct ? getProductUnitOptions(selectedProduct) : [{
    value: 'base',
    label: 'copë (bazë)',
    name: 'copë',
    multiplier: 1
  }], [selectedProduct]);
  const selectedUnit = selectedProduct ? getProductUnit(selectedProduct, unitKey) : unitOpts[0];
  const baseQtyPreview = selectedProduct ? toBaseQty(selectedProduct, qty, unitKey) : 0;
  const totalBaseQty = useMemo(() => lines.reduce((s, l) => s + Number(l.qty || 0), 0), [lines]);
  const totalValue = useMemo(() => lines.reduce((s, l) => s + Number(l.lineTotal || 0), 0), [lines]);
  useEffect(() => {
    setUnitKey('base');
    setUnitCost('');
  }, [productId]);
  const addLine = () => {
    const q = Number(qty);
    const c = Number(unitCost) || 0;
    if (!productId) return Swal.fire({
      icon: 'warning',
      title: 'Zgjidh artikullin',
      text: 'Zgjidh artikullin para se të shtosh rreshtin.'
    });
    if (!Number.isFinite(q) || q <= 0) return Swal.fire({
      icon: 'warning',
      title: 'Sasi e pasaktë',
      text: 'Sasia duhet të jetë më e madhe se 0.'
    });
    const product = byId[productId];
    const unit = getProductUnit(product, unitKey);
    const baseQty = toBaseQty(product, q, unit.value);
    const baseUnitCost = unit.multiplier > 0 ? round2(c / unit.multiplier) : c;
    const lineTotal = round2(q * c);
    setLines(prev => {
      const key = productId + '|' + unit.value;
      const existing = prev.find(l => l.key === key);
      if (existing) return prev.map(l => l.key === key ? {
        ...l,
        enteredQty: round2(Number(l.enteredQty || 0) + q),
        qty: round2(Number(l.qty || 0) + baseQty),
        enteredUnitCost: c || l.enteredUnitCost,
        unitCost: baseUnitCost || l.unitCost,
        lineTotal: round2(Number(l.lineTotal || 0) + lineTotal)
      } : l);
      return [...prev, {
        key,
        productId,
        name: product.name,
        sku: product.sku,
        enteredQty: q,
        qty: baseQty,
        unitKey: unit.value,
        unitName: unit.name,
        unitMultiplier: unit.multiplier,
        enteredUnitCost: c,
        unitCost: baseUnitCost,
        lineTotal
      }];
    });
    setProductId('');
    setQty('');
    setUnitKey('base');
    setUnitCost('');
  };
  const removeLine = key => setLines(prev => prev.filter(l => l.key !== key));
  const handleSubmit = async e => {
    e.preventDefault();
    if (!lines.length) return Swal.fire({
      icon: 'warning',
      title: 'Nuk ka artikuj',
      text: 'Shto të paktën një rresht.'
    });
    if (!reason.trim()) return Swal.fire({
      icon: 'warning',
      title: 'Arsye e detyrueshme',
      text: 'Vendos arsyen e hyrjes së stokut.'
    });
    setSaving(true);
    const batchLines = lines.map(l => ({
      ...l,
      reason: reason.trim(),
      reference: reference.trim() || null,
      supplier: supplier.trim() || null
    }));
    await onSave(batchLines);
    setSaving(false);
  };
  return React.createElement("div", {
    className: "modal-overlay",
    onClick: onClose
  }, React.createElement("div", {
    className: "modal modal-lg",
    onClick: e => e.stopPropagation()
  }, React.createElement("div", {
    className: "modal-header"
  }, React.createElement("h3", null, React.createElement("i", {
    className: "fas fa-truck-ramp-box"
  }), " Hyrje stoku n\xEB mas\xEB"), React.createElement("button", {
    className: "close-btn",
    onClick: onClose
  }, React.createElement("i", {
    className: "fas fa-times"
  }))), React.createElement("div", {
    className: "modal-body"
  }, React.createElement("div", {
    className: "pos-disc-row",
    style: {
      gridTemplateColumns: '2fr .8fr .9fr .9fr auto',
      alignItems: 'end'
    }
  }, React.createElement(SearchableDropdown, {
    label: "Artikulli",
    icon: "fas fa-box",
    options: productOpts,
    value: productId,
    onChange: setProductId,
    placeholder: "K\xEBrko artikull me em\xEBr/kod..."
  }), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Sasia"), React.createElement("input", {
    type: "number",
    min: "0",
    step: "0.01",
    value: qty,
    onChange: e => setQty(e.target.value)
  })), React.createElement(SearchableDropdown, {
    label: "Nj\xEBsia",
    icon: "fas fa-scale-balanced",
    options: unitOpts,
    value: unitKey,
    onChange: setUnitKey,
    placeholder: "Zgjidh nj\xEBsin\xEB..."
  }), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Kosto / nj\xEBsi"), React.createElement("input", {
    type: "number",
    min: "0",
    step: "0.01",
    value: unitCost,
    onChange: e => setUnitCost(e.target.value)
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "\xA0"), React.createElement("button", {
    type: "button",
    className: "btn btn-secondary",
    onClick: addLine
  }, React.createElement("i", {
    className: "fas fa-plus"
  }), " Shto"))), selectedProduct && Number(qty) > 0 && React.createElement("p", {
    className: "stock-onhand-hint"
  }, "Konvertim: ", React.createElement("strong", null, Number(qty), " ", selectedUnit.name), " = ", React.createElement("strong", null, formatQtyWithUnits(baseQtyPreview, selectedProduct))), lines.length > 0 && React.createElement("div", {
    className: "about-table-wrapper",
    style: {
      marginTop: 12,
      marginBottom: 20
    }
  }, React.createElement("table", {
    className: "about-roles-table"
  }, React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", null, "Artikulli"), React.createElement("th", null, "Sasia"), React.createElement("th", null, "Nj\xEBsia"), React.createElement("th", null, "N\xEB stok"), React.createElement("th", null, "Kosto/nj\xEBsi"), React.createElement("th", null, "Vlera"), React.createElement("th", null))), React.createElement("tbody", null, lines.map(l => React.createElement("tr", {
    key: l.key
  }, React.createElement("td", null, l.name, React.createElement("div", {
    className: "cell-sub"
  }, l.sku)), React.createElement("td", null, l.enteredQty), React.createElement("td", null, l.unitName), React.createElement("td", null, formatQtyWithUnits(l.qty, byId[l.productId])), React.createElement("td", null, money(l.enteredUnitCost)), React.createElement("td", null, money(l.lineTotal)), React.createElement("td", null, React.createElement("button", {
    type: "button",
    className: "action-icon delete-icon",
    onClick: () => removeLine(l.key)
  }, React.createElement("i", {
    className: "fas fa-times"
  })))))))), React.createElement("form", {
    onSubmit: handleSubmit
  }, React.createElement("div", {
    className: "form-grid"
  }, React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Arsye *"), React.createElement("input", {
    type: "text",
    value: reason,
    onChange: e => setReason(e.target.value),
    required: true
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Referenc\xEB"), React.createElement("input", {
    type: "text",
    value: reference,
    onChange: e => setReference(e.target.value),
    placeholder: "Nr fature / dokumenti"
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Furnitori"), React.createElement("input", {
    type: "text",
    value: supplier,
    onChange: e => setSupplier(e.target.value)
  }))), lines.length > 0 && React.createElement("p", {
    className: "stock-onhand-hint"
  }, "Totali n\xEB nj\xEBsi baz\xEB: ", React.createElement("strong", null, totalBaseQty), " \u2022 Vlera: ", React.createElement("strong", null, money(totalValue))), React.createElement("div", {
    className: "form-actions"
  }, React.createElement("button", {
    type: "submit",
    className: "btn btn-success",
    disabled: saving || lines.length === 0
  }, saving ? React.createElement(React.Fragment, null, React.createElement("i", {
    className: "fas fa-spinner fa-spin"
  }), " Duke ruajtur...") : React.createElement(React.Fragment, null, React.createElement("i", {
    className: "fas fa-save"
  }), " Regjistro hyrjen")), React.createElement("button", {
    type: "button",
    className: "btn btn-secondary",
    onClick: onClose
  }, React.createElement("i", {
    className: "fas fa-times"
  }), " Anulo"))))));
}
function StockAdjustModal({
  products,
  movements,
  onClose,
  onSave
}) {
  const [productId, setProductId] = useState('');
  const [counted, setCounted] = useState('');
  const [unitKey, setUnitKey] = useState('base');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const productOpts = useMemo(() => (products || []).map(p => ({
    value: p.id,
    label: `${p.name} (${p.sku})`
  })), [products]);
  const selected = (products || []).find(p => p.id === productId);
  const unitOpts = useMemo(() => selected ? getProductUnitOptions(selected) : [{
    value: 'base',
    label: 'copë (bazë)',
    name: 'copë',
    multiplier: 1
  }], [selected]);
  const selectedUnit = selected ? getProductUnit(selected, unitKey) : unitOpts[0];
  const onHand = useMemo(() => productId ? computeQtyOnHand(productId, movements) : 0, [productId, movements]);
  const countedBase = selected ? toBaseQty(selected, counted, unitKey) : Number(counted) || 0;
  const diff = counted === '' ? 0 : round2(countedBase - onHand);
  useEffect(() => {
    setUnitKey('base');
    setCounted('');
  }, [productId]);
  const submit = async e => {
    e.preventDefault();
    if (!productId) return Swal.fire({
      icon: 'warning',
      title: 'Zgjidh artikullin'
    });
    if (counted === '' || Number(counted) < 0) return Swal.fire({
      icon: 'warning',
      title: 'Vendos sasinë e numëruar'
    });
    if (diff === 0) return Swal.fire({
      icon: 'info',
      title: 'Pa ndryshim',
      text: 'Sasia e numëruar përputhet me gjendjen në sistem.'
    });
    setSaving(true);
    await onSave({
      productId,
      type: diff > 0 ? 'in' : 'out',
      qty: Math.abs(diff),
      enteredQty: Math.abs(Number(counted) || 0),
      unitKey,
      unitName: selectedUnit.name,
      unitMultiplier: selectedUnit.multiplier,
      reason: 'Adjustment',
      reference: 'Inventarizim',
      notes: notes.trim() || `Numëruar ${counted} ${selectedUnit.name} = ${formatQtyWithUnits(countedBase, selected)}, ishte ${formatQtyWithUnits(onHand, selected)}`
    }, selected?.name || 'Artikull i panjohur');
    setSaving(false);
  };
  return React.createElement("div", {
    className: "modal-overlay",
    onClick: onClose
  }, React.createElement("div", {
    className: "modal",
    onClick: e => e.stopPropagation()
  }, React.createElement("div", {
    className: "modal-header"
  }, React.createElement("h3", null, React.createElement("i", {
    className: "fas fa-scale-balanced"
  }), " Inventarizim / Rregullim"), React.createElement("button", {
    className: "close-btn",
    onClick: onClose
  }, React.createElement("i", {
    className: "fas fa-times"
  }))), React.createElement("div", {
    className: "modal-body"
  }, React.createElement("form", {
    onSubmit: submit
  }, React.createElement(SearchableDropdown, {
    label: "Artikulli",
    icon: "fas fa-box",
    options: productOpts,
    value: productId,
    onChange: setProductId,
    placeholder: "K\xEBrko artikull...",
    required: true,
    creatable: true,
    createLabel: "Shto artikull: {q}",
    onCreate: async q => {
      try {
        localStorage.setItem('erp_new_product_name', q);
      } catch (e) {}
      nav.go('products', 'products');
      return false;
    }
  }), productId && React.createElement("p", {
    className: "stock-onhand-hint"
  }, "Gjendja n\xEB sistem: ", React.createElement("strong", null, formatQtyWithUnits(onHand, selected))), React.createElement("div", {
    className: "form-grid"
  }, React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Sasia e num\xEBruar *"), React.createElement("input", {
    type: "number",
    min: "0",
    step: "0.01",
    value: counted,
    onChange: e => setCounted(e.target.value),
    required: true
  })), React.createElement(SearchableDropdown, {
    label: "Nj\xEBsia",
    icon: "fas fa-scale-balanced",
    options: unitOpts,
    value: unitKey,
    onChange: setUnitKey,
    placeholder: "Zgjidh nj\xEBsin\xEB...",
    required: true
  }), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Rregullimi n\xEB stok"), React.createElement("input", {
    type: "text",
    value: productId && counted !== '' ? diff > 0 ? '+' + formatQtyWithUnits(diff, selected) + ' (Hyrje)' : diff < 0 ? '-' + formatQtyWithUnits(Math.abs(diff), selected) + ' (Dalje)' : 'Pa ndryshim' : '-',
    disabled: true
  }))), productId && counted !== '' && React.createElement("p", {
    className: "stock-onhand-hint"
  }, "Num\xEBruar: ", React.createElement("strong", null, counted, " ", selectedUnit.name), " = ", React.createElement("strong", null, formatQtyWithUnits(countedBase, selected))), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Sh\xEBnime"), React.createElement("textarea", {
    rows: "2",
    value: notes,
    onChange: e => setNotes(e.target.value),
    placeholder: "Arsyeja e diferenc\xEBs"
  })), React.createElement("div", {
    className: "form-actions"
  }, React.createElement("button", {
    type: "submit",
    className: "btn btn-primary",
    disabled: saving
  }, saving ? React.createElement(React.Fragment, null, React.createElement("i", {
    className: "fas fa-spinner fa-spin"
  }), " Duke postuar...") : React.createElement(React.Fragment, null, React.createElement("i", {
    className: "fas fa-save"
  }), " Posto rregullimin")), React.createElement("button", {
    type: "button",
    className: "btn btn-secondary",
    onClick: onClose
  }, React.createElement("i", {
    className: "fas fa-times"
  }), " Anulo"))))));
}
function FleteDaljePrint({
  movement,
  product
}) {
  if (!movement) return null;
  try {
    return React.createElement("div", {
      dangerouslySetInnerHTML: {
        __html: buildMovementWarehouseHtml(movement, product)
      }
    });
  } catch (e) {
    console.error('fd crash', e);
    return React.createElement("pre", {
      style: {
        color: '#c00',
        fontSize: 11
      }
    }, 'Gabim: ' + String(e && e.message || e));
  }
}
function StockView({
  user,
  role,
  setActiveMenu
}) {
  const nav = useAppNav();
  useEffect(() => {
    if (nav && nav.consumeCreate && nav.consumeCreate('stock')) {
      setModalType('in');
    }
  }, []);
  const [qSearch, setQSearch] = useState('');
  const [modalType, setModalType] = useState(null);
  const [showBulkIn, setShowBulkIn] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [printMove, setPrintMove] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    const fn = () => setReloadKey(k => k + 1);
    window.addEventListener('erp-data-changed', fn);
    return () => window.removeEventListener('erp-data-changed', fn);
  }, []);
  const [load, setLoad] = useState('');
  const tableInstanceRef = useRef(null);
  useDtLiveSearch(tableInstanceRef, qSearch);
  const {
    loading,
    data,
    err
  } = useFetch(() => Promise.all([fbGetStockMovements(), fbGetProducts()]), [reloadKey]);
  const movements = useMemo(() => data && data[0] && data[0].success ? data[0].data : [], [data]);
  const products = useMemo(() => data && data[1] && data[1].success ? data[1].data : [], [data]);
  const reload = () => setReloadKey(k => k + 1);
  const productMap = useMemo(() => products.reduce((m, p) => (m[p.id] = p, m), {}), [products]);
  const byId = useMemo(() => movements.reduce((m, mv) => (m[mv.id] = mv, m), {}), [movements]);
  const tableData = useMemo(() => {
    const sorted = [...movements].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const run = {};
    return sorted.map(m => {
      run[m.productId] = (run[m.productId] || 0) + (m.type === 'in' ? m.qty : -m.qty);
      return Object.assign({}, m, {
        productName: productMap[m.productId]?.name || 'Unknown Product',
        balance: run[m.productId]
      });
    });
  }, [movements, productMap]);
  useEffect(() => {
    if (err || data && data[0] && !data[0].success) Swal.fire({
      icon: 'error',
      title: 'Error',
      text: data && data[0] && data[0].message || 'Failed to load stock movements'
    });
  }, [err, data]);
  useEffect(() => {
    if (loading) return;
    let table = tableInstanceRef.current;
    if (table) {
      table.clear().rows.add(tableData).draw(false);
    } else {
      table = $('#stockTable').DataTable({
        data: tableData,
        columnDefs: [{
          targets: '_all',
          defaultContent: ''
        }],
        columns: [{
          data: 'productName',
          title: 'Artikulli',
          render: (d, t) => t === 'display' ? esc(d) : d
        }, {
          data: 'type',
          title: 'Tipi',
          render: (d, t) => t === 'display' ? `<span class="status-badge ${d === 'in' ? 'status-active' : 'status-inactive'}">${stockTypeText(d)}</span>` : d
        }, {
          data: null,
          title: 'Sasia',
          render: (d, t, row) => t === 'display' ? esc(displayEnteredQty(row, productMap[row.productId])) : row.enteredQty != null ? row.enteredQty : row.qty
        }, {
          data: 'unitName',
          title: 'Njësia',
          defaultContent: 'copë',
          render: (d, t, row) => t === 'display' ? esc(d || unitBaseName(productMap[row.productId])) : d || 'copë'
        }, {
          data: 'qty',
          title: 'Në njësi bazë',
          render: (d, t, row) => t === 'display' ? esc(formatQtyWithUnits(d, productMap[row.productId])) : d
        }, {
          data: 'unitCost',
          title: 'Kosto bazë',
          defaultContent: '-',
          render: (d, t) => t === 'display' ? d ? money(d) : '-' : d || 0
        }, {
          data: 'reason',
          title: 'Arsyeja',
          render: (d, t) => t === 'display' ? esc(d || '') : d
        }, {
          data: 'reference',
          title: 'Referencë',
          defaultContent: '-',
          render: (d, t, row) => t === 'display' ? d ? docLinkHtml('openref', row.id, d) : '-' : d || ''
        }, {
          data: 'balance',
          title: 'Balanca',
          render: (d, t, row) => t === 'display' ? `<strong>${esc(formatQtyWithUnits(d, productMap[row.productId]))}</strong>` : d
        }, {
          data: 'performedBy',
          title: 'Përdoruesi',
          render: (d, t) => t === 'display' ? esc(d || '') : d
        }, {
          data: 'createdAt',
          title: 'Data/Ora',
          render: (d, t) => t === 'display' ? formatDateForDisplay(d) : d
        }, {
          data: null,
          title: 'Veprime',
          orderable: false,
          render: (d, t, row) => (row && row.type === 'out' ? actionBtn('printdoc', 'fa-print', 'Fletë Dalje') : row && row.type === 'in' ? actionBtn('printdoc', 'fa-print', 'Fletë Hyrje') : '') + (role === 'Admin' ? actionBtn('delete', 'fa-trash', 'Fshi', 'delete') : '')
        }],
        pageLength: 80,
        lengthMenu: [[10, 25, 50, -1], [10, 25, 50, 'All']],
        responsive: true,
        dom: 'Blfrtip',
        buttons: erpDtButtons('Hyrje_Dalje_Stoku'),
        order: [[10, 'desc']]
      });
      tableInstanceRef.current = table;
    }
    $('#stockTable').off('click', '[data-action]').on('click', '[data-action]', function () {
      const rowData = getDtRowData(table, this);
      if (!rowData || !rowData.id) return;
      const act = $(this).data('action');
      if (act === 'printdoc') {
        const mv = byId[rowData.id] || rowData;
        openMovementDocument(mv, productMap[mv.productId], true);
        return;
      }
      if (act === 'openref') {
        const mv = byId[rowData.id] || rowData;
        const ref = String(mv.reference || '');
        if (!ref) return;
        const reason = String(mv.reason || '');
        if (reason === 'Sale') {
          fbGetSales().then(res => {
            const sale = (res && res.success ? res.data : []).find(x => x.id === ref || x.invoiceNo === ref);
            if (sale) openSaleDocument(sale, 'a4', false);else Swal.fire({
              icon: 'info',
              title: 'Nuk u gjet shitja',
              text: ref
            });
          });
        } else if (reason === 'Fletë Hyrje' || reason === 'Purchase') {
          openWarehouseReceiptInDocument(ref, false);
        } else {
          Swal.fire({
            icon: 'info',
            title: 'Referenca',
            text: ref
          });
        }
        return;
      }
      if (act === 'delete') handleDelete(byId[rowData.id] || rowData);
    });
  }, [loading, tableData, role]);
  useEffect(() => () => {
    if (tableInstanceRef.current) {
      try {
        tableInstanceRef.current.destroy();
        tableInstanceRef.current = null;
      } catch (e) {}
    }
  }, []);
  const handleSave = async (moveData, productName) => {
    const {
      updateCost,
      ...move
    } = moveData;
    setLoad(move.type === 'in' ? 'Recording Stock In...' : 'Recording Stock Out...');
    const result = await fbAddStockMovement(move, productName, user);
    if (result.success && updateCost && move.unitCost) await fbUpdateProduct(move.productId, {
      cost: Number(move.unitCost)
    }, user);
    setLoad('');
    if (result.success) {
      setModalType(null);
      setShowAdjust(false);
      Swal.fire({
        icon: 'success',
        title: 'Success!',
        text: result.message,
        timer: 2000,
        showConfirmButton: false
      });
      reload();
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: result.message
      });
    }
  };
  const handleDelete = mv => {
    const productName = productMap[mv.productId]?.name || mv.productId;
    Swal.fire({
      icon: 'warning',
      title: 'Delete Stock Entry?',
      text: 'This retroactively changes historical Qty On Hand. This cannot be undone',
      showCancelButton: true,
      confirmButtonColor: '#ea4335',
      confirmButtonText: 'Delete'
    }).then(async result => {
      if (!result.isConfirmed) return;
      setLoad('Deleting stock entry...');
      const r = await fbDeleteStockMovement(mv.id, `${mv.qty} x ${productName}`, user);
      setLoad('');
      if (r.success) {
        Swal.fire({
          icon: 'success',
          text: r.message,
          timer: 2000,
          showConfirmButton: false
        });
        reload();
      } else Swal.fire({
        icon: 'error',
        title: 'Error',
        text: r.message
      });
    });
  };
  const handleBulkSave = async lines => {
    setLoad('Receiving stock...');
    const result = await fbBulkStockIn(lines, user);
    setLoad('');
    if (result.success) {
      setShowBulkIn(false);
      Swal.fire({
        icon: 'success',
        title: 'Success!',
        text: result.message,
        timer: 2000,
        showConfirmButton: false
      });
      reload();
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: result.message
      });
    }
  };
  return React.createElement("div", {
    className: "data-section"
  }, load && React.createElement(TopLoadingBar, null), React.createElement("div", {
    className: "section-header"
  }, React.createElement("h2", null, React.createElement("i", {
    className: "fas fa-dolly"
  }), " Hyrje / Dalje"), React.createElement("div", {
    className: "stock-btns"
  }, React.createElement(RefreshBtn, {
    onClick: reload
  }), React.createElement("button", {
    className: "btn btn-success",
    disabled: loading,
    onClick: () => setModalType('in')
  }, React.createElement("i", {
    className: "fas fa-arrow-down"
  }), " Stock In"), React.createElement("button", {
    className: "btn btn-danger",
    disabled: loading,
    onClick: () => setModalType('out')
  }, React.createElement("i", {
    className: "fas fa-arrow-up"
  }), " Stock Out"), React.createElement("button", {
    className: "btn btn-secondary",
    disabled: loading,
    onClick: () => setShowBulkIn(true)
  }, React.createElement("i", {
    className: "fas fa-truck-ramp-box"
  }), " Bulk Receive"), React.createElement("button", {
    className: "btn btn-secondary",
    disabled: loading,
    onClick: () => setShowAdjust(true)
  }, React.createElement("i", {
    className: "fas fa-scale-balanced"
  }), " Stocktake"))), loading && React.createElement(TableSkeleton, {
    rows: 8,
    columns: 10
  }), React.createElement("div", {
    style: {
      display: loading ? 'none' : 'block'
    }
  }, React.createElement("div", {
    className: "module-toolbar"
  }, React.createElement(GoogleSearchBox, {
    value: qSearch,
    onChange: setQSearch,
    placeholder: "K\xEBrko l\xEBvizje stoku\u2026 artikull, arsye, referenc\xEB, p\xEBrdorues\u2026"
  })), React.createElement("table", {
    id: "stockTable",
    className: "display",
    style: {
      width: '100%'
    }
  }), React.createElement(FilteredSummaryBar, {
    tableRef: tableInstanceRef,
    deps: [tableData, qSearch],
    itemsBuilder: rows => [{
      label: 'Lëvizje (filtruar)',
      value: rows.length
    }, {
      label: 'Hyrje',
      value: rows.filter(r => r.type === 'in').length
    }, {
      label: 'Dalje',
      value: rows.filter(r => r.type === 'out').length
    }]
  })), modalType && React.createElement(StockMovementModal, {
    type: modalType,
    products: products,
    movements: movements,
    onClose: () => setModalType(null),
    onSave: handleSave
  }), showBulkIn && React.createElement(BulkStockInModal, {
    products: products,
    onClose: () => setShowBulkIn(false),
    onSave: handleBulkSave
  }), showAdjust && React.createElement(StockAdjustModal, {
    products: products,
    movements: movements,
    onClose: () => setShowAdjust(false),
    onSave: handleSave
  }), printMove && React.createElement("div", {
    className: "modal-overlay",
    onClick: () => setPrintMove(null)
  }, React.createElement("div", {
    className: "modal thermal-slip-modal",
    onClick: e => e.stopPropagation(),
    style: {
      maxWidth: '980px'
    }
  }, React.createElement("div", {
    className: "modal-body thermal-slip-modal-body"
  }, React.createElement("div", {
    className: "erp-export-bar",
    style: {
      width: '100%',
      marginBottom: 10
    }
  }, React.createElement("button", {
    type: "button",
    className: "btn btn-preview",
    onClick: () => openMovementDocument(printMove, productMap[printMove.productId], false)
  }, React.createElement("i", {
    className: "fas fa-eye"
  }), " Preview"), React.createElement("button", {
    type: "button",
    className: "btn btn-primary",
    onClick: () => openMovementDocument(printMove, productMap[printMove.productId], true)
  }, React.createElement("i", {
    className: "fas fa-print"
  }), " Printo"), React.createElement("button", {
    type: "button",
    className: "btn btn-pdf",
    onClick: () => exportMovementPdf(printMove, productMap[printMove.productId])
  }, React.createElement("i", {
    className: "fas fa-file-pdf"
  }), " PDF"), React.createElement("button", {
    type: "button",
    className: "btn btn-excel",
    onClick: () => exportMovementXlsx(printMove, productMap[printMove.productId])
  }, React.createElement("i", {
    className: "fas fa-file-excel"
  }), " Excel"), React.createElement("button", {
    type: "button",
    className: "btn btn-secondary",
    onClick: () => setPrintMove(null)
  }, React.createElement("i", {
    className: "fas fa-times"
  }), " Mbyll")), React.createElement("div", {
    style: {
      background: '#f5f5f5',
      padding: 12,
      borderRadius: 6,
      overflow: 'auto',
      maxHeight: '65vh'
    }
  }, React.createElement("div", {
    style: {
      background: '#fff',
      margin: '0 auto',
      width: 'fit-content'
    }
  }, React.createElement(FleteDaljePrint, {
    movement: printMove,
    product: productMap[printMove.productId]
  })))))));
}
function Cart({
  items,
  products = [],
  onInc,
  onDec,
  onQtyChange,
  onFreeChange,
  onRemove,
  onUnitChange,
  onWarehouseChange,
  onPriceChange,
  onNetValueChange,
  onGrossValueChange,
  onTaxChange
}) {
  const prodByIdLocal = useMemo(() => products.reduce((m, p) => (m[p.id] = p, m), {}), [products]);
  if (items.length === 0) {
    return React.createElement("div", {
      className: "pos-empty"
    }, React.createElement("i", {
      className: "fas fa-cart-shopping"
    }), React.createElement("p", null, "Shporta \xEBsht\xEB bosh \u2014 k\xEBrko artikullin si n\xEB Google ose skano barkodin."));
  }
  return React.createElement("div", {
    className: "pos-cart-list"
  }, React.createElement("div", {
    className: "pos-cart-header"
  }, React.createElement("div", null, "Artikulli"), React.createElement("div", null, "Nj\xEBsia"), React.createElement("div", null, "Magazina"), React.createElement("div", null, "Sasia"), React.createElement("div", null, "Falas"), React.createElement("div", null, "TVSH"), React.createElement("div", null, "\xC7mimi pa TVSH"), React.createElement("div", null, "Vlera pa TVSH"), React.createElement("div", null, "TVSH"), React.createElement("div", null, "Vlera me TVSH"), React.createElement("div", null)), items.map(it => {
    const product = prodByIdLocal[it.productId] || it;
    const opts = getProductUnitOptions(product);
    const selectedUnit = getProductUnit(product, it.unitKey || 'base');
    const whOpts = getWarehousesForProduct(product, products);
    const selectedWh = it.warehouse || product.location || product.warehouse || 'Magazina Kryesore';
    const paidDisplay = Number(it.displayQty || 0);
    const freeDisplay = Number(it.freeDisplayQty || 0);
    const unitLabel = selectedUnit.name;
    const taxable = it.taxEnabled !== false;
    const rate = taxable ? productTaxRate(product) : 0;
    const currentUnitPrice = round2(Number(it.unitSalePrice != null ? it.unitSalePrice : autoUnitNetPrice(product, it.unitKey || 'base', taxable)) || 0);
    const lineNet = round2(paidDisplay * currentUnitPrice);
    const lineTax = round2(taxable ? lineNet * rate / 100 : 0);
    const lineGross = round2(lineNet + lineTax);
    return React.createElement("div", {
      className: "pos-cart-row",
      key: it.productId
    }, React.createElement("div", {
      className: "pi-name pos-cart-cell",
      "data-label": "Artikulli"
    }, React.createElement("div", null, React.createElement("strong", null, it.name), React.createElement("small", null, "SKU: ", it.sku), React.createElement("span", {
      className: "pos-unit-note"
    }, "Stok rreshti: ", formatQtyTwoUnits(it.qty, product, it.unitKey || 'base')))), React.createElement("div", {
      className: "pos-cart-cell",
      "data-label": "Nj\xEBsia"
    }, React.createElement("select", {
      className: "cart-unit-select",
      value: it.unitKey || 'base',
      onChange: e => onUnitChange && onUnitChange(it.productId, e.target.value)
    }, opts.map(o => React.createElement("option", {
      key: o.value,
      value: o.value
    }, o.name)))), React.createElement("div", {
      className: "pos-cart-cell",
      "data-label": "Magazina"
    }, React.createElement("select", {
      className: "cart-unit-select",
      value: selectedWh,
      onChange: e => onWarehouseChange && onWarehouseChange(it.productId, e.target.value)
    }, whOpts.map(w => React.createElement("option", {
      key: w,
      value: w
    }, w)))), React.createElement("div", {
      className: "pos-cart-cell",
      "data-label": "Sasia"
    }, React.createElement("div", {
      className: "pos-qty-ctrl"
    }, React.createElement("button", {
      type: "button",
      onClick: () => onDec(it.productId)
    }, React.createElement("i", {
      className: "fas fa-minus"
    })), React.createElement("input", {
      className: "pos-paid-input",
      type: "text",
      inputMode: "decimal",
      value: paidDisplay,
      onFocus: e => e.target.select(),
      onChange: e => onQtyChange && onQtyChange(it.productId, e.target.value.replace(',', '.'))
    }), React.createElement("button", {
      type: "button",
      onClick: () => onInc(it.productId)
    }, React.createElement("i", {
      className: "fas fa-plus"
    })))), React.createElement("div", {
      className: "pos-cart-cell",
      "data-label": "Falas"
    }, React.createElement("div", {
      className: "pos-free-wrap"
    }, React.createElement("input", {
      className: "pos-free-input",
      type: "text",
      inputMode: "decimal",
      value: freeDisplay,
      onFocus: e => e.target.select(),
      onChange: e => onFreeChange && onFreeChange(it.productId, e.target.value.replace(',', '.'))
    }), React.createElement("span", {
      className: "pos-free-badge"
    }, unitLabel))), React.createElement("div", {
      className: "pos-cart-cell",
      "data-label": "TVSH"
    }, React.createElement("select", {
      className: "cart-tax-select",
      value: taxable ? 'yes' : 'no',
      onChange: e => onTaxChange && onTaxChange(it.productId, e.target.value === 'yes')
    }, React.createElement("option", {
      value: "yes"
    }, "Po"), React.createElement("option", {
      value: "no"
    }, "Jo"))), React.createElement("div", {
      className: "pos-cart-cell",
      "data-label": "\xC7mimi pa TVSH"
    }, React.createElement("input", {
      className: "pos-price-input",
      type: "text",
      inputMode: "decimal",
      value: currentUnitPrice,
      onFocus: e => e.target.select(),
      onChange: e => onPriceChange && onPriceChange(it.productId, e.target.value.replace(',', '.'))
    }), React.createElement("div", {
      className: "cell-sub"
    }, "/", selectedUnit.name)), React.createElement("div", {
      className: "pos-cart-cell pos-line-total",
      "data-label": "Vlera pa TVSH"
    }, React.createElement("input", {
      className: "pos-value-input",
      type: "text",
      inputMode: "decimal",
      value: lineNet,
      onFocus: e => e.target.select(),
      onChange: e => onNetValueChange && onNetValueChange(it.productId, e.target.value.replace(',', '.'))
    }), React.createElement("div", {
      className: "cell-sub"
    }, paidDisplay, " \xD7 ", money(currentUnitPrice))), React.createElement("div", {
      className: "pos-cart-cell",
      "data-label": "TVSH Vlera"
    }, React.createElement("span", {
      className: "pos-tax-value"
    }, money(lineTax))), React.createElement("div", {
      className: "pos-cart-cell pos-line-total",
      "data-label": "Vlera me TVSH"
    }, React.createElement("input", {
      className: "pos-value-input",
      type: "text",
      inputMode: "decimal",
      value: lineGross,
      onFocus: e => e.target.select(),
      onChange: e => onGrossValueChange && onGrossValueChange(it.productId, e.target.value.replace(',', '.'))
    })), React.createElement("div", {
      className: "pos-cart-cell",
      "data-label": "Fshi"
    }, React.createElement("button", {
      type: "button",
      className: "pos-remove-btn",
      title: "Hiq rreshtin",
      onClick: () => onRemove(it.productId)
    }, React.createElement("i", {
      className: "fas fa-trash"
    }))));
  }));
}
function CameraScanModal({
  onDetected,
  onClose
}) {
  const scannerRef = useRef(null);
  const runningRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    const qr = new Html5Qrcode('pos-qr-reader');
    scannerRef.current = qr;
    const safeStop = () => {
      if (!runningRef.current) return;
      runningRef.current = false;
      try {
        qr.stop().then(() => qr.clear()).catch(() => {});
      } catch (e) {}
    };
    qr.start({
      facingMode: 'environment'
    }, {
      fps: 10,
      qrbox: 250
    }, decodedText => {
      if (cancelled) return;
      cancelled = true;
      safeStop();
      onDetected(decodedText);
    }, () => {}).then(() => {
      runningRef.current = true;
      if (cancelled) safeStop();
    }).catch(err => {
      Swal.fire({
        icon: 'error',
        title: 'Camera Error',
        text: 'Could not start camera: ' + (err && err.message ? err.message : err)
      });
      onClose();
    });
    return () => {
      cancelled = true;
      safeStop();
    };
  }, []);
  return React.createElement("div", {
    className: "modal-overlay",
    onClick: onClose
  }, React.createElement("div", {
    className: "modal",
    style: {
      maxWidth: '480px'
    },
    onClick: e => e.stopPropagation()
  }, React.createElement("div", {
    className: "modal-header"
  }, React.createElement("h3", null, React.createElement("i", {
    className: "fas fa-camera"
  }), " Scan with Camera"), React.createElement("button", {
    className: "close-btn",
    onClick: onClose
  }, React.createElement("i", {
    className: "fas fa-times"
  }))), React.createElement("div", {
    className: "modal-body"
  }, React.createElement("div", {
    className: "pos-camera-frame"
  }, React.createElement("div", {
    id: "pos-qr-reader"
  })), React.createElement("p", {
    style: {
      textAlign: 'center',
      color: '#888',
      fontSize: 13,
      marginTop: 12
    }
  }, "Point the camera at the product's QR code or barcode"))));
}
function fmtLek(n) {
  return Number(n || 0).toLocaleString('sq-AL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
function fmtQty(n) {
  const x = Number(n || 0);
  return Number.isInteger(x) ? String(x) : x.toLocaleString('sq-AL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  });
}
function saleBuyerName(sale) {
  return sale && (sale.customerName || sale.buyerName) || 'Klient pa emër';
}
function saleBuyerAddress(sale) {
  return sale && (sale.customerAddress || sale.buyerAddress || sale.address) || '';
}
function saleBuyerNipt(sale) {
  return sale && (sale.customerNipt || sale.buyerNipt || sale.nipt) || '';
}
function salePaymentLabel(sale) {
  const m = sale && sale.paymentMethod || 'Para';
  if (/cash|para|kartëmonedha/i.test(m)) return 'Para';
  if (/credit|kredi/i.test(m)) return 'Kredi';
  return m;
}
function saleInvoiceTypeLabel(sale) {
  const m = salePaymentLabel(sale);
  if (m === 'Kredi') return 'Faturë pa para';
  return 'Faturë me para';
}
function saleNslf(sale) {
  return sale && (sale.nslf || sale.NSLF) || fiscalCode('NSLF', sale && (sale.id || sale.invoiceNo) || '');
}
function saleNivf(sale) {
  return sale && (sale.nivf || sale.NIVF) || fiscalCode('NIVF', sale && (sale.invoiceNo || sale.id) || '');
}
function saleOperatorCode(sale) {
  return sale && (sale.operatorCode || sale.cashierCode) || 'tg763eq754';
}
function saleBusinessUnitCode(sale) {
  return sale && (sale.businessUnitCode || sale.tcrCode) || 'at011nm634';
}
function salePosName(sale) {
  return sale && (sale.posName || sale.cashier) || 'Cash ' + (businessName() || 'POS');
}
function saleTaxBreakdown(sale) {
  const map = {};
  (sale.items || []).forEach(function (it) {
    const rate = Number(it.taxRate != null ? it.taxRate : CFG.taxRate || 0) || 0;
    const key = String(rate);
    if (!map[key]) map[key] = {
      rate: rate,
      net: 0,
      tax: 0
    };
    map[key].net += Number(it.lineNet || 0);
    map[key].tax += Number(it.lineTax || 0);
  });
  const rows = Object.keys(map).map(function (k) {
    return {
      rate: map[k].rate,
      net: round2(map[k].net),
      tax: round2(map[k].tax)
    };
  });
  if (!rows.length) {
    rows.push({
      rate: Number(CFG.taxRate || 20),
      net: round2(sale.subtotal || 0),
      tax: round2(sale.tax || 0)
    });
  }
  return rows;
}
function ThermalSlip({
  sale
}) {
  if (!sale) return null;
  const items = sale.items || [];
  const taxRows = saleTaxBreakdown(sale);
  const mainTax = taxRows[0] || {
    rate: 20,
    net: sale.subtotal || 0,
    tax: sale.tax || 0
  };
  return React.createElement("div", {
    className: "thermal-slip-print"
  }, React.createElement("div", {
    className: "ts-copy"
  }, "KOPJE FATURE"), React.createElement("div", {
    className: "ts-fiscal"
  }, "Fatur\xEB Tatimore"), React.createElement("div", {
    className: "ts-business"
  }, businessName()), businessAddress() ? React.createElement("div", {
    className: "ts-address"
  }, businessAddress()) : null, React.createElement("div", {
    className: "ts-customer"
  }, saleBuyerName(sale)), saleBuyerAddress(sale) ? React.createElement("div", {
    className: "ts-address"
  }, saleBuyerAddress(sale)) : null, React.createElement("div", {
    className: "ts-rule"
  }), React.createElement("div", {
    className: "ts-field"
  }, React.createElement("b", null, "NIPT:"), React.createElement("span", null, businessNipt() || '—')), React.createElement("div", {
    className: "ts-field"
  }, React.createElement("b", null, "Data/Ora:"), React.createElement("span", null, formatDateForDisplay(sale.createdAt || nowIso()))), React.createElement("div", {
    className: "ts-field"
  }, React.createElement("b", null, "Fatura Nr:"), React.createElement("span", null, saleDocNo(sale))), React.createElement("div", {
    className: "ts-field"
  }, React.createElement("b", null, "Kodi i Operatorit:"), React.createElement("span", null, saleOperatorCode(sale))), React.createElement("div", {
    className: "ts-field"
  }, React.createElement("b", null, "Nj\xEBsia e biznesit:"), React.createElement("span", null, saleBusinessUnitCode(sale))), React.createElement("div", {
    className: "ts-field"
  }, React.createElement("b", null, "POS:"), React.createElement("span", null, salePosName(sale))), React.createElement("div", {
    className: "ts-field"
  }, React.createElement("b", null, "M\xEBnyrat e pages\xEBs:"), React.createElement("span", null, salePaymentLabel(sale))), React.createElement("div", {
    className: "ts-rule"
  }), items.map((it, i) => {
    const qty = Number(it.displayQty != null ? it.displayQty : it.qty) || 0;
    const free = Number(it.freeDisplayQty || 0) || 0;
    const price = Number(it.unitSalePrice != null ? it.unitSalePrice : it.price) || 0;
    const line = Number(it.lineTotal != null ? it.lineTotal : (it.lineNet || 0) + (it.lineTax || 0)) || 0;
    return React.createElement("div", {
      key: i
    }, React.createElement("div", {
      className: "ts-line-name"
    }, it.name), React.createElement("div", {
      className: "ts-line-calc"
    }, React.createElement("span", null, fmtQty(qty), free > 0 ? ' + ' + fmtQty(free) + ' falas' : '', " ", it.unitName || 'copë', " X ", fmtLek(price)), React.createElement("span", null, fmtLek(line))));
  }), React.createElement("div", {
    className: "ts-rule"
  }), React.createElement("div", {
    className: "ts-total-fiscal"
  }, React.createElement("span", null, "TOTAL LEK"), React.createElement("span", null, fmtLek(sale.total || 0))), React.createElement("div", {
    className: "ts-field"
  }, React.createElement("b", null, salePaymentLabel(sale)), React.createElement("span", null, fmtLek(sale.total || 0))), React.createElement("div", {
    className: "ts-rule"
  }), React.createElement("div", {
    className: "ts-tax-row"
  }, React.createElement("b", null, "Pa TVSH ", fmtLek(mainTax.rate), "%"), React.createElement("span", null, fmtLek(sale.subtotal || mainTax.net || 0))), React.createElement("div", {
    className: "ts-tax-row"
  }, React.createElement("b", null, "TVSH ", fmtLek(mainTax.rate), "%"), React.createElement("span", null, fmtLek(sale.tax || mainTax.tax || 0))), React.createElement("div", {
    className: "ts-rule"
  }), React.createElement("div", {
    className: "ts-nslf"
  }, React.createElement("div", null, "NSLF: ", saleNslf(sale)), React.createElement("div", null, "NIVF: ", saleNivf(sale))), React.createElement("div", {
    className: "ts-footer-note"
  }, CFG.receiptFooter || 'Faleminderit!'));
}
function A4InvoicePrint({
  sale
}) {
  if (!sale) return null;
  try {
    return React.createElement("div", {
      dangerouslySetInnerHTML: {
        __html: buildA4Html(sale)
      }
    });
  } catch (e) {
    console.error('a4 crash', e);
    return React.createElement("pre", {
      style: {
        color: '#c00',
        fontSize: 11
      }
    }, 'Gabim: ' + String(e && e.message || e));
  }
}
function FleteDaljeSalePrint({
  sale
}) {
  if (!sale) return null;
  try {
    return React.createElement("div", {
      dangerouslySetInnerHTML: {
        __html: buildWarehouseHtml(sale)
      }
    });
  } catch (e) {
    console.error('fd crash', e);
    return React.createElement("pre", {
      style: {
        color: '#c00',
        fontSize: 11
      }
    }, 'Gabim: ' + String(e && e.message || e));
  }
}
function FleteHyrjePrint({
  receipt
}) {
  if (!receipt) return null;
  try {
    return React.createElement("div", {
      dangerouslySetInnerHTML: {
        __html: buildWarehouseInHtml(receipt)
      }
    });
  } catch (e) {
    console.error('fh crash', e);
    return React.createElement("pre", {
      style: {
        color: '#c00',
        fontSize: 11
      }
    }, 'Gabim: ' + String(e && e.message || e));
  }
}
function WarehouseReceiptInOverlay({
  receipt,
  onClose
}) {
  if (!receipt) return null;
  return React.createElement("div", {
    className: "modal-overlay",
    onClick: onClose
  }, React.createElement("div", {
    className: "modal thermal-slip-modal",
    onClick: e => e.stopPropagation(),
    style: {
      maxWidth: '980px'
    }
  }, React.createElement("div", {
    className: "modal-header"
  }, React.createElement("h3", null, React.createElement("i", {
    className: "fas fa-box-open"
  }), " Flet\xEB Hyrje"), React.createElement("button", {
    className: "close-btn",
    onClick: onClose
  }, React.createElement("i", {
    className: "fas fa-times"
  }))), React.createElement("div", {
    className: "modal-body thermal-slip-modal-body"
  }, React.createElement("div", {
    className: "erp-export-bar",
    style: {
      width: '100%',
      marginBottom: 10
    }
  }, React.createElement("button", {
    type: "button",
    className: "btn btn-preview",
    onClick: () => openWarehouseReceiptInDocument(receipt, false)
  }, React.createElement("i", {
    className: "fas fa-eye"
  }), " Preview"), React.createElement("button", {
    type: "button",
    className: "btn btn-primary",
    onClick: () => openWarehouseReceiptInDocument(receipt, true)
  }, React.createElement("i", {
    className: "fas fa-print"
  }), " Printo"), React.createElement("button", {
    type: "button",
    className: "btn btn-pdf",
    onClick: () => exportWarehouseInPdf(receipt)
  }, React.createElement("i", {
    className: "fas fa-file-pdf"
  }), " PDF"), React.createElement("button", {
    type: "button",
    className: "btn btn-excel",
    onClick: () => exportWarehouseInXlsx(receipt)
  }, React.createElement("i", {
    className: "fas fa-file-excel"
  }), " Excel")), React.createElement("div", {
    style: {
      background: '#f5f5f5',
      padding: 12,
      borderRadius: 6,
      overflow: 'auto',
      maxHeight: '65vh',
      width: '100%'
    }
  }, React.createElement("div", {
    style: {
      background: '#fff',
      margin: '0 auto',
      width: 'fit-content'
    }
  }, React.createElement(FleteHyrjePrint, {
    receipt: receipt
  }))), React.createElement("div", {
    className: "form-actions",
    style: {
      marginTop: 12
    }
  }, React.createElement("button", {
    type: "button",
    className: "btn btn-secondary",
    onClick: onClose
  }, React.createElement("i", {
    className: "fas fa-times"
  }), " Mbyll")))));
}
function ThermalReceiptOverlay({
  sale,
  onClose
}) {
  const [docMode, setDocMode] = useState('thermal');
  useEffect(() => {
    setLastDocSale(sale);
  }, [sale]);
  if (!sale) return null;
  return React.createElement("div", {
    className: "modal-overlay",
    onClick: onClose
  }, React.createElement("div", {
    className: "modal thermal-slip-modal",
    onClick: e => e.stopPropagation(),
    style: {
      maxWidth: '980px'
    }
  }, React.createElement("div", {
    className: "modal-header"
  }, React.createElement("h3", null, React.createElement("i", {
    className: "fas fa-receipt"
  }), " Fatura / Flet\xEB Dalje"), React.createElement("button", {
    className: "close-btn",
    onClick: onClose
  }, React.createElement("i", {
    className: "fas fa-times"
  }))), React.createElement("div", {
    className: "modal-body thermal-slip-modal-body"
  }, React.createElement("div", {
    className: "erp-export-bar",
    style: {
      width: '100%',
      marginBottom: 10
    }
  }, React.createElement("button", {
    type: "button",
    className: 'btn ' + (docMode === 'thermal' ? 'btn-primary' : 'btn-secondary'),
    onClick: () => setDocMode('thermal')
  }, React.createElement("i", {
    className: "fas fa-receipt"
  }), " Termik"), React.createElement("button", {
    type: "button",
    className: 'btn ' + (docMode === 'a4' ? 'btn-primary' : 'btn-secondary'),
    onClick: () => setDocMode('a4')
  }, React.createElement("i", {
    className: "fas fa-file-invoice"
  }), " A4"), React.createElement("button", {
    type: "button",
    className: 'btn ' + (docMode === 'warehouse' ? 'btn-primary' : 'btn-secondary'),
    onClick: () => setDocMode('warehouse')
  }, React.createElement("i", {
    className: "fas fa-warehouse"
  }), " Flet\xEB Dalje"), React.createElement("button", {
    type: "button",
    className: "btn btn-preview",
    onClick: () => openSaleDocument(sale, docMode, false)
  }, React.createElement("i", {
    className: "fas fa-eye"
  }), " Preview"), React.createElement("button", {
    type: "button",
    className: "btn btn-primary",
    onClick: () => openSaleDocument(sale, docMode, true)
  }, React.createElement("i", {
    className: "fas fa-print"
  }), " Printo"), React.createElement("button", {
    type: "button",
    className: "btn btn-pdf",
    onClick: () => exportSalePdf(sale)
  }, React.createElement("i", {
    className: "fas fa-file-pdf"
  }), " PDF"), React.createElement("button", {
    type: "button",
    className: "btn btn-excel",
    onClick: () => exportSaleXlsx(sale)
  }, React.createElement("i", {
    className: "fas fa-file-excel"
  }), " Excel")), React.createElement("div", {
    style: {
      background: '#f5f5f5',
      padding: 12,
      borderRadius: 6,
      overflow: 'auto',
      maxHeight: '60vh'
    }
  }, docMode === 'thermal' && React.createElement("div", {
    style: {
      background: '#fff',
      margin: '0 auto'
    }
  }, React.createElement(ThermalSlip, {
    sale: sale
  })), docMode === 'a4' && React.createElement("div", {
    style: {
      background: '#fff',
      margin: '0 auto',
      transform: 'scale(0.72)',
      transformOrigin: 'top center'
    }
  }, React.createElement(A4InvoicePrint, {
    sale: sale
  })), docMode === 'warehouse' && React.createElement("div", {
    style: {
      background: '#fff',
      margin: '0 auto'
    }
  }, React.createElement(FleteDaljeSalePrint, {
    sale: sale
  }))), React.createElement("div", {
    className: "form-actions",
    style: {
      marginTop: 12
    }
  }, React.createElement("button", {
    type: "button",
    className: "btn btn-secondary",
    onClick: onClose
  }, React.createElement("i", {
    className: "fas fa-times"
  }), " Mbyll")))));
}
function POSView({
  user,
  role,
  setActiveMenu
}) {
  const nav = useAppNav();
  const payOpts = usePaymentOpts();
  const {
    refreshConfig
  } = useConfig();
  const [cart, setCart] = useState([]);
  const [scanValue, setScanValue] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [completedSale, setCompletedSale] = useState(null);
  const [load, setLoad] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [customerId, setCustomerId] = useState('');
  const [discountType, setDiscountType] = useState('flat');
  const [discountValue, setDiscountValue] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [selectedWarehouse, setSelectedWarehouse] = useState('Magazina Kryesore');
  const [tendered, setTendered] = useState('');
  const [held, setHeld] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('pos_held') || '[]');
    } catch (e) {
      return [];
    }
  });
  const scanRef = useRef(null);
  const {
    loading: loadingProducts,
    data: productsData
  } = useFetch(() => fbGetProducts(), []);
  const products = useMemo(() => productsData && productsData.success ? productsData.data : [], [productsData]);
  const prodById = useMemo(() => products.reduce((m, p) => (m[p.id] = p, m), {}), [products]);
  const codeIndex = useMemo(() => buildCodeIndex(products), [products]);
  const {
    data: custData
  } = useFetch(() => fbGetCustomers(), []);
  const customers = useMemo(() => custData && custData.success ? custData.data : [], [custData]);
  const customerOpts = useMemo(() => customers.map(c => ({
    value: c.id,
    label: c.name + (c.phone ? ' · ' + c.phone : '')
  })), [customers]);
  const {
    loading: loadingMovements,
    data: movementsData
  } = useFetch(() => fbGetStockMovements(), [reloadKey]);
  const movements = useMemo(() => movementsData && movementsData.success ? movementsData.data : [], [movementsData]);
  const catalogReady = !loadingProducts && !loadingMovements;
  const productSuggestions = useMemo(() => {
    const q = String(scanValue || '').trim().toLowerCase();
    if (!q || !catalogReady) return [];
    return products.filter(p => [p.name, p.sku, p.barcode].some(v => String(v || '').toLowerCase().includes(q))).slice(0, 12);
  }, [scanValue, products, catalogReady]);
  useEffect(() => {
    if (!catalogReady || completedSale || showCamera || !scanRef.current) return;
    const active = document.activeElement;
    const userIsEditing = active && active.closest && active.closest('.pos-cart-list, .pos-summary, .modal');
    if (userIsEditing) return;
    scanRef.current.focus();
  }, [catalogReady, completedSale, showCamera]);
  const capacityCheck = useCallback((productId, name, nextQty) => {
    const onHand = computeQtyOnHand(productId, movements);
    if (nextQty > onHand) {
      Swal.fire({
        icon: 'warning',
        title: 'Not enough stock',
        text: `Only ${onHand} unit(s) of ${name} in stock.`
      });
      return false;
    }
    return true;
  }, [movements]);
  const addToCart = useCallback((product, qtyToAdd = 1, unitKey = 'base') => {
    setCart(prev => {
      const unit = getProductUnit(product, unitKey);
      const addDisplay = Number(qtyToAdd) || 1;
      const existing = prev.find(l => l.productId === product.id);
      if (existing) {
        const mult = Number(existing.unitMultiplier || unit.multiplier || 1);
        const paidDisplay = round2(Number(existing.displayQty || 0) + addDisplay);
        const freeDisplay = Number(existing.freeDisplayQty || 0);
        const paidQty = round2(paidDisplay * mult);
        const freeQty = round2(freeDisplay * mult);
        const totalQty = round2(paidQty + freeQty);
        if (!capacityCheck(product.id, product.name, totalQty)) return prev;
        return prev.map(l => {
          if (l.productId !== product.id) return l;
          const taxable = l.taxEnabled !== false;
          const keepPrice = !!l.priceEdited;
          const nextUnitPrice = keepPrice ? Number(l.unitSalePrice || 0) : autoUnitNetPrice(product, l.unitKey || unit.value, taxable);
          return {
            ...l,
            price: round2(nextUnitPrice / mult),
            unitSalePrice: round2(nextUnitPrice),
            displayQty: paidDisplay,
            paidQty,
            freeDisplayQty: freeDisplay,
            freeQty,
            qty: totalQty,
            taxEnabled: taxable,
            warehouse: l.warehouse || product.location || product.warehouse || 'Magazina Kryesore'
          };
        });
      }
      const paidQty = round2(addDisplay * unit.multiplier);
      if (!capacityCheck(product.id, product.name, paidQty)) return prev;
      const taxable = true;
      const netUnitPrice = autoUnitNetPrice(product, unit.value, taxable);
      return [...prev, {
        productId: product.id,
        name: product.name,
        sku: product.sku,
        price: round2(netUnitPrice / unit.multiplier),
        unitSalePrice: netUnitPrice,
        qty: paidQty,
        paidQty,
        freeQty: 0,
        displayQty: addDisplay,
        freeDisplayQty: 0,
        unitKey: unit.value,
        unitName: unit.name,
        unitMultiplier: unit.multiplier,
        taxEnabled: taxable,
        warehouse: product.location || product.warehouse || 'Magazina Kryesore'
      }];
    });
  }, [capacityCheck]);
  const pickProductFromSearch = useCallback(product => {
    if (!product) return;
    addToCart(product, 1, 'base');
    setScanValue('');
    setTimeout(() => scanRef.current && scanRef.current.focus(), 0);
  }, [addToCart]);
  const resolveAndAddToCart = useCallback(async rawCode => {
    const code = String(rawCode || '').trim();
    if (!code) return;
    if (!catalogReady) {
      Swal.fire({
        icon: 'warning',
        title: 'Still Loading',
        text: 'Catalog is still loading, try again in a moment.'
      });
      return;
    }
    const local = codeIndex.get(code.toLowerCase());
    if (local) {
      addToCart(local, 1);
      return;
    }
    const q = code.toLowerCase();
    const fuzzy = products.find(p => [p.name, p.sku, p.barcode].some(v => String(v || '').toLowerCase().includes(q)));
    if (fuzzy) {
      addToCart(fuzzy, 1);
      return;
    }
    const res = await fbFindProductByCode(code);
    if (!res.success) {
      Swal.fire({
        icon: 'error',
        title: 'Nuk u gjet',
        text: res.message || `Nuk ka artikull për "${code}"`
      });
      return;
    }
    addToCart(res.data, 1);
  }, [addToCart, catalogReady, codeIndex, products]);
  const handleScanSubmit = e => {
    e.preventDefault();
    const code = scanValue;
    setScanValue('');
    resolveAndAddToCart(code);
  };
  const handleDetected = decodedText => {
    setShowCamera(false);
    resolveAndAddToCart(decodedText);
  };
  const applyLineQuantities = (productId, paidDisplayValue, freeDisplayValue, nextUnitKey) => {
    setCart(prev => {
      const line = prev.find(l => l.productId === productId);
      if (!line) return prev;
      const product = prodById[productId];
      const unit = getProductUnit(product, nextUnitKey || line.unitKey || 'base');
      const paidDisplay = Math.max(0, Number(paidDisplayValue) || 0);
      const freeDisplay = Math.max(0, Number(freeDisplayValue) || 0);
      const paidQty = round2(paidDisplay * unit.multiplier);
      const freeQty = round2(freeDisplay * unit.multiplier);
      const totalQty = round2(paidQty + freeQty);
      if (totalQty <= 0) return prev.filter(l => l.productId !== productId);
      if (!capacityCheck(productId, line.name, totalQty)) return prev;
      return prev.map(l => {
        if (l.productId !== productId) return l;
        const sameUnit = (l.unitKey || 'base') === unit.value;
        const taxable = l.taxEnabled !== false;
        const keepPrice = sameUnit && !!l.priceEdited;
        const netUnitPrice = keepPrice ? Number(l.unitSalePrice || 0) : autoUnitNetPrice(product, unit.value, taxable);
        return {
          ...l,
          price: round2(netUnitPrice / unit.multiplier),
          unitSalePrice: round2(netUnitPrice),
          unitKey: unit.value,
          unitName: unit.name,
          unitMultiplier: unit.multiplier,
          displayQty: paidDisplay,
          freeDisplayQty: freeDisplay,
          paidQty,
          freeQty,
          qty: totalQty,
          taxEnabled: taxable,
          priceEdited: keepPrice,
          warehouse: l.warehouse || product.location || product.warehouse || 'Magazina Kryesore'
        };
      });
    });
  };
  const changeQty = (productId, delta) => {
    const line = cart.find(l => l.productId === productId);
    if (!line) return;
    applyLineQuantities(productId, round2(Number(line.displayQty || 0) + delta), Number(line.freeDisplayQty || 0), line.unitKey || 'base');
  };
  const changeDisplayQty = (productId, value) => {
    const line = cart.find(l => l.productId === productId);
    if (!line) return;
    applyLineQuantities(productId, value, Number(line.freeDisplayQty || 0), line.unitKey || 'base');
  };
  const changeFreeQty = (productId, value) => {
    const line = cart.find(l => l.productId === productId);
    if (!line) return;
    applyLineQuantities(productId, Number(line.displayQty || 0), value, line.unitKey || 'base');
  };
  const changeLineUnit = (productId, unitKey) => {
    const line = cart.find(l => l.productId === productId);
    if (!line) return;
    applyLineQuantities(productId, Number(line.displayQty || 0), Number(line.freeDisplayQty || 0), unitKey);
  };
  const changeLineWarehouse = (productId, warehouse) => {
    setCart(prev => prev.map(line => line.productId === productId ? {
      ...line,
      warehouse: warehouse || 'Magazina Kryesore'
    } : line));
  };
  const changeLinePrice = (productId, value) => {
    const unitPriceValue = Math.max(0, Number(value) || 0);
    setCart(prev => prev.map(line => {
      if (line.productId !== productId) return line;
      const product = prodById[productId] || {};
      const unit = getProductUnit(product, line.unitKey || 'base');
      return {
        ...line,
        unitSalePrice: round2(unitPriceValue),
        price: round2(unitPriceValue / unit.multiplier),
        priceEdited: true
      };
    }));
  };
  const changeLineNetValue = (productId, value) => {
    const lineValue = Math.max(0, Number(value) || 0);
    setCart(prev => prev.map(line => {
      if (line.productId !== productId) return line;
      const product = prodById[productId] || {};
      const unit = getProductUnit(product, line.unitKey || 'base');
      const paidDisplay = Math.max(0, Number(line.displayQty || 0));
      const unitSale = paidDisplay > 0 ? round2(lineValue / paidDisplay) : 0;
      return {
        ...line,
        unitSalePrice: unitSale,
        price: round2(unitSale / unit.multiplier),
        priceEdited: true
      };
    }));
  };
  const changeLineGrossValue = (productId, value) => {
    const grossValue = Math.max(0, Number(value) || 0);
    setCart(prev => prev.map(line => {
      if (line.productId !== productId) return line;
      const product = prodById[productId] || {};
      const unit = getProductUnit(product, line.unitKey || 'base');
      const paidDisplay = Math.max(0, Number(line.displayQty || 0));
      const taxable = line.taxEnabled !== false;
      const rate = taxable ? productTaxRate(product) : 0;
      const netValue = taxable && rate > 0 ? round2(grossValue / (1 + rate / 100)) : grossValue;
      const unitSale = paidDisplay > 0 ? round2(netValue / paidDisplay) : 0;
      return {
        ...line,
        unitSalePrice: unitSale,
        price: round2(unitSale / unit.multiplier),
        priceEdited: true
      };
    }));
  };
  const changeLineTax = (productId, enabled) => {
    setCart(prev => prev.map(line => {
      if (line.productId !== productId) return line;
      const product = prodById[productId] || {};
      const unit = getProductUnit(product, line.unitKey || 'base');
      const netUnitPrice = autoUnitNetPrice(product, unit.value, enabled);
      return {
        ...line,
        taxEnabled: !!enabled,
        unitSalePrice: netUnitPrice,
        price: round2(netUnitPrice / unit.multiplier),
        priceEdited: false
      };
    }));
  };
  const removeLine = productId => setCart(prev => prev.filter(l => l.productId !== productId));
  const totals = useMemo(() => computeSaleTotals(cart, prodById, {
    type: discountType,
    value: discountValue
  }), [cart, prodById, discountType, discountValue]);
  const itemCount = useMemo(() => cart.reduce((s, l) => s + (Number(l.qty) || 0), 0), [cart]);
  const changeDue = paymentMethod === 'Cash' ? Math.max(0, (Number(tendered) || 0) - totals.grand) : 0;
  const persistHeld = list => {
    setHeld(list);
    localStorage.setItem('pos_held', JSON.stringify(list));
  };
  const resetSale = () => {
    setCart([]);
    setCustomerId('');
    setDiscountValue('');
    setDiscountType('flat');
    setPaymentMethod('Cash');
    setTendered('');
  };
  const holdSale = () => {
    if (!cart.length) return;
    const cust = customers.find(c => c.id === customerId);
    const label = (cust ? cust.name : 'Walk-in') + ' · ' + cart.reduce((n, l) => n + l.qty, 0) + ' item(s) · ' + money(totals.grand);
    persistHeld([...held, {
      id: Date.now(),
      label,
      cart,
      customerId,
      discountType,
      discountValue,
      ts: nowIso()
    }]);
    resetSale();
    Swal.fire({
      icon: 'success',
      title: 'Held',
      text: 'Sale parked — recall it anytime.',
      timer: 1400,
      showConfirmButton: false
    });
  };
  const recallHeld = async () => {
    if (!held.length) {
      Swal.fire({
        icon: 'info',
        title: 'No held sales'
      });
      return;
    }
    const opts = {};
    held.forEach((h, i) => opts[i] = h.label);
    const {
      value
    } = await Swal.fire({
      title: 'Recall a held sale',
      input: 'select',
      inputOptions: opts,
      inputPlaceholder: 'Pick one',
      showCancelButton: true,
      confirmButtonText: 'Recall'
    });
    if (value == null) return;
    const h = held[Number(value)];
    if (!h) return;
    setCart(h.cart || []);
    setCustomerId(h.customerId || '');
    setDiscountType(h.discountType || 'flat');
    setDiscountValue(h.discountValue || '');
    persistHeld(held.filter((_, i) => i !== Number(value)));
  };
  const handleCheckout = async () => {
    if (cart.length === 0) return;
    if (paymentMethod === 'Cash' && (Number(tendered) || 0) < totals.grand) {
      const go = await Swal.fire({
        icon: 'warning',
        title: 'Short payment',
        text: `Tendered is less than ${money(totals.grand)}. Continue anyway?`,
        showCancelButton: true,
        confirmButtonText: 'Yes, continue'
      });
      if (!go.isConfirmed) return;
    }
    if (paymentMethod === 'Credit' && !customerId) {
      Swal.fire({
        icon: 'warning',
        title: 'Pick a customer',
        text: 'Credit sales must be tied to a customer.'
      });
      return;
    }
    setLoad('Processing sale...');
    const cust = customers.find(c => c.id === customerId);
    const sale = {
      items: totals.lines,
      subtotal: totals.subtotal,
      discount: totals.discount,
      discountType,
      tax: totals.tax,
      total: totals.grand,
      paymentMethod,
      amountTendered: paymentMethod === 'Cash' ? Number(tendered) || 0 : paymentMethod === 'Credit' ? 0 : totals.grand,
      changeDue: round2(changeDue),
      customerId: customerId || '',
      customerName: cust ? cust.name : 'Walk-in',
      status: paymentMethod === 'Credit' ? 'credit' : 'completed'
    };
    const res = await fbCreateSale(sale, user);
    setLoad('');
    if (res.success) {
      setCompletedSale(res.data);
      resetSale();
      setReloadKey(k => k + 1);
      Swal.fire({
        icon: 'success',
        title: 'Sale Complete',
        text: `${res.data.invoiceNo || ''} — ${money(res.data.total)}`,
        timer: 1800,
        showConfirmButton: false
      });
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Checkout Failed',
        text: res.message
      });
    }
  };
  return React.createElement("div", {
    className: "data-section"
  }, load && React.createElement(TopLoadingBar, null), React.createElement("div", {
    className: "section-header"
  }, React.createElement("h2", null, React.createElement("i", {
    className: "fas fa-cash-register"
  }), " POS / Shitje"), React.createElement("div", {
    className: "pos-scan-actions"
  }, React.createElement("button", {
    className: "btn btn-secondary",
    disabled: !catalogReady,
    onClick: () => setShowCamera(true)
  }, React.createElement("i", {
    className: "fas fa-camera"
  }), " Camera"), React.createElement("button", {
    className: "btn btn-secondary",
    onClick: recallHeld
  }, React.createElement("i", {
    className: "fas fa-clock-rotate-left"
  }), " Held", held.length ? ` (${held.length})` : ''))), React.createElement("form", {
    className: "pos-scan-box",
    onSubmit: handleScanSubmit
  }, React.createElement("div", {
    className: "form-group pos-product-search-wrap"
  }, React.createElement("label", null, React.createElement("i", {
    className: "fas fa-search"
  }), " Artikulli"), React.createElement("input", {
    ref: scanRef,
    type: "text",
    className: "pos-scan-input",
    autoFocus: true,
    disabled: !catalogReady,
    value: scanValue,
    onChange: e => setScanValue(e.target.value),
    autoComplete: "off",
    placeholder: catalogReady ? 'Shkruaj emrin, kodin ose barkodin...' : 'Duke ngarkuar artikujt...'
  }), productSuggestions.length > 0 && React.createElement("div", {
    className: "pos-product-suggestions"
  }, productSuggestions.map(p => React.createElement("button", {
    type: "button",
    key: p.id,
    className: "pos-product-suggestion",
    onMouseDown: e => {
      e.preventDefault();
      pickProductFromSearch(p);
    }
  }, React.createElement("span", null, React.createElement("span", {
    className: "pos-sg-name"
  }, p.name), React.createElement("span", {
    className: "pos-sg-meta"
  }, p.sku || '-', " ", p.barcode ? ' · ' + p.barcode : '', " \xB7 ", formatUnitStructure(p))), React.createElement("span", {
    className: "pos-sg-stock"
  }, formatQtyWithUnits(computeQtyOnHand(p.id, movements), p)))))), React.createElement("button", {
    type: "submit",
    className: "btn btn-primary",
    disabled: !catalogReady
  }, React.createElement("i", {
    className: "fas fa-plus"
  }), " Shto")), React.createElement("div", {
    className: "pos-grid"
  }, React.createElement("div", null, loadingProducts ? React.createElement(TableSkeleton, {
    rows: 4,
    columns: 4
  }) : React.createElement(Cart, {
    items: cart,
    products: products,
    onInc: id => changeQty(id, 1),
    onDec: id => changeQty(id, -1),
    onQtyChange: changeDisplayQty,
    onFreeChange: changeFreeQty,
    onPriceChange: changeLinePrice,
    onNetValueChange: changeLineNetValue,
    onGrossValueChange: changeLineGrossValue,
    onTaxChange: changeLineTax,
    onRemove: removeLine,
    onUnitChange: changeLineUnit,
    onWarehouseChange: changeLineWarehouse
  })), React.createElement("div", {
    className: "pos-summary"
  }, React.createElement(SearchableDropdown, {
    label: "Customer",
    icon: "fas fa-user",
    options: customerOpts,
    value: customerId,
    onChange: setCustomerId,
    placeholder: "Walk-in customer",
    creatable: true,
    createLabel: "Shto klient: {q}",
    onCreate: async q => {
      try {
        localStorage.setItem('erp_new_customer_name', q);
      } catch (e) {}
      nav.go('records', 'records');
      return false;
    }
  }), React.createElement("div", {
    className: "pos-disc-row"
  }, React.createElement(SearchableDropdown, {
    label: "Discount",
    icon: "fas fa-tags",
    options: DISCOUNT_TYPE_OPTS,
    value: discountType,
    onChange: setDiscountType,
    placeholder: "Amount"
  }), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Value"), React.createElement("input", {
    type: "number",
    min: "0",
    step: "0.01",
    placeholder: "0",
    value: discountValue,
    onChange: e => setDiscountValue(e.target.value)
  }))), React.createElement(SearchableDropdown, {
    label: "Payment",
    icon: "fas fa-money-bill-wave",
    options: payOpts,
    value: paymentMethod,
    onChange: setPaymentMethod,
    placeholder: "Cash",
    creatable: true,
    createLabel: "Shto m\xEBnyr\xEB pagese: {q}",
    onCreate: async q => {
      const res = await ieQuickAddSettingList('paymentMethods', q, user);
      if (!res.success) throw new Error(res.message || 'Dështoi');
      try {
        refreshConfig && refreshConfig();
      } catch (e) {}
      return {
        value: res.value,
        label: res.value
      };
    }
  }), paymentMethod === 'Cash' && React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Amount Tendered"), React.createElement("input", {
    type: "number",
    min: "0",
    step: "0.01",
    value: tendered,
    onChange: e => setTendered(e.target.value)
  })), React.createElement("div", {
    className: "pos-summary-row"
  }, React.createElement("span", null, "Items"), React.createElement("span", null, itemCount)), React.createElement("div", {
    className: "pos-summary-row"
  }, React.createElement("span", null, "Vlera pa TVSH"), React.createElement("span", null, money(totals.subtotal))), totals.discount > 0 && React.createElement("div", {
    className: "pos-summary-row"
  }, React.createElement("span", null, "Discount"), React.createElement("span", null, "- ", money(totals.discount))), totals.tax > 0 && React.createElement("div", {
    className: "pos-summary-row"
  }, React.createElement("span", null, "TVSH"), React.createElement("span", null, money(totals.tax))), React.createElement("div", {
    className: "pos-summary-row grand"
  }, React.createElement("span", null, "Vlera me TVSH"), React.createElement("span", null, money(totals.grand))), paymentMethod === 'Cash' && (Number(tendered) || 0) > 0 && React.createElement("div", {
    className: "pos-summary-row"
  }, React.createElement("span", null, "Change"), React.createElement("span", null, money(changeDue))), React.createElement("div", {
    className: "pos-checkout-actions"
  }, React.createElement("button", {
    className: "btn btn-secondary",
    disabled: cart.length === 0,
    onClick: holdSale
  }, React.createElement("i", {
    className: "fas fa-pause"
  }), " Hold"), React.createElement("button", {
    className: "btn btn-success",
    disabled: cart.length === 0,
    onClick: handleCheckout
  }, React.createElement("i", {
    className: "fas fa-check"
  }), " Checkout")))), showCamera && React.createElement(CameraScanModal, {
    onDetected: handleDetected,
    onClose: () => setShowCamera(false)
  }), completedSale && React.createElement(ThermalReceiptOverlay, {
    sale: completedSale,
    onClose: () => setCompletedSale(null)
  }));
}
function ReturnModal({
  sale,
  returns,
  user,
  onClose,
  onDone
}) {
  const already = useMemo(() => (sale.items || []).map(it => computeReturnedQty(sale.id, it.productId, returns)), [sale, returns]);
  const [qtys, setQtys] = useState(() => (sale.items || []).map(() => 0));
  const [saving, setSaving] = useState(false);
  const remaining = idx => sale.items[idx].qty - already[idx];
  const setQty = (idx, val) => {
    const max = remaining(idx);
    const v = Math.max(0, Math.min(max, Number(val) || 0));
    setQtys(prev => prev.map((q, i) => i === idx ? v : q));
  };
  const totalRefund = useMemo(() => qtys.reduce((s, q, i) => s + q * sale.items[i].price, 0), [qtys, sale.items]);
  const handleSubmit = async e => {
    e.preventDefault();
    const items = sale.items.map((it, i) => ({
      productId: it.productId,
      name: it.name,
      sku: it.sku,
      qty: qtys[i],
      price: it.price,
      lineTotal: qtys[i] * it.price
    })).filter(it => it.qty > 0);
    if (!items.length) return Swal.fire({
      icon: 'warning',
      title: 'Nothing Selected',
      text: 'Enter a return quantity for at least one item'
    });
    setSaving(true);
    const result = await fbCreateReturn(sale.id, items, user);
    setSaving(false);
    if (result.success) {
      Swal.fire({
        icon: 'success',
        title: 'Return Processed',
        text: 'Refund: ' + money(totalRefund),
        timer: 2000,
        showConfirmButton: false
      });
      onDone();
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: result.message
      });
    }
  };
  return React.createElement("div", {
    className: "modal-overlay",
    onClick: onClose
  }, React.createElement("div", {
    className: "modal",
    onClick: e => e.stopPropagation()
  }, React.createElement("div", {
    className: "modal-header"
  }, React.createElement("h3", null, React.createElement("i", {
    className: "fas fa-rotate-left"
  }), " Process Return - Sale ", String(sale.id).slice(-6).toUpperCase()), React.createElement("button", {
    className: "close-btn",
    onClick: onClose
  }, React.createElement("i", {
    className: "fas fa-times"
  }))), React.createElement("div", {
    className: "modal-body"
  }, React.createElement("form", {
    onSubmit: handleSubmit
  }, React.createElement("div", {
    className: "about-table-wrapper"
  }, React.createElement("table", {
    className: "about-roles-table"
  }, React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", null, "Item"), React.createElement("th", null, "Sold"), React.createElement("th", null, "Already Returned"), React.createElement("th", null, "Return Qty"), React.createElement("th", null, "Refund"))), React.createElement("tbody", null, sale.items.map((it, i) => React.createElement("tr", {
    key: it.sku || i
  }, React.createElement("td", null, it.name), React.createElement("td", null, it.qty), React.createElement("td", null, already[i]), React.createElement("td", null, React.createElement("input", {
    type: "number",
    min: "0",
    max: remaining(i),
    value: qtys[i],
    onChange: e => setQty(i, e.target.value),
    style: {
      width: '80px'
    }
  })), React.createElement("td", null, money(qtys[i] * it.price))))))), React.createElement("p", {
    className: "stock-onhand-hint",
    style: {
      marginTop: '16px'
    }
  }, "Total Refund: ", React.createElement("strong", null, money(totalRefund))), React.createElement("div", {
    className: "form-actions"
  }, React.createElement("button", {
    type: "submit",
    className: "btn btn-danger",
    disabled: saving
  }, saving ? React.createElement(React.Fragment, null, React.createElement("i", {
    className: "fas fa-spinner fa-spin"
  }), " Processing...") : React.createElement(React.Fragment, null, React.createElement("i", {
    className: "fas fa-rotate-left"
  }), " Process Return")), React.createElement("button", {
    type: "button",
    className: "btn btn-secondary",
    onClick: onClose
  }, React.createElement("i", {
    className: "fas fa-times"
  }), " Anulo"))))));
}
function SaleFormView({
  sale,
  onClose,
  onPrint
}) {
  if (!sale) return null;
  const stages = [{
    id: 'draft',
    label: 'Draft'
  }, {
    id: 'confirmed',
    label: 'Confirmed'
  }, {
    id: 'paid',
    label: 'Paid'
  }, {
    id: 'credit',
    label: 'Credit'
  }, {
    id: 'returned',
    label: 'Returned'
  }];
  const hasReturn = Number(sale.returnedTotal || 0) > 0;
  const state = hasReturn ? 'returned' : sale.status === 'credit' ? 'credit' : sale.paymentMethod === 'Credit' ? 'credit' : 'paid';
  const items = sale.items || [];
  return React.createElement(OdooFormOverlay, {
    breadcrumb: "Shitjet",
    title: sale.invoiceNo || String(sale.id).slice(-6).toUpperCase(),
    onClose: onClose,
    buttons: React.createElement(React.Fragment, null, React.createElement("button", {
      type: "button",
      className: "btn btn-primary",
      onClick: () => openSaleDocument(sale, 'thermal', true)
    }, React.createElement("i", {
      className: "fas fa-print"
    }), " Termik"), React.createElement("button", {
      type: "button",
      className: "btn btn-primary",
      onClick: () => openSaleDocument(sale, 'a4', true)
    }, React.createElement("i", {
      className: "fas fa-file-invoice"
    }), " A4"), React.createElement("button", {
      type: "button",
      className: "btn btn-secondary",
      onClick: () => openSaleDocument(sale, 'a4', false)
    }, React.createElement("i", {
      className: "fas fa-eye"
    }), " Preview"), React.createElement("button", {
      type: "button",
      className: "btn btn-secondary",
      onClick: () => exportSalePdf(sale)
    }, React.createElement("i", {
      className: "fas fa-file-pdf"
    }), " PDF"), React.createElement("button", {
      type: "button",
      className: "btn btn-secondary",
      onClick: () => exportSaleXlsx(sale)
    }, React.createElement("i", {
      className: "fas fa-file-excel"
    }), " Excel"))
  }, React.createElement(OdooFormSheet, {
    title: sale.invoiceNo || 'FAT-' + String(sale.id).slice(-6).toUpperCase(),
    statusbar: React.createElement("div", {
      style: {
        maxWidth: 1100,
        margin: '0 auto 12px'
      }
    }, React.createElement("div", {
      className: "o-statusbar"
    }, stages.map((s, i) => {
      const idx = Math.max(0, stages.findIndex(x => x.id === state));
      let cls = 'o-arrow';
      if (s.id === state) cls += ' active';else if (i < idx) cls += ' done';
      const clickable = s.id === 'paid' || s.id === 'credit';
      return React.createElement("span", {
        key: s.id,
        className: cls,
        style: {
          cursor: clickable ? 'pointer' : 'default'
        },
        onClick: async () => {
          if (!clickable || s.id === state) return;
          const patch = s.id === 'credit' ? {
            status: 'credit',
            paymentMethod: 'Credit'
          } : {
            status: 'completed',
            paymentMethod: sale.paymentMethod === 'Credit' ? 'Cash' : sale.paymentMethod || 'Cash'
          };
          const r = await fbUpdateSale(sale.id, patch, null);
          if (r.success) {
            Swal.fire({
              icon: 'success',
              title: 'U përditësua',
              timer: 1000,
              showConfirmButton: false
            });
            onClose();
            try {
              window.dispatchEvent(new CustomEvent('erp-data-changed', {
                detail: {
                  tableId: 'salesTable'
                }
              }));
            } catch (e) {}
          } else Swal.fire({
            icon: 'error',
            text: r.message
          });
        }
      }, s.label);
    })), React.createElement("div", {
      className: "o-multi-edit-hint",
      style: {
        textAlign: 'right'
      }
    }, "Kliko Paid/Credit p\xEBr t\xEB ndryshuar statusin \xB7 ose p\xEBrdor Kanban drag"))
  }, React.createElement("div", {
    className: "o-form-group"
  }, React.createElement("div", null, React.createElement(OdooFormField, {
    label: "Klienti",
    value: sale.customerName || 'Walk-in'
  }), React.createElement(OdooFormField, {
    label: "Data",
    value: formatDateForDisplay(sale.createdAt)
  }), React.createElement(OdooFormField, {
    label: "Ark\xEBtari",
    value: sale.cashier || '—'
  }), React.createElement(OdooFormField, {
    label: "Pagesa",
    value: sale.paymentMethod || '—'
  })), React.createElement("div", null, React.createElement(OdooFormField, {
    label: "N\xEBntotali",
    value: money(sale.subtotal || 0)
  }), React.createElement(OdooFormField, {
    label: "Zbritje",
    value: money(sale.discount || 0)
  }), React.createElement(OdooFormField, {
    label: "TVSH",
    value: money(sale.tax || 0)
  }), React.createElement(OdooFormField, {
    label: "Totali",
    value: money(sale.total || 0)
  }))), React.createElement("div", {
    className: "o-form-section-title"
  }, "Artikujt e fatur\xEBs"), React.createElement("table", {
    className: "o-form-table"
  }, React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", null, "Artikulli"), React.createElement("th", null, "Sasia"), React.createElement("th", null, "Nj\xEBsia"), React.createElement("th", null, "\xC7mimi"), React.createElement("th", null, "TVSH %"), React.createElement("th", null, "Vlera"))), React.createElement("tbody", null, items.length === 0 && React.createElement("tr", null, React.createElement("td", {
    colSpan: "6",
    style: {
      color: '#999',
      textAlign: 'center'
    }
  }, "Nuk ka rreshta")), items.map((it, i) => React.createElement("tr", {
    key: i
  }, React.createElement("td", null, it.name, React.createElement("div", {
    className: "cell-sub"
  }, it.sku || '')), React.createElement("td", null, it.displayQty != null ? it.displayQty : it.qty), React.createElement("td", null, it.unitName || 'copë'), React.createElement("td", null, money(it.unitSalePrice != null ? it.unitSalePrice : it.price)), React.createElement("td", null, it.taxRate != null ? it.taxRate : '—'), React.createElement("td", null, money(it.lineTotal != null ? it.lineTotal : it.lineNet))))), React.createElement("tfoot", null, React.createElement("tr", null, React.createElement("td", {
    colSpan: "5"
  }, "TOTAL"), React.createElement("td", null, money(sale.total || 0)))))));
}
function SalesHistoryView({
  user,
  role
}) {
  const [qSearch, setQSearch] = useState('');
  const [viewMode, setViewMode] = useState('list');
  const [facetPay, setFacetPay] = useState('');
  const [facetStatus, setFacetStatus] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [returnSaleId, setReturnSaleId] = useState(null);
  const [viewSale, setViewSale] = useState(null);
  const [printSale, setPrintSale] = useState(null);
  const tableInstanceRef = useRef(null);
  useDtLiveSearch(tableInstanceRef, qSearch);
  useEffect(() => {
    const fn = e => {
      if (!e.detail || e.detail.tableId === 'salesTable') setReloadKey(k => k + 1);
    };
    window.addEventListener('erp-data-changed', fn);
    return () => window.removeEventListener('erp-data-changed', fn);
  }, []);
  const {
    loading,
    data,
    err
  } = useFetch(() => Promise.all([fbGetSales(), fbGetReturns()]), [reloadKey]);
  const sales = useMemo(() => data && data[0] && data[0].success ? data[0].data : [], [data]);
  const returns = useMemo(() => data && data[1] && data[1].success ? data[1].data : [], [data]);
  const reload = () => setReloadKey(k => k + 1);
  const byId = useMemo(() => sales.reduce((m, s) => (m[s.id] = s, m), {}), [sales]);
  const payMethods = useMemo(() => [...new Set(sales.map(s => s.paymentMethod).filter(Boolean))], [sales]);
  const facets = useMemo(() => {
    const f = [];
    if (facetPay) f.push({
      id: 'pay',
      label: 'Pagesa',
      value: facetPay
    });
    if (facetStatus) f.push({
      id: 'status',
      label: 'Statusi',
      value: facetStatus === 'credit' ? 'Kredi' : facetStatus
    });
    if (qSearch) f.push({
      id: 'q',
      label: 'Kërkim',
      value: qSearch
    });
    return f;
  }, [facetPay, facetStatus, qSearch]);
  const filterChips = useMemo(() => {
    const chips = [{
      id: 'credit',
      label: 'Kredi e hapur',
      active: facetStatus === 'credit'
    }, {
      id: 'returned',
      label: 'Me kthim',
      active: facetStatus === 'returned'
    }];
    payMethods.slice(0, 6).forEach(p => chips.push({
      id: 'pay:' + p,
      label: p,
      active: facetPay === p
    }));
    return chips;
  }, [payMethods, facetPay, facetStatus]);
  const onToggleChip = c => {
    if (c.id === 'credit') setFacetStatus(facetStatus === 'credit' ? '' : 'credit');else if (c.id === 'returned') setFacetStatus(facetStatus === 'returned' ? '' : 'returned');else if (String(c.id).startsWith('pay:')) {
      const p = String(c.id).slice(4);
      setFacetPay(facetPay === p ? '' : p);
    }
  };
  const onRemoveFacet = f => {
    if (f.id === 'pay') setFacetPay('');else if (f.id === 'status') setFacetStatus('');else if (f.id === 'q') setQSearch('');
  };
  const filteredSales = useMemo(() => {
    return sales.filter(s => {
      if (facetPay && s.paymentMethod !== facetPay) return false;
      if (facetStatus === 'credit' && s.status !== 'credit' && s.paymentMethod !== 'Credit') return false;
      if (facetStatus === 'returned') {}
      if (qSearch) {
        const q = qSearch.toLowerCase();
        const blob = [s.invoiceNo, s.customerName, s.cashier, s.paymentMethod, s.status].join(' ').toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [sales, facetPay, facetStatus, qSearch]);
  const tableData = useMemo(() => sales.map(s => {
    const itemCount = (s.items || []).reduce((n, it) => n + it.qty, 0);
    const cogs = (s.items || []).reduce((c, it) => c + (Number(it.cost) || 0) * it.qty, 0);
    const profit = round2(Number(s.subtotal != null ? s.subtotal : s.total || 0) - Number(s.discount || 0) - cogs);
    const returnedTotal = returns.filter(r => r.saleId === s.id).reduce((sum, r) => sum + Number(r.totalRefund || 0), 0);
    return Object.assign({}, s, {
      itemCount,
      profit,
      returnedTotal
    });
  }), [sales, returns]);
  const summary = useMemo(() => ({
    count: sales.length,
    total: tableData.reduce((s, r) => s + Number(r.total || 0), 0),
    profit: tableData.reduce((s, r) => s + Number(r.profit || 0), 0),
    returned: tableData.reduce((s, r) => s + Number(r.returnedTotal || 0), 0)
  }), [tableData, sales.length]);
  useEffect(() => {
    if (err || data && data[0] && !data[0].success) Swal.fire({
      icon: 'error',
      title: 'Error',
      text: data && data[0] && data[0].message || 'Failed to load sales'
    });
  }, [err, data]);
  const displaySales = useMemo(() => {
    return (tableData || []).filter(s => {
      if (facetPay && s.paymentMethod !== facetPay) return false;
      if (facetStatus === 'credit' && !(s.status === 'credit' || s.paymentMethod === 'Credit')) return false;
      if (facetStatus === 'returned' && !(Number(s.returnedTotal) > 0)) return false;
      return true;
    });
  }, [tableData, facetPay, facetStatus]);
  useEffect(() => {
    if (loading) return;
    if (viewMode !== 'list') {
      if (tableInstanceRef.current) {
        try {
          tableInstanceRef.current.destroy();
        } catch (e) {}
        tableInstanceRef.current = null;
      }
      return;
    }
    if (!document.getElementById('salesTable')) return;
    if (tableInstanceRef.current) {
      try {
        if (!document.contains(tableInstanceRef.current.table().node())) {
          tableInstanceRef.current.destroy();
          tableInstanceRef.current = null;
        }
      } catch (e) {
        tableInstanceRef.current = null;
      }
    }
    let table = tableInstanceRef.current;
    if (table) {
      table.clear().rows.add(displaySales).draw(false);
    } else {
      table = $('#salesTable').DataTable({
        data: displaySales,
        columnDefs: [{
          targets: '_all',
          defaultContent: ''
        }],
        createdRow: (row, d) => {
          if (d.status === 'credit') $(row).addClass('row-danger');else if (Number(d.returnedTotal) > 0) $(row).addClass('row-warn');
        },
        columns: [{
          data: 'invoiceNo',
          title: 'Fatura',
          render: (d, t, row) => t === 'display' ? docLinkHtml('view', row.id, d || String(row.id).slice(-6).toUpperCase()) : d || row.id
        }, {
          data: 'createdAt',
          title: 'Data',
          render: (d, t) => t === 'display' ? formatDateForDisplay(d) : d
        }, {
          data: 'customerName',
          title: 'Klienti',
          render: (d, t) => t === 'display' ? esc(d || 'Walk-in') : d
        }, {
          data: 'cashier',
          title: 'Arkëtari',
          render: (d, t) => t === 'display' ? esc(d || '') : d
        }, {
          data: 'itemCount',
          title: 'Artikuj'
        }, {
          data: 'total',
          title: 'Totali',
          render: (d, t) => t === 'display' ? money(d) : d
        }, {
          data: 'paymentMethod',
          title: 'Pagesa',
          render: (d, t) => t === 'display' ? d ? '<span class="type-chip">' + esc(d) + '</span>' : '-' : d || ''
        }, {
          data: 'profit',
          title: 'Fitimi',
          render: (d, t) => t === 'display' ? `<span style="color:${Number(d) >= 0 ? '#155724' : '#721c24'};font-weight:600">${money(d)}</span>` : d
        }, {
          data: 'returnedTotal',
          title: 'Kthyer',
          render: (d, t) => t === 'display' ? d > 0 ? '<span class="status-badge status-inactive">' + money(d) + '</span>' : '-' : d
        }, {
          data: null,
          title: 'Veprime',
          orderable: false,
          render: () => actionBtn('view', 'fa-receipt', 'Shiko') + (role === 'Admin' ? actionBtn('return', 'fa-rotate-left', 'Kthim', 'qr') : '')
        }],
        pageLength: 80,
        lengthMenu: [[10, 25, 50, -1], [10, 25, 50, 'All']],
        responsive: true,
        dom: 'Blfrtip',
        buttons: erpDtButtons('Historiku_Shitjeve'),
        order: [[1, 'desc']]
      });
      tableInstanceRef.current = table;
    }
    $('#salesTable').off('click', '[data-action]').on('click', '[data-action]', function () {
      const rowData = getDtRowData(table, this);
      if (!rowData || !rowData.id) return;
      const id = rowData.id;
      const action = $(this).data('action');
      if (action === 'view') setViewSale(byId[id] || rowData);else if (action === 'return') setReturnSaleId(id);
    });
  }, [loading, displaySales, role, facetPay, facetStatus, viewMode]);
  useEffect(() => () => {
    if (tableInstanceRef.current) {
      try {
        tableInstanceRef.current.destroy();
        tableInstanceRef.current = null;
      } catch (e) {}
    }
  }, []);
  const onSaleKanbanDrop = async (cardId, fromCol, toCol, card) => {
    if (!cardId || fromCol === toCol) return;
    if (toCol === 'returned') {
      Swal.fire({
        icon: 'info',
        title: 'Kthimi',
        text: 'Për kthim përdor butonin Kthim te listë/formë. Drag te "Kthyer" nuk krijon kthim automatik.'
      });
      return;
    }
    const patch = {};
    if (toCol === 'credit') {
      patch.status = 'credit';
      patch.paymentMethod = 'Credit';
    } else if (toCol === 'paid') {
      patch.status = 'completed';
      if ((card && card.record && card.record.paymentMethod) === 'Credit') patch.paymentMethod = 'Cash';
    } else return;
    const r = await fbUpdateSale(cardId, patch, user);
    if (r.success) {
      Swal.fire({
        icon: 'success',
        title: 'Statusi u ndryshua',
        text: r.message,
        timer: 1200,
        showConfirmButton: false
      });
      reload();
    } else Swal.fire({
      icon: 'error',
      title: 'Gabim',
      text: r.message
    });
  };
  const kanbanColumns = useMemo(() => {
    const groups = [{
      id: 'paid',
      title: 'Paguar',
      match: s => s.status !== 'credit' && s.paymentMethod !== 'Credit' && !(Number(s.returnedTotal) > 0)
    }, {
      id: 'credit',
      title: 'Kredi',
      match: s => s.status === 'credit' || s.paymentMethod === 'Credit'
    }, {
      id: 'returned',
      title: 'Kthyer',
      match: s => Number(s.returnedTotal) > 0
    }, {
      id: 'other',
      title: 'Të tjera',
      match: s => false
    }];
    const src = (tableData || []).filter(s => {
      if (facetPay && s.paymentMethod !== facetPay) return false;
      if (facetStatus === 'credit' && !(s.status === 'credit' || s.paymentMethod === 'Credit')) return false;
      if (facetStatus === 'returned' && !(Number(s.returnedTotal) > 0)) return false;
      if (qSearch) {
        const q = qSearch.toLowerCase();
        const blob = [s.invoiceNo, s.customerName, s.cashier, s.paymentMethod, s.status].join(' ').toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
    const used = new Set();
    return groups.map(g => {
      const cards = src.filter(s => {
        if (g.id === 'other') return !used.has(s.id);
        const ok = g.match(s);
        if (ok) used.add(s.id);
        return ok;
      }).map(s => ({
        id: s.id,
        title: s.invoiceNo || String(s.id).slice(-6).toUpperCase(),
        sub: s.customerName || 'Walk-in',
        meta: formatDateForDisplay(s.createdAt),
        amount: money(s.total),
        footer: s.paymentMethod || '',
        tags: [s.status === 'credit' ? 'Kredi' : null, Number(s.returnedTotal) > 0 ? 'Kthim' : null].filter(Boolean),
        record: s,
        onClick: () => setViewSale(byId[s.id] || s)
      }));
      return {
        id: g.id,
        title: g.title,
        cards
      };
    }).filter(c => c.id !== 'other' || c.cards.length);
  }, [tableData, facetPay, facetStatus, qSearch, byId]);
  return React.createElement("div", {
    className: "data-section"
  }, React.createElement("div", {
    className: "section-header"
  }, React.createElement("h2", null, React.createElement("i", {
    className: "fas fa-receipt"
  }), " Porosit\xEB"), React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center'
    }
  }, React.createElement(OdooViewSwitcher, {
    mode: viewMode,
    onChange: setViewMode
  }), React.createElement(RefreshBtn, {
    onClick: reload
  }))), React.createElement("div", {
    className: "o-cp-tools"
  }, React.createElement(OdooSearchFacets, {
    value: qSearch,
    onChange: setQSearch,
    placeholder: "K\xEBrko fatur\xEB, klient, ark\xEBtar, pages\xEB\u2026",
    facets: facets,
    onRemoveFacet: onRemoveFacet,
    filterChips: filterChips,
    onToggleChip: onToggleChip
  })), loading && React.createElement(TableSkeleton, {
    rows: 8,
    columns: 10
  }), React.createElement("div", {
    style: {
      display: loading ? 'none' : 'block'
    }
  }, React.createElement("div", {
    style: {
      display: viewMode === 'list' ? 'block' : 'none'
    }
  }, React.createElement("table", {
    id: "salesTable",
    className: "display",
    style: {
      width: '100%'
    }
  }), React.createElement(FilteredSummaryBar, {
    tableRef: tableInstanceRef,
    deps: [tableData, qSearch, facetPay, facetStatus],
    itemsBuilder: rows => [{
      label: 'Shitje (filtruar)',
      value: rows.length
    }, {
      label: 'Totali (filtruar)',
      value: money(rows.reduce((s, r) => s + Number(r.total || 0), 0))
    }, {
      label: 'Fitimi (filtruar)',
      value: money(rows.reduce((s, r) => s + Number(r.profit || 0), 0))
    }]
  })), viewMode === 'kanban' && React.createElement(OdooKanban, {
    columns: kanbanColumns,
    onDropCard: onSaleKanbanDrop
  }), sales.length > 0 && viewMode === 'list' && React.createElement(SummaryBar, {
    items: [{
      label: 'Sales',
      value: summary.count
    }, {
      label: 'Total',
      value: money(summary.total)
    }, {
      label: 'Profit',
      value: money(summary.profit)
    }, {
      label: 'Returned',
      value: money(summary.returned)
    }]
  })), viewSale && React.createElement(SaleFormView, {
    sale: viewSale,
    onClose: () => setViewSale(null),
    onPrint: s => setPrintSale(s)
  }), printSale && React.createElement(ThermalReceiptOverlay, {
    sale: printSale,
    onClose: () => setPrintSale(null)
  }), returnSaleId && React.createElement(ReturnModal, {
    sale: byId[returnSaleId],
    returns: returns,
    user: user,
    onClose: () => setReturnSaleId(null),
    onDone: () => {
      setReturnSaleId(null);
      reload();
    }
  }));
}
function DashboardView({
  user,
  role,
  setActiveMenu
}) {
  const {
    loading,
    data
  } = useFetch(() => Promise.all([fbGetSales(), fbGetProducts(), fbGetStockMovements(), fbGetExpenses()]), []);
  const sales = useMemo(() => data && data[0] && data[0].success ? data[0].data : [], [data]);
  const products = useMemo(() => data && data[1] && data[1].success ? data[1].data : [], [data]);
  const movements = useMemo(() => data && data[2] && data[2].success ? data[2].data : [], [data]);
  const expenses = useMemo(() => data && data[3] && data[3].success ? data[3].data : [], [data]);
  const barRef = useRef(null),
    payRef = useRef(null);
  const barChart = useRef(null),
    payChart = useRef(null);
  const ymd = d => {
    try {
      return new Date(d).toISOString().slice(0, 10);
    } catch (e) {
      return '';
    }
  };
  const today = new Date().toISOString().slice(0, 10);
  const s = useMemo(() => {
    const todaySales = sales.filter(x => ymd(x.createdAt) === today);
    const lowStock = products.filter(p => computeQtyOnHand(p.id, movements) <= Number(p.reorderLevel || 0));
    const month = today.slice(0, 7);
    const monthRevenue = sales.filter(x => ymd(x.createdAt).slice(0, 7) === month).reduce((a, x) => a + Number(x.total || 0), 0);
    const monthExpenses = expenses.filter(e => (e.date || ymd(e.createdAt)).slice(0, 7) === month).reduce((a, e) => a + Number(e.amount || 0), 0);
    return {
      todayRevenue: todaySales.reduce((a, x) => a + Number(x.total || 0), 0),
      todayOrders: todaySales.length,
      lowStock,
      creditOutstanding: sales.filter(x => x.status === 'credit').reduce((a, x) => a + Number(x.total || 0), 0),
      stockValue: products.reduce((a, p) => a + computeQtyOnHand(p.id, movements) * (Number(p.cost) || 0), 0),
      monthRevenue,
      monthExpenses
    };
  }, [sales, products, movements, expenses, today]);
  const recentSales = useMemo(() => [...sales].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6), [sales]);
  useEffect(() => {
    if (loading) return;
    const days = [...Array(7)].map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d;
    });
    const labels = days.map(d => d.toLocaleDateString('en-US', {
      weekday: 'short'
    }));
    const revByDay = days.map(d => {
      const k = d.toISOString().slice(0, 10);
      return sales.filter(x => ymd(x.createdAt) === k).reduce((a, x) => a + Number(x.total || 0), 0);
    });
    const byPay = sales.reduce((m, x) => {
      const k = x.paymentMethod || 'Other';
      m[k] = (m[k] || 0) + Number(x.total || 0);
      return m;
    }, {});
    if (barChart.current) barChart.current.destroy();
    if (barRef.current) barChart.current = new Chart(barRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Revenue',
          data: revByDay,
          backgroundColor: 'rgba(113,75,103,0.75)',
          borderColor: '#714B67',
          borderWidth: 2,
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
    if (payChart.current) payChart.current.destroy();
    if (payRef.current) payChart.current = new Chart(payRef.current, {
      type: 'doughnut',
      data: {
        labels: Object.keys(byPay),
        datasets: [{
          data: Object.values(byPay),
          backgroundColor: ['#714B67', '#017e84', '#28a745', '#f0ad4e', '#d9534f', '#5c6bc0'],
          borderColor: '#fff',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: {
            position: 'bottom'
          }
        }
      }
    });
    return () => {
      if (barChart.current) barChart.current.destroy();
      if (payChart.current) payChart.current.destroy();
    };
  }, [loading, sales]);
  if (loading) return React.createElement("div", {
    className: "o-home"
  }, React.createElement("div", {
    className: "lte-kpi-grid"
  }, [...Array(4)].map((_, i) => React.createElement(DashboardCardSkeleton, {
    key: i
  }))));
  const homeApps = ODOO_APPS.filter(a => a.id !== 'dashboard' && a.id !== 'about' && (!a.admin || role === 'Admin')).slice(0, 10);
  return React.createElement("div", {
    className: "o-home"
  }, React.createElement("div", {
    className: "o-home-header"
  }, React.createElement("div", null, React.createElement("h1", null, "Mir\xEB se vini", user?.name ? ', ' + user.name : ''), React.createElement("p", null, "Odoo-style ERP \xB7 Paneli i kontrollit \xB7 ", new Date().toLocaleDateString('sq-AL', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }))), React.createElement("div", {
    className: "quick-actions",
    style: {
      padding: 0,
      margin: 0
    }
  }, React.createElement("button", {
    className: "btn btn-success",
    onClick: () => setActiveMenu('pos')
  }, React.createElement("i", {
    className: "fas fa-plus"
  }), " Shitje e re"), React.createElement("button", {
    className: "btn btn-primary",
    onClick: () => setActiveMenu('products')
  }, React.createElement("i", {
    className: "fas fa-box"
  }), " Produkt"), React.createElement("button", {
    className: "btn btn-secondary",
    onClick: () => setActiveMenu('purchase-orders')
  }, React.createElement("i", {
    className: "fas fa-bag-shopping"
  }), " Porosi blerje"))), React.createElement("div", {
    className: "o-apps-grid"
  }, homeApps.map(a => React.createElement("div", {
    key: a.id,
    className: "o-app-tile",
    onClick: () => setActiveMenu(a.id)
  }, React.createElement("div", {
    className: "o-app-icon",
    style: {
      background: a.color
    }
  }, React.createElement("i", {
    className: `fas ${a.icon}`
  })), React.createElement("div", {
    className: "o-app-name"
  }, a.label), React.createElement("div", {
    className: "o-app-sub"
  }, a.sub)))), React.createElement("div", {
    className: "lte-kpi-grid"
  }, React.createElement(SmallBox, {
    value: money(s.todayRevenue),
    label: "Today's Sales",
    icon: "fa-sack-dollar",
    color: "bg-success",
    onMore: () => setActiveMenu('sales-history')
  }), React.createElement(SmallBox, {
    value: s.todayOrders,
    label: "Today's Orders",
    icon: "fa-receipt",
    color: "bg-navy",
    onMore: () => setActiveMenu('sales-history')
  }), React.createElement(SmallBox, {
    value: s.lowStock.length,
    label: "Low Stock Items",
    icon: "fa-triangle-exclamation",
    color: "bg-warning",
    onMore: () => setActiveMenu('products')
  }), React.createElement(SmallBox, {
    value: money(s.creditOutstanding),
    label: "Credit Outstanding",
    icon: "fa-hand-holding-dollar",
    color: "bg-danger",
    onMore: () => setActiveMenu('sales-history')
  })), React.createElement("div", {
    className: "lte-kpi-grid"
  }, React.createElement("div", {
    className: "info-box"
  }, React.createElement("div", {
    className: "info-box-icon bg-navy"
  }, React.createElement("i", {
    className: "fas fa-warehouse"
  })), React.createElement("div", {
    className: "info-box-content"
  }, React.createElement("div", {
    className: "info-box-text"
  }, "Stock Value"), React.createElement("div", {
    className: "info-box-number"
  }, money(s.stockValue)))), React.createElement("div", {
    className: "info-box"
  }, React.createElement("div", {
    className: "info-box-icon bg-success"
  }, React.createElement("i", {
    className: "fas fa-arrow-trend-up"
  })), React.createElement("div", {
    className: "info-box-content"
  }, React.createElement("div", {
    className: "info-box-text"
  }, "Month Revenue"), React.createElement("div", {
    className: "info-box-number"
  }, money(s.monthRevenue)))), React.createElement("div", {
    className: "info-box"
  }, React.createElement("div", {
    className: "info-box-icon bg-danger"
  }, React.createElement("i", {
    className: "fas fa-arrow-trend-down"
  })), React.createElement("div", {
    className: "info-box-content"
  }, React.createElement("div", {
    className: "info-box-text"
  }, "Month Expenses"), React.createElement("div", {
    className: "info-box-number"
  }, money(s.monthExpenses)))), React.createElement("div", {
    className: "info-box"
  }, React.createElement("div", {
    className: "info-box-icon bg-info"
  }, React.createElement("i", {
    className: "fas fa-scale-balanced"
  })), React.createElement("div", {
    className: "info-box-content"
  }, React.createElement("div", {
    className: "info-box-text"
  }, "Month Net"), React.createElement("div", {
    className: "info-box-number"
  }, money(s.monthRevenue - s.monthExpenses))))), React.createElement("div", {
    className: "dashboard-grid-2"
  }, React.createElement(LteCard, {
    title: "Revenue \u2014 Last 7 Days",
    icon: "fa-chart-column"
  }, React.createElement("div", {
    className: "chart-container"
  }, React.createElement("canvas", {
    ref: barRef
  }))), React.createElement(LteCard, {
    title: "Sales by Payment Method",
    icon: "fa-chart-pie"
  }, React.createElement("div", {
    className: "chart-container"
  }, React.createElement("canvas", {
    ref: payRef
  })))), React.createElement("div", {
    className: "dashboard-grid-2"
  }, React.createElement(LteCard, {
    title: "Recent Sales",
    icon: "fa-receipt"
  }, recentSales.length === 0 ? React.createElement("p", {
    style: {
      color: '#999'
    }
  }, "No sales yet.") : React.createElement("div", {
    className: "about-table-wrapper"
  }, React.createElement("table", {
    className: "about-roles-table"
  }, React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", null, "Invoice"), React.createElement("th", null, "Customer"), React.createElement("th", null, "Total"), React.createElement("th", null, "When"))), React.createElement("tbody", null, recentSales.map(x => React.createElement("tr", {
    key: x.id
  }, React.createElement("td", null, x.invoiceNo || String(x.id).slice(-6).toUpperCase()), React.createElement("td", null, x.customerName || 'Walk-in'), React.createElement("td", null, money(x.total)), React.createElement("td", null, getTimeAgo(x.createdAt)))))))), React.createElement(LteCard, {
    title: "Low Stock Alerts",
    icon: "fa-triangle-exclamation"
  }, s.lowStock.length === 0 ? React.createElement("p", {
    style: {
      color: '#999'
    }
  }, "All stock levels healthy.") : React.createElement("div", {
    className: "about-table-wrapper"
  }, React.createElement("table", {
    className: "about-roles-table"
  }, React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", null, "Product"), React.createElement("th", null, "SKU"), React.createElement("th", null, "On Hand"), React.createElement("th", null, "Reorder"))), React.createElement("tbody", null, s.lowStock.slice(0, 8).map(p => React.createElement("tr", {
    key: p.id
  }, React.createElement("td", null, p.name), React.createElement("td", null, React.createElement("code", null, p.sku)), React.createElement("td", null, React.createElement("span", {
    className: "status-badge status-inactive"
  }, computeQtyOnHand(p.id, movements))), React.createElement("td", null, p.reorderLevel || 0)))))))));
}
function reportDateOnly(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('sq-AL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}
function reportInRange(iso, from, to) {
  if (!iso) return true;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return true;
  if (from && d < new Date(from + 'T00:00:00')) return false;
  if (to && d > new Date(to + 'T23:59:59')) return false;
  return true;
}
function reportMatch(q) {
  const raw = String(q || '').trim().toLowerCase();
  const vals = Array.prototype.slice.call(arguments, 1);
  if (!raw) return true;
  const hay = vals.map(function (v) {
    return String(v == null ? '' : v).toLowerCase();
  }).join(' ');
  const tokens = raw.split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  return tokens.every(function (t) {
    return hay.indexOf(t) !== -1;
  });
}
function reportActiveFilters(filters, maps) {
  maps = maps || {};
  const f = filters || {};
  const out = {};
  if (f.from) out['Nga data'] = f.from;
  if (f.to) out['Deri më'] = f.to;
  if (f.q && String(f.q).trim()) out['Kërkim'] = String(f.q).trim();
  if (f.customerId) out['Klienti'] = maps.customers && maps.customers[f.customerId] && maps.customers[f.customerId].name || f.customerId;
  if (f.supplierId) out['Furnitori'] = maps.suppliers && maps.suppliers[f.supplierId] && maps.suppliers[f.supplierId].name || f.supplierId;
  if (f.productId) out['Artikulli'] = maps.products && maps.products[f.productId] && maps.products[f.productId].name + (maps.products[f.productId].sku ? ' (' + maps.products[f.productId].sku + ')' : '') || f.productId;
  if (f.unitKey) out['Njësia'] = f.unitKey === 'base' ? 'Njësia bazë' : f.unitKey === 'unit2' ? 'Njësia 2' : f.unitKey === 'unit3' ? 'Njësia 3' : f.unitKey;
  if (f.warehouse) out['Magazina'] = f.warehouse;
  if (f.price !== '' && f.price != null) out['Çmimi'] = f.price;
  return out;
}
function reportValue(v) {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? v : '';
  if (typeof v === 'boolean') return v ? 'Po' : 'Jo';
  return String(v).replace(/<[^>]*>/g, '');
}
function reportFileName(title, ext) {
  const base = String(title || 'raport').toLowerCase().replace(/[ë]/g, 'e').replace(/[ç]/g, 'c').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'raport';
  return base + '_' + new Date().toISOString().slice(0, 10) + '.' + ext;
}
function reportDownloadBlob(filename, blob, mime) {
  const url = URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob], {
    type: mime || 'application/octet-stream'
  }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function reportXmlEscape(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function reportColumnName(n) {
  let s = '';
  n += 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - m) / 26);
  }
  return s;
}
function reportSummaryItems(title, columns, rows, totals, filters) {
  const items = [{
    label: 'Raporti',
    value: title || '-'
  }, {
    label: 'Rreshta',
    value: rows.length
  }];
  const f = filters || {};
  Object.keys(f).forEach(function (k) {
    if (k === 'from' || k === 'to' || k === 'q' || k === 'customerId' || k === 'supplierId' || k === 'productId' || k === 'unitKey' || k === 'warehouse' || k === 'price') return;
    if (f[k] !== '' && f[k] != null && f[k] !== false) items.push({
      label: k,
      value: f[k]
    });
  });
  if (f.from) items.push({
    label: 'Nga data',
    value: f.from
  });
  if (f.to) items.push({
    label: 'Deri më',
    value: f.to
  });
  if (f.q) items.push({
    label: 'Kërkim',
    value: f.q
  });
  if (f.customerId && !f['Klienti']) items.push({
    label: 'Klienti',
    value: f.customerId
  });
  if (f.supplierId && !f['Furnitori']) items.push({
    label: 'Furnitori',
    value: f.supplierId
  });
  if (f.productId && !f['Artikulli']) items.push({
    label: 'Artikulli',
    value: f.productId
  });
  if (f.unitKey && !f['Njësia']) items.push({
    label: 'Njësia',
    value: f.unitKey
  });
  if (f.warehouse && !f['Magazina']) items.push({
    label: 'Magazina',
    value: f.warehouse
  });
  if (f.price !== '' && f.price != null && !f['Çmimi']) items.push({
    label: 'Çmimi',
    value: f.price
  });
  if (totals) {
    columns.forEach(c => {
      const v = totals[c.key];
      if (v !== undefined && v !== null && v !== '') items.push({
        label: 'Total ' + c.label,
        value: v
      });
    });
  }
  return items;
}
function reportCell(value, style) {
  return {
    value: value == null ? '' : value,
    style: style || 0
  };
}
function reportBuildSheetRows(title, columns, rows, totals, filters) {
  const summary = reportSummaryItems(title, columns, rows, totals, filters || {});
  const data = [];
  data.push([reportCell(title, 1)]);
  data.push([reportCell('Gjeneruar më', 2), reportCell(new Date().toLocaleString('sq-AL'))]);
  data.push([reportCell('Periudha', 2), reportCell((filters && filters.from || '-') + ' deri ' + (filters && filters.to || '-'))]);
  if (filters && filters.q) data.push([reportCell('Kërkim', 2), reportCell(filters.q)]);
  data.push([]);
  data.push([reportCell('PËRMBLEDHJE ERP', 2)]);
  summary.forEach(it => data.push([reportCell(it.label, 2), reportCell(reportValue(it.value))]));
  data.push([]);
  data.push(columns.map(c => reportCell(c.label, 3)));
  rows.forEach(r => data.push(columns.map(c => reportCell(reportValue(c.value(r))))));
  if (totals && rows.length) data.push(columns.map((c, i) => reportCell(i === 0 ? 'TOTAL' : reportValue(totals[c.key] || ''), 4)));
  return data;
}
function reportXlsxStylesXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + '<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="16"/><color rgb="FF001F3F"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF001F3F"/><name val="Calibri"/></font></fonts>' + '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF001F3F"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEFF4FA"/><bgColor indexed="64"/></patternFill></fill></fills>' + '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD9DEE5"/></left><right style="thin"><color rgb="FFD9DEE5"/></right><top style="thin"><color rgb="FFD9DEE5"/></top><bottom style="thin"><color rgb="FFD9DEE5"/></bottom><diagonal/></border></borders>' + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' + '<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/></cellXfs>' + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
}
function reportExportXlsx(title, columns, rows, totals, filters) {
  if (!rows || !rows.length) return;
  const headers = columns.map(function (c) {
    return c.label;
  });
  const dataRows = rows.map(function (r) {
    const o = {};
    columns.forEach(function (c) {
      try {
        o[c.label] = typeof c.value === 'function' ? c.value(r) : r[c.key];
      } catch (e) {
        o[c.label] = '';
      }
    });
    return o;
  });
  const totalsRow = totals ? function () {
    const o = {};
    columns.forEach(function (c, i) {
      o[c.label] = i === 0 ? totals[c.key] != null ? totals[c.key] : 'TOTAL' : totals[c.key] != null ? totals[c.key] : '';
    });
    return o;
  }() : null;
  return erpExportXlsx(title, headers, dataRows, totalsRow, filters || {});
}
function reportExportPdf(title, columns, rows, totals, filters) {
  if (!rows || !rows.length) return;
  const headers = columns.map(function (c) {
    return c.label;
  });
  const dataRows = rows.map(function (r) {
    const o = {};
    columns.forEach(function (c) {
      try {
        o[c.label] = typeof c.value === 'function' ? c.value(r) : r[c.key];
      } catch (e) {
        o[c.label] = '';
      }
    });
    return o;
  });
  const totalsRow = totals ? function () {
    const o = {};
    columns.forEach(function (c, i) {
      o[c.label] = i === 0 ? totals[c.key] != null ? totals[c.key] : 'TOTAL' : totals[c.key] != null ? totals[c.key] : '';
    });
    return o;
  }() : null;
  return erpExportPdf(title, headers, dataRows, totalsRow, filters || {});
}
function reportPrint(title, columns, rows, totals, filters) {
  const summary = reportSummaryItems(title, columns, rows, totals, filters || {});
  const summaryHtml = summary.map(it => '<div class="sum-card"><small>' + esc(it.label) + '</small><strong>' + esc(reportValue(it.value)) + '</strong></div>').join('');
  const th = columns.map(c => '<th>' + esc(c.label) + '</th>').join('');
  const tb = rows.map(r => '<tr>' + columns.map(c => '<td>' + esc(reportValue(c.value(r))) + '</td>').join('') + '</tr>').join('');
  const tf = totals ? '<tfoot><tr>' + columns.map((c, i) => '<td>' + esc(i === 0 ? 'TOTAL' : reportValue(totals[c.key] || '')) + '</td>').join('') + '</tr></tfoot>' : '';
  const w = window.open('', '_blank');
  if (!w) {
    alert('Lejo popup për printim.');
    return;
  }
  w.document.write('<!doctype html><html><head><title>' + esc(title) + '</title><style>body{font-family:Arial,sans-serif;padding:20px;color:#111}h2{margin:0 0 4px;color:#001f3f}.sub{color:#667085;font-size:12px;margin-bottom:12px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}.sum-card{border:1px solid #d9dee5;border-left:4px solid #001f3f;background:#f8fafc;padding:8px}.sum-card small{display:block;color:#667085;text-transform:uppercase;font-weight:700;font-size:10px}.sum-card strong{display:block;color:#001f3f;font-size:14px;margin-top:3px}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#001f3f;color:#fff;text-align:left;padding:8px}td{border:1px solid #ddd;padding:7px}tfoot td{font-weight:700;background:#f3f5f7}@media print{body{padding:0}.summary{grid-template-columns:repeat(4,1fr)}}</style></head><body><h2>' + esc(title) + '</h2><div class="sub">Gjeneruar më: ' + esc(new Date().toLocaleString('sq-AL')) + '</div><div class="summary">' + summaryHtml + '</div><table><thead><tr>' + th + '</tr></thead><tbody>' + tb + '</tbody>' + tf + '</table></body></html>');
  w.document.close();
  w.focus();
  setTimeout(() => {
    w.print();
    w.close();
  }, 250);
}
function reportGroup(rows, keyFn, initFn, addFn) {
  const m = {};
  rows.forEach(r => {
    const key = keyFn(r);
    if (!m[key]) m[key] = initFn(r, key);
    addFn(m[key], r);
  });
  return Object.values(m);
}
function reportLastDate(rows, dateKey) {
  if (!rows.length) return '-';
  return reportDateOnly(rows.reduce((a, r) => new Date(r[dateKey] || 0) > new Date(a || 0) ? r[dateKey] : a, rows[0][dateKey]));
}
function ReportKpis({
  items
}) {
  return React.createElement("div", {
    className: "report-kpi-grid"
  }, items.map((it, i) => React.createElement("div", {
    className: "report-kpi",
    key: i
  }, React.createElement("div", {
    className: "rk-label"
  }, it.label), React.createElement("div", {
    className: "rk-value"
  }, it.value))));
}
function ReportTable({
  title,
  icon,
  columns,
  rows,
  totals,
  filters,
  emptyText
}) {
  const summaryItems = reportSummaryItems(title, columns, rows, totals, filters || {});
  return React.createElement(LteCard, {
    title: title,
    icon: icon || 'fa-table'
  }, React.createElement("div", {
    className: "report-action-row"
  }, React.createElement("button", {
    className: "btn btn-success",
    onClick: () => reportExportXlsx(title, columns, rows, totals, filters || {}),
    disabled: !rows.length
  }, React.createElement("i", {
    className: "fas fa-file-excel"
  }), " Excel .xlsx"), React.createElement("button", {
    className: "btn btn-danger",
    onClick: () => reportExportPdf(title, columns, rows, totals, filters || {}),
    disabled: !rows.length
  }, React.createElement("i", {
    className: "fas fa-file-pdf"
  }), " PDF"), React.createElement("button", {
    className: "btn btn-secondary",
    onClick: () => reportPrint(title, columns, rows, totals, filters || {}),
    disabled: !rows.length
  }, React.createElement("i", {
    className: "fas fa-print"
  }), " Printo")), React.createElement("div", {
    className: "report-erp-summary"
  }, summaryItems.map((it, i) => React.createElement("div", {
    className: "report-erp-card",
    key: i
  }, React.createElement("div", {
    className: "res-label"
  }, it.label), React.createElement("div", {
    className: "res-value"
  }, it.value)))), React.createElement("div", {
    className: "report-table-wrap"
  }, React.createElement("table", {
    className: "report-table"
  }, React.createElement("thead", null, React.createElement("tr", null, columns.map(c => React.createElement("th", {
    key: c.key
  }, c.label)))), React.createElement("tbody", null, rows.length ? rows.map((r, idx) => React.createElement("tr", {
    key: idx
  }, columns.map(c => React.createElement("td", {
    key: c.key
  }, c.value(r))))) : React.createElement("tr", null, React.createElement("td", {
    className: "report-muted",
    colSpan: columns.length
  }, emptyText || 'Nuk ka të dhëna për këtë raport.'))), totals && rows.length > 0 && React.createElement("tfoot", null, React.createElement("tr", null, columns.map((c, i) => React.createElement("td", {
    key: c.key
  }, i === 0 ? 'TOTAL' : totals[c.key] || '')))))));
}
function ReportBars({
  title,
  icon,
  rows,
  labelKey,
  valueKey
}) {
  const max = Math.max(1, ...rows.map(r => Number(r[valueKey]) || 0));
  return React.createElement(LteCard, {
    title: title,
    icon: icon || 'fa-chart-simple'
  }, React.createElement("div", {
    className: "report-bars"
  }, rows.length ? rows.slice(0, 10).map((r, i) => React.createElement("div", {
    className: "report-bar-row",
    key: i
  }, React.createElement("div", {
    className: "report-bar-name"
  }, r[labelKey] || '-'), React.createElement("div", {
    className: "report-bar-track"
  }, React.createElement("div", {
    className: "report-bar-fill",
    style: {
      width: Math.max(4, Number(r[valueKey] || 0) / max * 100) + '%'
    }
  })), React.createElement("div", {
    className: "report-bar-value"
  }, money(r[valueKey])))) : React.createElement("div", {
    className: "hub-empty"
  }, "Nuk ka t\xEB dh\xEBna.")));
}
function ReportsView({
  user,
  role,
  setActiveMenu
}) {
  const nav = useAppNav();
  const today = new Date().toISOString().slice(0, 10);
  const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const emptyFilters = {
    from: firstDay,
    to: today,
    q: '',
    productId: '',
    customerId: '',
    supplierId: '',
    unitKey: '',
    price: '',
    warehouse: ''
  };
  const [tab, setTab] = useState('sales');
  const [filters, setFilters] = useState(emptyFilters);
  const {
    loading,
    data,
    err
  } = useFetch(() => Promise.all([fbGetSales(), fbGetProducts(), fbGetStockMovements(), fbGetPurchaseOrders(), fbGetExpenses(), fbGetCustomers(), fbGetSuppliers(), fbGetReturns()]), []);
  const sales = useMemo(() => data && data[0] && data[0].success ? data[0].data : [], [data]);
  const products = useMemo(() => data && data[1] && data[1].success ? data[1].data : [], [data]);
  const moves = useMemo(() => data && data[2] && data[2].success ? data[2].data : [], [data]);
  const purchases = useMemo(() => data && data[3] && data[3].success ? data[3].data : [], [data]);
  const expenses = useMemo(() => data && data[4] && data[4].success ? data[4].data : [], [data]);
  const customers = useMemo(() => data && data[5] && data[5].success ? data[5].data : [], [data]);
  const suppliers = useMemo(() => data && data[6] && data[6].success ? data[6].data : [], [data]);
  const returns = useMemo(() => data && data[7] && data[7].success ? data[7].data : [], [data]);
  const productById = useMemo(() => products.reduce((m, p) => (m[p.id] = p, m), {}), [products]);
  const customerById = useMemo(() => customers.reduce((m, c) => (m[c.id] = c, m), {}), [customers]);
  const supplierById = useMemo(() => suppliers.reduce((m, s) => (m[s.id] = s, m), {}), [suppliers]);
  if (loading) return React.createElement(TopLoadingBar, null);
  if (err) return React.createElement("div", {
    className: "error"
  }, "Gabim gjat\xEB ngarkimit t\xEB raporteve: ", err.message);
  const productOpts = products.map(p => ({
    value: p.id,
    label: `${p.name || '-'} (${p.sku || '-'})`
  }));
  const customerOpts = customers.map(c => ({
    value: c.id,
    label: c.name || '-'
  }));
  const supplierOpts = suppliers.map(s => ({
    value: s.id,
    label: s.name || '-'
  }));
  const unitOpts = [{
    value: 'base',
    label: 'Njësia bazë'
  }, {
    value: 'unit2',
    label: 'Njësia 2'
  }, {
    value: 'unit3',
    label: 'Njësia 3'
  }];
  const warehouses = Array.from(new Set(['Magazina Kryesore'].concat(CFG.warehouses || []).concat(products.map(p => p.location || p.warehouse || '')).filter(Boolean))).map(w => ({
    value: w,
    label: w
  }));
  const filterPrice = price => !filters.price || Math.abs((Number(price) || 0) - Number(filters.price)) < 0.00001;
  const filterProduct = id => !filters.productId || String(id || '') === String(filters.productId);
  const filterCustomer = sale => {
    if (!filters.customerId) return true;
    const c = customerById[filters.customerId];
    if (!c) return String(sale.customerId || '') === String(filters.customerId);
    return String(sale.customerId || '') === String(c.id) || sale.customerName === c.name;
  };
  const filterSupplier = po => {
    if (!filters.supplierId) return true;
    const s = supplierById[filters.supplierId];
    if (!s) return String(po.supplierId || '') === String(filters.supplierId);
    return String(po.supplierId || '') === String(s.id) || po.supplierName === s.name;
  };
  const filterWarehouse = (p, row) => !filters.warehouse || (row && row.warehouse || p && (p.location || p.warehouse) || 'Magazina Kryesore') === filters.warehouse;
  const filterUnit = row => !filters.unitKey || (row.unitKey || 'base') === filters.unitKey;
  const filterMaps = {
    products: productById,
    customers: customerById,
    suppliers: supplierById
  };
  const activeFilters = reportActiveFilters(filters, filterMaps);
  const qSale = function (s) {
    const items = s.items || [];
    const itemBits = items.map(function (it) {
      const p = productById[it.productId] || {};
      return [it.name, it.sku, p.name, p.sku, p.barcode, p.category, p.brand, it.warehouse, it.unitName].join(' ');
    }).join(' ');
    return reportMatch(filters.q, s.invoiceNo, s.customerName, s.customerId, s.paymentMethod, s.cashier, s.status, s.operatorCode, s.posName, itemBits);
  };
  const baseSales = sales.filter(s => reportInRange(s.createdAt, filters.from, filters.to) && filterCustomer(s) && qSale(s));
  const saleLines = baseSales.flatMap(s => (s.items || []).map(it => {
    const p = productById[it.productId] || {};
    const unit = getProductUnit(p, it.unitKey || 'base');
    const paidBase = Number(it.paidQty != null ? it.paidQty : it.displayQty != null ? Number(it.displayQty || 0) * Number(it.unitMultiplier || unit.multiplier || 1) : it.qty) || 0;
    const freeBase = Number(it.freeQty || 0);
    const unitSale = Number(it.unitSalePrice != null ? it.unitSalePrice : it.displayQty ? Number(it.lineTotal || 0) / Number(it.displayQty || 1) : unitPrice(p, unit.value)) || 0;
    const displayQty = it.displayQty != null ? Number(it.displayQty || 0) : round2(paidBase / Number(it.unitMultiplier || unit.multiplier || 1));
    return Object.assign({}, it, {
      saleId: s.id,
      invoiceNo: s.invoiceNo,
      saleDate: s.createdAt,
      customerId: s.customerId || '',
      customerName: s.customerName || 'Walk-in',
      paymentMethod: s.paymentMethod || '-',
      productId: it.productId,
      productName: it.name || p.name || '-',
      sku: it.sku || p.sku || '-',
      unitKey: it.unitKey || unit.value,
      unitName: it.unitName || unit.name,
      unitMultiplier: Number(it.unitMultiplier || unit.multiplier || 1),
      displayQty,
      paidQty: paidBase,
      freeQty: freeBase,
      qty: Number(it.qty != null ? it.qty : paidBase + freeBase),
      unitSalePrice: unitSale,
      price: Number(it.price || unitSale / Number(it.unitMultiplier || unit.multiplier || 1)) || 0,
      lineTotal: Number(it.lineTotal != null ? it.lineTotal : displayQty * unitSale) || 0,
      warehouse: it.warehouse || p.location || p.warehouse || 'Magazina Kryesore',
      category: p.category || '-'
    });
  })).filter(l => filterProduct(l.productId) && filterUnit(l) && filterPrice(l.unitSalePrice) && filterWarehouse(productById[l.productId], l) && reportMatch(filters.q, l.productName, l.name, l.sku, l.barcode, l.customerName, l.invoiceNo, l.warehouse, l.category, l.unitName, l.paymentMethod));
  const filteredSales = baseSales.filter(s => !filters.productId || saleLines.some(l => l.saleId === s.id));
  const filteredPurchases = purchases.filter(p => {
    if (!reportInRange(p.createdAt, filters.from, filters.to)) return false;
    if (!filterSupplier(p)) return false;
    const itemBits = (p.items || []).map(function (it) {
      const prod = productById[it.productId] || {};
      return [it.name, it.sku, prod.name, prod.sku, prod.barcode, prod.category].join(' ');
    }).join(' ');
    if (!reportMatch(filters.q, p.poNumber, p.supplierName, p.status, p.notes, itemBits)) return false;
    if (filters.productId && !(p.items || []).some(function (it) {
      return String(it.productId) === String(filters.productId);
    })) return false;
    return true;
  });
  const purchaseLines = filteredPurchases.flatMap(p => (p.items || []).map(it => {
    const prod = productById[it.productId] || {};
    return Object.assign({}, it, {
      poId: p.id,
      poNumber: p.poNumber,
      purchaseDate: p.createdAt,
      supplierId: p.supplierId || '',
      supplierName: p.supplierName || '-',
      productName: it.name || prod.name || '-',
      sku: it.sku || prod.sku || '-',
      unitKey: it.unitKey || 'base',
      unitName: it.unitName || unitBaseName(prod),
      unitMultiplier: Number(it.unitMultiplier || getProductUnit(prod, it.unitKey || 'base').multiplier || 1),
      displayQty: Number(it.enteredQty != null ? it.enteredQty : it.unitMultiplier ? Number(it.qty || 0) / Number(it.unitMultiplier || 1) : it.qty) || 0,
      qty: Number(it.qty || 0),
      unitCostShown: Number(it.enteredUnitCost || it.lineUnitCost || it.unitCost || 0),
      lineTotal: Number(it.lineTotal != null ? it.lineTotal : Number(it.qty || 0) * Number(it.unitCost || 0)),
      warehouse: it.warehouse || prod.location || prod.warehouse || 'Magazina Kryesore',
      category: prod.category || '-'
    });
  })).filter(l => filterProduct(l.productId) && filterUnit(l) && filterPrice(l.unitCost || l.enteredUnitCost || l.price) && filterWarehouse(productById[l.productId], l) && reportMatch(filters.q, l.productName, l.name, l.sku, l.supplierName, l.poNumber, l.warehouse, l.category, l.unitName));
  const filteredReturns = returns.filter(r => {
    if (!reportInRange(r.createdAt, filters.from, filters.to)) return false;
    if (filters.customerId) {
      const sale = sales.find(s => s.id === r.saleId);
      if (sale && !filterCustomer(sale)) return false;
    }
    const itemBits = (r.items || []).map(function (it) {
      return [it.name, it.sku, it.productId].join(' ');
    }).join(' ');
    if (filters.productId && !(r.items || []).some(function (it) {
      return String(it.productId) === String(filters.productId);
    })) return false;
    return reportMatch(filters.q, r.saleId, r.processedBy, r.reason, itemBits);
  });
  const returnLines = filteredReturns.flatMap(r => (r.items || []).map(it => Object.assign({}, it, {
    returnId: r.id,
    saleId: r.saleId,
    returnDate: r.createdAt,
    processedBy: r.processedBy || '-'
  })));
  const salesTotal = saleLines.reduce((a, l) => a + Number(l.lineTotal || 0), 0);
  const salesReceived = filteredSales.reduce((a, s) => a + (s.paymentMethod === 'Credit' ? 0 : Number(s.total || 0)), 0);
  const salesBalance = filteredSales.reduce((a, s) => a + (s.paymentMethod === 'Credit' ? Number(s.total || 0) : 0), 0);
  const salesTax = filteredSales.reduce((a, s) => a + Number(s.tax || 0), 0);
  const salesDiscount = filteredSales.reduce((a, s) => a + Number(s.discount || 0), 0);
  const returnsTotal = filteredReturns.reduce((a, r) => a + Number(r.totalRefund || 0), 0);
  const itemRows = reportGroup(saleLines, l => (l.productId || l.productName || 'unknown') + '|' + (l.unitKey || 'base') + '|' + Number(l.unitSalePrice || 0), l => ({
    productId: l.productId,
    name: l.productName || l.name || '-',
    sku: l.sku || '-',
    category: l.category || '-',
    unit: l.unitName || '-',
    unitKey: l.unitKey || 'base',
    warehouse: l.warehouse || '-',
    clients: new Set(),
    qtyBase: 0,
    qtyDisplay: 0,
    freeBase: 0,
    sales: 0,
    cost: 0,
    profit: 0,
    price: Number(l.unitSalePrice || 0)
  }), (row, l) => {
    row.clients.add(l.customerName || 'Walk-in');
    row.qtyBase += Number(l.paidQty || 0);
    row.qtyDisplay += Number(l.displayQty || 0);
    row.freeBase += Number(l.freeQty || 0);
    row.sales += Number(l.lineTotal || 0);
    row.cost += Number(l.paidQty || 0) * Number(l.cost || 0);
    row.profit = row.sales - row.cost;
  }).map(r => Object.assign({}, r, {
    clientsText: Array.from(r.clients).join(', ')
  })).sort((a, b) => b.sales - a.sales);
  const grossProfit = itemRows.reduce((a, r) => a + r.profit, 0);
  const salesDetailRows = saleLines.map(l => ({
    invoiceNo: l.invoiceNo || '-',
    date: l.saleDate,
    customer: l.customerName,
    item: l.productName || l.name || '-',
    sku: l.sku || '-',
    unit: l.unitName || '-',
    qty: l.displayQty,
    free: round2(Number(l.freeQty || 0) / Number(l.unitMultiplier || 1)),
    qty2: formatQtyTwoUnits(Number(l.qty || 0), productById[l.productId], l.unitKey),
    price: Number(l.unitSalePrice) || 0,
    net: Number(l.lineNet || 0),
    tax: Number(l.lineTax || 0),
    total: Number(l.lineTotal || 0),
    payment: l.paymentMethod,
    warehouse: l.warehouse
  }));
  const dailyRows = reportGroup(filteredSales, s => String(s.createdAt || '').slice(0, 10), s => ({
    date: String(s.createdAt || '').slice(0, 10),
    invoices: 0,
    qty: 0,
    subtotal: 0,
    discount: 0,
    tax: 0,
    total: 0,
    received: 0,
    balance: 0,
    profit: 0
  }), (row, s) => {
    const lines = saleLines.filter(l => l.saleId === s.id);
    row.invoices += 1;
    row.qty += lines.reduce((a, it) => a + Number(it.qty || 0), 0);
    row.subtotal += lines.reduce((a, it) => a + Number(it.lineTotal || 0), 0);
    row.discount += Number(s.discount || 0);
    row.tax += Number(s.tax || 0);
    row.total += Number(s.total || 0);
    row.received += s.paymentMethod === 'Credit' ? 0 : Number(s.total || 0);
    row.balance += s.paymentMethod === 'Credit' ? Number(s.total || 0) : 0;
    row.profit += lines.reduce((a, it) => a + (Number(it.lineTotal || 0) - Number(it.paidQty || 0) * Number(it.cost || 0)), 0);
  }).sort((a, b) => new Date(b.date) - new Date(a.date));
  const paymentRows = reportGroup(filteredSales, s => s.paymentMethod || '-', s => ({
    method: s.paymentMethod || '-',
    invoices: 0,
    total: 0,
    received: 0,
    balance: 0
  }), (row, s) => {
    row.invoices += 1;
    row.total += Number(s.total || 0);
    row.received += s.paymentMethod === 'Credit' ? 0 : Number(s.total || 0);
    row.balance += s.paymentMethod === 'Credit' ? Number(s.total || 0) : 0;
  }).sort((a, b) => b.total - a.total);
  const customerSalesRows = reportGroup(filteredSales, s => s.customerName || 'Walk-in', s => ({
    customer: s.customerName || 'Walk-in',
    invoices: 0,
    qty: 0,
    total: 0,
    received: 0,
    balance: 0,
    lastSale: s.createdAt
  }), (row, s) => {
    const lines = saleLines.filter(l => l.saleId === s.id);
    row.invoices += 1;
    row.qty += lines.reduce((a, it) => a + Number(it.qty || 0), 0);
    row.total += Number(s.total || 0);
    row.received += s.paymentMethod === 'Credit' ? 0 : Number(s.total || 0);
    row.balance += s.paymentMethod === 'Credit' ? Number(s.total || 0) : 0;
    if (new Date(s.createdAt) > new Date(row.lastSale)) row.lastSale = s.createdAt;
  }).sort((a, b) => b.total - a.total);
  const expenseRows = expenses.filter(e => {
    if (!reportInRange(e.date || e.createdAt, filters.from, filters.to)) return false;
    if (filters.supplierId) {
      const s = supplierById[filters.supplierId];
      const v = e.vendor || e.payee || '';
      if (s && v !== s.name && String(e.supplierId || '') !== String(s.id)) return false;
    }
    return reportMatch(filters.q, e.category, e.vendor, e.payee, e.notes, e.paymentMethod, e.amount);
  }).map(e => ({
    date: e.date || e.createdAt,
    category: e.category || '-',
    vendor: e.vendor || e.payee || '-',
    amount: Number(e.amount) || 0,
    notes: e.notes || '',
    paymentMethod: e.paymentMethod || '-'
  }));
  const expenseTotal = expenseRows.reduce((a, r) => a + r.amount, 0);
  const expenseCategoryRows = reportGroup(expenseRows, e => e.category || '-', e => ({
    category: e.category || '-',
    count: 0,
    amount: 0
  }), (row, e) => {
    row.count += 1;
    row.amount += Number(e.amount || 0);
  }).sort((a, b) => b.amount - a.amount);
  const netProfit = grossProfit - expenseTotal - returnsTotal;
  const purchaseRows = filteredPurchases.map(p => ({
    poNumber: p.poNumber || '-',
    date: p.createdAt,
    supplier: p.supplierName || '-',
    items: (p.items || []).length,
    qty: purchaseLines.filter(l => l.poId === p.id).reduce((a, it) => a + Number(it.qty || 0), 0),
    unitSummary: (p.items || []).map(it => (it.enteredQty != null ? it.enteredQty : it.qty) + ' ' + (it.unitName || 'copë')).join(', '),
    total: Number(p.total) || 0,
    status: p.status || '-'
  }));
  const purchaseTotal = purchaseLines.reduce((a, r) => a + Number(r.lineTotal || 0), 0);
  const purchaseItemRows = reportGroup(purchaseLines, l => (l.productId || l.productName || 'unknown') + '|' + (l.unitKey || 'base'), l => ({
    name: l.productName || '-',
    sku: l.sku || '-',
    unit: l.unitName || '-',
    qty: 0,
    qtyBase: 0,
    cost: 0,
    avgCost: 0,
    suppliers: new Set()
  }), (row, l) => {
    row.suppliers.add(l.supplierName || '-');
    row.qty += Number(l.displayQty || 0);
    row.qtyBase += Number(l.qty || 0);
    row.cost += Number(l.lineTotal || 0);
    row.avgCost = row.qty ? row.cost / row.qty : 0;
  }).map(r => Object.assign({}, r, {
    suppliersText: Array.from(r.suppliers).join(', ')
  })).sort((a, b) => b.cost - a.cost);
  const supplierPurchaseRows = reportGroup(filteredPurchases, p => p.supplierName || '-', p => ({
    supplier: p.supplierName || '-',
    pos: 0,
    qty: 0,
    total: 0,
    lastPurchase: p.createdAt
  }), (row, p) => {
    row.pos += 1;
    row.qty += purchaseLines.filter(l => l.poId === p.id).reduce((a, it) => a + Number(it.qty || 0), 0);
    row.total += Number(p.total || 0);
    if (new Date(p.createdAt) > new Date(row.lastPurchase)) row.lastPurchase = p.createdAt;
  }).sort((a, b) => b.total - a.total);
  const stockRows = products.map(p => {
    const qty = computeQtyOnHand(p.id, moves);
    const cost = Number(p.cost) || 0;
    const price = Number(p.price) || 0;
    const reorder = Number(p.reorderLevel) || 0;
    const prodSales = sales.filter(s => (s.items || []).some(it => it.productId === p.id));
    return {
      id: p.id,
      name: p.name || '-',
      sku: p.sku || '-',
      category: p.category || '-',
      warehouse: p.location || p.warehouse || 'Magazina Kryesore',
      qty,
      qty2: formatQtyTwoUnits(qty, p),
      cost,
      price,
      value: qty * cost,
      sellingValue: qty * price,
      reorder,
      suggested: Math.max(0, reorder - qty),
      status: qty <= reorder ? 'Stok i ulët' : 'OK',
      lastSold: reportLastDate(prodSales, 'createdAt'),
      soldInPeriod: saleLines.filter(l => l.productId === p.id).reduce((a, l) => a + Number(l.qty || 0), 0)
    };
  }).filter(r => filterProduct(r.id) && (!filters.warehouse || r.warehouse === filters.warehouse) && filterPrice(r.price) && reportMatch(filters.q, r.name, r.sku, r.category, r.warehouse));
  const stockValue = stockRows.reduce((a, r) => a + r.value, 0);
  const lowStockRows = stockRows.filter(r => r.qty <= r.reorder).sort((a, b) => a.qty - b.qty);
  const reorderRows = lowStockRows.map(r => Object.assign({}, r, {
    orderQty: Math.max(r.suggested, 0)
  }));
  const slowRows = stockRows.filter(r => !r.soldInPeriod).sort((a, b) => b.value - a.value);
  const stockDetailRows = moves.filter(m => reportInRange(m.createdAt, filters.from, filters.to)).map(m => {
    const p = productById[m.productId] || {};
    return {
      date: m.createdAt,
      productId: m.productId,
      product: p.name || m.productName || m.productId || '-',
      sku: p.sku || '-',
      warehouse: m.warehouse || p.location || p.warehouse || 'Magazina Kryesore',
      type: m.type === 'in' ? 'Hyrje' : 'Dalje',
      qty: Number(m.qty) || 0,
      qty2: formatQtyTwoUnits(Number(m.qty) || 0, p, m.unitKey),
      unit: m.unitName || unitBaseName(p),
      reason: m.reason || '-',
      reference: m.reference || '-'
    };
  }).filter(r => filterProduct(r.productId) && (!filters.warehouse || r.warehouse === filters.warehouse) && reportMatch(filters.q, r.product, r.sku, r.type, r.reason, r.reference, r.warehouse));
  const warehouseRows = stockRows.sort((a, b) => String(a.warehouse).localeCompare(String(b.warehouse)) || String(a.name).localeCompare(String(b.name)));
  const vatRows = filteredSales.map(s => ({
    invoiceNo: s.invoiceNo || '-',
    date: s.createdAt,
    customer: s.customerName || 'Walk-in',
    net: Number(s.total || 0) - Number(s.tax || 0),
    tax: Number(s.tax || 0),
    total: Number(s.total || 0),
    rate: (s.items || [])[0]?.taxRate ?? CFG.taxRate ?? 0
  }));
  const returnRows = filteredReturns.map(r => ({
    date: r.createdAt,
    saleId: r.saleId || '-',
    lines: (r.items || []).length,
    qty: (r.items || []).reduce((a, it) => a + Number(it.qty || 0), 0),
    total: Number(r.totalRefund || 0),
    processedBy: r.processedBy || '-'
  }));
  const returnItemRows = reportGroup(returnLines, l => l.productId || l.name || '-', l => ({
    name: l.name || '-',
    sku: l.sku || '-',
    qty: 0,
    total: 0
  }), (row, l) => {
    row.qty += Number(l.qty || 0);
    row.total += Number(l.lineTotal || 0);
  }).sort((a, b) => b.total - a.total);
  const customerRows = customers.filter(c => {
    if (filters.customerId && String(c.id) !== String(filters.customerId)) return false;
    return reportMatch(filters.q, c.name, c.phone, c.email, c.category, c.customerType, c.company);
  }).map(c => {
    const custSales = filteredSales.filter(s => String(s.customerId || '') === String(c.id) || s.customerName === c.name);
    const total = custSales.reduce((a, s) => a + Number(s.total || 0), 0);
    const creditOpen = custSales.reduce((a, s) => a + (s.paymentMethod === 'Credit' || s.status === 'credit' ? Number(s.total || 0) : 0), 0);
    const balance = Number(c.amount || 0) + creditOpen;
    return {
      id: c.id,
      name: c.name || '-',
      phone: c.phone || '-',
      type: c.customerType || c.category || '-',
      invoices: custSales.length,
      total,
      balance,
      status: c.active === false ? 'Jo aktiv' : 'Aktiv'
    };
  }).filter(r => filters.customerId ? true : true).sort((a, b) => b.balance - a.balance);
  const supplierRows = suppliers.filter(s => {
    if (filters.supplierId && String(s.id) !== String(filters.supplierId)) return false;
    return reportMatch(filters.q, s.name, s.phone, s.email, s.contact);
  }).map(s => {
    const supPO = filteredPurchases.filter(p => String(p.supplierId || '') === String(s.id) || p.supplierName === s.name);
    const paid = expenseRows.filter(e => e.vendor === s.name).reduce((a, e) => a + Number(e.amount || 0), 0);
    const total = supPO.reduce((a, p) => a + Number(p.total || 0), 0);
    return {
      id: s.id,
      name: s.name || '-',
      contact: s.contact || '-',
      phone: s.phone || '-',
      pos: supPO.length,
      total,
      paid,
      payable: Number(s.openingBalance || 0) + total - paid
    };
  }).sort((a, b) => b.payable - a.payable);
  const summaryRows = [{
    name: 'Shitje',
    invoices: filteredSales.length,
    lines: saleLines.length,
    amount: salesTotal
  }, {
    name: 'Blerje',
    invoices: filteredPurchases.length,
    lines: purchaseLines.length,
    amount: purchaseTotal
  }, {
    name: 'Kthime',
    invoices: filteredReturns.length,
    lines: returnLines.length,
    amount: returnsTotal
  }, {
    name: 'Shpenzime',
    invoices: expenseRows.length,
    lines: expenseRows.length,
    amount: expenseTotal
  }, {
    name: 'Fitim neto',
    invoices: '-',
    lines: '-',
    amount: netProfit
  }];
  const analyticRows = [].concat(saleLines.map(l => ({
    date: l.saleDate,
    type: 'Shitje',
    doc: l.invoiceNo,
    party: l.customerName,
    item: l.productName,
    unit: l.unitName,
    qty: l.displayQty,
    qty2: formatQtyTwoUnits(l.qty, productById[l.productId], l.unitKey),
    price: l.unitSalePrice,
    debit: l.lineTotal,
    credit: 0,
    warehouse: l.warehouse
  })), purchaseLines.map(l => ({
    date: l.purchaseDate,
    type: 'Blerje',
    doc: l.poNumber,
    party: l.supplierName,
    item: l.productName,
    unit: l.unitName,
    qty: l.displayQty,
    qty2: formatQtyTwoUnits(l.qty, productById[l.productId], l.unitKey),
    price: l.unitCostShown,
    debit: 0,
    credit: l.lineTotal,
    warehouse: l.warehouse
  }))).sort((a, b) => new Date(b.date) - new Date(a.date)).filter(r => {
    if (filters.productId) {
      const p = productById[filters.productId];
      const ok = p && (r.item === p.name || r.sku === p.sku) || String(r.productId || '') === String(filters.productId);
      if (!ok) return false;
    }
    if (filters.customerId) {
      const c = customerById[filters.customerId];
      if (c && r.party && r.party !== c.name && String(r.type || '').toLowerCase().includes('shit')) return false;
    }
    if (filters.supplierId) {
      const s = supplierById[filters.supplierId];
      if (s && r.party && r.party !== s.name && String(r.type || '').toLowerCase().includes('bler')) return false;
    }
    if (filters.warehouse && r.warehouse && r.warehouse !== filters.warehouse) return false;
    return true;
  });
  const supplierLedgerRows = (() => {
    const rows = [];
    suppliers.forEach(sup => {
      if (filters.supplierId && sup.id !== filters.supplierId) return;
      let bal = Number(sup.openingBalance || 0);
      if (bal) rows.push({
        date: '',
        supplier: sup.name,
        type: 'Çelje',
        doc: 'Balancë fillestare',
        debit: bal,
        credit: 0,
        balance: bal
      });
      filteredPurchases.filter(p => p.supplierId === sup.id || p.supplierName === sup.name).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).forEach(p => {
        bal += Number(p.total || 0);
        rows.push({
          date: p.createdAt,
          supplier: sup.name,
          type: 'Faturë blerje',
          doc: p.poNumber || '-',
          debit: Number(p.total || 0),
          credit: 0,
          balance: bal
        });
      });
      expenseRows.filter(e => e.vendor === sup.name).sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(e => {
        bal -= Number(e.amount || 0);
        rows.push({
          date: e.date,
          supplier: sup.name,
          type: 'Pagesë',
          doc: e.category || 'Pagesë',
          debit: 0,
          credit: Number(e.amount || 0),
          balance: bal
        });
      });
    });
    return rows.filter(r => reportMatch(filters.q, r.supplier, r.type, r.doc)).sort((a, b) => String(a.supplier).localeCompare(String(b.supplier)) || new Date(a.date || 0) - new Date(b.date || 0));
  })();
  const billingRows = [].concat(filteredSales.map(s => ({
    date: s.createdAt,
    party: s.customerName || 'Walk-in',
    kind: 'Klient',
    type: 'Faturim shitje',
    doc: s.invoiceNo || '-',
    invoice: Number(s.total || 0),
    payment: s.paymentMethod === 'Credit' ? 0 : Number(s.total || 0),
    balance: s.paymentMethod === 'Credit' ? Number(s.total || 0) : 0
  })), filteredPurchases.map(p => ({
    date: p.createdAt,
    party: p.supplierName || '-',
    kind: 'Furnitor',
    type: 'Faturim blerje',
    doc: p.poNumber || '-',
    invoice: Number(p.total || 0),
    payment: 0,
    balance: Number(p.total || 0)
  })), expenseRows.map(e => ({
    date: e.date,
    party: e.vendor || '-',
    kind: 'Pagesë',
    type: 'Pagesë furnitori/shpenzim',
    doc: e.category || '-',
    invoice: 0,
    payment: Number(e.amount || 0),
    balance: -Number(e.amount || 0)
  }))).filter(r => {
    if (filters.customerId) {
      const c = customerById[filters.customerId];
      if (!(r.kind === 'Klient' && c && r.party === c.name)) return false;
    }
    if (filters.supplierId) {
      const s = supplierById[filters.supplierId];
      if (!s) return false;
      if (!(r.party === s.name)) return false;
    }
    return reportMatch(filters.q, r.party, r.kind, r.type, r.doc);
  }).sort((a, b) => new Date(b.date) - new Date(a.date));
  const partyActionRows = billingRows.filter(r => {
    if (filters.customerId) {
      const c = customerById[filters.customerId];
      if (r.kind === 'Klient' && c && r.party !== c.name) return false;
      if (r.kind !== 'Klient' && filters.customerId) return false;
    }
    if (filters.supplierId) {
      const s = supplierById[filters.supplierId];
      if (r.kind === 'Furnitor' && s && r.party !== s.name) return false;
      if (r.kind !== 'Furnitor' && filters.supplierId && !filters.customerId) return false;
    }
    return reportMatch(filters.q, r.party, r.type, r.doc, r.kind);
  }).map(r => ({
    date: r.date,
    party: r.party,
    kind: r.kind,
    action: r.type,
    doc: r.doc,
    debit: r.invoice,
    credit: r.payment,
    net: Number(r.invoice || 0) - Number(r.payment || 0)
  }));
  const itemCardRows = analyticRows.filter(r => {
    if (filters.productId) {
      const p = productById[filters.productId];
      const ok = r.productId && String(r.productId) === String(filters.productId) || p && (r.item === p.name || r.sku === p.sku);
      if (!ok) return false;
    }
    if (filters.customerId) {
      const c = customerById[filters.customerId];
      if (c && r.party && r.party !== c.name && r.customerName !== c.name) {
        if (r.type === 'Shitje' && r.party !== c.name) return false;
      }
    }
    if (filters.warehouse && r.warehouse && r.warehouse !== filters.warehouse) return false;
    if (filters.price && r.price != null && Math.abs(Number(r.price) - Number(filters.price)) > 0.00001) return false;
    return reportMatch(filters.q, r.item, r.sku, r.party, r.doc, r.type, r.warehouse);
  }).map((r, i) => Object.assign({}, r, {
    nr: i + 1
  }));
  const itemAnalysisRows = itemRows.map(r => ({
    name: r.name,
    sku: r.sku,
    category: r.category,
    unit: r.unit,
    qty: formatQtyTwoUnits(r.qtyBase, productById[r.productId], r.unitKey),
    free: formatQtyTwoUnits(r.freeBase, productById[r.productId], r.unitKey),
    price: r.price,
    sales: r.sales,
    cost: r.cost,
    profit: r.profit,
    margin: r.sales ? r.profit / r.sales * 100 : 0,
    clients: r.clientsText,
    warehouse: r.warehouse
  }));
  const tabs = [{
    id: 'sales',
    label: 'Shitje',
    icon: 'fa-receipt'
  }, {
    id: 'salesDetail',
    label: 'Regjistër shitje',
    icon: 'fa-list'
  }, {
    id: 'daily',
    label: 'Ditore',
    icon: 'fa-calendar-day'
  }, {
    id: 'payment',
    label: 'Pagesa',
    icon: 'fa-credit-card'
  }, {
    id: 'items',
    label: 'Shitje / Artikull',
    icon: 'fa-boxes-stacked'
  }, {
    id: 'customers',
    label: 'Shitje / Klient',
    icon: 'fa-users'
  }, {
    id: 'summary',
    label: 'Blerje-Shitje',
    icon: 'fa-scale-balanced'
  }, {
    id: 'analytic',
    label: 'Regjistër analitik',
    icon: 'fa-table-list'
  }, {
    id: 'supplierLedger',
    label: 'Kartelë furnitori',
    icon: 'fa-truck-field'
  }, {
    id: 'billing',
    label: 'Faturime & Pagesa',
    icon: 'fa-file-invoice-dollar'
  }, {
    id: 'itemCard',
    label: 'Kartelë artikulli',
    icon: 'fa-clipboard-list'
  }, {
    id: 'itemAnalysis',
    label: 'Analizë artikulli',
    icon: 'fa-magnifying-glass-chart'
  }, {
    id: 'partyActions',
    label: 'Veprime klient/furnitor',
    icon: 'fa-people-arrows'
  }, {
    id: 'stock',
    label: 'Stok',
    icon: 'fa-warehouse'
  }, {
    id: 'warehouse',
    label: 'Gjendje magazine',
    icon: 'fa-boxes-packing'
  }, {
    id: 'stockDetail',
    label: 'Kartelë stoku',
    icon: 'fa-list-check'
  }, {
    id: 'lowStock',
    label: 'Stok i ulët',
    icon: 'fa-triangle-exclamation'
  }, {
    id: 'slow',
    label: 'Pa lëvizje',
    icon: 'fa-hourglass-half'
  }, {
    id: 'reorder',
    label: 'Kërkesë furnizimi',
    icon: 'fa-cart-plus'
  }, {
    id: 'purchases',
    label: 'Blerje',
    icon: 'fa-file-invoice-dollar'
  }, {
    id: 'purchaseItems',
    label: 'Artikuj blerje',
    icon: 'fa-box-open'
  }, {
    id: 'suppliers',
    label: 'Furnitorë',
    icon: 'fa-truck-field'
  }, {
    id: 'profit',
    label: 'Fitim & Humbje',
    icon: 'fa-chart-line'
  }, {
    id: 'vat',
    label: 'TVSH',
    icon: 'fa-percent'
  }, {
    id: 'expenses',
    label: 'Shpenzime',
    icon: 'fa-money-bill-trend-up'
  }, {
    id: 'expenseCategory',
    label: 'Shpenzime/Kategori',
    icon: 'fa-tags'
  }, {
    id: 'returns',
    label: 'Kthime',
    icon: 'fa-rotate-left'
  }, {
    id: 'parties',
    label: 'Kartela',
    icon: 'fa-address-book'
  }];
  return React.createElement("div", {
    className: "data-section reports-page"
  }, React.createElement("div", {
    className: "reports-top"
  }, React.createElement("div", null, React.createElement("h2", null, React.createElement("i", {
    className: "fas fa-chart-pie"
  }), " Raportet")), React.createElement("button", {
    className: "btn btn-secondary",
    onClick: () => setFilters(emptyFilters)
  }, React.createElement("i", {
    className: "fas fa-eraser"
  }), " Pastro filtrat")), React.createElement("div", {
    className: "filters-section"
  }, React.createElement("div", {
    className: "filters-header"
  }, React.createElement("h3", null, React.createElement("i", {
    className: "fas fa-filter"
  }), " Filtrat e raportit")), React.createElement("div", {
    className: "filters-grid"
  }, React.createElement("div", {
    className: "filter-group"
  }, React.createElement("label", null, React.createElement("i", {
    className: "fas fa-calendar"
  }), " Nga data"), React.createElement("input", {
    className: "filter-input",
    type: "date",
    value: filters.from,
    onChange: e => setFilters(f => Object.assign({}, f, {
      from: e.target.value
    }))
  })), React.createElement("div", {
    className: "filter-group"
  }, React.createElement("label", null, React.createElement("i", {
    className: "fas fa-calendar-check"
  }), " Deri m\xEB"), React.createElement("input", {
    className: "filter-input",
    type: "date",
    value: filters.to,
    onChange: e => setFilters(f => Object.assign({}, f, {
      to: e.target.value
    }))
  })), React.createElement("div", {
    className: "filter-group",
    style: {
      gridColumn: '1 / -1'
    }
  }, React.createElement("label", null, React.createElement("i", {
    className: "fas fa-search"
  }), " K\xEBrko (si Google \u2014 t\xEB gjitha fushat)"), React.createElement("div", {
    className: 'google-search-wrap' + (filters.q ? ' has-value' : ''),
    style: {
      maxWidth: '100%'
    }
  }, React.createElement("i", {
    className: "fas fa-search gs-icon"
  }), React.createElement("input", {
    type: "search",
    value: filters.q || '',
    placeholder: "Shkruaj p\xEBr t\xEB filtruar: klient, artikull, SKU, fatur\xEB, furnitor, magazin\xEB, pages\xEB...",
    onChange: e => setFilters(f => Object.assign({}, f, {
      q: e.target.value
    })),
    autoComplete: "off"
  }), filters.q ? React.createElement("button", {
    type: "button",
    className: "gs-clear",
    title: "Pastro",
    onClick: () => setFilters(f => Object.assign({}, f, {
      q: ''
    }))
  }, React.createElement("i", {
    className: "fas fa-times"
  })) : null), activeFilters && Object.keys(activeFilters).length > 0 && React.createElement("div", {
    className: "o-search-filters",
    style: {
      marginTop: 8
    }
  }, Object.keys(activeFilters).map(k => React.createElement("span", {
    className: "o-facet",
    key: k,
    style: {
      marginRight: 6
    }
  }, React.createElement("span", {
    className: "o-facet-label"
  }, k, ":"), React.createElement("span", {
    className: "o-facet-value"
  }, String(activeFilters[k])))))), React.createElement(SearchableDropdown, {
    label: "Artikulli",
    icon: "fas fa-box",
    options: productOpts,
    value: filters.productId,
    onChange: v => setFilters(f => Object.assign({}, f, {
      productId: v
    })),
    placeholder: "T\xEB gjith\xEB artikujt",
    creatable: true,
    createLabel: "Shto artikull: {q}",
    onCreate: async q => {
      try {
        localStorage.setItem('erp_new_product_name', q);
      } catch (e) {}
      nav.go('products', 'products');
      return false;
    }
  }), React.createElement(SearchableDropdown, {
    label: "Klienti",
    icon: "fas fa-user",
    options: customerOpts,
    value: filters.customerId,
    onChange: v => setFilters(f => Object.assign({}, f, {
      customerId: v
    })),
    placeholder: "T\xEB gjith\xEB klient\xEBt",
    creatable: true,
    createLabel: "Shto klient: {q}",
    onCreate: async q => {
      try {
        localStorage.setItem('erp_new_customer_name', q);
      } catch (e) {}
      nav.go('records', 'records');
      return false;
    }
  }), React.createElement(SearchableDropdown, {
    label: "Furnitori",
    icon: "fas fa-truck-field",
    options: supplierOpts,
    value: filters.supplierId,
    onChange: v => setFilters(f => Object.assign({}, f, {
      supplierId: v
    })),
    placeholder: "T\xEB gjith\xEB furnitor\xEBt",
    creatable: true,
    createLabel: "Shto furnitor: {q}",
    onCreate: async q => {
      try {
        localStorage.setItem('erp_new_supplier_name', q);
      } catch (e) {}
      nav.go('suppliers', 'suppliers');
      return false;
    }
  }), React.createElement(SearchableDropdown, {
    label: "Nj\xEBsia",
    icon: "fas fa-scale-balanced",
    options: unitOpts,
    value: filters.unitKey,
    onChange: v => setFilters(f => Object.assign({}, f, {
      unitKey: v
    })),
    placeholder: "T\xEB gjitha nj\xEBsit\xEB"
  }), React.createElement(SearchableDropdown, {
    label: "Magazina",
    icon: "fas fa-warehouse",
    options: warehouses,
    value: filters.warehouse,
    onChange: v => setFilters(f => Object.assign({}, f, {
      warehouse: v
    })),
    placeholder: "T\xEB gjitha magazinat",
    creatable: true,
    createLabel: "Shto magazin\xEB: {q}",
    onCreate: async q => {
      const res = await ieQuickAddSettingList('warehouses', q, JSON.parse(localStorage.getItem('fb_user') || 'null'));
      if (!res.success) throw new Error(res.message || 'Dështoi');
      setFilters(f => Object.assign({}, f, {
        warehouse: q
      }));
      return {
        value: q,
        label: q
      };
    }
  }), React.createElement("div", {
    className: "filter-group"
  }, React.createElement("label", null, React.createElement("i", {
    className: "fas fa-tag"
  }), " \xC7mimi i sakt\xEB"), React.createElement("input", {
    className: "filter-input",
    type: "number",
    step: "0.01",
    value: filters.price,
    onChange: e => setFilters(f => Object.assign({}, f, {
      price: e.target.value
    })),
    placeholder: "p.sh. 300"
  })))), React.createElement(ReportKpis, {
    items: [{
      label: 'Shitje totale',
      value: money(salesTotal)
    }, {
      label: 'Blerje totale',
      value: money(purchaseTotal)
    }, {
      label: 'Balancë shitje',
      value: money(salesBalance)
    }, {
      label: 'Fitim neto',
      value: money(netProfit)
    }]
  }), React.createElement("div", {
    className: "report-tabs"
  }, tabs.map(t => React.createElement("button", {
    key: t.id,
    className: 'report-tab ' + (tab === t.id ? 'active' : ''),
    onClick: () => setTab(t.id)
  }, React.createElement("i", {
    className: 'fas ' + t.icon
  }), t.label))), tab === 'sales' && React.createElement("div", {
    className: "report-two-col"
  }, React.createElement("div", null, React.createElement(ReportTable, {
    filters: activeFilters,
    title: "Raport Shitjesh",
    icon: "fa-receipt",
    rows: filteredSales,
    totals: {
      tax: money(salesTax),
      discount: money(salesDiscount),
      total: money(filteredSales.reduce((a, r) => a + Number(r.total || 0), 0)),
      received: money(salesReceived),
      balance: money(salesBalance)
    },
    columns: [{
      key: 'invoice',
      label: 'Fatura',
      value: r => r.invoiceNo || String(r.id).slice(-6).toUpperCase()
    }, {
      key: 'date',
      label: 'Data',
      value: r => reportDateOnly(r.createdAt)
    }, {
      key: 'customer',
      label: 'Klienti',
      value: r => r.customerName || 'Walk-in'
    }, {
      key: 'payment',
      label: 'Pagesa',
      value: r => r.paymentMethod || '-'
    }, {
      key: 'tax',
      label: 'TVSH',
      value: r => money(r.tax)
    }, {
      key: 'discount',
      label: 'Zbritje',
      value: r => money(r.discount)
    }, {
      key: 'total',
      label: 'Totali',
      value: r => money(r.total)
    }, {
      key: 'received',
      label: 'Arkëtuar',
      value: r => money(r.paymentMethod === 'Credit' ? 0 : r.total)
    }, {
      key: 'balance',
      label: 'Balancë',
      value: r => money(r.paymentMethod === 'Credit' ? r.total : 0)
    }]
  })), React.createElement("div", null, React.createElement(ReportBars, {
    title: "Top artikuj sipas shitjes",
    icon: "fa-ranking-star",
    rows: itemRows,
    labelKey: "name",
    valueKey: "sales"
  }))), tab === 'salesDetail' && React.createElement(ReportTable, {
    filters: activeFilters,
    title: "Regjistri Analitik i Shitjeve",
    icon: "fa-list",
    rows: salesDetailRows,
    totals: {
      qty: salesDetailRows.reduce((a, r) => a + Number(r.qty || 0), 0),
      free: salesDetailRows.reduce((a, r) => a + Number(r.free || 0), 0),
      tax: money(salesDetailRows.reduce((a, r) => a + r.tax, 0)),
      total: money(salesDetailRows.reduce((a, r) => a + r.total, 0))
    },
    columns: [{
      key: 'invoiceNo',
      label: 'Fatura',
      value: r => r.invoiceNo
    }, {
      key: 'date',
      label: 'Data',
      value: r => reportDateOnly(r.date)
    }, {
      key: 'customer',
      label: 'Klienti',
      value: r => r.customer
    }, {
      key: 'item',
      label: 'Artikulli',
      value: r => r.item
    }, {
      key: 'sku',
      label: 'Kodi',
      value: r => r.sku
    }, {
      key: 'unit',
      label: 'Njësia',
      value: r => r.unit
    }, {
      key: 'qty',
      label: 'Sasia',
      value: r => r.qty
    }, {
      key: 'free',
      label: 'Falas',
      value: r => r.free
    }, {
      key: 'qty2',
      label: 'Në dy njësi',
      value: r => r.qty2
    }, {
      key: 'price',
      label: 'Çmimi pa TVSH',
      value: r => money(r.price)
    }, {
      key: 'net',
      label: 'Vlera pa TVSH',
      value: r => money(r.net || 0)
    }, {
      key: 'tax',
      label: 'TVSH',
      value: r => money(r.tax)
    }, {
      key: 'total',
      label: 'Vlera me TVSH',
      value: r => money(r.total)
    }, {
      key: 'warehouse',
      label: 'Magazina',
      value: r => r.warehouse
    }]
  }), tab === 'items' && React.createElement(ReportTable, {
    filters: activeFilters,
    title: "Shitje sipas Artikullit",
    icon: "fa-boxes-stacked",
    rows: itemRows,
    totals: {
      qtyBase: formatQtyTwoUnits(itemRows.reduce((a, r) => a + r.qtyBase, 0), products[0] || {}),
      sales: money(itemRows.reduce((a, r) => a + r.sales, 0)),
      cost: money(itemRows.reduce((a, r) => a + r.cost, 0)),
      profit: money(itemRows.reduce((a, r) => a + r.profit, 0))
    },
    columns: [{
      key: 'name',
      label: 'Artikulli',
      value: r => r.name
    }, {
      key: 'sku',
      label: 'Kodi',
      value: r => r.sku
    }, {
      key: 'unit',
      label: 'Njësia',
      value: r => r.unit
    }, {
      key: 'price',
      label: 'Çmimi',
      value: r => money(r.price)
    }, {
      key: 'qtyBase',
      label: 'Sasia dy njësi',
      value: r => formatQtyTwoUnits(r.qtyBase, productById[r.productId], r.unitKey)
    }, {
      key: 'freeBase',
      label: 'Falas dy njësi',
      value: r => formatQtyTwoUnits(r.freeBase, productById[r.productId], r.unitKey)
    }, {
      key: 'clients',
      label: 'Klientë',
      value: r => r.clientsText
    }, {
      key: 'warehouse',
      label: 'Magazina',
      value: r => r.warehouse
    }, {
      key: 'sales',
      label: 'Vlera shitjes',
      value: r => money(r.sales)
    }, {
      key: 'cost',
      label: 'Kosto',
      value: r => money(r.cost)
    }, {
      key: 'profit',
      label: 'Fitimi',
      value: r => money(r.profit)
    }, {
      key: 'margin',
      label: 'Marzhi %',
      value: r => r.sales ? (r.profit / r.sales * 100).toFixed(2) + '%' : '0%'
    }]
  }), tab === 'daily' && React.createElement(ReportTable, {
    filters: activeFilters,
    title: "P\xEBrmbledhje Shitjesh Ditore",
    icon: "fa-calendar-day",
    rows: dailyRows,
    totals: {
      invoices: dailyRows.reduce((a, r) => a + r.invoices, 0),
      qty: dailyRows.reduce((a, r) => a + r.qty, 0),
      subtotal: money(dailyRows.reduce((a, r) => a + r.subtotal, 0)),
      discount: money(dailyRows.reduce((a, r) => a + r.discount, 0)),
      tax: money(dailyRows.reduce((a, r) => a + r.tax, 0)),
      total: money(dailyRows.reduce((a, r) => a + r.total, 0)),
      received: money(dailyRows.reduce((a, r) => a + r.received, 0)),
      balance: money(dailyRows.reduce((a, r) => a + r.balance, 0)),
      profit: money(dailyRows.reduce((a, r) => a + r.profit, 0))
    },
    columns: [{
      key: 'date',
      label: 'Data',
      value: r => reportDateOnly(r.date)
    }, {
      key: 'invoices',
      label: 'Fatura',
      value: r => r.invoices
    }, {
      key: 'qty',
      label: 'Sasi bazë',
      value: r => r.qty
    }, {
      key: 'subtotal',
      label: 'Nëntotal',
      value: r => money(r.subtotal)
    }, {
      key: 'discount',
      label: 'Zbritje',
      value: r => money(r.discount)
    }, {
      key: 'tax',
      label: 'TVSH',
      value: r => money(r.tax)
    }, {
      key: 'total',
      label: 'Totali',
      value: r => money(r.total)
    }, {
      key: 'received',
      label: 'Arkëtuar',
      value: r => money(r.received)
    }, {
      key: 'balance',
      label: 'Balancë',
      value: r => money(r.balance)
    }, {
      key: 'profit',
      label: 'Fitim',
      value: r => money(r.profit)
    }]
  }), tab === 'payment' && React.createElement(ReportTable, {
    filters: activeFilters,
    title: "Shitje sipas M\xEBnyr\xEBs s\xEB Pages\xEBs",
    icon: "fa-credit-card",
    rows: paymentRows,
    totals: {
      invoices: paymentRows.reduce((a, r) => a + r.invoices, 0),
      total: money(paymentRows.reduce((a, r) => a + r.total, 0)),
      received: money(paymentRows.reduce((a, r) => a + r.received, 0)),
      balance: money(paymentRows.reduce((a, r) => a + r.balance, 0))
    },
    columns: [{
      key: 'method',
      label: 'Pagesa',
      value: r => r.method
    }, {
      key: 'invoices',
      label: 'Fatura',
      value: r => r.invoices
    }, {
      key: 'total',
      label: 'Totali',
      value: r => money(r.total)
    }, {
      key: 'received',
      label: 'Arkëtuar',
      value: r => money(r.received)
    }, {
      key: 'balance',
      label: 'Balancë',
      value: r => money(r.balance)
    }]
  }), tab === 'customers' && React.createElement(ReportTable, {
    filters: activeFilters,
    title: "Shitje sipas Klientit",
    icon: "fa-users",
    rows: customerSalesRows,
    totals: {
      invoices: customerSalesRows.reduce((a, r) => a + r.invoices, 0),
      qty: customerSalesRows.reduce((a, r) => a + r.qty, 0),
      total: money(customerSalesRows.reduce((a, r) => a + r.total, 0)),
      received: money(customerSalesRows.reduce((a, r) => a + r.received, 0)),
      balance: money(customerSalesRows.reduce((a, r) => a + r.balance, 0))
    },
    columns: [{
      key: 'customer',
      label: 'Klienti',
      value: r => r.customer
    }, {
      key: 'invoices',
      label: 'Fatura',
      value: r => r.invoices
    }, {
      key: 'qty',
      label: 'Sasia',
      value: r => r.qty
    }, {
      key: 'total',
      label: 'Shitje',
      value: r => money(r.total)
    }, {
      key: 'received',
      label: 'Arkëtuar',
      value: r => money(r.received)
    }, {
      key: 'balance',
      label: 'Balancë',
      value: r => money(r.balance)
    }, {
      key: 'lastSale',
      label: 'Shitja e fundit',
      value: r => reportDateOnly(r.lastSale)
    }]
  }), tab === 'summary' && React.createElement(ReportTable, {
    filters: activeFilters,
    title: "P\xEBrmbledh\xEBse Blerjesh dhe Shitjesh",
    icon: "fa-scale-balanced",
    rows: summaryRows,
    totals: {
      amount: money(netProfit)
    },
    columns: [{
      key: 'name',
      label: 'Moduli',
      value: r => r.name
    }, {
      key: 'invoices',
      label: 'Dokumente',
      value: r => r.invoices
    }, {
      key: 'lines',
      label: 'Rreshta',
      value: r => r.lines
    }, {
      key: 'amount',
      label: 'Vlera',
      value: r => money(r.amount)
    }]
  }), tab === 'analytic' && React.createElement(ReportTable, {
    filters: activeFilters,
    title: "Regjistri Analitik Shitje / Blerje",
    icon: "fa-table-list",
    rows: analyticRows,
    totals: {
      debit: money(analyticRows.reduce((a, r) => a + r.debit, 0)),
      credit: money(analyticRows.reduce((a, r) => a + r.credit, 0))
    },
    columns: [{
      key: 'date',
      label: 'Data',
      value: r => reportDateOnly(r.date)
    }, {
      key: 'type',
      label: 'Lloji',
      value: r => r.type
    }, {
      key: 'doc',
      label: 'Dokumenti',
      value: r => r.doc
    }, {
      key: 'party',
      label: 'Klient/Furnitor',
      value: r => r.party
    }, {
      key: 'item',
      label: 'Artikulli',
      value: r => r.item
    }, {
      key: 'unit',
      label: 'Njësia',
      value: r => r.unit
    }, {
      key: 'qty2',
      label: 'Sasia dy njësi',
      value: r => r.qty2
    }, {
      key: 'price',
      label: 'Çmimi/Kosto',
      value: r => money(r.price)
    }, {
      key: 'debit',
      label: 'Shitje',
      value: r => money(r.debit)
    }, {
      key: 'credit',
      label: 'Blerje',
      value: r => money(r.credit)
    }, {
      key: 'warehouse',
      label: 'Magazina',
      value: r => r.warehouse
    }]
  }), tab === 'supplierLedger' && React.createElement(ReportTable, {
    filters: activeFilters,
    title: "Kartel\xEB Furnitori",
    icon: "fa-truck-field",
    rows: supplierLedgerRows,
    totals: {
      debit: money(supplierLedgerRows.reduce((a, r) => a + r.debit, 0)),
      credit: money(supplierLedgerRows.reduce((a, r) => a + r.credit, 0)),
      balance: money(supplierLedgerRows.reduce((a, r) => Number(r.balance || 0), 0))
    },
    columns: [{
      key: 'date',
      label: 'Data',
      value: r => r.date ? reportDateOnly(r.date) : '-'
    }, {
      key: 'supplier',
      label: 'Furnitori',
      value: r => r.supplier
    }, {
      key: 'type',
      label: 'Veprimi',
      value: r => r.type
    }, {
      key: 'doc',
      label: 'Dokumenti',
      value: r => r.doc
    }, {
      key: 'debit',
      label: 'Debi/Faturim',
      value: r => money(r.debit)
    }, {
      key: 'credit',
      label: 'Kredi/Pagesë',
      value: r => money(r.credit)
    }, {
      key: 'balance',
      label: 'Balanca',
      value: r => money(r.balance)
    }]
  }), tab === 'billing' && React.createElement(ReportTable, {
    filters: activeFilters,
    title: "Faturime dhe Pagesa Klient/Furnitor",
    icon: "fa-file-invoice-dollar",
    rows: billingRows,
    totals: {
      invoice: money(billingRows.reduce((a, r) => a + r.invoice, 0)),
      payment: money(billingRows.reduce((a, r) => a + r.payment, 0)),
      balance: money(billingRows.reduce((a, r) => a + r.balance, 0))
    },
    columns: [{
      key: 'date',
      label: 'Data',
      value: r => reportDateOnly(r.date)
    }, {
      key: 'party',
      label: 'Klient/Furnitor',
      value: r => r.party
    }, {
      key: 'kind',
      label: 'Lloji',
      value: r => r.kind
    }, {
      key: 'type',
      label: 'Veprimi',
      value: r => r.type
    }, {
      key: 'doc',
      label: 'Dokumenti',
      value: r => r.doc
    }, {
      key: 'invoice',
      label: 'Faturim',
      value: r => money(r.invoice)
    }, {
      key: 'payment',
      label: 'Pagesë',
      value: r => money(r.payment)
    }, {
      key: 'balance',
      label: 'Balanca',
      value: r => money(r.balance)
    }]
  }), tab === 'itemCard' && React.createElement(ReportTable, {
    filters: activeFilters,
    title: "Kartel\xEB Artikulli",
    icon: "fa-clipboard-list",
    rows: itemCardRows,
    totals: {
      debit: money(itemCardRows.reduce((a, r) => a + r.debit, 0)),
      credit: money(itemCardRows.reduce((a, r) => a + r.credit, 0))
    },
    columns: [{
      key: 'date',
      label: 'Data',
      value: r => reportDateOnly(r.date)
    }, {
      key: 'type',
      label: 'Veprimi',
      value: r => r.type
    }, {
      key: 'doc',
      label: 'Dokumenti',
      value: r => r.doc
    }, {
      key: 'party',
      label: 'Klient/Furnitor',
      value: r => r.party
    }, {
      key: 'item',
      label: 'Artikulli',
      value: r => r.item
    }, {
      key: 'unit',
      label: 'Njësia',
      value: r => r.unit
    }, {
      key: 'qty2',
      label: 'Sasia dy njësi',
      value: r => r.qty2
    }, {
      key: 'price',
      label: 'Çmimi/Kosto',
      value: r => money(r.price)
    }, {
      key: 'debit',
      label: 'Shitje',
      value: r => money(r.debit)
    }, {
      key: 'credit',
      label: 'Blerje',
      value: r => money(r.credit)
    }, {
      key: 'warehouse',
      label: 'Magazina',
      value: r => r.warehouse
    }]
  }), tab === 'itemAnalysis' && React.createElement(ReportTable, {
    filters: activeFilters,
    title: "Analiz\xEB Artikulli",
    icon: "fa-magnifying-glass-chart",
    rows: itemAnalysisRows,
    totals: {
      sales: money(itemAnalysisRows.reduce((a, r) => a + r.sales, 0)),
      cost: money(itemAnalysisRows.reduce((a, r) => a + r.cost, 0)),
      profit: money(itemAnalysisRows.reduce((a, r) => a + r.profit, 0))
    },
    columns: [{
      key: 'name',
      label: 'Artikulli',
      value: r => r.name
    }, {
      key: 'sku',
      label: 'Kodi',
      value: r => r.sku
    }, {
      key: 'category',
      label: 'Kategoria',
      value: r => r.category
    }, {
      key: 'unit',
      label: 'Njësia',
      value: r => r.unit
    }, {
      key: 'qty',
      label: 'Sasia shitur',
      value: r => r.qty
    }, {
      key: 'free',
      label: 'Falas',
      value: r => r.free
    }, {
      key: 'price',
      label: 'Çmimi',
      value: r => money(r.price)
    }, {
      key: 'sales',
      label: 'Shitje',
      value: r => money(r.sales)
    }, {
      key: 'cost',
      label: 'Kosto',
      value: r => money(r.cost)
    }, {
      key: 'profit',
      label: 'Fitimi',
      value: r => money(r.profit)
    }, {
      key: 'margin',
      label: 'Marzhi %',
      value: r => r.margin.toFixed(2) + '%'
    }, {
      key: 'clients',
      label: 'Klientë',
      value: r => r.clients
    }, {
      key: 'warehouse',
      label: 'Magazina',
      value: r => r.warehouse
    }]
  }), tab === 'partyActions' && React.createElement(ReportTable, {
    filters: activeFilters,
    title: "Analiz\xEB Veprime Klient/Furnitor",
    icon: "fa-people-arrows",
    rows: partyActionRows,
    totals: {
      debit: money(partyActionRows.reduce((a, r) => a + r.debit, 0)),
      credit: money(partyActionRows.reduce((a, r) => a + r.credit, 0)),
      net: money(partyActionRows.reduce((a, r) => a + r.net, 0))
    },
    columns: [{
      key: 'date',
      label: 'Data',
      value: r => reportDateOnly(r.date)
    }, {
      key: 'party',
      label: 'Palë',
      value: r => r.party
    }, {
      key: 'kind',
      label: 'Lloji',
      value: r => r.kind
    }, {
      key: 'action',
      label: 'Veprimi',
      value: r => r.action
    }, {
      key: 'doc',
      label: 'Dokumenti',
      value: r => r.doc
    }, {
      key: 'debit',
      label: 'Debi',
      value: r => money(r.debit)
    }, {
      key: 'credit',
      label: 'Kredi',
      value: r => money(r.credit)
    }, {
      key: 'net',
      label: 'Neto',
      value: r => money(r.net)
    }]
  }), tab === 'stock' && React.createElement(ReportTable, {
    filters: activeFilters,
    title: "P\xEBrmbledhje Stoku",
    icon: "fa-warehouse",
    rows: stockRows,
    totals: {
      qty: stockRows.reduce((a, r) => a + r.qty, 0),
      value: money(stockValue),
      sellingValue: money(stockRows.reduce((a, r) => a + r.sellingValue, 0))
    },
    columns: [{
      key: 'name',
      label: 'Artikulli',
      value: r => r.name
    }, {
      key: 'sku',
      label: 'Kodi',
      value: r => r.sku
    }, {
      key: 'category',
      label: 'Kategoria',
      value: r => r.category
    }, {
      key: 'warehouse',
      label: 'Magazina',
      value: r => r.warehouse
    }, {
      key: 'qty2',
      label: 'Gjendje dy njësi',
      value: r => r.qty2
    }, {
      key: 'cost',
      label: 'Kosto',
      value: r => money(r.cost)
    }, {
      key: 'price',
      label: 'Çmim shitje',
      value: r => money(r.price)
    }, {
      key: 'value',
      label: 'Vlera kosto',
      value: r => money(r.value)
    }, {
      key: 'sellingValue',
      label: 'Vlera shitje',
      value: r => money(r.sellingValue)
    }, {
      key: 'reorder',
      label: 'Min.',
      value: r => r.reorder
    }, {
      key: 'status',
      label: 'Statusi',
      value: r => r.status
    }]
  }), tab === 'warehouse' && React.createElement(ReportTable, {
    filters: activeFilters,
    title: "Gjendje Magazine",
    icon: "fa-boxes-packing",
    rows: warehouseRows,
    totals: {
      qty: warehouseRows.reduce((a, r) => a + r.qty, 0),
      value: money(warehouseRows.reduce((a, r) => a + r.value, 0))
    },
    columns: [{
      key: 'warehouse',
      label: 'Magazina',
      value: r => r.warehouse
    }, {
      key: 'name',
      label: 'Artikulli',
      value: r => r.name
    }, {
      key: 'sku',
      label: 'Kodi',
      value: r => r.sku
    }, {
      key: 'category',
      label: 'Kategoria',
      value: r => r.category
    }, {
      key: 'qty2',
      label: 'Gjendje dy njësi',
      value: r => r.qty2
    }, {
      key: 'cost',
      label: 'Kosto',
      value: r => money(r.cost)
    }, {
      key: 'value',
      label: 'Vlera stoku',
      value: r => money(r.value)
    }, {
      key: 'status',
      label: 'Statusi',
      value: r => r.status
    }]
  }), tab === 'stockDetail' && React.createElement(ReportTable, {
    filters: activeFilters,
    title: "Kartel\xEB / Detaje L\xEBvizje Stoku",
    icon: "fa-list-check",
    rows: stockDetailRows,
    totals: {
      qty: stockDetailRows.reduce((a, r) => a + r.qty, 0)
    },
    columns: [{
      key: 'date',
      label: 'Data',
      value: r => reportDateOnly(r.date)
    }, {
      key: 'product',
      label: 'Artikulli',
      value: r => r.product
    }, {
      key: 'sku',
      label: 'Kodi',
      value: r => r.sku
    }, {
      key: 'warehouse',
      label: 'Magazina',
      value: r => r.warehouse
    }, {
      key: 'type',
      label: 'Lloji',
      value: r => r.type
    }, {
      key: 'qty2',
      label: 'Sasia dy njësi',
      value: r => r.qty2
    }, {
      key: 'unit',
      label: 'Njësia',
      value: r => r.unit
    }, {
      key: 'reason',
      label: 'Arsyeja',
      value: r => r.reason
    }, {
      key: 'reference',
      label: 'Referencë',
      value: r => r.reference
    }]
  }), tab === 'lowStock' && React.createElement(ReportTable, {
    filters: activeFilters,
    title: "Raport Stok i Ul\xEBt",
    icon: "fa-triangle-exclamation",
    rows: lowStockRows,
    totals: {
      qty: lowStockRows.reduce((a, r) => a + r.qty, 0),
      suggested: lowStockRows.reduce((a, r) => a + r.suggested, 0),
      value: money(lowStockRows.reduce((a, r) => a + r.value, 0))
    },
    columns: [{
      key: 'name',
      label: 'Artikulli',
      value: r => r.name
    }, {
      key: 'sku',
      label: 'Kodi',
      value: r => r.sku
    }, {
      key: 'category',
      label: 'Kategoria',
      value: r => r.category
    }, {
      key: 'warehouse',
      label: 'Magazina',
      value: r => r.warehouse
    }, {
      key: 'qty2',
      label: 'Gjendje dy njësi',
      value: r => r.qty2
    }, {
      key: 'reorder',
      label: 'Minimum',
      value: r => r.reorder
    }, {
      key: 'suggested',
      label: 'Duhet furnizuar',
      value: r => r.suggested
    }, {
      key: 'value',
      label: 'Vlera kosto',
      value: r => money(r.value)
    }]
  }), tab === 'slow' && React.createElement(ReportTable, {
    filters: activeFilters,
    title: "Artikuj pa Shitje n\xEB Periudh\xEB",
    icon: "fa-hourglass-half",
    rows: slowRows,
    totals: {
      qty: slowRows.reduce((a, r) => a + r.qty, 0),
      value: money(slowRows.reduce((a, r) => a + r.value, 0))
    },
    columns: [{
      key: 'name',
      label: 'Artikulli',
      value: r => r.name
    }, {
      key: 'sku',
      label: 'Kodi',
      value: r => r.sku
    }, {
      key: 'category',
      label: 'Kategoria',
      value: r => r.category
    }, {
      key: 'warehouse',
      label: 'Magazina',
      value: r => r.warehouse
    }, {
      key: 'qty2',
      label: 'Gjendje dy njësi',
      value: r => r.qty2
    }, {
      key: 'value',
      label: 'Vlera stoku',
      value: r => money(r.value)
    }, {
      key: 'lastSold',
      label: 'Shitja e fundit',
      value: r => r.lastSold
    }]
  }), tab === 'reorder' && React.createElement(ReportTable, {
    filters: activeFilters,
    title: "K\xEBrkes\xEB Furnizimi",
    icon: "fa-cart-plus",
    rows: reorderRows,
    totals: {
      qty: reorderRows.reduce((a, r) => a + r.qty, 0),
      orderQty: reorderRows.reduce((a, r) => a + r.orderQty, 0)
    },
    columns: [{
      key: 'name',
      label: 'Artikulli',
      value: r => r.name
    }, {
      key: 'sku',
      label: 'Kodi',
      value: r => r.sku
    }, {
      key: 'category',
      label: 'Kategoria',
      value: r => r.category
    }, {
      key: 'warehouse',
      label: 'Magazina',
      value: r => r.warehouse
    }, {
      key: 'qty2',
      label: 'Gjendje dy njësi',
      value: r => r.qty2
    }, {
      key: 'reorder',
      label: 'Minimum',
      value: r => r.reorder
    }, {
      key: 'orderQty',
      label: 'Sasia për porosi',
      value: r => r.orderQty
    }, {
      key: 'cost',
      label: 'Kosto',
      value: r => money(r.cost)
    }, {
      key: 'value',
      label: 'Vlera porosie',
      value: r => money(r.orderQty * r.cost)
    }]
  }), tab === 'purchases' && React.createElement(ReportTable, {
    filters: activeFilters,
    title: "Raport Blerjesh",
    icon: "fa-file-invoice-dollar",
    rows: purchaseRows,
    totals: {
      items: purchaseRows.reduce((a, r) => a + r.items, 0),
      qty: purchaseRows.reduce((a, r) => a + r.qty, 0),
      total: money(purchaseRows.reduce((a, r) => a + r.total, 0))
    },
    columns: [{
      key: 'poNumber',
      label: 'Nr. Porosie',
      value: r => r.poNumber
    }, {
      key: 'date',
      label: 'Data',
      value: r => reportDateOnly(r.date)
    }, {
      key: 'supplier',
      label: 'Furnitori',
      value: r => r.supplier
    }, {
      key: 'items',
      label: 'Rreshta',
      value: r => r.items
    }, {
      key: 'unitSummary',
      label: 'Njësitë',
      value: r => r.unitSummary
    }, {
      key: 'qty',
      label: 'Sasia bazë',
      value: r => r.qty
    }, {
      key: 'status',
      label: 'Statusi',
      value: r => r.status
    }, {
      key: 'total',
      label: 'Totali',
      value: r => money(r.total)
    }]
  }), tab === 'purchaseItems' && React.createElement(ReportTable, {
    filters: activeFilters,
    title: "Blerje sipas Artikullit",
    icon: "fa-box-open",
    rows: purchaseItemRows,
    totals: {
      qtyBase: purchaseItemRows.reduce((a, r) => a + r.qtyBase, 0),
      cost: money(purchaseItemRows.reduce((a, r) => a + r.cost, 0))
    },
    columns: [{
      key: 'name',
      label: 'Artikulli',
      value: r => r.name
    }, {
      key: 'sku',
      label: 'Kodi',
      value: r => r.sku
    }, {
      key: 'unit',
      label: 'Njësia',
      value: r => r.unit
    }, {
      key: 'qty',
      label: 'Sasia blerë',
      value: r => r.qty
    }, {
      key: 'qtyBase',
      label: 'Sasi bazë',
      value: r => r.qtyBase
    }, {
      key: 'suppliers',
      label: 'Furnitorë',
      value: r => r.suppliersText
    }, {
      key: 'avgCost',
      label: 'Kosto mesatare',
      value: r => money(r.avgCost)
    }, {
      key: 'cost',
      label: 'Vlera blerje',
      value: r => money(r.cost)
    }]
  }), tab === 'suppliers' && React.createElement(ReportTable, {
    filters: activeFilters,
    title: "Blerje sipas Furnitorit",
    icon: "fa-truck-field",
    rows: supplierPurchaseRows,
    totals: {
      pos: supplierPurchaseRows.reduce((a, r) => a + r.pos, 0),
      qty: supplierPurchaseRows.reduce((a, r) => a + r.qty, 0),
      total: money(supplierPurchaseRows.reduce((a, r) => a + r.total, 0))
    },
    columns: [{
      key: 'supplier',
      label: 'Furnitori',
      value: r => r.supplier
    }, {
      key: 'pos',
      label: 'Porosi',
      value: r => r.pos
    }, {
      key: 'qty',
      label: 'Sasia bazë',
      value: r => r.qty
    }, {
      key: 'total',
      label: 'Blerje',
      value: r => money(r.total)
    }, {
      key: 'lastPurchase',
      label: 'Blerja e fundit',
      value: r => reportDateOnly(r.lastPurchase)
    }]
  }), tab === 'profit' && React.createElement("div", null, React.createElement(ReportKpis, {
    items: [{
      label: 'Shitje',
      value: money(salesTotal)
    }, {
      label: 'Kosto mallrash',
      value: money(itemRows.reduce((a, r) => a + r.cost, 0))
    }, {
      label: 'Shpenzime',
      value: money(expenseTotal)
    }, {
      label: 'Fitim neto',
      value: money(netProfit)
    }]
  }), React.createElement(ReportTable, {
    filters: activeFilters,
    title: "Fitim & Humbje",
    icon: "fa-chart-line",
    rows: [{
      name: 'Shitje bruto',
      amount: salesTotal
    }, {
      name: 'Kthime shitje',
      amount: -returnsTotal
    }, {
      name: 'Kosto mallrash',
      amount: -itemRows.reduce((a, r) => a + r.cost, 0)
    }, {
      name: 'Fitim bruto',
      amount: grossProfit - returnsTotal
    }, {
      name: 'Shpenzime operative',
      amount: -expenseTotal
    }, {
      name: 'Fitim neto',
      amount: netProfit
    }],
    totals: {
      amount: money(netProfit)
    },
    columns: [{
      key: 'name',
      label: 'Përshkrimi',
      value: r => r.name
    }, {
      key: 'amount',
      label: 'Shuma',
      value: r => money(r.amount)
    }]
  })), tab === 'vat' && React.createElement(ReportTable, {
    filters: activeFilters,
    title: "Raport TVSH",
    icon: "fa-percent",
    rows: vatRows,
    totals: {
      net: money(vatRows.reduce((a, r) => a + r.net, 0)),
      tax: money(vatRows.reduce((a, r) => a + r.tax, 0)),
      total: money(vatRows.reduce((a, r) => a + r.total, 0))
    },
    columns: [{
      key: 'invoiceNo',
      label: 'Fatura',
      value: r => r.invoiceNo
    }, {
      key: 'date',
      label: 'Data',
      value: r => reportDateOnly(r.date)
    }, {
      key: 'customer',
      label: 'Klienti',
      value: r => r.customer
    }, {
      key: 'rate',
      label: 'Norma %',
      value: r => r.rate
    }, {
      key: 'net',
      label: 'Vlera pa TVSH',
      value: r => money(r.net)
    }, {
      key: 'tax',
      label: 'TVSH',
      value: r => money(r.tax)
    }, {
      key: 'total',
      label: 'Vlera me TVSH',
      value: r => money(r.total)
    }]
  }), tab === 'expenses' && React.createElement(ReportTable, {
    filters: activeFilters,
    title: "Raport Shpenzimesh",
    icon: "fa-money-bill-trend-up",
    rows: expenseRows,
    totals: {
      amount: money(expenseTotal)
    },
    columns: [{
      key: 'date',
      label: 'Data',
      value: r => reportDateOnly(r.date)
    }, {
      key: 'category',
      label: 'Kategoria',
      value: r => r.category
    }, {
      key: 'vendor',
      label: 'Furnitori/Marrësi',
      value: r => r.vendor
    }, {
      key: 'paymentMethod',
      label: 'Pagesa',
      value: r => r.paymentMethod
    }, {
      key: 'notes',
      label: 'Shënime',
      value: r => r.notes
    }, {
      key: 'amount',
      label: 'Shuma',
      value: r => money(r.amount)
    }]
  }), tab === 'expenseCategory' && React.createElement(ReportTable, {
    filters: activeFilters,
    title: "Shpenzime sipas Kategoris\xEB",
    icon: "fa-tags",
    rows: expenseCategoryRows,
    totals: {
      count: expenseCategoryRows.reduce((a, r) => a + r.count, 0),
      amount: money(expenseCategoryRows.reduce((a, r) => a + r.amount, 0))
    },
    columns: [{
      key: 'category',
      label: 'Kategoria',
      value: r => r.category
    }, {
      key: 'count',
      label: 'Nr.',
      value: r => r.count
    }, {
      key: 'amount',
      label: 'Shuma',
      value: r => money(r.amount)
    }]
  }), tab === 'returns' && React.createElement("div", {
    className: "report-two-col"
  }, React.createElement(ReportTable, {
    filters: activeFilters,
    title: "Raport Kthimesh",
    icon: "fa-rotate-left",
    rows: returnRows,
    totals: {
      lines: returnRows.reduce((a, r) => a + r.lines, 0),
      qty: returnRows.reduce((a, r) => a + r.qty, 0),
      total: money(returnRows.reduce((a, r) => a + r.total, 0))
    },
    columns: [{
      key: 'date',
      label: 'Data',
      value: r => reportDateOnly(r.date)
    }, {
      key: 'saleId',
      label: 'ID Shitje',
      value: r => r.saleId
    }, {
      key: 'lines',
      label: 'Rreshta',
      value: r => r.lines
    }, {
      key: 'qty',
      label: 'Sasia',
      value: r => r.qty
    }, {
      key: 'total',
      label: 'Vlera kthyer',
      value: r => money(r.total)
    }, {
      key: 'processedBy',
      label: 'Përpunuar nga',
      value: r => r.processedBy
    }]
  }), React.createElement(ReportTable, {
    filters: activeFilters,
    title: "Kthime sipas Artikullit",
    icon: "fa-boxes-packing",
    rows: returnItemRows,
    totals: {
      qty: returnItemRows.reduce((a, r) => a + r.qty, 0),
      total: money(returnItemRows.reduce((a, r) => a + r.total, 0))
    },
    columns: [{
      key: 'name',
      label: 'Artikulli',
      value: r => r.name
    }, {
      key: 'sku',
      label: 'Kodi',
      value: r => r.sku
    }, {
      key: 'qty',
      label: 'Sasia',
      value: r => r.qty
    }, {
      key: 'total',
      label: 'Vlera',
      value: r => money(r.total)
    }]
  })), tab === 'parties' && React.createElement("div", {
    className: "report-two-col"
  }, React.createElement(ReportTable, {
    filters: activeFilters,
    title: "Kartela Klient\xEBsh",
    icon: "fa-address-book",
    rows: customerRows,
    totals: {
      invoices: customerRows.reduce((a, r) => a + r.invoices, 0),
      total: money(customerRows.reduce((a, r) => a + r.total, 0)),
      balance: money(customerRows.reduce((a, r) => a + r.balance, 0))
    },
    columns: [{
      key: 'name',
      label: 'Klienti',
      value: r => r.name
    }, {
      key: 'phone',
      label: 'Telefoni',
      value: r => r.phone
    }, {
      key: 'type',
      label: 'Tipi',
      value: r => r.type
    }, {
      key: 'invoices',
      label: 'Fatura',
      value: r => r.invoices
    }, {
      key: 'total',
      label: 'Shitje',
      value: r => money(r.total)
    }, {
      key: 'balance',
      label: 'Balancë',
      value: r => money(r.balance)
    }, {
      key: 'status',
      label: 'Statusi',
      value: r => r.status
    }]
  }), React.createElement(ReportTable, {
    filters: activeFilters,
    title: "Kartela Furnitor\xEBsh",
    icon: "fa-truck-field",
    rows: supplierRows,
    totals: {
      pos: supplierRows.reduce((a, r) => a + r.pos, 0),
      total: money(supplierRows.reduce((a, r) => a + r.total, 0)),
      paid: money(supplierRows.reduce((a, r) => a + r.paid, 0)),
      payable: money(supplierRows.reduce((a, r) => a + r.payable, 0))
    },
    columns: [{
      key: 'name',
      label: 'Furnitori',
      value: r => r.name
    }, {
      key: 'contact',
      label: 'Kontakti',
      value: r => r.contact
    }, {
      key: 'phone',
      label: 'Telefoni',
      value: r => r.phone
    }, {
      key: 'pos',
      label: 'Porosi',
      value: r => r.pos
    }, {
      key: 'total',
      label: 'Blerje',
      value: r => money(r.total)
    }, {
      key: 'paid',
      label: 'Paguar',
      value: r => money(r.paid)
    }, {
      key: 'payable',
      label: 'Detyrim',
      value: r => money(r.payable)
    }]
  })));
}
function LogsView() {
  const {
    loading,
    data
  } = useFetch(() => fbGetLogs(), []);
  const logs = useMemo(() => data && data.success ? data.data : [], [data]);
  const [qSearch, setQSearch] = useState('');
  const filtered = useMemo(() => {
    const q = qSearch.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter(l => [l.action, l.detail, l.user, formatDateForDisplay(l.ts)].join(' ').toLowerCase().includes(q));
  }, [logs, qSearch]);
  const headers = ['Action', 'Detail', 'User', 'When'];
  const exportRows = filtered.map(l => ({
    Action: l.action,
    Detail: l.detail,
    User: l.user,
    When: formatDateForDisplay(l.ts)
  }));
  return React.createElement("div", {
    className: "data-section"
  }, React.createElement("div", {
    className: "section-header"
  }, React.createElement("h2", null, React.createElement("i", {
    className: "fas fa-history"
  }), " Aktiviteti"), React.createElement("div", {
    className: "erp-export-bar"
  }, React.createElement("button", {
    className: "btn btn-excel",
    disabled: !exportRows.length,
    onClick: () => erpExportXlsx('Activity_Logs', headers, exportRows, null, {
      Kërkim: qSearch || '-'
    })
  }, React.createElement("i", {
    className: "fas fa-file-excel"
  }), " Excel"), React.createElement("button", {
    className: "btn btn-pdf",
    disabled: !exportRows.length,
    onClick: () => erpExportPdf('Activity_Logs', headers, exportRows, null, {
      Kërkim: qSearch || '-'
    })
  }, React.createElement("i", {
    className: "fas fa-file-pdf"
  }), " PDF"), React.createElement("button", {
    className: "btn btn-preview",
    disabled: !exportRows.length,
    onClick: () => erpPrintPreview('Activity_Logs', headers, exportRows, null, {
      Kërkim: qSearch || '-'
    })
  }, React.createElement("i", {
    className: "fas fa-print"
  }), " Preview"))), React.createElement("div", {
    className: "module-toolbar",
    style: {
      marginBottom: 12
    }
  }, React.createElement(GoogleSearchBox, {
    value: qSearch,
    onChange: setQSearch,
    placeholder: "K\xEBrko log\u2026 veprim, detaj, p\xEBrdorues\u2026"
  })), loading ? React.createElement(TableSkeleton, {
    rows: 6,
    columns: 4
  }) : React.createElement("div", {
    className: "about-table-wrapper"
  }, React.createElement("table", {
    className: "about-roles-table"
  }, React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", null, "Action"), React.createElement("th", null, "Detail"), React.createElement("th", null, "User"), React.createElement("th", null, "When"))), React.createElement("tbody", null, filtered.length === 0 ? React.createElement("tr", null, React.createElement("td", {
    colSpan: "4",
    style: {
      textAlign: 'center',
      color: '#999'
    }
  }, "No activity yet.")) : filtered.map(l => React.createElement("tr", {
    key: l.id
  }, React.createElement("td", null, l.action), React.createElement("td", null, l.detail), React.createElement("td", null, l.user), React.createElement("td", null, formatDateForDisplay(l.ts)))))), React.createElement(SummaryBar, {
    items: [{
      label: 'Logje (filtruar)',
      value: filtered.length
    }, {
      label: 'Gjithsej',
      value: logs.length
    }]
  })));
}
function SupplierModal({
  editItem,
  onClose,
  onSave
}) {
  const [f, setF] = useState({
    name: editItem?.name || function () {
      try {
        const n = localStorage.getItem('erp_new_supplier_name');
        if (n) {
          localStorage.removeItem('erp_new_supplier_name');
          return n;
        }
      } catch (e) {}
      return '';
    }(),
    contact: editItem?.contact || '',
    phone: editItem?.phone || '',
    email: editItem?.email || '',
    address: editItem?.address || '',
    terms: editItem?.terms || '',
    openingBalance: editItem?.openingBalance ?? '',
    notes: editItem?.notes || ''
  });
  const [saving, setSaving] = useState(false);
  const upd = (k, v) => setF(p => ({
    ...p,
    [k]: v
  }));
  return React.createElement("div", {
    className: "modal-overlay",
    onClick: onClose
  }, React.createElement("div", {
    className: "modal",
    onClick: e => e.stopPropagation()
  }, React.createElement("div", {
    className: "modal-header"
  }, React.createElement("h3", null, React.createElement("i", {
    className: "fas fa-truck-field"
  }), " ", editItem ? 'Edit' : 'Add', " Supplier"), React.createElement("button", {
    className: "close-btn",
    onClick: onClose
  }, React.createElement("i", {
    className: "fas fa-times"
  }))), React.createElement("div", {
    className: "modal-body"
  }, React.createElement("form", {
    onSubmit: e => {
      e.preventDefault();
      setSaving(true);
      onSave({
        ...f,
        openingBalance: Number(f.openingBalance) || 0
      });
    }
  }, React.createElement("div", {
    className: "form-grid"
  }, React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Supplier Name *"), React.createElement("input", {
    type: "text",
    value: f.name,
    onChange: e => upd('name', e.target.value),
    required: true
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Contact Person"), React.createElement("input", {
    type: "text",
    value: f.contact,
    onChange: e => upd('contact', e.target.value)
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Phone"), React.createElement("input", {
    type: "text",
    value: f.phone,
    onChange: e => upd('phone', e.target.value)
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Email"), React.createElement("input", {
    type: "email",
    value: f.email,
    onChange: e => upd('email', e.target.value)
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Payment Terms"), React.createElement("input", {
    type: "text",
    placeholder: "Net 30, COD...",
    value: f.terms,
    onChange: e => upd('terms', e.target.value)
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Opening Balance (payable)"), React.createElement("input", {
    type: "number",
    step: "0.01",
    value: f.openingBalance,
    onChange: e => upd('openingBalance', e.target.value)
  }))), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Address"), React.createElement("textarea", {
    rows: "2",
    value: f.address,
    onChange: e => upd('address', e.target.value)
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Notes"), React.createElement("textarea", {
    rows: "2",
    value: f.notes,
    onChange: e => upd('notes', e.target.value)
  })), React.createElement("div", {
    className: "form-actions"
  }, React.createElement("button", {
    type: "submit",
    className: "btn btn-primary",
    disabled: saving
  }, saving ? React.createElement(React.Fragment, null, React.createElement("i", {
    className: "fas fa-spinner fa-spin"
  }), " Duke ruajtur...") : React.createElement(React.Fragment, null, React.createElement("i", {
    className: "fas fa-save"
  }), " Ruaj")), React.createElement("button", {
    type: "button",
    className: "btn btn-secondary",
    onClick: onClose
  }, React.createElement("i", {
    className: "fas fa-times"
  }), " Anulo"))))));
}
function SuppliersView({
  user,
  role,
  setActiveMenu
}) {
  const nav = useAppNav();
  const [qSearch, setQSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  useEffect(() => {
    if (nav && nav.consumeCreate && nav.consumeCreate('suppliers')) {
      setEditingId(null);
      setShowModal(true);
    }
  }, []);
  const [editingId, setEditingId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [load, setLoad] = useState('');
  const tableRef = useRef(null);
  useDtLiveSearch(tableRef, qSearch);
  const {
    loading,
    data,
    err
  } = useFetch(() => fbGetSuppliers(), [reloadKey]);
  const suppliers = useMemo(() => data && data.success ? data.data : [], [data]);
  const byId = useMemo(() => suppliers.reduce((m, s) => (m[s.id] = s, m), {}), [suppliers]);
  const reload = () => setReloadKey(k => k + 1);
  const totalPayable = useMemo(() => suppliers.reduce((s, x) => s + Number(x.openingBalance || 0), 0), [suppliers]);
  const [viewSup, setViewSup] = useState(null);
  useEffect(() => {
    if (err || data && !data.success) Swal.fire({
      icon: 'error',
      title: 'Error',
      text: data && data.message || 'Failed to load suppliers'
    });
  }, [err, data]);
  useEffect(() => {
    if (loading) return;
    let table = tableRef.current;
    if (table) {
      table.clear().rows.add(suppliers).draw(false);
    } else {
      table = $('#suppliersTable').DataTable({
        data: suppliers,
        columnDefs: [{
          targets: '_all',
          defaultContent: ''
        }],
        createdRow: (row, d) => {
          if (Number(d.openingBalance) > 0) $(row).addClass('row-warn');
        },
        columns: [{
          data: 'name',
          title: 'Emri',
          render: (d, t) => t === 'display' ? esc(d) : d
        }, {
          data: 'contact',
          title: 'Kontakt',
          render: (d, t) => t === 'display' ? esc(d || '-') : d
        }, {
          data: 'phone',
          title: 'Telefoni',
          render: (d, t) => t === 'display' ? esc(d || '-') : d
        }, {
          data: 'email',
          title: 'Email',
          render: (d, t) => t === 'display' ? esc(d || '-') : d
        }, {
          data: 'terms',
          title: 'Kushtet',
          render: (d, t) => t === 'display' ? esc(d || '-') : d
        }, {
          data: 'openingBalance',
          title: 'Detyrim',
          render: (d, t) => t === 'display' ? money(d) : d
        }, {
          data: null,
          title: 'Veprime',
          orderable: false,
          render: () => actionBtn('view', 'fa-eye', 'Shiko') + actionBtn('edit', 'fa-edit', 'Ndrysho', 'edit') + (role === 'Admin' ? actionBtn('delete', 'fa-trash', 'Fshi', 'delete') : '')
        }],
        pageLength: 80,
        lengthMenu: [[10, 25, 50, -1], [10, 25, 50, 'All']],
        responsive: true,
        dom: 'Blfrtip',
        buttons: erpDtButtons('Furnitorët'),
        order: [[0, 'asc']]
      });
      tableRef.current = table;
    }
    $('#suppliersTable').off('click', '[data-action]').on('click', '[data-action]', function () {
      const rowData = getDtRowData(table, this);
      if (!rowData || !rowData.id) return;
      const id = rowData.id;
      const act = $(this).data('action');
      if (act === 'view') setViewSup(byId[id] || rowData);else if (act === 'edit') {
        setEditingId(id);
        setShowModal(true);
      } else handleDelete(byId[id] || rowData);
    });
  }, [loading, suppliers, role]);
  useEffect(() => () => {
    if (tableRef.current) {
      try {
        tableRef.current.destroy();
        tableRef.current = null;
      } catch (e) {}
    }
  }, []);
  const handleSave = async fd => {
    setLoad(editingId ? 'Updating supplier...' : 'Saving supplier...');
    const r = editingId ? await fbUpdateSupplier(editingId, fd, user) : await fbAddSupplier(fd, user);
    setLoad('');
    if (r.success) {
      setShowModal(false);
      setEditingId(null);
      Swal.fire({
        icon: 'success',
        title: 'Success!',
        text: r.message,
        timer: 1800,
        showConfirmButton: false
      });
      reload();
    } else Swal.fire({
      icon: 'error',
      title: 'Error',
      text: r.message
    });
  };
  const handleDelete = s => Swal.fire({
    icon: 'warning',
    title: 'Delete supplier?',
    text: s.name,
    showCancelButton: true,
    confirmButtonColor: '#ea4335',
    confirmButtonText: 'Delete'
  }).then(async res => {
    if (!res.isConfirmed) return;
    setLoad('Deleting...');
    const r = await fbDeleteSupplier(s.id, s.name, user);
    setLoad('');
    if (r.success) {
      Swal.fire({
        icon: 'success',
        text: r.message,
        timer: 1600,
        showConfirmButton: false
      });
      reload();
    } else Swal.fire({
      icon: 'error',
      title: 'Error',
      text: r.message
    });
  });
  return React.createElement("div", {
    className: "data-section"
  }, load && React.createElement(TopLoadingBar, null), React.createElement("div", {
    className: "section-header"
  }, React.createElement("h2", null, React.createElement("i", {
    className: "fas fa-truck-field"
  }), " Furnitor\xEBt"), React.createElement("div", {
    style: {
      display: 'flex',
      gap: '10px'
    }
  }, React.createElement(RefreshBtn, {
    onClick: reload
  }), React.createElement("button", {
    className: "btn btn-success",
    onClick: () => {
      setEditingId(null);
      setShowModal(true);
    }
  }, React.createElement("i", {
    className: "fas fa-plus"
  }), " I ri"))), loading && React.createElement(TableSkeleton, {
    rows: 8,
    columns: 7
  }), React.createElement("div", {
    style: {
      display: loading ? 'none' : 'block'
    }
  }, React.createElement("div", {
    className: "module-toolbar"
  }, React.createElement(GoogleSearchBox, {
    value: qSearch,
    onChange: setQSearch,
    placeholder: "K\xEBrko furnitor\u2026 em\xEBr, kontakt, telefon, email\u2026"
  })), React.createElement("table", {
    id: "suppliersTable",
    className: "display",
    style: {
      width: '100%'
    }
  }), React.createElement(FilteredSummaryBar, {
    tableRef: tableRef,
    deps: [suppliers, qSearch],
    itemsBuilder: rows => [{
      label: 'Furnitorë (filtruar)',
      value: rows.length
    }, {
      label: 'Detyrim (filtruar)',
      value: money(rows.reduce((s, r) => s + Number(r.openingBalance || 0), 0))
    }]
  }), suppliers.length > 0 && React.createElement(SummaryBar, {
    items: [{
      label: 'Suppliers',
      value: suppliers.length
    }, {
      label: 'Total Payable',
      value: money(totalPayable)
    }]
  })), viewSup && React.createElement(SupplierHubModal, {
    supplier: viewSup,
    onClose: () => setViewSup(null)
  }), showModal && React.createElement(SupplierModal, {
    editItem: byId[editingId],
    onClose: () => {
      setShowModal(false);
      setEditingId(null);
    },
    onSave: handleSave
  }));
}
function ExpenseModal({
  editItem,
  onClose,
  onSave
}) {
  const nav = useAppNav();
  const payOpts = usePaymentOpts();
  const expCatOpts = useExpenseCategoryOpts();
  const {
    refreshConfig
  } = useConfig();
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({
    date: editItem?.date || today,
    category: editItem?.category || 'Other',
    payee: editItem?.payee || '',
    amount: editItem?.amount ?? '',
    paymentMethod: editItem?.paymentMethod || 'Cash',
    notes: editItem?.notes || ''
  });
  const [saving, setSaving] = useState(false);
  const upd = (k, v) => setF(p => ({
    ...p,
    [k]: v
  }));
  return React.createElement("div", {
    className: "modal-overlay",
    onClick: onClose
  }, React.createElement("div", {
    className: "modal",
    onClick: e => e.stopPropagation()
  }, React.createElement("div", {
    className: "modal-header"
  }, React.createElement("h3", null, React.createElement("i", {
    className: "fas fa-receipt"
  }), " ", editItem ? 'Edit' : 'Add', " Expense"), React.createElement("button", {
    className: "close-btn",
    onClick: onClose
  }, React.createElement("i", {
    className: "fas fa-times"
  }))), React.createElement("div", {
    className: "modal-body"
  }, React.createElement("form", {
    onSubmit: e => {
      e.preventDefault();
      if (!(Number(f.amount) > 0)) return Swal.fire({
        icon: 'warning',
        title: 'Enter an amount'
      });
      setSaving(true);
      onSave({
        ...f,
        amount: Number(f.amount) || 0
      });
    }
  }, React.createElement("div", {
    className: "form-grid"
  }, React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Date *"), React.createElement("input", {
    type: "date",
    value: f.date,
    onChange: e => upd('date', e.target.value),
    required: true
  })), React.createElement(SearchableDropdown, {
    label: "Kategoria",
    icon: "fas fa-tag",
    options: expCatOpts || EXPENSE_CATEGORY_OPTS,
    value: f.category,
    onChange: v => upd('category', v),
    placeholder: "Select...",
    required: true,
    creatable: true,
    createLabel: "Shto kategori shpenzimi: {q}",
    onCreate: async q => {
      const res = await ieQuickAddSettingList('expenseCategories', q, JSON.parse(localStorage.getItem('fb_user') || 'null'));
      if (!res.success) throw new Error(res.message || 'Dështoi');
      try {
        refreshConfig && refreshConfig();
      } catch (e) {}
      return {
        value: q,
        label: q
      };
    }
  }), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Payee / Paid To"), React.createElement("input", {
    type: "text",
    value: f.payee,
    onChange: e => upd('payee', e.target.value)
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Amount *"), React.createElement("input", {
    type: "number",
    step: "0.01",
    min: "0",
    value: f.amount,
    onChange: e => upd('amount', e.target.value),
    required: true
  })), React.createElement(SearchableDropdown, {
    label: "Paid Via",
    icon: "fas fa-money-bill-wave",
    options: payOpts || PAYMENT_OPTS,
    value: f.paymentMethod,
    onChange: v => upd('paymentMethod', v),
    placeholder: "Cash",
    creatable: true,
    createLabel: "Shto m\xEBnyr\xEB pagese: {q}",
    onCreate: async q => {
      const res = await ieQuickAddSettingList('paymentMethods', q, JSON.parse(localStorage.getItem('fb_user') || 'null'));
      if (!res.success) throw new Error(res.message || 'Dështoi');
      try {
        refreshConfig && refreshConfig();
      } catch (e) {}
      return {
        value: q,
        label: q
      };
    }
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Notes"), React.createElement("textarea", {
    rows: "2",
    value: f.notes,
    onChange: e => upd('notes', e.target.value)
  })), React.createElement("div", {
    className: "form-actions"
  }, React.createElement("button", {
    type: "submit",
    className: "btn btn-primary",
    disabled: saving
  }, saving ? React.createElement(React.Fragment, null, React.createElement("i", {
    className: "fas fa-spinner fa-spin"
  }), " Duke ruajtur...") : React.createElement(React.Fragment, null, React.createElement("i", {
    className: "fas fa-save"
  }), " Ruaj")), React.createElement("button", {
    type: "button",
    className: "btn btn-secondary",
    onClick: onClose
  }, React.createElement("i", {
    className: "fas fa-times"
  }), " Anulo"))))));
}
function ExpensesView({
  user,
  role,
  setActiveMenu
}) {
  const nav = useAppNav();
  const [qSearch, setQSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  useEffect(() => {
    if (nav && nav.consumeCreate && nav.consumeCreate('expenses')) {
      setEditingId(null);
      setShowModal(true);
    }
  }, []);
  const [editingId, setEditingId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [load, setLoad] = useState('');
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    category: ''
  });
  const tableRef = useRef(null);
  useDtLiveSearch(tableRef, qSearch);
  const {
    loading,
    data,
    err
  } = useFetch(() => fbGetExpenses(), [reloadKey]);
  const expenses = useMemo(() => data && data.success ? data.data : [], [data]);
  const byId = useMemo(() => expenses.reduce((m, e) => (m[e.id] = e, m), {}), [expenses]);
  const reload = () => setReloadKey(k => k + 1);
  const filtered = useMemo(() => expenses.filter(e => {
    const d = new Date(e.date || e.createdAt);
    if (filters.dateFrom && d < new Date(filters.dateFrom)) return false;
    if (filters.dateTo && d > new Date(filters.dateTo + 'T23:59:59')) return false;
    if (filters.category && e.category !== filters.category) return false;
    return true;
  }), [expenses, filters]);
  const total = useMemo(() => filtered.reduce((s, e) => s + Number(e.amount || 0), 0), [filtered]);
  useEffect(() => {
    if (err || data && !data.success) Swal.fire({
      icon: 'error',
      title: 'Error',
      text: data && data.message || 'Failed to load expenses'
    });
  }, [err, data]);
  useEffect(() => {
    if (loading) return;
    let table = tableRef.current;
    if (table) {
      table.clear().rows.add(filtered).draw(false);
    } else {
      table = $('#expensesTable').DataTable({
        data: filtered,
        columnDefs: [{
          targets: '_all',
          defaultContent: ''
        }],
        columns: [{
          data: 'date',
          title: 'Data',
          render: (d, t, row) => t === 'display' ? esc(d || (row.createdAt || '').slice(0, 10)) : d
        }, {
          data: 'category',
          title: 'Kategoria',
          render: (d, t) => t === 'display' ? '<span class="type-chip">' + esc(d || '') + '</span>' : d
        }, {
          data: 'payee',
          title: 'Marrësi',
          render: (d, t) => t === 'display' ? esc(d || '-') : d
        }, {
          data: 'amount',
          title: 'Shuma',
          render: (d, t) => t === 'display' ? money(d) : d
        }, {
          data: 'paymentMethod',
          title: 'Paguar me',
          render: (d, t) => t === 'display' ? esc(d || '-') : d
        }, {
          data: 'notes',
          title: 'Shënime',
          render: (d, t) => t === 'display' ? esc(d || '-') : d
        }, {
          data: null,
          title: 'Veprime',
          orderable: false,
          render: () => actionBtn('edit', 'fa-edit', 'Ndrysho', 'edit') + (role === 'Admin' ? actionBtn('delete', 'fa-trash', 'Fshi', 'delete') : '')
        }],
        pageLength: 80,
        lengthMenu: [[10, 25, 50, -1], [10, 25, 50, 'All']],
        responsive: true,
        dom: 'Blfrtip',
        buttons: erpDtButtons('Shpenzimet'),
        order: [[0, 'desc']]
      });
      tableRef.current = table;
    }
    $('#expensesTable').off('click', '[data-action]').on('click', '[data-action]', function () {
      const rowData = getDtRowData(table, this);
      if (!rowData || !rowData.id) return;
      const id = rowData.id;
      $(this).data('action') === 'edit' ? (setEditingId(id), setShowModal(true)) : handleDelete(byId[id] || rowData);
    });
  }, [loading, filtered, role]);
  useEffect(() => () => {
    if (tableRef.current) {
      try {
        tableRef.current.destroy();
        tableRef.current = null;
      } catch (e) {}
    }
  }, []);
  const handleSave = async fd => {
    setLoad(editingId ? 'Updating expense...' : 'Saving expense...');
    const r = editingId ? await fbUpdateExpense(editingId, fd, user) : await fbAddExpense(fd, user);
    setLoad('');
    if (r.success) {
      setShowModal(false);
      setEditingId(null);
      Swal.fire({
        icon: 'success',
        title: 'Success!',
        text: r.message,
        timer: 1600,
        showConfirmButton: false
      });
      reload();
    } else Swal.fire({
      icon: 'error',
      title: 'Error',
      text: r.message
    });
  };
  const handleDelete = ex => Swal.fire({
    icon: 'warning',
    title: 'Delete expense?',
    text: (ex.category || '') + ' ' + money(ex.amount),
    showCancelButton: true,
    confirmButtonColor: '#ea4335',
    confirmButtonText: 'Delete'
  }).then(async res => {
    if (!res.isConfirmed) return;
    setLoad('Deleting...');
    const r = await fbDeleteExpense(ex.id, (ex.category || 'Expense') + ' ' + money(ex.amount), user);
    setLoad('');
    if (r.success) {
      Swal.fire({
        icon: 'success',
        text: r.message,
        timer: 1500,
        showConfirmButton: false
      });
      reload();
    } else Swal.fire({
      icon: 'error',
      title: 'Error',
      text: r.message
    });
  });
  return React.createElement("div", {
    className: "data-section"
  }, load && React.createElement(TopLoadingBar, null), React.createElement("div", {
    className: "section-header"
  }, React.createElement("h2", null, React.createElement("i", {
    className: "fas fa-money-bill-wave"
  }), " Shpenzimet"), React.createElement("div", {
    style: {
      display: 'flex',
      gap: '10px'
    }
  }, React.createElement(RefreshBtn, {
    onClick: reload
  }), React.createElement("button", {
    className: "btn btn-success",
    onClick: () => {
      setEditingId(null);
      setShowModal(true);
    }
  }, React.createElement("i", {
    className: "fas fa-plus"
  }), " I ri"))), !loading && React.createElement("div", {
    className: "filters-section"
  }, React.createElement("div", {
    className: "filters-header"
  }, React.createElement("h3", null, React.createElement("i", {
    className: "fas fa-filter"
  }), " Filtrat & K\xEBrkimi"), React.createElement("button", {
    className: "btn btn-secondary btn-sm",
    onClick: () => {
      setFilters({
        dateFrom: '',
        dateTo: '',
        category: ''
      });
      setQSearch('');
    }
  }, React.createElement("i", {
    className: "fas fa-times-circle"
  }), " Pastro t\xEB gjitha")), React.createElement("div", {
    className: "module-toolbar",
    style: {
      marginBottom: 12
    }
  }, React.createElement(GoogleSearchBox, {
    value: qSearch,
    onChange: setQSearch,
    placeholder: "K\xEBrko shpenzim\u2026 kategori, marr\xEBs, sh\xEBnim, pages\xEB\u2026"
  })), React.createElement("div", {
    className: "filters-grid"
  }, React.createElement("div", {
    className: "filter-group"
  }, React.createElement("label", null, React.createElement("i", {
    className: "fas fa-calendar-alt"
  }), " Date From"), React.createElement("input", {
    type: "date",
    className: "filter-input",
    value: filters.dateFrom,
    onChange: e => setFilters(f => ({
      ...f,
      dateFrom: e.target.value
    }))
  })), React.createElement("div", {
    className: "filter-group"
  }, React.createElement("label", null, React.createElement("i", {
    className: "fas fa-calendar-alt"
  }), " Date To"), React.createElement("input", {
    type: "date",
    className: "filter-input",
    value: filters.dateTo,
    onChange: e => setFilters(f => ({
      ...f,
      dateTo: e.target.value
    }))
  })), React.createElement(SearchableDropdown, {
    label: "Kategoria",
    icon: "fas fa-tag",
    options: EXPENSE_CATEGORY_OPTS,
    value: filters.category,
    onChange: v => setFilters(f => ({
      ...f,
      category: v
    })),
    placeholder: "All Categories"
  }), React.createElement("div", {
    className: "filter-group"
  }, React.createElement("label", null, "Total (filtered)"), React.createElement("input", {
    type: "text",
    className: "filter-input",
    value: money(total),
    disabled: true
  })))), loading && React.createElement(TableSkeleton, {
    rows: 8,
    columns: 7
  }), React.createElement("div", {
    style: {
      display: loading ? 'none' : 'block'
    }
  }, React.createElement("table", {
    id: "expensesTable",
    className: "display",
    style: {
      width: '100%'
    }
  }), React.createElement(FilteredSummaryBar, {
    tableRef: tableRef,
    deps: [filtered, qSearch],
    itemsBuilder: rows => [{
      label: 'Shpenzime (filtruar)',
      value: rows.length
    }, {
      label: 'Totali (filtruar)',
      value: money(rows.reduce((s, r) => s + Number(r.amount || 0), 0))
    }]
  }), filtered.length > 0 && React.createElement(SummaryBar, {
    items: [{
      label: 'Entries',
      value: filtered.length
    }, {
      label: 'Total Expenses',
      value: money(total)
    }]
  })), showModal && React.createElement(ExpenseModal, {
    editItem: byId[editingId],
    onClose: () => {
      setShowModal(false);
      setEditingId(null);
    },
    onSave: handleSave
  }));
}
function PurchaseOrderModal({
  suppliers,
  products,
  onClose,
  onSave
}) {
  const nav = useAppNav();
  const [supplierId, setSupplierId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([]);
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('');
  const [unitKey, setUnitKey] = useState('base');
  const [unitCost, setUnitCost] = useState('');
  const [saving, setSaving] = useState(false);
  const supplierOpts = useMemo(() => (suppliers || []).map(s => ({
    value: s.id,
    label: s.name
  })), [suppliers]);
  const productOpts = useMemo(() => (products || []).map(p => ({
    value: p.id,
    label: `${p.name} (${p.sku})`
  })), [products]);
  const byId = useMemo(() => (products || []).reduce((m, p) => (m[p.id] = p, m), {}), [products]);
  const selectedProduct = productId ? byId[productId] : null;
  const unitOpts = useMemo(() => selectedProduct ? getProductUnitOptions(selectedProduct) : [{
    value: 'base',
    label: 'copë (bazë)',
    name: 'copë',
    multiplier: 1
  }], [selectedProduct]);
  const selectedUnit = selectedProduct ? getProductUnit(selectedProduct, unitKey) : unitOpts[0];
  const baseQtyPreview = selectedProduct ? toBaseQty(selectedProduct, qty, unitKey) : 0;
  const total = useMemo(() => lines.reduce((s, l) => s + Number(l.lineTotal || 0), 0), [lines]);
  useEffect(() => {
    setUnitKey('base');
    setUnitCost('');
  }, [productId]);
  const addLine = () => {
    const q = Number(qty),
      c = Number(unitCost);
    if (!productId) return Swal.fire({
      icon: 'warning',
      title: 'Zgjidh artikullin'
    });
    if (!Number.isFinite(q) || q <= 0) return Swal.fire({
      icon: 'warning',
      title: 'Sasi e pasaktë',
      text: 'Sasia duhet të jetë më e madhe se 0.'
    });
    const p = byId[productId];
    const unit = getProductUnit(p, unitKey);
    const enteredUnitCost = c || unitPrice(p, unit.value) || Number(p.cost) * unit.multiplier || 0;
    const baseUnitCost = unit.multiplier > 0 ? round2(enteredUnitCost / unit.multiplier) : enteredUnitCost;
    const baseQty = toBaseQty(p, q, unit.value);
    const lineTotal = round2(q * enteredUnitCost);
    setLines(prev => {
      const key = productId + '|' + unit.value;
      const ex = prev.find(l => l.key === key);
      if (ex) return prev.map(l => l.key === key ? {
        ...l,
        enteredQty: round2(Number(l.enteredQty || 0) + q),
        qty: round2(Number(l.qty || 0) + baseQty),
        enteredUnitCost,
        unitCost: baseUnitCost,
        lineTotal: round2(Number(l.lineTotal || 0) + lineTotal)
      } : l);
      return [...prev, {
        key,
        productId,
        name: p.name,
        sku: p.sku,
        enteredQty: q,
        qty: baseQty,
        unitKey: unit.value,
        unitName: unit.name,
        unitMultiplier: unit.multiplier,
        enteredUnitCost,
        unitCost: baseUnitCost,
        lineTotal
      }];
    });
    setProductId('');
    setQty('');
    setUnitKey('base');
    setUnitCost('');
  };
  const removeLine = key => setLines(prev => prev.filter(l => l.key !== key));
  const submit = async status => {
    if (!supplierId) return Swal.fire({
      icon: 'warning',
      title: 'Zgjidh furnitorin'
    });
    if (!lines.length) return Swal.fire({
      icon: 'warning',
      title: 'Shto të paktën një rresht'
    });
    const sup = (suppliers || []).find(s => s.id === supplierId);
    setSaving(true);
    await onSave({
      supplierId,
      supplierName: sup ? sup.name : '',
      items: lines.map(l => ({
        ...l,
        lineUnitCost: l.enteredUnitCost
      })),
      total: round2(total),
      notes: notes.trim() || null,
      expectedDate: expectedDate || null,
      status
    });
    setSaving(false);
  };
  return React.createElement("div", {
    className: "modal-overlay",
    onClick: onClose
  }, React.createElement("div", {
    className: "modal modal-lg",
    onClick: e => e.stopPropagation()
  }, React.createElement("div", {
    className: "modal-header"
  }, React.createElement("h3", null, React.createElement("i", {
    className: "fas fa-file-invoice-dollar"
  }), " Porosi blerjeje e re"), React.createElement("button", {
    className: "close-btn",
    onClick: onClose
  }, React.createElement("i", {
    className: "fas fa-times"
  }))), React.createElement("div", {
    className: "modal-body"
  }, React.createElement("div", {
    className: "form-grid"
  }, React.createElement(SearchableDropdown, {
    label: "Furnitori",
    icon: "fas fa-truck-field",
    options: supplierOpts,
    value: supplierId,
    onChange: setSupplierId,
    placeholder: "Zgjidh furnitorin...",
    required: true,
    creatable: true,
    createLabel: "Shto furnitor: {q}",
    onCreate: async q => {
      try {
        localStorage.setItem('erp_new_supplier_name', q);
      } catch (e) {}
      nav.go('suppliers', 'suppliers');
      return false;
    }
  }), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, React.createElement("i", {
    className: "fas fa-calendar-day"
  }), " Data e pritshme"), React.createElement("input", {
    type: "date",
    value: expectedDate,
    onChange: e => setExpectedDate(e.target.value)
  }))), React.createElement("div", {
    className: "pos-disc-row",
    style: {
      gridTemplateColumns: '2fr .75fr .9fr .9fr auto',
      alignItems: 'end'
    }
  }, React.createElement(SearchableDropdown, {
    label: "Artikulli",
    icon: "fas fa-box",
    options: productOpts,
    value: productId,
    onChange: setProductId,
    placeholder: "K\xEBrko artikull...",
    creatable: true,
    createLabel: "Shto artikull: {q}",
    onCreate: async q => {
      try {
        localStorage.setItem('erp_new_product_name', q);
      } catch (e) {}
      nav.go('products', 'products');
      return false;
    }
  }), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Sasia"), React.createElement("input", {
    type: "number",
    min: "0",
    step: "0.01",
    value: qty,
    onChange: e => setQty(e.target.value)
  })), React.createElement(SearchableDropdown, {
    label: "Nj\xEBsia",
    icon: "fas fa-scale-balanced",
    options: unitOpts,
    value: unitKey,
    onChange: setUnitKey,
    placeholder: "Zgjidh nj\xEBsin\xEB..."
  }), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Kosto / nj\xEBsi"), React.createElement("input", {
    type: "number",
    min: "0",
    step: "0.01",
    value: unitCost,
    onChange: e => setUnitCost(e.target.value),
    placeholder: "sipas nj\xEBsis\xEB"
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "\xA0"), React.createElement("button", {
    type: "button",
    className: "btn btn-secondary",
    onClick: addLine
  }, React.createElement("i", {
    className: "fas fa-plus"
  }), " Shto"))), selectedProduct && Number(qty) > 0 && React.createElement("p", {
    className: "stock-onhand-hint"
  }, "Konvertim: ", React.createElement("strong", null, Number(qty), " ", selectedUnit.name), " = ", React.createElement("strong", null, formatQtyWithUnits(baseQtyPreview, selectedProduct))), lines.length > 0 && React.createElement("div", {
    className: "about-table-wrapper",
    style: {
      marginTop: 12
    }
  }, React.createElement("table", {
    className: "about-roles-table"
  }, React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", null, "Artikulli"), React.createElement("th", null, "Sasia"), React.createElement("th", null, "Nj\xEBsia"), React.createElement("th", null, "N\xEB stok"), React.createElement("th", null, "Kosto/nj\xEBsi"), React.createElement("th", null, "Kosto baz\xEB"), React.createElement("th", null, "Vlera"), React.createElement("th", null))), React.createElement("tbody", null, lines.map(l => React.createElement("tr", {
    key: l.key
  }, React.createElement("td", null, l.name, React.createElement("div", {
    className: "cell-sub"
  }, l.sku)), React.createElement("td", null, l.enteredQty), React.createElement("td", null, l.unitName), React.createElement("td", null, formatQtyWithUnits(l.qty, byId[l.productId])), React.createElement("td", null, money(l.enteredUnitCost)), React.createElement("td", null, money(l.unitCost)), React.createElement("td", null, money(l.lineTotal)), React.createElement("td", null, React.createElement("button", {
    type: "button",
    className: "action-icon delete-icon",
    onClick: () => removeLine(l.key)
  }, React.createElement("i", {
    className: "fas fa-times"
  })))))))), React.createElement("p", {
    className: "stock-onhand-hint",
    style: {
      marginTop: 12
    }
  }, "Totali i blerjes: ", React.createElement("strong", null, money(total))), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Sh\xEBnime"), React.createElement("textarea", {
    rows: "2",
    value: notes,
    onChange: e => setNotes(e.target.value)
  })), React.createElement("div", {
    className: "form-actions"
  }, React.createElement("button", {
    type: "button",
    className: "btn btn-primary",
    disabled: saving,
    onClick: () => submit('ordered')
  }, React.createElement("i", {
    className: "fas fa-paper-plane"
  }), " Ruaj & Porosit"), React.createElement("button", {
    type: "button",
    className: "btn btn-secondary",
    disabled: saving,
    onClick: () => submit('draft')
  }, React.createElement("i", {
    className: "fas fa-floppy-disk"
  }), " Ruaj Draft"), React.createElement("button", {
    type: "button",
    className: "btn btn-secondary",
    onClick: onClose
  }, React.createElement("i", {
    className: "fas fa-times"
  }), " Anulo")))));
}
function PoDetailModal({
  po,
  onClose,
  onReceive,
  supplier
}) {
  if (!po) return null;
  const receivable = po.status !== 'received' && po.status !== 'cancelled';
  const stages = [{
    id: 'draft',
    label: 'Draft'
  }, {
    id: 'ordered',
    label: 'Ordered'
  }, {
    id: 'received',
    label: 'Received'
  }, {
    id: 'cancelled',
    label: 'Cancelled'
  }];
  const st = po.status || 'draft';
  return React.createElement(OdooFormOverlay, {
    breadcrumb: "Porosi Blerje",
    title: po.poNumber || 'PO',
    onClose: onClose,
    buttons: React.createElement(React.Fragment, null, receivable && React.createElement("button", {
      type: "button",
      className: "btn btn-success",
      onClick: () => onReceive && onReceive(po)
    }, React.createElement("i", {
      className: "fas fa-dolly"
    }), " Kalo n\xEB stok"), React.createElement("button", {
      type: "button",
      className: "btn btn-secondary",
      onClick: () => openPurchaseDocument(po, supplier, false)
    }, React.createElement("i", {
      className: "fas fa-eye"
    }), " Fatur\xEB"), React.createElement("button", {
      type: "button",
      className: "btn btn-primary",
      onClick: () => openPurchaseDocument(po, supplier, true)
    }, React.createElement("i", {
      className: "fas fa-print"
    }), " Printo"), React.createElement("button", {
      type: "button",
      className: "btn btn-pdf",
      onClick: () => exportPurchasePdf(po, supplier)
    }, React.createElement("i", {
      className: "fas fa-file-pdf"
    }), " PDF"), React.createElement("button", {
      type: "button",
      className: "btn btn-excel",
      onClick: () => exportPurchaseXlsx(po, supplier)
    }, React.createElement("i", {
      className: "fas fa-file-excel"
    }), " Excel"), React.createElement("button", {
      type: "button",
      className: "btn btn-secondary",
      onClick: onClose
    }, "Mbyll"))
  }, React.createElement(OdooFormSheet, {
    title: po.poNumber || 'Porosi',
    statusbar: React.createElement("div", {
      style: {
        maxWidth: 1100,
        margin: '0 auto 12px'
      }
    }, React.createElement(OdooStatusbar, {
      stages: stages,
      value: st
    }))
  }, React.createElement("div", {
    className: "o-form-group"
  }, React.createElement("div", null, React.createElement(OdooFormField, {
    label: "Furnitori",
    value: po.supplierName || '—'
  }), React.createElement(OdooFormField, {
    label: "Statusi",
    value: statusTextSq(po.status) || po.status || '—'
  }), React.createElement(OdooFormField, {
    label: "Pritet",
    value: po.expectedDate || '—'
  })), React.createElement("div", null, React.createElement(OdooFormField, {
    label: "Krijuar",
    value: formatDateForDisplay(po.createdAt)
  }), React.createElement(OdooFormField, {
    label: "Totali",
    value: money(po.total || 0)
  }), React.createElement(OdooFormField, {
    label: "Sh\xEBnime",
    value: po.notes || '—'
  }))), React.createElement("div", {
    className: "o-form-section-title"
  }, "Rreshtat e porosis\xEB"), React.createElement("table", {
    className: "o-form-table"
  }, React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", null, "Artikulli"), React.createElement("th", null, "Sasia"), React.createElement("th", null, "Nj\xEBsia"), React.createElement("th", null, "N\xEB stok"), React.createElement("th", null, "Kosto/nj\xEBsi"), React.createElement("th", null, "Vlera"))), React.createElement("tbody", null, (po.items || []).map((it, i) => React.createElement("tr", {
    key: (it.sku || '') + i
  }, React.createElement("td", null, it.name, React.createElement("div", {
    className: "cell-sub"
  }, it.sku)), React.createElement("td", null, it.enteredQty != null ? it.enteredQty : it.qty), React.createElement("td", null, it.unitName || 'copë'), React.createElement("td", null, displayBaseQty(it, null)), React.createElement("td", null, money(it.enteredUnitCost || it.lineUnitCost || it.unitCost)), React.createElement("td", null, money(it.lineTotal != null ? it.lineTotal : (it.enteredQty != null ? it.enteredQty : it.qty) * (it.enteredUnitCost || it.lineUnitCost || it.unitCost || 0)))))), React.createElement("tfoot", null, React.createElement("tr", null, React.createElement("td", {
    colSpan: "5"
  }, "TOTAL"), React.createElement("td", null, money(po.total || 0)))))));
}
function PurchaseOrdersView({
  user,
  role,
  setActiveMenu
}) {
  const nav = useAppNav();
  const [qSearch, setQSearch] = useState('');
  const [viewMode, setViewMode] = useState('list');
  const [facetStatus, setFacetStatus] = useState('');
  const [showModal, setShowModal] = useState(false);
  useEffect(() => {
    if (nav && nav.consumeCreate && nav.consumeCreate('purchase-orders')) {
      setShowModal(true);
    }
  }, []);
  const [viewPo, setViewPo] = useState(null);
  const [viewReceipt, setViewReceipt] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [load, setLoad] = useState('');
  const tableRef = useRef(null);
  useDtLiveSearch(tableRef, qSearch);
  useEffect(() => {
    const fn = e => {
      if (!e.detail || e.detail.tableId === 'poTable') setReloadKey(k => k + 1);
    };
    window.addEventListener('erp-data-changed', fn);
    return () => window.removeEventListener('erp-data-changed', fn);
  }, []);
  const {
    loading,
    data,
    err
  } = useFetch(() => Promise.all([fbGetPurchaseOrders(), fbGetSuppliers(), fbGetProducts()]), [reloadKey]);
  const pos = useMemo(() => data && data[0] && data[0].success ? data[0].data : [], [data]);
  const suppliers = useMemo(() => data && data[1] && data[1].success ? data[1].data : [], [data]);
  const products = useMemo(() => data && data[2] && data[2].success ? data[2].data : [], [data]);
  const byId = useMemo(() => pos.reduce((m, p) => (m[p.id] = p, m), {}), [pos]);
  const tableData = useMemo(() => pos.map(p => Object.assign({}, p, {
    itemCount: (p.items || []).length,
    unitSummary: (p.items || []).map(it => (it.enteredQty != null ? it.enteredQty : it.qty) + ' ' + (it.unitName || 'copë')).join(', ')
  })), [pos]);
  const reload = () => setReloadKey(k => k + 1);
  const poSummary = useMemo(() => ({
    count: pos.length,
    total: pos.reduce((s, p) => s + Number(p.total || 0), 0),
    open: pos.filter(p => p.status !== 'received' && p.status !== 'cancelled').reduce((s, p) => s + Number(p.total || 0), 0)
  }), [pos]);
  const displayPOs = useMemo(() => (tableData || []).filter(p => {
    if (facetStatus && (p.status || 'draft') !== facetStatus) return false;
    return true;
  }), [tableData, facetStatus]);
  const statusBadge = s => {
    const map = {
      received: 'status-active',
      ordered: 'type-chip',
      draft: '',
      cancelled: 'status-inactive'
    };
    const cls = map[s] || 'type-chip';
    return `<span class="${cls === 'type-chip' ? 'type-chip' : 'status-badge ' + cls}">${esc(statusTextSq(s) || s || 'draft')}</span>`;
  };
  useEffect(() => {
    if (err || data && data[0] && !data[0].success) Swal.fire({
      icon: 'error',
      title: 'Error',
      text: data && data[0] && data[0].message || 'Failed to load POs'
    });
  }, [err, data]);
  useEffect(() => {
    if (loading) return;
    if (viewMode !== 'list') {
      if (tableRef.current) {
        try {
          tableRef.current.destroy();
        } catch (e) {}
        tableRef.current = null;
      }
      return;
    }
    if (!document.getElementById('poTable')) return;
    if (tableRef.current) {
      try {
        if (!document.contains(tableRef.current.table().node())) {
          tableRef.current.destroy();
          tableRef.current = null;
        }
      } catch (e) {
        tableRef.current = null;
      }
    }
    let table = tableRef.current;
    if (table) {
      table.clear().rows.add(displayPOs).draw(false);
    } else {
      table = $('#poTable').DataTable({
        data: displayPOs,
        columnDefs: [{
          targets: '_all',
          defaultContent: ''
        }],
        createdRow: (row, d) => {
          if (d.status === 'received') $(row).addClass('row-ok');else if (d.status === 'cancelled') $(row).addClass('row-muted');else $(row).addClass('row-warn');
        },
        columns: [{
          data: 'poNumber',
          title: 'Nr. Porosie',
          render: (d, t, row) => t === 'display' ? docLinkHtml('view', row.id, d || '') : d
        }, {
          data: 'createdAt',
          title: 'Data',
          render: (d, t) => t === 'display' ? formatDateForDisplay(d) : d
        }, {
          data: 'supplierName',
          title: 'Furnitori',
          render: (d, t) => t === 'display' ? esc(d || '-') : d
        }, {
          data: 'itemCount',
          title: 'Rreshta'
        }, {
          data: 'unitSummary',
          title: 'Njësitë',
          defaultContent: '-',
          render: (d, t) => t === 'display' ? esc(d || '-') : d
        }, {
          data: 'total',
          title: 'Totali',
          render: (d, t) => t === 'display' ? money(d) : d
        }, {
          data: 'status',
          title: 'Statusi',
          render: (d, t) => t === 'display' ? statusBadge(d) : d
        }, {
          data: 'expectedDate',
          title: 'Pritet',
          render: (d, t) => t === 'display' ? esc(d || '-') : d
        }, {
          data: null,
          title: 'Veprime',
          orderable: false,
          render: (d, t, row) => actionBtn('view', 'fa-eye', 'Shiko') + actionBtn('invoice', 'fa-file-invoice', 'Faturë') + actionBtn('invoicepdf', 'fa-file-pdf', 'PDF') + actionBtn('invoicexlsx', 'fa-file-excel', 'Excel') + (row.status !== 'received' && row.status !== 'cancelled' ? actionBtn('receive', 'fa-dolly', 'Kalo në stok', 'qr') : '') + (role === 'Admin' ? actionBtn('delete', 'fa-trash', 'Fshi', 'delete') : '')
        }],
        pageLength: 80,
        lengthMenu: [[20, 40, 80, 100, -1], [20, 40, 80, 100, 'Të gjitha']],
        responsive: true,
        dom: 'Blfrtip',
        buttons: erpDtButtons('Porositë_Blerjes'),
        order: [[1, 'desc']]
      });
      tableRef.current = table;
    }
    $('#poTable').off('click', '[data-action]').on('click', '[data-action]', function () {
      const rowData = getDtRowData(table, this);
      if (!rowData || !rowData.id) return;
      const action = $(this).data('action');
      if (action === 'view') setViewPo(byId[rowData.id] || rowData);else if (action === 'receive') doReceive(byId[rowData.id] || rowData);else if (action === 'delete') handleDelete(byId[rowData.id] || rowData);else if (action === 'invoice' || action === 'invoicepdf' || action === 'invoicexlsx') {
        const po = byId[rowData.id] || rowData;
        const sup = (suppliers || []).find(s => s.id === po.supplierId);
        if (action === 'invoice') openPurchaseDocument(po, sup, false);else if (action === 'invoicepdf') exportPurchasePdf(po, sup);else exportPurchaseXlsx(po, sup);
      }
    });
  }, [loading, displayPOs, role, viewMode]);
  useEffect(() => () => {
    if (tableRef.current) {
      try {
        tableRef.current.destroy();
        tableRef.current = null;
      } catch (e) {}
    }
  }, []);
  const handleSave = async fd => {
    setLoad('Duke ruajtur porosinë...');
    const r = await fbCreatePurchaseOrder(fd, user);
    setLoad('');
    if (r.success) {
      setShowModal(false);
      Swal.fire({
        icon: 'success',
        title: 'U ruajt!',
        text: r.message,
        timer: 1600,
        showConfirmButton: false
      });
      reload();
    } else Swal.fire({
      icon: 'error',
      title: 'Error',
      text: r.message
    });
  };
  const doReceive = async po => {
    const warehouses = CFG.warehouses && CFG.warehouses.length ? CFG.warehouses : ['Magazina Kryesore', 'Depo 2'];
    const {
      value: selectedWarehouse
    } = await Swal.fire({
      title: 'Zgjidh Magazinën',
      input: 'select',
      inputOptions: warehouses.reduce((o, w) => {
        o[w] = w;
        return o;
      }, {}),
      inputPlaceholder: 'Zgjidh magazinën',
      showCancelButton: true,
      confirmButtonText: 'Vazhdo',
      confirmButtonColor: '#714B67'
    });
    if (!selectedWarehouse) return;
    const conf = await Swal.fire({
      icon: 'question',
      title: 'Krijo Fletë Hyrje?',
      text: `${po.poNumber || ''} → ${selectedWarehouse}`,
      showCancelButton: true,
      confirmButtonText: 'Ruaj blerjen & Krijo Fletë Hyrje',
      cancelButtonText: 'Anulo',
      confirmButtonColor: '#714B67'
    });
    if (!conf.isConfirmed) return;
    const autoNo = 'FH-' + String(po.poNumber || Date.now()).replace(/[^0-9A-Z]/gi, '').slice(-6);
    const numRes = await Swal.fire({
      icon: 'question',
      title: 'Numri i Fletës së Hyrjes',
      html: 'Automatik nga porosia e blerjes (<b>' + autoNo + '</b>), ose shkruaje manualisht:',
      input: 'text',
      inputValue: autoNo,
      showCancelButton: true,
      confirmButtonText: 'Vazhdo',
      cancelButtonText: 'Anulo',
      confirmButtonColor: '#714B67'
    });
    if (!numRes.isConfirmed) {
      setLoad('');
      return;
    }
    const docNo = String(numRes.value || '').trim() || autoNo;
    setLoad('Duke krijuar Fletë Hyrje...');
    const receipt = {
      docNo,
      poId: po.id,
      poNumber: po.poNumber,
      supplierId: po.supplierId,
      supplierName: po.supplierName,
      warehouse: selectedWarehouse,
      items: (po.items || []).map(it => ({
        productId: it.productId,
        name: it.name,
        sku: it.sku,
        qty: Number(it.qty) || 0,
        enteredQty: Number(it.enteredQty != null ? it.enteredQty : it.qty) || 0,
        unitKey: it.unitKey || 'base',
        unitName: it.unitName || 'copë',
        unitMultiplier: Number(it.unitMultiplier) || 1,
        unitCost: Number(it.unitCost) || 0,
        enteredUnitCost: Number(it.enteredUnitCost || it.lineUnitCost || it.unitCost) || 0,
        lineTotal: Number(it.lineTotal) || 0,
        warehouse: selectedWarehouse
      })),
      total: po.total || 0,
      notes: po.notes || '',
      createdAt: nowIso()
    };
    const receiptRes = await fbCreateWarehouseReceiptIn(receipt, user);
    if (!receiptRes.success) {
      setLoad('');
      Swal.fire({
        icon: 'error',
        title: 'Fletë Hyrje nuk u ruajt',
        text: receiptRes.message || 'Ruajtja e dokumentit dështoi. Stoku nuk u ndryshua.'
      });
      return;
    }
    const r = await fbReceivePurchaseOrder(po, user, false, selectedWarehouse, {
      id: receiptRes.id,
      docNo
    });
    setLoad('');
    if (r.success) {
      setViewPo(null);
      Swal.fire({
        icon: 'success',
        title: 'Fletë Hyrje u krijua!',
        text: docNo,
        timer: 1800,
        showConfirmButton: false
      });
      setViewReceipt(receiptRes.data || {
        id: receiptRes.id,
        ...receipt
      });
      reload();
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Gabim gjatë hyrjes në stok',
        text: r.message || 'Fletë Hyrje u ruajt, por stoku nuk u përditësua plotësisht. Kontrollo lëvizjet e magazinës.'
      });
    }
  };
  const handleDelete = po => {
    Swal.fire({
      icon: 'warning',
      title: 'Fshi porosinë?',
      text: po.poNumber || '',
      showCancelButton: true,
      confirmButtonColor: '#d9534f',
      confirmButtonText: 'Confirm',
      cancelButtonText: 'Cancel'
    }).then(async res => {
      if (!res.isConfirmed) return;
      setLoad('Duke fshirë...');
      const r = await fbDeletePurchaseOrder(po.id, po.poNumber, user);
      setLoad('');
      if (r.success) {
        Swal.fire({
          icon: 'success',
          text: r.message,
          timer: 1400,
          showConfirmButton: false
        });
        reload();
      } else Swal.fire({
        icon: 'error',
        title: 'Error',
        text: r.message
      });
    });
  };
  const poFacets = useMemo(() => {
    const f = [];
    if (facetStatus) f.push({
      id: 'status',
      label: 'Statusi',
      value: statusTextSq(facetStatus) || facetStatus
    });
    if (qSearch) f.push({
      id: 'q',
      label: 'Kërkim',
      value: qSearch
    });
    return f;
  }, [facetStatus, qSearch]);
  const poChips = [{
    id: 'draft',
    label: 'Draft',
    active: facetStatus === 'draft'
  }, {
    id: 'ordered',
    label: 'Ordered',
    active: facetStatus === 'ordered'
  }, {
    id: 'received',
    label: 'Received',
    active: facetStatus === 'received'
  }, {
    id: 'cancelled',
    label: 'Cancelled',
    active: facetStatus === 'cancelled'
  }];
  const onPoKanbanDrop = async (cardId, fromCol, toCol, card) => {
    if (!cardId || fromCol === toCol) return;
    const allowed = ['draft', 'ordered', 'received', 'cancelled'];
    if (allowed.indexOf(toCol) < 0) return;
    if (toCol === 'received' && fromCol !== 'received') {
      const po = byId[cardId] || card && card.record;
      if (po) {
        doReceive(po);
        return;
      }
    }
    const r = await fbUpdatePurchaseOrder(cardId, {
      status: toCol,
      poNumber: card && card.title || cardId
    }, user);
    if (r.success) {
      Swal.fire({
        icon: 'success',
        title: 'Statusi u ndryshua',
        timer: 1200,
        showConfirmButton: false
      });
      reload();
    } else Swal.fire({
      icon: 'error',
      title: 'Gabim',
      text: r.message
    });
  };
  const poKanban = useMemo(() => {
    const stages = ['draft', 'ordered', 'received', 'cancelled'];
    const titles = {
      draft: 'Draft',
      ordered: 'Ordered',
      received: 'Received',
      cancelled: 'Cancelled'
    };
    const src = displayPOs.filter(p => {
      if (qSearch) {
        const q = qSearch.toLowerCase();
        const blob = [p.poNumber, p.supplierName, p.status].join(' ').toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
    return stages.map(st => ({
      id: st,
      title: titles[st],
      cards: src.filter(p => (p.status || 'draft') === st).map(p => ({
        id: p.id,
        title: p.poNumber || String(p.id).slice(-6),
        sub: p.supplierName || '—',
        meta: formatDateForDisplay(p.createdAt),
        amount: money(p.total),
        footer: p.itemCount != null ? p.itemCount + ' rreshta' : '',
        tags: [statusTextSq(p.status) || p.status].filter(Boolean),
        record: p,
        onClick: () => setViewPo(byId[p.id] || p)
      }))
    }));
  }, [displayPOs, qSearch, byId]);
  return React.createElement("div", {
    className: "data-section"
  }, load && React.createElement(TopLoadingBar, null), React.createElement("div", {
    className: "section-header"
  }, React.createElement("h2", null, React.createElement("i", {
    className: "fas fa-file-invoice-dollar"
  }), " Porosi Blerje"), React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center'
    }
  }, React.createElement(OdooViewSwitcher, {
    mode: viewMode,
    onChange: setViewMode
  }), React.createElement(RefreshBtn, {
    onClick: reload
  }), React.createElement("button", {
    className: "btn btn-success",
    disabled: loading,
    onClick: () => setShowModal(true)
  }, React.createElement("i", {
    className: "fas fa-plus"
  }), " I ri"))), React.createElement("div", {
    className: "o-cp-tools"
  }, React.createElement(OdooSearchFacets, {
    value: qSearch,
    onChange: setQSearch,
    placeholder: "K\xEBrko porosi\u2026 nr, furnitor, status\u2026",
    facets: poFacets,
    onRemoveFacet: f => {
      if (f.id === 'status') setFacetStatus('');
      if (f.id === 'q') setQSearch('');
    },
    filterChips: poChips,
    onToggleChip: c => setFacetStatus(facetStatus === c.id ? '' : c.id)
  })), loading && React.createElement(TableSkeleton, {
    rows: 8,
    columns: 8
  }), React.createElement("div", {
    style: {
      display: loading ? 'none' : 'block'
    }
  }, React.createElement("div", {
    style: {
      display: viewMode === 'list' ? 'block' : 'none'
    }
  }, React.createElement("table", {
    id: "poTable",
    className: "display",
    style: {
      width: '100%'
    }
  }), React.createElement(FilteredSummaryBar, {
    tableRef: tableRef,
    deps: [displayPOs, qSearch, facetStatus],
    itemsBuilder: rows => [{
      label: 'Porosi (filtruar)',
      value: rows.length
    }, {
      label: 'Totali (filtruar)',
      value: money(rows.reduce((s, r) => s + Number(r.total || 0), 0))
    }, {
      label: 'Hapura',
      value: rows.filter(r => r.status !== 'received' && r.status !== 'cancelled').length
    }]
  }), pos.length > 0 && React.createElement(SummaryBar, {
    items: [{
      label: 'POs',
      value: poSummary.count
    }, {
      label: 'Total Value',
      value: money(poSummary.total)
    }, {
      label: 'Open (unreceived)',
      value: money(poSummary.open)
    }]
  })), viewMode === 'kanban' && React.createElement(OdooKanban, {
    columns: poKanban,
    onDropCard: onPoKanbanDrop
  })), showModal && React.createElement(PurchaseOrderModal, {
    suppliers: suppliers,
    products: products,
    onClose: () => setShowModal(false),
    onSave: handleSave
  }), viewPo && React.createElement(PoDetailModal, {
    po: viewPo,
    onClose: () => setViewPo(null),
    onReceive: doReceive,
    supplier: (suppliers || []).find(s => s.id === viewPo.supplierId)
  }), viewReceipt && React.createElement(WarehouseReceiptInOverlay, {
    receipt: viewReceipt,
    onClose: () => setViewReceipt(null)
  }));
}
function WarehouseReceiptsInView({
  user,
  role
}) {
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  useEffect(() => {
    const fn = () => setReloadKey(k => k + 1);
    window.addEventListener('erp-data-changed', fn);
    return () => window.removeEventListener('erp-data-changed', fn);
  }, []);
  const {
    loading,
    data,
    err
  } = useFetch(() => fbGetWarehouseReceiptsIn(), [reloadKey]);
  const receipts = useMemo(() => data && data.success ? data.data : [], [data]);
  const filtered = useMemo(() => {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return receipts;
    return receipts.filter(r => [r.docNo, r.poNumber, r.supplierName, r.warehouse, r.createdAt].some(v => String(v || '').toLowerCase().includes(q)));
  }, [receipts, query]);
  useEffect(() => {
    if (err || data && !data.success) Swal.fire({
      icon: 'error',
      title: 'Gabim',
      text: data && data.message || String(err || 'Nuk u ngarkuan Fletë Hyrjet')
    });
  }, [err, data]);
  return React.createElement("div", {
    className: "data-section"
  }, React.createElement("div", {
    className: "section-header"
  }, React.createElement("h2", null, React.createElement("i", {
    className: "fas fa-box-open"
  }), " Flet\xEB Hyrje"), React.createElement("button", {
    type: "button",
    className: "btn btn-secondary btn-refresh",
    onClick: () => setReloadKey(k => k + 1)
  }, React.createElement("i", {
    className: "fas fa-rotate"
  }), " Rifresko")), React.createElement("div", {
    className: "module-toolbar"
  }, React.createElement("div", {
    className: "left"
  }, React.createElement("div", {
    className: 'google-search-wrap' + (query ? ' has-value' : '')
  }, React.createElement("i", {
    className: "fas fa-search gs-icon"
  }), React.createElement("input", {
    value: query,
    onChange: e => setQuery(e.target.value),
    placeholder: "K\xEBrko nr., porosi, furnitor, magazin\xEB\u2026"
  }), React.createElement("button", {
    className: "gs-clear",
    onClick: () => setQuery('')
  }, React.createElement("i", {
    className: "fas fa-times"
  })))), React.createElement("div", {
    className: "right"
  }, React.createElement("span", {
    className: "type-chip"
  }, filtered.length, " dokumente"))), loading ? React.createElement(TableSkeleton, {
    rows: 8,
    columns: 8
  }) : React.createElement("div", {
    className: "about-table-wrapper"
  }, React.createElement("table", {
    className: "about-roles-table"
  }, React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", null, "Nr. Flet\xEB Hyrje"), React.createElement("th", null, "Data"), React.createElement("th", null, "Porosia"), React.createElement("th", null, "Furnitori"), React.createElement("th", null, "Magazina"), React.createElement("th", null, "Rreshta"), React.createElement("th", null, "Totali"), React.createElement("th", null, "Veprime"))), React.createElement("tbody", null, filtered.length === 0 ? React.createElement("tr", null, React.createElement("td", {
    colSpan: "8",
    style: {
      textAlign: 'center',
      color: '#888',
      padding: 24
    }
  }, "Nuk ka Flet\xEB Hyrje.")) : filtered.map(r => React.createElement("tr", {
    key: r.id || r.docNo
  }, React.createElement("td", null, React.createElement("button", {
    type: "button",
    className: "doc-link",
    onClick: () => setSelectedReceipt(r)
  }, React.createElement("i", {
    className: "fas fa-arrow-right"
  }), warehouseDocNoFromReceipt(r))), React.createElement("td", null, formatDateForDisplay(r.createdAt)), React.createElement("td", null, r.poNumber || '—'), React.createElement("td", null, r.supplierName || '—'), React.createElement("td", null, r.warehouse || 'Magazina Kryesore'), React.createElement("td", null, (r.items || []).length), React.createElement("td", null, money(r.total || 0)), React.createElement("td", {
    style: {
      whiteSpace: 'nowrap'
    }
  }, React.createElement("button", {
    type: "button",
    className: "action-icon qr-icon",
    title: "Shiko",
    onClick: () => setSelectedReceipt(r)
  }, React.createElement("i", {
    className: "fas fa-eye"
  })), React.createElement("button", {
    type: "button",
    className: "action-icon edit-icon",
    title: "Printo",
    onClick: () => openWarehouseReceiptInDocument(r, true)
  }, React.createElement("i", {
    className: "fas fa-print"
  })), React.createElement("button", {
    type: "button",
    className: "action-icon delete-icon",
    title: "PDF",
    onClick: () => exportWarehouseInPdf(r)
  }, React.createElement("i", {
    className: "fas fa-file-pdf"
  })), React.createElement("button", {
    type: "button",
    className: "action-icon qr-icon",
    title: "Excel",
    onClick: () => exportWarehouseInXlsx(r)
  }, React.createElement("i", {
    className: "fas fa-file-excel"
  })))))))), React.createElement(SummaryBar, {
    items: [{
      label: 'Fletë Hyrje',
      value: filtered.length
    }, {
      label: 'Vlera totale',
      value: money(filtered.reduce((s, r) => s + Number(r.total || 0), 0))
    }]
  }), selectedReceipt && React.createElement(WarehouseReceiptInOverlay, {
    receipt: selectedReceipt,
    onClose: () => setSelectedReceipt(null)
  }));
}
function UserModal({
  editUser,
  onClose,
  onSave
}) {
  const [formData, setFormData] = useState({
    name: editUser?.name || '',
    email: editUser?.email || '',
    password: '',
    role: editUser?.role || 'User',
    active: editUser?.active !== false
  });
  const [customRights, setCustomRights] = useState(() => {
    const base = getRights(editUser?.role || 'User');
    const over = editUser && editUser.rights || {};
    const keys = ['pos', 'products', 'stock', 'sales-history', 'reports', 'records', 'suppliers', 'purchase-orders', 'warehouse-receipts-in', 'expenses', 'users', 'settings', 'logs', 'import-export', 'canCreate', 'canEdit', 'canDelete', 'canExport'];
    const o = {};
    keys.forEach(k => {
      o[k] = over[k] != null ? !!over[k] : !!base[k];
    });
    return o;
  });
  const [useCustom, setUseCustom] = useState(!!(editUser && editUser.rights));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!useCustom) {
      const base = getRights(formData.role);
      setCustomRights(prev => {
        const n = {};
        Object.keys(prev).forEach(k => {
          n[k] = !!base[k];
        });
        return n;
      });
    }
  }, [formData.role, useCustom]);
  const toggleRight = key => {
    setUseCustom(true);
    setCustomRights(p => ({
      ...p,
      [key]: !p[key]
    }));
  };
  const submit = async e => {
    e.preventDefault();
    setErr('');
    const name = formData.name.trim();
    const email = formData.email.trim();
    if (!name) {
      setErr('Shkruaj emrin e përdoruesit');
      return;
    }
    if (!email || !email.includes('@')) {
      setErr('Shkruaj një email të vlefshëm');
      return;
    }
    if (!editUser && (!formData.password || formData.password.length < 4)) {
      setErr('Fjalëkalimi duhet ≥ 4 karaktere');
      return;
    }
    if (!formData.role) {
      setErr('Zgjidh rolin / të drejtat');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name,
        email,
        role: formData.role,
        active: formData.active !== false,
        rights: formData.role === 'Admin' ? null : useCustom ? customRights : null
      };
      if (!editUser || formData.password) payload.password = formData.password;
      await onSave(payload);
    } catch (ex) {
      setErr(String(ex && ex.message || ex));
    }
    setSaving(false);
  };
  const moduleKeys = ['pos', 'products', 'stock', 'sales-history', 'reports', 'records', 'suppliers', 'purchase-orders', 'warehouse-receipts-in', 'expenses', 'users', 'settings', 'logs'];
  const actionKeys = ['canCreate', 'canEdit', 'canDelete', 'canExport'];
  const isAdminRole = formData.role === 'Admin';
  return React.createElement("div", {
    className: "modal-overlay",
    onClick: onClose
  }, React.createElement("div", {
    className: "modal",
    onClick: e => e.stopPropagation(),
    style: {
      maxWidth: 760
    }
  }, React.createElement("div", {
    className: "modal-header"
  }, React.createElement("h3", null, React.createElement("i", {
    className: "fas fa-user-gear"
  }), " ", editUser ? 'Ndrysho përdoruesin' : 'Shto përdorues'), React.createElement("button", {
    type: "button",
    className: "close-btn",
    onClick: onClose
  }, React.createElement("i", {
    className: "fas fa-times"
  }))), React.createElement("div", {
    className: "modal-body"
  }, React.createElement("form", {
    onSubmit: submit
  }, err && React.createElement("div", {
    style: {
      background: '#fdecea',
      color: '#b02a37',
      border: '1px solid #f5c2c7',
      borderRadius: 4,
      padding: '10px 12px',
      marginBottom: 14,
      fontSize: 13
    }
  }, React.createElement("i", {
    className: "fas fa-circle-exclamation"
  }), " ", err), React.createElement("div", {
    className: "form-grid"
  }, React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Emri *"), React.createElement("input", {
    type: "text",
    value: formData.name,
    onChange: e => setFormData(p => ({
      ...p,
      name: e.target.value
    })),
    placeholder: "p.sh. Arben Krasniqi",
    autoFocus: true
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Email *"), React.createElement("input", {
    type: "email",
    value: formData.email,
    onChange: e => setFormData(p => ({
      ...p,
      email: e.target.value
    })),
    placeholder: "p.sh. arben@firma.al"
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Fjal\xEBkalimi ", editUser ? '(bosh = pa ndryshim)' : '*'), React.createElement("input", {
    type: "password",
    value: formData.password,
    onChange: e => setFormData(p => ({
      ...p,
      password: e.target.value
    })),
    placeholder: editUser ? '••••••••' : 'min. 4 karaktere',
    autoComplete: "new-password"
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Roli / Niveli i aksesit *"), React.createElement("select", {
    className: "filter-input",
    value: formData.role,
    onChange: e => setFormData(p => ({
      ...p,
      role: e.target.value
    })),
    style: {
      width: '100%'
    }
  }, ROLE_OPTS.map(o => React.createElement("option", {
    key: o.value,
    value: o.value
  }, o.label))))), React.createElement("div", {
    className: "form-group",
    style: {
      marginTop: 8
    }
  }, React.createElement("label", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      cursor: 'pointer'
    }
  }, React.createElement("input", {
    type: "checkbox",
    className: "odoo-check",
    checked: formData.active !== false,
    onChange: e => setFormData(p => ({
      ...p,
      active: e.target.checked
    }))
  }), "Llogaria aktive")), React.createElement("div", {
    style: {
      marginTop: 16,
      border: '1px solid var(--o-border, #dee2e6)',
      borderRadius: 4,
      overflow: 'hidden'
    }
  }, React.createElement("div", {
    style: {
      padding: '10px 14px',
      background: '#f8f9fa',
      borderBottom: '1px solid #dee2e6',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, React.createElement("strong", {
    style: {
      fontWeight: 500
    }
  }, React.createElement("i", {
    className: "fas fa-shield-halved",
    style: {
      color: '#714B67',
      marginRight: 8
    }
  }), "T\xEB drejtat e aksesit"), !isAdminRole && React.createElement("label", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 12.5,
      color: '#6c757d',
      cursor: 'pointer',
      margin: 0
    }
  }, React.createElement("input", {
    type: "checkbox",
    checked: useCustom,
    onChange: e => setUseCustom(e.target.checked)
  }), "Personalizo t\xEB drejtat")), React.createElement("div", {
    style: {
      padding: 14
    }
  }, isAdminRole ? React.createElement("div", {
    style: {
      color: '#1e7e34',
      fontSize: 13.5
    }
  }, React.createElement("i", {
    className: "fas fa-circle-check"
  }), " Admin ka akses t\xEB plot\xEB n\xEB t\xEB gjitha modulet dhe veprimet.") : React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      fontSize: 12,
      color: '#6c757d',
      marginBottom: 10
    }
  }, "Modulet q\xEB mund t\u2019i shoh\xEB:"), React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))',
      gap: 8,
      marginBottom: 14
    }
  }, moduleKeys.map(k => React.createElement("label", {
    key: k,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 13,
      padding: '6px 8px',
      background: customRights[k] ? '#eef7f7' : '#fafafa',
      border: '1px solid #e9ecef',
      borderRadius: 3,
      cursor: useCustom ? 'pointer' : 'default',
      opacity: useCustom || customRights[k] ? 1 : 0.7
    }
  }, React.createElement("input", {
    type: "checkbox",
    className: "odoo-check",
    checked: !!customRights[k],
    disabled: !useCustom,
    onChange: () => toggleRight(k)
  }), RIGHT_LABELS[k] || k))), React.createElement("div", {
    style: {
      fontSize: 12,
      color: '#6c757d',
      marginBottom: 10
    }
  }, "Veprimet e lejuara:"), React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))',
      gap: 8
    }
  }, actionKeys.map(k => React.createElement("label", {
    key: k,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 13,
      padding: '6px 8px',
      background: customRights[k] ? '#f3eef2' : '#fafafa',
      border: '1px solid #e9ecef',
      borderRadius: 3,
      cursor: useCustom ? 'pointer' : 'default'
    }
  }, React.createElement("input", {
    type: "checkbox",
    className: "odoo-check",
    checked: !!customRights[k],
    disabled: !useCustom,
    onChange: () => toggleRight(k)
  }), RIGHT_LABELS[k] || k))), !useCustom && React.createElement("div", {
    style: {
      marginTop: 10,
      fontSize: 12,
      color: '#6c757d'
    }
  }, "T\xEB drejtat vijn\xEB nga roli ", React.createElement("b", null, formData.role), ". Aktivizo \u201CPersonalizo\u201D p\xEBr t\u2019i ndryshuar.")))), React.createElement("div", {
    className: "form-actions"
  }, React.createElement("button", {
    type: "submit",
    className: "btn btn-primary",
    disabled: saving
  }, saving ? React.createElement(React.Fragment, null, React.createElement("i", {
    className: "fas fa-spinner fa-spin"
  }), " Duke ruajtur...") : React.createElement(React.Fragment, null, React.createElement("i", {
    className: "fas fa-save"
  }), " Ruaj p\xEBrdoruesin")), React.createElement("button", {
    type: "button",
    className: "btn btn-secondary",
    onClick: onClose,
    disabled: saving
  }, React.createElement("i", {
    className: "fas fa-times"
  }), " Anulo"))))));
}
function UsersView({
  user,
  role
}) {
  const [qSearch, setQSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [load, setLoad] = useState('');
  const tableInstanceRef = useRef(null);
  useDtLiveSearch(tableInstanceRef, qSearch);
  const {
    loading,
    data,
    err
  } = useFetch(() => fbGetUsers(), [reloadKey]);
  const [viewUser, setViewUser] = useState(null);
  const users = useMemo(() => data && data.success ? data.data : [], [data]);
  const reload = () => setReloadKey(k => k + 1);
  const byId = useMemo(() => users.reduce((m, u) => (m[u.id] = u, m), {}), [users]);
  const adminCount = useMemo(() => users.filter(u => u.role === 'Admin').length, [users]);
  const openEdit = useCallback(id => {
    setEditingId(id);
    setShowModal(true);
  }, []);
  useEffect(() => {
    if (err || data && !data.success) Swal.fire({
      icon: 'error',
      title: 'Error',
      text: data && data.message || 'Failed to load users'
    });
  }, [err, data]);
  useEffect(() => {
    if (loading) return;
    let table = tableInstanceRef.current;
    if (table) {
      table.clear().rows.add(users).draw(false);
    } else {
      table = $('#usersTable').DataTable({
        data: users,
        columnDefs: [{
          targets: '_all',
          defaultContent: ''
        }],
        columns: [{
          data: 'name',
          title: 'Emri',
          render: (d, t) => t === 'display' ? esc(d) : d
        }, {
          data: 'email',
          title: 'Email',
          render: (d, t) => t === 'display' ? esc(d) : d
        }, {
          data: 'role',
          title: 'Roli',
          render: (d, t) => t === 'display' ? '<span class="role-badge ' + (d === 'Admin' ? 'role-admin' : d === 'Manager' ? 'role-admin' : 'role-emp') + '">' + esc(d || 'User') + '</span>' : d
        }, {
          data: null,
          title: 'Veprime',
          orderable: false,
          render: () => actionBtn('view', 'fa-eye', 'Shiko') + actionBtn('edit', 'fa-edit', 'Ndrysho', 'edit') + actionBtn('delete', 'fa-trash', 'Fshi', 'delete')
        }],
        pageLength: 80,
        lengthMenu: [[10, 25, 50, -1], [10, 25, 50, 'All']],
        responsive: true,
        dom: 'Blfrtip',
        buttons: erpDtButtons('Përdoruesit'),
        order: [[0, 'asc']]
      });
      tableInstanceRef.current = table;
    }
    $('#usersTable').off('click', '[data-action]').on('click', '[data-action]', function () {
      const rowData = getDtRowData(table, this);
      if (!rowData || !rowData.id) return;
      const id = rowData.id;
      const act = $(this).data('action');
      if (act === 'view') setViewUser(byId[id] || rowData);else if (act === 'edit') openEdit(id);else handleDelete(byId[id] || rowData);
    });
  }, [loading, users]);
  useEffect(() => () => {
    if (tableInstanceRef.current) {
      try {
        tableInstanceRef.current.destroy();
        tableInstanceRef.current = null;
      } catch (e) {}
    }
  }, []);
  const handleSave = async formData => {
    if (role !== 'Admin' && !mergeUserRights(user).users) {
      Swal.fire({
        icon: 'error',
        title: 'Pa të drejtë',
        text: 'Vetëm Admin (ose me të drejtën Përdoruesit) mund të shtojë/ndryshojë llogari.'
      });
      return;
    }
    setLoad(editingId ? 'Duke përditësuar...' : 'Duke ruajtur përdoruesin...');
    try {
      const result = editingId ? await fbUpdateUser(editingId, formData, user) : await fbAddUser(formData, user);
      setLoad('');
      if (result && result.success) {
        setShowModal(false);
        setEditingId(null);
        Swal.fire({
          icon: 'success',
          title: 'U ruajt!',
          text: result.message,
          timer: 1800,
          showConfirmButton: false
        });
        reload();
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Nuk u ruajt',
          text: result && result.message || 'Gabim i panjohur'
        });
      }
    } catch (e) {
      setLoad('');
      Swal.fire({
        icon: 'error',
        title: 'Gabim',
        text: String(e && e.message || e)
      });
    }
  };
  const handleDelete = u => {
    if (u.id === user.id || u.email === user.email) return Swal.fire({
      icon: 'warning',
      title: 'Not Allowed',
      text: 'You cannot delete your own account while logged in.'
    });
    if (u.role === 'Admin' && adminCount <= 1) return Swal.fire({
      icon: 'warning',
      title: 'Not Allowed',
      text: 'At least one Admin account must remain.'
    });
    Swal.fire({
      icon: 'warning',
      title: 'Delete?',
      text: 'This cannot be undone',
      showCancelButton: true,
      confirmButtonColor: '#ea4335',
      confirmButtonText: 'Delete'
    }).then(async result => {
      if (!result.isConfirmed) return;
      setLoad('Deleting user...');
      const r = await fbDeleteUser(u.id, u.name, user);
      setLoad('');
      if (r.success) {
        Swal.fire({
          icon: 'success',
          text: r.message,
          timer: 2000,
          showConfirmButton: false
        });
        reload();
      } else Swal.fire({
        icon: 'error',
        title: 'Error',
        text: r.message
      });
    });
  };
  return React.createElement("div", {
    className: "data-section"
  }, load && React.createElement(TopLoadingBar, null), React.createElement("div", {
    className: "section-header"
  }, React.createElement("h2", null, React.createElement("i", {
    className: "fas fa-users-cog"
  }), " P\xEBrdoruesit"), React.createElement("div", {
    style: {
      display: 'flex',
      gap: '10px'
    }
  }, React.createElement(RefreshBtn, {
    onClick: reload
  }), React.createElement("button", {
    className: "btn btn-success",
    onClick: () => {
      setEditingId(null);
      setShowModal(true);
    }
  }, React.createElement("i", {
    className: "fas fa-plus"
  }), " Shto p\xEBrdorues"))), loading && React.createElement(TableSkeleton, {
    rows: 5,
    columns: 4
  }), React.createElement("div", {
    style: {
      display: loading ? 'none' : 'block'
    }
  }, React.createElement("div", {
    className: "module-toolbar"
  }, React.createElement(GoogleSearchBox, {
    value: qSearch,
    onChange: setQSearch,
    placeholder: "K\xEBrko p\xEBrdorues\u2026 em\xEBr, email, rol\u2026"
  })), React.createElement("table", {
    id: "usersTable",
    className: "display",
    style: {
      width: '100%'
    }
  }), React.createElement(FilteredSummaryBar, {
    tableRef: tableInstanceRef,
    deps: [users, qSearch],
    itemsBuilder: rows => [{
      label: 'Përdorues (filtruar)',
      value: rows.length
    }, {
      label: 'Admin',
      value: rows.filter(r => r.role === 'Admin').length
    }]
  })), viewUser && React.createElement(UserHubModal, {
    account: viewUser,
    onClose: () => setViewUser(null)
  }), showModal && React.createElement(UserModal, {
    editUser: byId[editingId],
    onClose: () => {
      setShowModal(false);
      setEditingId(null);
    },
    onSave: handleSave
  }));
}
const IE_TEMPLATES = {
  customers: {
    id: 'customers',
    label: 'Klientët',
    icon: 'fa-address-book',
    path: 'records',
    columns: ['name', 'phone', 'email', 'company', 'customerType', 'category', 'amount', 'creditLimit', 'address', 'nipt', 'notes', 'active'],
    headers: ['Emri*', 'Telefoni', 'Email', 'Kompania', 'Tipi', 'Kategoria', 'Balanca', 'Limiti Kredie', 'Adresa', 'NIPT', 'Shënime', 'Aktiv(1/0)'],
    required: ['name']
  },
  products: {
    id: 'products',
    label: 'Artikujt',
    icon: 'fa-boxes-stacked',
    path: 'products',
    columns: ['name', 'sku', 'barcode', 'category', 'price', 'cost', 'unit', 'unit2Name', 'unit2Coef', 'unit2Price', 'reorderLevel', 'taxRate', 'location', 'status', 'notes'],
    headers: ['Emri*', 'SKU', 'Barkodi', 'Kategoria', 'Çmimi', 'Kosto', 'Njësia', 'Njësia2', 'Koef2', 'Çmimi2', 'Nivel furnizimi', 'TVSH%', 'Magazina', 'Statusi', 'Shënime'],
    required: ['name']
  },
  suppliers: {
    id: 'suppliers',
    label: 'Furnitorët',
    icon: 'fa-truck-field',
    path: 'suppliers',
    columns: ['name', 'contact', 'phone', 'email', 'address', 'terms', 'openingBalance', 'notes'],
    headers: ['Emri*', 'Kontakti', 'Telefoni', 'Email', 'Adresa', 'Kushtet', 'Balanca fillestare', 'Shënime'],
    required: ['name']
  },
  stock: {
    id: 'stock',
    label: 'Hyrje / Dalje',
    icon: 'fa-dolly',
    path: 'stock_movements',
    columns: ['sku', 'productName', 'type', 'qty', 'unitName', 'unitCost', 'reason', 'reference', 'warehouse', 'batchNo', 'notes'],
    headers: ['SKU*', 'Emri artikullit', 'Tipi(in/out)*', 'Sasia*', 'Njësia', 'Kosto', 'Arsyeja', 'Referenca', 'Magazina', 'Lot/Batch', 'Shënime'],
    required: ['type', 'qty']
  },
  sales: {
    id: 'sales',
    label: 'Shitjet / Faturat',
    icon: 'fa-receipt',
    path: 'sales',
    columns: ['invoiceNo', 'date', 'customerName', 'customerPhone', 'paymentMethod', 'sku', 'productName', 'qty', 'unitName', 'unitPrice', 'taxRate', 'discount', 'notes'],
    headers: ['Nr Fature', 'Data*', 'Klienti', 'Tel klienti', 'Pagesa', 'SKU', 'Artikulli*', 'Sasia*', 'Njësia', 'Çmimi*', 'TVSH%', 'Zbritje', 'Shënime'],
    required: ['productName', 'qty', 'unitPrice']
  },
  purchases: {
    id: 'purchases',
    label: 'Blerjet (PO)',
    icon: 'fa-bag-shopping',
    path: 'purchase_orders',
    columns: ['poNumber', 'date', 'supplierName', 'status', 'sku', 'productName', 'qty', 'unitName', 'unitCost', 'notes'],
    headers: ['Nr PO', 'Data*', 'Furnitori*', 'Statusi', 'SKU', 'Artikulli*', 'Sasia*', 'Njësia', 'Kosto*', 'Shënime'],
    required: ['supplierName', 'productName', 'qty', 'unitCost']
  },
  payments: {
    id: 'payments',
    label: 'Pagesat / Arkëtimet',
    icon: 'fa-money-bill-transfer',
    path: 'payments',
    columns: ['date', 'type', 'party', 'amount', 'method', 'reference', 'notes'],
    headers: ['Data*', 'Tipi(in/out)*', 'Palë*', 'Shuma*', 'Metoda', 'Referenca', 'Shënime'],
    required: ['type', 'party', 'amount']
  },
  expenses: {
    id: 'expenses',
    label: 'Shpenzimet',
    icon: 'fa-money-bill-wave',
    path: 'expenses',
    columns: ['date', 'category', 'payee', 'amount', 'paymentMethod', 'notes'],
    headers: ['Data*', 'Kategoria*', 'Marrësi', 'Shuma*', 'Pagesa', 'Shënime'],
    required: ['category', 'amount']
  }
};
function ieCsvEscape(v) {
  const s = String(v == null ? '' : v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function ieDownloadText(filename, text, mime) {
  const blob = new Blob([text], {
    type: mime || 'text/csv;charset=utf-8'
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function ieParseCsv(text) {
  const rows = [];
  let i = 0,
    field = '',
    row = [],
    inQ = false;
  const s = String(text || '').replace(/^\uFEFF/, '');
  while (i < s.length) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQ = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQ = true;
      i++;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some(c => String(c).trim() !== '')) rows.push(row);
      row = [];
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  row.push(field);
  if (row.some(c => String(c).trim() !== '')) rows.push(row);
  if (!rows.length) return {
    headers: [],
    rows: []
  };
  const headers = rows[0].map(h => String(h || '').trim());
  const data = rows.slice(1).map(r => {
    const o = {};
    headers.forEach((h, idx) => {
      o[h] = r[idx] != null ? String(r[idx]).trim() : '';
    });
    return o;
  });
  return {
    headers,
    rows: data
  };
}
async function ieParseXlsx(arrayBuffer) {
  if (!window.JSZip) throw new Error('JSZip nuk u ngarkua');
  const zip = await JSZip.loadAsync(arrayBuffer);
  const shared = [];
  const ssFile = zip.file('xl/sharedStrings.xml');
  if (ssFile) {
    const ss = await ssFile.async('string');
    const siRe = /<si>([\s\S]*?)<\/si>/g;
    let m;
    while (m = siRe.exec(ss)) {
      const texts = [];
      const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g;
      let tm;
      while (tm = tRe.exec(m[1])) texts.push(tm[1]);
      let t = texts.length ? texts.join('') : m[1].replace(/<[^>]+>/g, '');
      t = t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
      shared.push(t);
    }
  }
  const sheetName = Object.keys(zip.files).sort().find(function (n) {
    return /^xl\/worksheets\/sheet\d+\.xml$/.test(n);
  });
  if (!sheetName) throw new Error('Nuk u gjet worksheet në Excel');
  const xml = await zip.file(sheetName).async('string');
  const cellRe = /<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  const gridMap = {};
  let cm;
  function colLettersToIndex(letters) {
    let n = 0;
    for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
    return n - 1;
  }
  while (cm = cellRe.exec(xml)) {
    const attrs = cm[1] || '';
    const body = cm[2] || '';
    const refM = attrs.match(/\br="([A-Z]+)(\d+)"/i);
    if (!refM) continue;
    const col = colLettersToIndex(refM[1].toUpperCase());
    const row = Number(refM[2]) - 1;
    const t = (attrs.match(/\bt="([^"]+)"/) || [])[1] || '';
    let val = '';
    const vM = body.match(/<v[^>]*>([\s\S]*?)<\/v>/);
    const isM = body.match(/<t[^>]*>([\s\S]*?)<\/t>/);
    if (vM) val = vM[1];else if (isM) val = isM[1];
    if (t === 's') val = shared[Number(val)] != null ? shared[Number(val)] : '';
    if (t === 'inlineStr' && !val) {
      const t2 = body.match(/<t[^>]*>([\s\S]*?)<\/t>/);
      if (t2) val = t2[1];
    }
    val = String(val == null ? '' : val).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
    if (!gridMap[row]) gridMap[row] = {};
    gridMap[row][col] = val;
  }
  const rowIdxs = Object.keys(gridMap).map(Number).sort(function (a, b) {
    return a - b;
  });
  if (!rowIdxs.length) return {
    headers: [],
    rows: []
  };
  const grid = rowIdxs.map(function (r) {
    const cols = gridMap[r];
    const maxC = Math.max.apply(null, Object.keys(cols).map(Number));
    const arr = [];
    for (let c = 0; c <= maxC; c++) arr.push(cols[c] != null ? cols[c] : '');
    return arr;
  }).filter(function (arr) {
    return arr.some(function (x) {
      return String(x).trim() !== '';
    });
  });
  if (!grid.length) return {
    headers: [],
    rows: []
  };
  const known = {};
  try {
    Object.keys(IE_TEMPLATES).forEach(function (k) {
      const tpl = IE_TEMPLATES[k];
      (tpl.headers || []).forEach(function (h) {
        known[String(h).toLowerCase().replace(/\*/g, '').trim()] = 1;
      });
      (tpl.columns || []).forEach(function (h) {
        known[String(h).toLowerCase().trim()] = 1;
      });
    });
  } catch (e) {}
  ['emri', 'name', 'sku', 'data', 'date', 'tipi', 'type', 'sasia', 'qty', 'shuma', 'amount', 'artikulli', 'klienti', 'furnitori', 'telefoni', 'phone', 'email', 'cmimi', 'çmimi', 'kosto', 'balanca', 'pagesa', 'statusi'].forEach(function (k) {
    known[k] = 1;
  });
  function scoreHeader(row) {
    let s = 0;
    (row || []).forEach(function (cell) {
      const n = String(cell || '').toLowerCase().replace(/\*/g, '').trim();
      if (!n) return;
      if (known[n]) s += 3;
      if (n.indexOf('emri') >= 0 || n.indexOf('name') >= 0 || n.indexOf('sku') >= 0 || n.indexOf('sasia') >= 0) s += 2;
      if (/template|sistemi|gjeneruar|filtrat|rreshta|format|lloj:/.test(n)) s -= 6;
    });
    const filled = (row || []).filter(function (c) {
      return String(c || '').trim() !== '';
    }).length;
    if (filled >= 3) s += 2;
    if (filled >= 6) s += 2;
    return s;
  }
  let headerIdx = 0,
    best = -999;
  for (let r = 0; r < Math.min(grid.length, 40); r++) {
    const sc = scoreHeader(grid[r]);
    if (sc > best) {
      best = sc;
      headerIdx = r;
    }
  }
  if (best < 2) {
    let maxLen = 0;
    grid.forEach(function (r, idx) {
      if (r.length > maxLen) {
        maxLen = r.length;
        headerIdx = idx;
      }
    });
  }
  const headers = grid[headerIdx].map(function (h) {
    return String(h || '').trim();
  });
  const rows = [];
  for (let r = headerIdx + 1; r < grid.length; r++) {
    const line = grid[r];
    const joined = line.join(' ').toLowerCase().trim();
    if (/^(gjeneruar|filtrat|rreshta|sistemi genit|template_|lloj:|format:)/.test(joined)) continue;
    const o = {};
    let any = false;
    headers.forEach(function (h, idx) {
      if (!h) return;
      let v = line[idx] != null ? String(line[idx]).trim() : '';
      if (/e\+\d+$/i.test(v) && !isNaN(Number(v))) {
        try {
          v = String(Math.round(Number(v)));
        } catch (e) {}
      }
      o[h] = v;
      if (v) any = true;
    });
    if (any) rows.push(o);
  }
  return {
    headers: headers,
    rows: rows,
    headerRow: headerIdx + 1
  };
}
function ieNormHeader(h) {
  return String(h == null ? '' : h).toLowerCase().replace(/\*/g, '').replace(/\s+/g, ' ').trim();
}
function ieMapRow(tpl, raw) {
  const o = {};
  const rawMap = {};
  Object.keys(raw || {}).forEach(function (k) {
    rawMap[ieNormHeader(k)] = raw[k];
  });
  tpl.columns.forEach(function (col, i) {
    const h = tpl.headers[i];
    let v = raw[col];
    if (v == null || v === '') v = raw[h];
    if ((v == null || v === '') && h) v = raw[String(h).replace(/\*/g, '')];
    if ((v == null || v === '') && h) v = rawMap[ieNormHeader(h)];
    if (v == null || v === '') v = rawMap[ieNormHeader(col)];
    if ((v == null || v === '') && col === 'name') v = rawMap['emri'] || rawMap['klienti'] || rawMap['furnitori'] || rawMap['artikulli'];
    if ((v == null || v === '') && col === 'phone') v = rawMap['telefoni'] || rawMap['tel'];
    if ((v == null || v === '') && col === 'productName') v = rawMap['artikulli'] || rawMap['emri artikullit'] || rawMap['emri'];
    if ((v == null || v === '') && col === 'customerName') v = rawMap['klienti'] || rawMap['emri'];
    if ((v == null || v === '') && col === 'supplierName') v = rawMap['furnitori'] || rawMap['emri'];
    if ((v == null || v === '') && col === 'unitPrice') v = rawMap['cmimi'] || rawMap['çmimi'] || rawMap['cmimi*'] || rawMap['çmimi*'];
    if ((v == null || v === '') && col === 'unitCost') v = rawMap['kosto'] || rawMap['kosto*'];
    if ((v == null || v === '') && col === 'qty') v = rawMap['sasia'] || rawMap['sasia*'];
    if ((v == null || v === '') && col === 'amount') v = rawMap['shuma'] || rawMap['shuma*'] || rawMap['balanca'];
    if (typeof v === 'string' && /e\+\d+$/i.test(v) && !isNaN(Number(v))) {
      try {
        v = String(Math.round(Number(v)));
      } catch (e) {}
    }
    o[col] = v != null ? v : '';
  });
  return o;
}
async function ieBuildCleanXlsx(filename, sheetName, headers, rows) {
  if (!window.JSZip) throw new Error('JSZip nuk u ngarkua');
  const shared = [];
  const sharedIndex = Object.create(null);
  function ss(v) {
    const s = String(v == null ? '' : v);
    if (Object.prototype.hasOwnProperty.call(sharedIndex, s)) return sharedIndex[s];
    const i = shared.length;
    shared.push(s);
    sharedIndex[s] = i;
    return i;
  }
  function colName(n) {
    let s = '',
      x = n + 1;
    while (x > 0) {
      const m = (x - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      x = Math.floor((x - 1) / 26);
    }
    return s;
  }
  function escXml(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  const all = [headers].concat((rows || []).map(function (r) {
    return headers.map(function (h) {
      return r[h] != null ? r[h] : '';
    });
  }));
  const sheetRows = all.map(function (row, ri) {
    const cells = row.map(function (val, ci) {
      const ref = colName(ci) + (ri + 1);
      if (typeof val === 'number' && Number.isFinite(val)) return '<c r="' + ref + '"><v>' + val + '</v></c>';
      const s = String(val == null ? '' : val);
      if (/^\d{9,}$/.test(s)) return '<c r="' + ref + '" t="inlineStr"><is><t>' + escXml(s) + '</t></is></c>';
      return '<c r="' + ref + '" t="s"><v>' + ss(s) + '</v></c>';
    }).join('');
    return '<row r="' + (ri + 1) + '">' + cells + '</row>';
  }).join('');
  const sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + sheetRows + '</sheetData></worksheet>';
  const sst = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' + shared.length + '" uniqueCount="' + shared.length + '">' + shared.map(function (s) {
    return '<si><t>' + escXml(s) + '</t></si>';
  }).join('') + '</sst>';
  const safeSheet = String(sheetName || 'Data').replace(/[\\\/\?\*\[\]]/g, ' ').slice(0, 31) || 'Data';
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
  zip.folder('_rels').file('.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  zip.folder('xl').file('workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' + escXml(safeSheet) + '" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.folder('xl').folder('_rels').file('workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  zip.folder('xl').file('sharedStrings.xml', sst);
  zip.folder('xl').file('styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>');
  zip.folder('xl').folder('worksheets').file('sheet1.xml', sheetXml);
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    compression: 'DEFLATE'
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith('.xlsx') ? filename : filename + '.xlsx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () {
    try {
      URL.revokeObjectURL(a.href);
    } catch (e) {}
  }, 2000);
  return true;
}
function ieTemplateCsv(tpl) {
  const lines = [tpl.headers.map(ieCsvEscape).join(',')];
  const sample = tpl.headers.map(function (h, i) {
    const c = tpl.columns[i];
    if (c === 'name' || c === 'productName' || c === 'party' || c === 'supplierName' || c === 'customerName') return 'Shembull';
    if (c === 'type') return 'in';
    if (c === 'qty' || c === 'amount' || c === 'unitPrice' || c === 'unitCost' || c === 'price') return '1';
    if (c === 'date') return new Date().toISOString().slice(0, 10);
    if (c === 'active') return '1';
    if (c === 'paymentMethod' || c === 'method') return 'Cash';
    if (c === 'status') return 'ordered';
    if (c === 'taxRate') return '20';
    if (c === 'phone') return '0691234567';
    return '';
  });
  lines.push(sample.map(ieCsvEscape).join(','));
  return lines.join('\n');
}
async function ieTemplateXlsx(tpl) {
  const headers = tpl.headers.slice();
  const sample = {};
  headers.forEach(function (h, i) {
    const c = tpl.columns[i];
    let v = '';
    if (c === 'name' || c === 'productName' || c === 'party' || c === 'supplierName' || c === 'customerName') v = 'Shembull';else if (c === 'type') v = 'in';else if (c === 'qty' || c === 'amount' || c === 'unitPrice' || c === 'unitCost' || c === 'price') v = 1;else if (c === 'date') v = new Date().toISOString().slice(0, 10);else if (c === 'active') v = 1;else if (c === 'paymentMethod' || c === 'method') v = 'Cash';else if (c === 'status') v = 'ordered';else if (c === 'taxRate') v = 20;else if (c === 'phone') v = '0691234567';
    sample[h] = v;
  });
  await ieBuildCleanXlsx('template_' + tpl.id + '.xlsx', tpl.label, headers, [sample]);
}
async function ieExportEntity(tpl, user) {
  let rows = [];
  if (tpl.id === 'customers') {
    const r = await fbGetRecords();
    rows = (r.data || []).map(c => ({
      name: c.name || '',
      phone: c.phone || '',
      email: c.email || '',
      company: c.company || '',
      customerType: c.customerType || '',
      category: c.category || '',
      amount: c.amount || 0,
      creditLimit: c.creditLimit || '',
      address: c.address || '',
      nipt: c.nipt || '',
      notes: c.notes || '',
      active: c.active === false ? 0 : 1
    }));
  } else if (tpl.id === 'products') {
    const r = await fbGetProducts();
    rows = (r.data || []).map(p => ({
      name: p.name || '',
      sku: p.sku || '',
      barcode: p.barcode || '',
      category: p.category || '',
      price: p.price || 0,
      cost: p.cost || 0,
      unit: p.unit || 'copë',
      unit2Name: p.unit2Name || '',
      unit2Coef: p.unit2Coef || '',
      unit2Price: p.unit2Price || '',
      reorderLevel: p.reorderLevel || 0,
      taxRate: p.taxRate != null ? p.taxRate : '',
      location: p.location || p.warehouse || '',
      status: p.status || 'active',
      notes: p.notes || ''
    }));
  } else if (tpl.id === 'suppliers') {
    const r = await fbGetSuppliers();
    rows = (r.data || []).map(s => ({
      name: s.name || '',
      contact: s.contact || '',
      phone: s.phone || '',
      email: s.email || '',
      address: s.address || '',
      terms: s.terms || '',
      openingBalance: s.openingBalance || 0,
      notes: s.notes || ''
    }));
  } else if (tpl.id === 'stock') {
    const r = await fbGetStockMovements();
    const pr = await fbGetProducts();
    const byId = (pr.data || []).reduce((m, p) => (m[p.id] = p, m), {});
    rows = (r.data || []).map(m => {
      const p = byId[m.productId] || {};
      return {
        sku: p.sku || '',
        productName: p.name || m.productName || '',
        type: m.type || '',
        qty: m.enteredQty != null ? m.enteredQty : m.qty,
        unitName: m.unitName || '',
        unitCost: m.unitCost || '',
        reason: m.reason || '',
        reference: m.reference || '',
        warehouse: m.warehouse || p.location || '',
        batchNo: m.batchNo || '',
        notes: m.notes || ''
      };
    });
  } else if (tpl.id === 'sales') {
    const r = await fbGetSales();
    (r.data || []).forEach(s => {
      (s.items || [{
        name: '',
        qty: 0,
        unitSalePrice: 0
      }]).forEach(it => {
        rows.push({
          invoiceNo: s.invoiceNo || '',
          date: (s.createdAt || '').slice(0, 10),
          customerName: s.customerName || '',
          customerPhone: s.customerPhone || '',
          paymentMethod: s.paymentMethod || '',
          sku: it.sku || '',
          productName: it.name || '',
          qty: it.displayQty != null ? it.displayQty : it.qty,
          unitName: it.unitName || '',
          unitPrice: it.unitSalePrice != null ? it.unitSalePrice : it.price,
          taxRate: it.taxRate != null ? it.taxRate : '',
          discount: s.discount || 0,
          notes: s.notes || ''
        });
      });
    });
  } else if (tpl.id === 'purchases') {
    const r = await fbGetPurchaseOrders();
    (r.data || []).forEach(p => {
      (p.items || [{
        name: '',
        qty: 0,
        unitCost: 0
      }]).forEach(it => {
        rows.push({
          poNumber: p.poNumber || '',
          date: (p.createdAt || '').slice(0, 10),
          supplierName: p.supplierName || '',
          status: p.status || '',
          sku: it.sku || '',
          productName: it.name || '',
          qty: it.enteredQty != null ? it.enteredQty : it.qty,
          unitName: it.unitName || '',
          unitCost: it.enteredUnitCost != null ? it.enteredUnitCost : it.unitCost,
          notes: p.notes || ''
        });
      });
    });
  } else if (tpl.id === 'payments') {
    const pay = await db.ref('payments').once('value');
    const val = pay.val() || {};
    Object.keys(val).forEach(k => {
      const p = val[k] || {};
      rows.push({
        date: (p.date || p.createdAt || '').toString().slice(0, 10),
        type: p.type || '',
        party: p.party || '',
        amount: p.amount || 0,
        method: p.method || p.paymentMethod || '',
        reference: p.reference || '',
        notes: p.notes || ''
      });
    });
    const sales = await fbGetSales();
    (sales.data || []).forEach(s => {
      if (s.paymentMethod === 'Credit') return;
      rows.push({
        date: (s.createdAt || '').slice(0, 10),
        type: 'in',
        party: s.customerName || 'Walk-in',
        amount: s.total || 0,
        method: s.paymentMethod || 'Cash',
        reference: s.invoiceNo || '',
        notes: 'Arkëtim nga shitje'
      });
    });
    const exp = await fbGetExpenses();
    (exp.data || []).forEach(e => {
      rows.push({
        date: (e.date || e.createdAt || '').toString().slice(0, 10),
        type: 'out',
        party: e.payee || e.vendor || '',
        amount: e.amount || 0,
        method: e.paymentMethod || '',
        reference: e.category || '',
        notes: e.notes || 'Pagesë/shpenzim'
      });
    });
  } else if (tpl.id === 'expenses') {
    const r = await fbGetExpenses();
    rows = (r.data || []).map(e => ({
      date: (e.date || e.createdAt || '').toString().slice(0, 10),
      category: e.category || '',
      payee: e.payee || e.vendor || '',
      amount: e.amount || 0,
      paymentMethod: e.paymentMethod || '',
      notes: e.notes || ''
    }));
  }
  const dataRows = rows.map(function (r) {
    const o = {};
    tpl.columns.forEach(function (c, i) {
      o[tpl.headers[i]] = r[c];
    });
    return o;
  });
  if (!dataRows.length) {
    await ieBuildCleanXlsx('export_' + tpl.id + '.xlsx', tpl.label, tpl.headers.slice(), []);
    return 0;
  }
  await ieBuildCleanXlsx('export_' + tpl.id + '_' + new Date().toISOString().slice(0, 10) + '.xlsx', tpl.label, tpl.headers.slice(), dataRows);
  return dataRows.length;
}
async function ieImportEntity(tpl, rawRows, user) {
  const mappedAll = (rawRows || []).map(function (r) {
    return ieMapRow(tpl, r);
  });
  const mapped = mappedAll.filter(function (r) {
    const nameish = String(r.name || r.productName || r.party || r.customerName || r.supplierName || '').trim().toLowerCase();
    if (nameish === 'shembull' || nameish === 'sample' || nameish === 'example') return false;
    if (tpl.id === 'stock' || tpl.id === 'sales' || tpl.id === 'purchases') {
      const hasProd = String(r.sku || r.productName || '').trim() !== '';
      if (!hasProd && tpl.id === 'stock') return false;
    }
    return tpl.required.every(function (k) {
      return String(r[k] || '').trim() !== '';
    });
  });
  const errors = [];
  let ok = 0;
  if (!mapped.length && (rawRows || []).length) {
    errors.push('Asnjë rresht nuk ka fushat e detyrueshme: ' + (tpl.required || []).join(', ') + '. Header të gjetura: ' + Object.keys(rawRows[0] || {}).join(' | '));
  }
  if (tpl.id === 'customers') {
    for (let __i = 0; __i < mapped.length; __i++) {
      const r = mapped[__i];
      const res = await fbAddRecord({
        name: r.name,
        phone: r.phone,
        email: r.email,
        company: r.company,
        customerType: r.customerType || 'Retail',
        category: r.category || '',
        amount: Number(r.amount) || 0,
        creditLimit: Number(r.creditLimit) || 0,
        address: r.address || '',
        nipt: r.nipt || '',
        notes: r.notes || '',
        active: !(r.active === '0' || r.active === 0 || r.active === 'false')
      }, user);
      if (res.success) ok++;else errors.push(res.message || 'Gabim klienti');
    }
  } else if (tpl.id === 'products') {
    for (let __i = 0; __i < mapped.length; __i++) {
      const r = mapped[__i];
      let sku = r.sku;
      if (!sku) {
        const g = await fbGenerateSku();
        sku = g.success ? g.data : 'SKU-' + Date.now();
      }
      const res = await fbAddProduct({
        name: r.name,
        sku: sku,
        barcode: r.barcode || '',
        category: r.category || '',
        price: Number(r.price) || 0,
        cost: Number(r.cost) || 0,
        unit: r.unit || 'copë',
        unit2Name: r.unit2Name || '',
        unit2Coef: r.unit2Coef || '',
        unit2Price: r.unit2Price || '',
        reorderLevel: Number(r.reorderLevel) || 0,
        taxRate: r.taxRate === '' ? null : Number(r.taxRate),
        location: r.location || 'Magazina Kryesore',
        status: r.status || 'active',
        notes: r.notes || ''
      }, user);
      if (res.success) ok++;else errors.push(res.message || 'Gabim artikulli');
    }
  } else if (tpl.id === 'suppliers') {
    for (let __i = 0; __i < mapped.length; __i++) {
      const r = mapped[__i];
      const res = await fbAddSupplier({
        name: r.name,
        contact: r.contact || '',
        phone: r.phone || '',
        email: r.email || '',
        address: r.address || '',
        terms: r.terms || '',
        openingBalance: Number(r.openingBalance) || 0,
        notes: r.notes || ''
      }, user);
      if (res.success) ok++;else errors.push(res.message || 'Gabim furnitori');
    }
  } else if (tpl.id === 'stock') {
    const pr = await fbGetProducts();
    const products = pr.data || [];
    const bySku = {};
    products.forEach(p => {
      if (p.sku) bySku[String(p.sku).toLowerCase()] = p;
      bySku[String(p.name || '').toLowerCase()] = p;
    });
    for (let __i = 0; __i < mapped.length; __i++) {
      const r = mapped[__i];
      const p = bySku[String(r.sku || '').toLowerCase()] || bySku[String(r.productName || '').toLowerCase()];
      if (!p) {
        errors.push('Artikulli nuk u gjet: ' + (r.sku || r.productName));
        continue;
      }
      const type = String(r.type || '').toLowerCase() === 'out' ? 'out' : 'in';
      const qty = Number(r.qty) || 0;
      if (qty <= 0) {
        errors.push('Sasi e pavlefshme për ' + p.name);
        continue;
      }
      const res = await fbAddStockMovement({
        productId: p.id,
        type: type,
        qty: qty,
        enteredQty: qty,
        unitName: r.unitName || p.unit || 'copë',
        unitKey: 'base',
        unitMultiplier: 1,
        unitCost: Number(r.unitCost) || Number(p.cost) || 0,
        reason: r.reason || (type === 'in' ? 'Import' : 'Import'),
        reference: r.reference || 'IMPORT',
        warehouse: r.warehouse || p.location || 'Magazina Kryesore',
        batchNo: r.batchNo || '',
        notes: r.notes || ''
      }, p.name, user);
      if (res.success) ok++;else errors.push(res.message || 'Gabim stoku');
    }
  } else if (tpl.id === 'sales') {
    const groups = {};
    mapped.forEach(r => {
      const key = [r.invoiceNo || '', r.date || '', r.customerName || ''].join('|');
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    const pr = await fbGetProducts();
    const products = pr.data || [];
    const bySku = {};
    products.forEach(p => {
      if (p.sku) bySku[String(p.sku).toLowerCase()] = p;
      bySku[String(p.name || '').toLowerCase()] = p;
    });
    const __keys = Object.keys(groups);
    for (let __k = 0; __k < __keys.length; __k++) {
      const key = __keys[__k];
      const lines = groups[key];
      const head = lines[0];
      const items = [];
      let subtotal = 0,
        tax = 0;
      for (let __l = 0; __l < lines.length; __l++) {
        const r = lines[__l];
        const p = bySku[String(r.sku || '').toLowerCase()] || bySku[String(r.productName || '').toLowerCase()];
        const qty = Number(r.qty) || 0;
        const price = Number(r.unitPrice) || 0;
        const rate = r.taxRate === '' || r.taxRate == null ? Number(CFG.taxRate || 0) : Number(r.taxRate);
        const lineNet = round2(qty * price);
        const lineTax = round2(lineNet * rate / 100);
        subtotal += lineNet;
        tax += lineTax;
        items.push({
          productId: p ? p.id : null,
          name: r.productName || p && p.name || '',
          sku: r.sku || p && p.sku || '',
          qty: qty,
          displayQty: qty,
          freeDisplayQty: 0,
          freeQty: 0,
          unitKey: 'base',
          unitName: r.unitName || 'copë',
          unitMultiplier: 1,
          unitSalePrice: price,
          price: price,
          taxRate: rate,
          lineNet: lineNet,
          lineTax: lineTax,
          lineTotal: round2(lineNet + lineTax),
          cost: p ? Number(p.cost) || 0 : 0,
          warehouse: p ? p.location || 'Magazina Kryesore' : 'Magazina Kryesore'
        });
      }
      if (!items.length) continue;
      const discount = Number(head.discount) || 0;
      const total = round2(subtotal - discount + tax);
      try {
        const payload = {
          invoiceNo: head.invoiceNo || undefined,
          customerName: head.customerName || 'Walk-in',
          customerPhone: head.customerPhone || '',
          paymentMethod: head.paymentMethod || 'Cash',
          status: head.paymentMethod === 'Credit' ? 'credit' : 'completed',
          items: items,
          subtotal: subtotal,
          discount: discount,
          tax: tax,
          total: total,
          notes: head.notes || 'Import',
          cashier: user.name || user.email,
          createdAt: head.date ? new Date(head.date + 'T12:00:00').toISOString() : nowIso()
        };
        if (!payload.invoiceNo) {
          const inv = await fbGenerateInvoiceNo();
          payload.invoiceNo = inv.success ? inv.data : 'IMP-' + Date.now();
        }
        await db.ref('sales').push(payload);
        for (let __j = 0; __j < items.length; __j++) {
          const it = items[__j];
          if (!it.productId) continue;
          await fbAddStockMovement({
            productId: it.productId,
            type: 'out',
            qty: it.qty,
            enteredQty: it.qty,
            unitKey: 'base',
            unitName: it.unitName,
            unitMultiplier: 1,
            reason: 'Sale',
            reference: payload.invoiceNo,
            warehouse: it.warehouse
          }, it.name, user);
        }
        ok++;
      } catch (e) {
        errors.push(e.message || 'Gabim shitje');
      }
    }
  } else if (tpl.id === 'purchases') {
    const groups = {};
    mapped.forEach(r => {
      const key = [r.poNumber || '', r.date || '', r.supplierName || ''].join('|');
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    const pr = await fbGetProducts();
    const products = pr.data || [];
    const bySku = {};
    products.forEach(p => {
      if (p.sku) bySku[String(p.sku).toLowerCase()] = p;
      bySku[String(p.name || '').toLowerCase()] = p;
    });
    const sup = await fbGetSuppliers();
    const suppliers = sup.data || [];
    const __keys = Object.keys(groups);
    for (let __k = 0; __k < __keys.length; __k++) {
      const key = __keys[__k];
      const lines = groups[key];
      const head = lines[0];
      const supplier = suppliers.find(s => s.name === head.supplierName);
      const items = [];
      let total = 0;
      for (let __l = 0; __l < lines.length; __l++) {
        const r = lines[__l];
        const p = bySku[String(r.sku || '').toLowerCase()] || bySku[String(r.productName || '').toLowerCase()];
        const qty = Number(r.qty) || 0;
        const cost = Number(r.unitCost) || 0;
        const lineTotal = round2(qty * cost);
        total += lineTotal;
        items.push({
          productId: p ? p.id : null,
          name: r.productName || p && p.name || '',
          sku: r.sku || p && p.sku || '',
          qty: qty,
          enteredQty: qty,
          unitKey: 'base',
          unitName: r.unitName || 'copë',
          unitMultiplier: 1,
          unitCost: cost,
          enteredUnitCost: cost,
          lineTotal: lineTotal
        });
      }
      try {
        let poNumber = head.poNumber;
        if (!poNumber) {
          const g = await fbGeneratePoNumber();
          poNumber = g.success ? g.data : 'PO-' + Date.now();
        }
        await db.ref('purchase_orders').push({
          poNumber: poNumber,
          supplierId: supplier ? supplier.id : '',
          supplierName: head.supplierName,
          status: head.status || 'ordered',
          items: items,
          total: round2(total),
          notes: head.notes || 'Import',
          createdAt: head.date ? new Date(head.date + 'T12:00:00').toISOString() : nowIso(),
          createdBy: user.email
        });
        ok++;
      } catch (e) {
        errors.push(e.message || 'Gabim blerje');
      }
    }
  } else if (tpl.id === 'payments') {
    for (let __i = 0; __i < mapped.length; __i++) {
      const r = mapped[__i];
      const type = String(r.type || '').toLowerCase() === 'out' ? 'out' : 'in';
      try {
        await db.ref('payments').push({
          date: r.date || nowIso().slice(0, 10),
          type: type,
          party: r.party,
          amount: Number(r.amount) || 0,
          method: r.method || r.paymentMethod || 'Cash',
          reference: r.reference || '',
          notes: r.notes || '',
          createdAt: nowIso(),
          addedBy: user.email
        });
        ok++;
      } catch (e) {
        errors.push(e.message || 'Gabim pagese');
      }
    }
  } else if (tpl.id === 'expenses') {
    for (let __i = 0; __i < mapped.length; __i++) {
      const r = mapped[__i];
      const res = await fbAddExpense({
        date: r.date || nowIso().slice(0, 10),
        category: r.category,
        payee: r.payee || '',
        amount: Number(r.amount) || 0,
        paymentMethod: r.paymentMethod || 'Cash',
        notes: r.notes || ''
      }, user);
      if (res.success) ok++;else errors.push(res.message || 'Gabim shpenzimi');
    }
  }
  return {
    ok,
    errors,
    total: mapped.length
  };
}
function ImportExportView({
  user,
  role
}) {
  const [tab, setTab] = useState('import');
  const [entity, setEntity] = useState('customers');
  const [preview, setPreview] = useState({
    headers: [],
    rows: []
  });
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [restoreMode, setRestoreMode] = useState('merge');
  const fileRef = useRef(null);
  const backupRef = useRef(null);
  const tpl = IE_TEMPLATES[entity];
  const onPickFile = async file => {
    if (!file) return;
    setStatus(null);
    setBusy(true);
    try {
      const name = (file.name || '').toLowerCase();
      let parsed;
      if (name.endsWith('.csv') || name.endsWith('.txt')) {
        const text = await file.text();
        parsed = ieParseCsv(text);
      } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        const buf = await file.arrayBuffer();
        parsed = await ieParseXlsx(buf);
      } else {
        throw new Error('Formati duhet të jetë .csv ose .xlsx');
      }
      setPreview(parsed);
      if (!parsed.rows.length) {
        setStatus({
          type: 'err',
          text: 'Nuk u gjetën rreshta të dhënash. Sigurohu që rreshti i header-it ka kolona si: ' + (IE_TEMPLATES[entity] && IE_TEMPLATES[entity].headers ? IE_TEMPLATES[entity].headers.slice(0, 4).join(', ') : 'Emri*, ...') + ' dhe të dhënat janë POSHTË header-it (pa rreshta titulli sipër).'
        });
      } else {
        setStatus({
          type: 'info',
          text: 'U lexuan ' + parsed.rows.length + ' rreshta | Header: ' + (parsed.headers || []).slice(0, 6).join(' | ') + ((parsed.headers || []).length > 6 ? '...' : '') + '. Shtyp Importo.'
        });
      }
    } catch (e) {
      setStatus({
        type: 'err',
        text: e.message || String(e)
      });
      setPreview({
        headers: [],
        rows: []
      });
    }
    setBusy(false);
  };
  const doImport = async () => {
    if (!preview.rows.length) return Swal.fire({
      icon: 'info',
      title: 'Nuk ka rreshta',
      text: 'Ngarko një file template më parë.'
    });
    const conf = await Swal.fire({
      icon: 'question',
      title: 'Importo ' + tpl.label + '?',
      text: preview.rows.length + ' rreshta do të importohen.',
      showCancelButton: true,
      confirmButtonText: 'Importo',
      cancelButtonText: 'Anulo',
      confirmButtonColor: '#714B67'
    });
    if (!conf.isConfirmed) return;
    setBusy(true);
    setStatus({
      type: 'info',
      text: 'Duke importuar...'
    });
    try {
      const res = await ieImportEntity(tpl, preview.rows, user);
      if (!res.total) {
        setStatus({
          type: 'err',
          text: '0 rreshta të vlefshëm. Kontrollo që kolonat përputhen me template (p.sh. Emri*) dhe fushat e detyrueshme janë plotësuar.'
        });
        Swal.fire({
          icon: 'warning',
          title: 'Asgjë nuk u importua',
          text: 'Header-i duhet të jetë rreshti me Emri*/SKU*/etj. Jo titulli i file-it.'
        });
        setBusy(false);
        return;
      }
      setStatus({
        type: res.errors.length ? 'err' : 'ok',
        text: 'U importuan ' + res.ok + ' / ' + res.total + (res.errors.length ? '. Gabime: ' + res.errors.slice(0, 5).join(' | ') : '')
      });
      Swal.fire({
        icon: res.errors.length ? 'warning' : 'success',
        title: 'Importi përfundoi',
        text: 'Sukses: ' + res.ok + (res.errors.length ? ', gabime: ' + res.errors.length : '')
      });
      try {
        await fbLogActivity('Import', user, tpl.label + ': ' + res.ok + ' rreshta');
      } catch (e) {}
    } catch (e) {
      setStatus({
        type: 'err',
        text: e.message || String(e)
      });
    }
    setBusy(false);
  };
  const doExport = async id => {
    setBusy(true);
    try {
      if (!window.JSZip) throw new Error('JSZip nuk u ngarkua. Hap me internet dhe rifresko.');
      const t = IE_TEMPLATES[id];
      if (!t) throw new Error('Moduli nuk u gjet');
      const n = await ieExportEntity(t, user);
      Swal.fire({
        icon: 'success',
        title: 'Eksportuar',
        text: t.label + ': ' + n + ' rreshta (edhe 0 = vetëm header)',
        timer: 2000,
        showConfirmButton: false
      });
    } catch (e) {
      console.error(e);
      Swal.fire({
        icon: 'error',
        title: 'Eksporti dështoi',
        text: e.message || String(e)
      });
    }
    setBusy(false);
  };
  const downloadTemplate = async (asXlsx, entityId) => {
    const t = IE_TEMPLATES[entityId || entity] || IE_TEMPLATES.customers;
    if (!t) return;
    try {
      if (asXlsx) {
        if (!window.JSZip) throw new Error('JSZip nuk u ngarkua. Hap me internet dhe rifresko.');
        await ieTemplateXlsx(t);
      } else {
        ieDownloadText('template_' + t.id + '.csv', '﻿' + ieTemplateCsv(t), 'text/csv;charset=utf-8');
      }
    } catch (e) {
      console.error(e);
      if (window.Swal) Swal.fire({
        icon: 'error',
        title: 'Template dështoi',
        text: e.message || String(e)
      });
    }
  };
  const doBackupJson = async () => {
    setBusy(true);
    const res = await fbDumpAllData();
    setBusy(false);
    if (!res.success) return Swal.fire({
      icon: 'error',
      title: 'Backup dështoi',
      text: res.message
    });
    ieDownloadText('backup_sistemi_genit_' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(res.data, null, 2), 'application/json');
    Swal.fire({
      icon: 'success',
      title: 'Backup JSON u shkarkua',
      timer: 1500,
      showConfirmButton: false
    });
  };
  const doBackupXlsx = async () => {
    setBusy(true);
    try {
      const dump = await fbDumpAllData();
      if (!dump.success) throw new Error(dump.message);
      const data = dump.data.data || {};
      if (!window.JSZip) throw new Error('JSZip mungon');
      const entities = [{
        name: 'Klientet',
        rows: Object.values(data.records || {}).map(c => [c.name, c.phone, c.email, c.customerType, c.amount, c.active]),
        headers: ['Emri', 'Telefoni', 'Email', 'Tipi', 'Balanca', 'Aktiv']
      }, {
        name: 'Artikujt',
        rows: Object.values(data.products || {}).map(p => [p.name, p.sku, p.barcode, p.category, p.price, p.cost, p.location, p.status]),
        headers: ['Emri', 'SKU', 'Barkodi', 'Kategoria', 'Cmimi', 'Kosto', 'Magazina', 'Statusi']
      }, {
        name: 'Furnitoret',
        rows: Object.values(data.suppliers || {}).map(s => [s.name, s.contact, s.phone, s.email, s.openingBalance]),
        headers: ['Emri', 'Kontakti', 'Telefoni', 'Email', 'Balanca']
      }, {
        name: 'Shitjet',
        rows: Object.values(data.sales || {}).map(s => [s.invoiceNo, s.createdAt, s.customerName, s.paymentMethod, s.total, s.status]),
        headers: ['Fatura', 'Data', 'Klienti', 'Pagesa', 'Totali', 'Statusi']
      }, {
        name: 'Blerjet',
        rows: Object.values(data.purchase_orders || {}).map(p => [p.poNumber, p.createdAt, p.supplierName, p.total, p.status]),
        headers: ['PO', 'Data', 'Furnitori', 'Totali', 'Statusi']
      }, {
        name: 'Stoku',
        rows: Object.values(data.stock_movements || {}).map(m => [m.createdAt, m.type, m.productId, m.qty, m.reason, m.reference]),
        headers: ['Data', 'Tipi', 'ProduktId', 'Sasia', 'Arsyeja', 'Referenca']
      }, {
        name: 'Shpenzimet',
        rows: Object.values(data.expenses || {}).map(e => [e.date || e.createdAt, e.category, e.payee || e.vendor, e.amount, e.paymentMethod]),
        headers: ['Data', 'Kategoria', 'Marresi', 'Shuma', 'Pagesa']
      }, {
        name: 'Pagesat',
        rows: Object.values(data.payments || {}).map(p => [p.date, p.type, p.party, p.amount, p.method, p.reference]),
        headers: ['Data', 'Tipi', 'Pale', 'Shuma', 'Metoda', 'Referenca']
      }];
      const zip = new JSZip();
      const shared = [];
      const sharedIndex = Object.create(null);
      function ss(v) {
        const s = String(v == null ? '' : v);
        if (Object.prototype.hasOwnProperty.call(sharedIndex, s)) return sharedIndex[s];
        const i = shared.length;
        shared.push(s);
        sharedIndex[s] = i;
        return i;
      }
      function colName(n) {
        let s = '',
          x = n + 1;
        while (x > 0) {
          const m = (x - 1) % 26;
          s = String.fromCharCode(65 + m) + s;
          x = Math.floor((x - 1) / 26);
        }
        return s;
      }
      function escXml(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      }
      const sheetFiles = [];
      entities.forEach((ent, si) => {
        const rowsXml = [];
        const all = [ent.headers].concat(ent.rows.map(r => r.map(x => x)));
        all.forEach((row, ri) => {
          const cells = row.map((val, ci) => {
            const ref = colName(ci) + (ri + 1);
            if (typeof val === 'number' && Number.isFinite(val)) return '<c r="' + ref + '"><v>' + val + '</v></c>';
            return '<c r="' + ref + '" t="s"><v>' + ss(val) + '</v></c>';
          }).join('');
          rowsXml.push('<row r="' + (ri + 1) + '">' + cells + '</row>');
        });
        const sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + rowsXml.join('') + '</sheetData></worksheet>';
        const fname = 'xl/worksheets/sheet' + (si + 1) + '.xml';
        zip.file(fname, sheetXml);
        sheetFiles.push({
          name: ent.name.slice(0, 31),
          fname: 'worksheets/sheet' + (si + 1) + '.xml',
          id: si + 1
        });
      });
      const sst = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' + shared.length + '" uniqueCount="' + shared.length + '">' + shared.map(s => '<si><t>' + escXml(s) + '</t></si>').join('') + '</sst>';
      zip.file('xl/sharedStrings.xml', sst);
      zip.file('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>');
      const sheetsXml = sheetFiles.map((s, i) => '<sheet name="' + escXml(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('');
      zip.file('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + sheetsXml + '</sheets></workbook>');
      const rels = sheetFiles.map((s, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="' + s.fname + '"/>').join('') + '<Relationship Id="rId' + (sheetFiles.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>' + '<Relationship Id="rId' + (sheetFiles.length + 2) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>';
      zip.folder('xl').folder('_rels').file('workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels + '</Relationships>');
      zip.folder('_rels').file('.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
      const overrides = sheetFiles.map((s, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('');
      zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' + overrides + '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
      const blob = await zip.generateAsync({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        compression: 'DEFLATE'
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'backup_sistemi_genit_' + new Date().toISOString().slice(0, 10) + '.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      Swal.fire({
        icon: 'success',
        title: 'Backup Excel u shkarkua',
        timer: 1500,
        showConfirmButton: false
      });
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Backup Excel dështoi',
        text: e.message || String(e)
      });
    }
    setBusy(false);
  };
  const onRestoreFile = async file => {
    if (!file) return;
    setBusy(true);
    try {
      const name = (file.name || '').toLowerCase();
      if (!name.endsWith('.json')) throw new Error('Për restore përdor backup .json (rekomanduar). Excel është vetëm për shikim/eksport.');
      const text = await file.text();
      const json = JSON.parse(text);
      const conf = await Swal.fire({
        icon: 'warning',
        title: 'Restore backup?',
        html: '<p>Mode: <b>' + (restoreMode === 'replace' ? 'ZËVENDËSO' : 'BASHKO (merge)') + '</b></p><p>Kjo mund të ndryshojë të dhënat ekzistuese.</p>',
        showCancelButton: true,
        confirmButtonText: 'Vazhdo',
        cancelButtonText: 'Anulo',
        confirmButtonColor: '#d9534f'
      });
      if (!conf.isConfirmed) {
        setBusy(false);
        return;
      }
      let payload = json;
      if (json && json.success && json.data) payload = json.data;
      if (payload && payload.meta && payload.data) payload = payload;else if (payload && !payload.data) payload = {
        data: payload
      };
      const res = await fbRestoreAllData(payload, restoreMode);
      if (!res.success) throw new Error(res.message);
      await fbLogActivity('Restore Backup', user, restoreMode);
      Swal.fire({
        icon: 'success',
        title: 'Restore u krye',
        text: 'Rifresko faqen për të parë të dhënat.',
        confirmButtonText: 'Rifresko'
      }).then(() => location.reload());
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Restore dështoi',
        text: e.message || String(e)
      });
    }
    setBusy(false);
  };
  const entities = Object.keys(IE_TEMPLATES).map(k => IE_TEMPLATES[k]);
  return React.createElement("div", {
    className: "data-section"
  }, React.createElement("div", {
    className: "section-header"
  }, React.createElement("h2", null, React.createElement("i", {
    className: "fas fa-file-import"
  }), " Import / Eksport"), React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, busy && React.createElement("span", {
    style: {
      color: '#6c757d',
      fontSize: 13
    }
  }, React.createElement("i", {
    className: "fas fa-spinner fa-spin"
  }), " Duke punuar..."))), React.createElement("div", {
    className: "ie-tabs"
  }, React.createElement("button", {
    type: "button",
    className: 'ie-tab' + (tab === 'import' ? ' active' : ''),
    onClick: () => setTab('import')
  }, React.createElement("i", {
    className: "fas fa-file-import"
  }), " Import"), React.createElement("button", {
    type: "button",
    className: 'ie-tab' + (tab === 'export' ? ' active' : ''),
    onClick: () => setTab('export')
  }, React.createElement("i", {
    className: "fas fa-file-export"
  }), " Eksport"), React.createElement("button", {
    type: "button",
    className: 'ie-tab' + (tab === 'backup' ? ' active' : ''),
    onClick: () => setTab('backup')
  }, React.createElement("i", {
    className: "fas fa-database"
  }), " Backup / Restore")), React.createElement("div", {
    className: "ie-body"
  }, tab === 'import' && React.createElement(React.Fragment, null, React.createElement("div", {
    className: "ie-grid"
  }, entities.map(e => React.createElement("div", {
    key: e.id,
    className: "ie-card",
    style: {
      outline: entity === e.id ? '2px solid #714B67' : 'none'
    }
  }, React.createElement("h3", null, React.createElement("i", {
    className: 'fas ' + e.icon
  }), " ", e.label), React.createElement("p", null, "Shkarko template, plot\xEBso rreshtat, pastaj ngarko p\xEBr import."), React.createElement("div", {
    className: "ie-actions"
  }, React.createElement("button", {
    type: "button",
    className: "btn btn-secondary btn-sm",
    onClick: () => {
      setEntity(e.id);
      downloadTemplate(false, e.id);
    }
  }, React.createElement("i", {
    className: "fas fa-download"
  }), " CSV"), React.createElement("button", {
    type: "button",
    className: "btn btn-secondary btn-sm",
    onClick: () => {
      setEntity(e.id);
      downloadTemplate(true, e.id);
    }
  }, React.createElement("i", {
    className: "fas fa-file-excel"
  }), " Excel"), React.createElement("button", {
    type: "button",
    className: "btn btn-primary btn-sm",
    onClick: () => setEntity(e.id)
  }, React.createElement("i", {
    className: "fas fa-check"
  }), " Zgjidh"))))), React.createElement("div", {
    className: "ie-upload"
  }, React.createElement("p", {
    style: {
      marginBottom: 8
    }
  }, React.createElement("b", null, "Moduli aktiv:"), " ", tpl.label), React.createElement("input", {
    ref: fileRef,
    type: "file",
    accept: ".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    onChange: e => onPickFile(e.target.files && e.target.files[0])
  }), React.createElement("label", {
    onClick: () => fileRef.current && fileRef.current.click()
  }, React.createElement("i", {
    className: "fas fa-cloud-upload-alt"
  }), " Ngarko file CSV / Excel"), React.createElement("div", {
    style: {
      marginTop: 10
    }
  }, React.createElement("button", {
    type: "button",
    className: "btn btn-success",
    disabled: busy || !preview.rows.length,
    onClick: doImport
  }, React.createElement("i", {
    className: "fas fa-file-import"
  }), " Importo ", tpl.label))), status && React.createElement("div", {
    className: 'ie-status ' + status.type
  }, status.text), preview.rows.length > 0 && React.createElement("div", {
    className: "ie-preview"
  }, React.createElement("table", null, React.createElement("thead", null, React.createElement("tr", null, preview.headers.map((h, i) => React.createElement("th", {
    key: i
  }, h)))), React.createElement("tbody", null, preview.rows.slice(0, 50).map((r, i) => React.createElement("tr", {
    key: i
  }, preview.headers.map((h, j) => React.createElement("td", {
    key: j
  }, r[h])))))), preview.rows.length > 50 && React.createElement("div", {
    style: {
      padding: 8,
      color: '#6c757d',
      fontSize: 12
    }
  }, "Duke shfaqur 50 / ", preview.rows.length, " rreshta..."))), tab === 'export' && React.createElement("div", {
    className: "ie-grid"
  }, entities.map(e => React.createElement("div", {
    key: e.id,
    className: "ie-card"
  }, React.createElement("h3", null, React.createElement("i", {
    className: 'fas ' + e.icon
  }), " ", e.label), React.createElement("p", null, "Eksporto t\xEB dh\xEBnat ekzistuese n\xEB format template Excel (.xlsx)."), React.createElement("div", {
    className: "ie-actions"
  }, React.createElement("button", {
    type: "button",
    className: "btn btn-success btn-sm",
    disabled: busy,
    onClick: () => doExport(e.id)
  }, React.createElement("i", {
    className: "fas fa-file-excel"
  }), " Eksporto Excel"), React.createElement("button", {
    type: "button",
    className: "btn btn-secondary btn-sm",
    onClick: () => {
      setEntity(e.id);
      setTab('import');
      downloadTemplate(true, e.id);
    }
  }, React.createElement("i", {
    className: "fas fa-download"
  }), " Template"))))), tab === 'backup' && React.createElement("div", null, React.createElement("div", {
    className: "ie-backup-box"
  }, React.createElement("h3", null, React.createElement("i", {
    className: "fas fa-download"
  }), " Backup i plot\xEB"), React.createElement("p", {
    style: {
      color: '#6c757d',
      fontSize: 13,
      margin: 0
    }
  }, "Shkarko t\xEB gjitha t\xEB dh\xEBnat e sistemit (si Odoo database backup). JSON \xEBsht\xEB formati kryesor p\xEBr restore."), React.createElement("div", {
    className: "row"
  }, React.createElement("button", {
    type: "button",
    className: "btn btn-primary",
    disabled: busy,
    onClick: doBackupJson
  }, React.createElement("i", {
    className: "fas fa-file-code"
  }), " Backup JSON"), React.createElement("button", {
    type: "button",
    className: "btn btn-success",
    disabled: busy,
    onClick: doBackupXlsx
  }, React.createElement("i", {
    className: "fas fa-file-excel"
  }), " Backup Excel (shum\xEB flet\xEB)"))), React.createElement("div", {
    className: "ie-backup-box"
  }, React.createElement("h3", null, React.createElement("i", {
    className: "fas fa-upload"
  }), " Restore / Import backup"), React.createElement("p", {
    style: {
      color: '#6c757d',
      fontSize: 13,
      margin: 0
    }
  }, "Ngarko nj\xEB file ", React.createElement("b", null, ".json"), " t\xEB krijuar nga Backup JSON. Zgjidh n\xEBse do t\xEB bashkohen apo t\xEB z\xEBvend\xEBsohen t\xEB dh\xEBnat."), React.createElement("div", {
    className: "row",
    style: {
      alignItems: 'center'
    }
  }, React.createElement("label", {
    style: {
      fontSize: 13
    }
  }, React.createElement("input", {
    type: "radio",
    name: "rmode",
    checked: restoreMode === 'merge',
    onChange: () => setRestoreMode('merge')
  }), " Bashko (merge)"), React.createElement("label", {
    style: {
      fontSize: 13
    }
  }, React.createElement("input", {
    type: "radio",
    name: "rmode",
    checked: restoreMode === 'replace',
    onChange: () => setRestoreMode('replace')
  }), " Z\xEBvend\xEBso (replace)")), React.createElement("div", {
    className: "row"
  }, React.createElement("input", {
    ref: backupRef,
    type: "file",
    accept: ".json,application/json",
    style: {
      display: 'none'
    },
    onChange: e => onRestoreFile(e.target.files && e.target.files[0])
  }), React.createElement("button", {
    type: "button",
    className: "btn btn-danger",
    disabled: busy,
    onClick: () => backupRef.current && backupRef.current.click()
  }, React.createElement("i", {
    className: "fas fa-database"
  }), " Restore nga JSON"))), React.createElement("div", {
    className: "ie-backup-box"
  }, React.createElement("h3", null, React.createElement("i", {
    className: "fas fa-circle-info"
  }), " Udh\xEBzim"), React.createElement("ul", {
    style: {
      margin: 0,
      paddingLeft: 18,
      color: '#495057',
      fontSize: 13,
      lineHeight: 1.5
    }
  }, React.createElement("li", null, "Template Excel/CSV: p\xEBr import modular (klient\xEB, artikuj, stok, fatura, etj.)."), React.createElement("li", null, "Backup JSON: kopje e plot\xEB e databaz\xEBs p\xEBr restore (si Odoo dump)."), React.createElement("li", null, "Backup Excel: shum\xEB flet\xEB p\xEBr arkivim / shikim, jo restore i plot\xEB."), React.createElement("li", null, "Para replace, b\xEBj gjithmon\xEB nj\xEB Backup JSON t\xEB ri."))))));
}
function AboutView() {
  return React.createElement("div", {
    className: "about-section"
  }, React.createElement("div", {
    className: "about-header"
  }, React.createElement("div", {
    className: "about-logo"
  }, React.createElement("img", {
    src: LOGO_URL,
    alt: "Sistemi Genit"
  })), React.createElement("div", {
    className: "about-title"
  }, React.createElement("h1", null, "Sistemi Genit"), React.createElement("p", {
    className: "about-dev"
  }, "Sistem i krijuar nga ", React.createElement("strong", null, "Mariglen Myftari")))), React.createElement("div", {
    className: "about-card"
  }, React.createElement("h2", null, React.createElement("i", {
    className: "fas fa-circle-info"
  }), " Rreth aplikacionit"), React.createElement("p", null, "Sistemi Genit \xEBsht\xEB platform\xEB ERP p\xEBr menaxhimin e shitjeve, klient\xEBve, produkteve, stokut, blerjeve, shpenzimeve dhe raporteve. Mb\xEBshtet POS, fatura, eksport PDF/Excel dhe role p\xEBrdoruesish.")), React.createElement("div", {
    className: "about-card"
  }, React.createElement("h2", null, React.createElement("i", {
    className: "fas fa-code-branch"
  }), " Version"), React.createElement("div", {
    className: "about-table-wrapper"
  }, React.createElement("table", {
    className: "about-roles-table"
  }, React.createElement("tbody", null, React.createElement("tr", null, React.createElement("td", {
    style: {
      textAlign: 'left',
      fontWeight: 600
    }
  }, "Emri i sistemit"), React.createElement("td", {
    style: {
      textAlign: 'left'
    }
  }, "Sistemi Genit")), React.createElement("tr", null, React.createElement("td", {
    style: {
      textAlign: 'left',
      fontWeight: 600
    }
  }, "Version"), React.createElement("td", {
    style: {
      textAlign: 'left'
    }
  }, "1.0.0")), React.createElement("tr", null, React.createElement("td", {
    style: {
      textAlign: 'left',
      fontWeight: 600
    }
  }, "Krijuar nga"), React.createElement("td", {
    style: {
      textAlign: 'left'
    }
  }, "Mariglen Myftari")))))), React.createElement("div", {
    className: "about-footer"
  }, React.createElement("p", null, "Sistem i krijuar nga ", React.createElement("strong", null, "Mariglen Myftari")), React.createElement("p", {
    className: "about-version"
  }, "Version 1.0.0")));
}
function SettingsView({
  user,
  role
}) {
  const {
    settings,
    categories,
    refreshConfig
  } = useConfig();
  const [form, setForm] = useState(settings || {});
  const [newCat, setNewCat] = useState('');
  const [saving, setSaving] = useState(false);
  const [load, setLoad] = useState('');
  useEffect(() => {
    setForm(settings || {});
  }, [settings]);
  const upd = (k, v) => setForm(f => Object.assign({}, f, {
    [k]: v
  }));
  const save = async () => {
    setSaving(true);
    const payload = {
      businessName: form.businessName || '',
      address: form.address || '',
      phone: form.phone || '',
      email: form.email || '',
      logoUrl: form.logoUrl || '',
      nipt: form.nipt || '',
      currencySymbol: form.currencySymbol || '$',
      currencyCode: form.currencyCode || 'USD',
      taxRate: Number(form.taxRate) || 0,
      taxInclusive: !!form.taxInclusive,
      invoicePrefix: form.invoicePrefix || 'INV-',
      lowStockDefault: Number(form.lowStockDefault) || 0,
      receiptHeader: form.receiptHeader || '',
      receiptFooter: form.receiptFooter || '',
      paymentMethods: form.paymentMethods || [],
      warehouses: form.warehouses || [],
      customUnits: form.customUnits || [],
      expenseCategories: form.expenseCategories || []
    };
    const r = await fbSaveSettings(payload, user);
    setSaving(false);
    if (r.success) {
      applySettings(payload);
      refreshConfig();
      Swal.fire({
        icon: 'success',
        title: 'Saved',
        text: 'Settings updated',
        timer: 1600,
        showConfirmButton: false
      });
    } else Swal.fire({
      icon: 'error',
      title: 'Error',
      text: r.message
    });
  };
  const addCat = async () => {
    const nm = newCat.trim();
    if (!nm) return;
    setLoad('Adding category...');
    const r = await fbAddCategory(nm, user);
    setLoad('');
    if (r.success) {
      setNewCat('');
      refreshConfig();
    } else Swal.fire({
      icon: 'error',
      title: 'Error',
      text: r.message
    });
  };
  const delCat = c => Swal.fire({
    icon: 'warning',
    title: 'Delete category?',
    text: c.name,
    showCancelButton: true,
    confirmButtonColor: '#ea4335',
    confirmButtonText: 'Delete'
  }).then(async res => {
    if (!res.isConfirmed) return;
    setLoad('Deleting...');
    const r = await fbDeleteCategory(c.id, c.name, user);
    setLoad('');
    if (r.success) refreshConfig();else Swal.fire({
      icon: 'error',
      title: 'Error',
      text: r.message
    });
  });
  return React.createElement("div", {
    className: "data-section"
  }, load && React.createElement(TopLoadingBar, null), React.createElement("div", {
    className: "section-header"
  }, React.createElement("h2", null, React.createElement("i", {
    className: "fas fa-gear"
  }), " Cil\xEBsimet"), React.createElement("button", {
    className: "btn btn-primary",
    onClick: save,
    disabled: saving
  }, saving ? React.createElement(React.Fragment, null, React.createElement("i", {
    className: "fas fa-spinner fa-spin"
  }), " Duke ruajtur...") : React.createElement(React.Fragment, null, React.createElement("i", {
    className: "fas fa-save"
  }), " Ruaj Settings"))), React.createElement(LteCard, {
    title: "Business Info",
    icon: "fa-store"
  }, React.createElement("div", {
    className: "form-grid"
  }, React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Business Name"), React.createElement("input", {
    type: "text",
    value: form.businessName || '',
    onChange: e => upd('businessName', e.target.value)
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Phone"), React.createElement("input", {
    type: "text",
    value: form.phone || '',
    onChange: e => upd('phone', e.target.value)
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Email"), React.createElement("input", {
    type: "email",
    value: form.email || '',
    onChange: e => upd('email', e.target.value)
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Logo URL"), React.createElement("input", {
    type: "text",
    value: form.logoUrl || '',
    onChange: e => upd('logoUrl', e.target.value),
    placeholder: "https://..."
  }))), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Address"), React.createElement("textarea", {
    rows: "2",
    value: form.address || '',
    onChange: e => upd('address', e.target.value)
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "NIPT / NUIS"), React.createElement("input", {
    type: "text",
    value: form.nipt || '',
    onChange: e => upd('nipt', e.target.value),
    placeholder: "p.sh. L64221403A"
  }))), React.createElement(LteCard, {
    title: "Currency & Tax",
    icon: "fa-coins"
  }, React.createElement("div", {
    className: "form-grid"
  }, React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Currency Symbol"), React.createElement("input", {
    type: "text",
    value: form.currencySymbol || '',
    onChange: e => upd('currencySymbol', e.target.value),
    placeholder: "$, Rs, \u20B9, \xA3..."
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Currency Code"), React.createElement("input", {
    type: "text",
    value: form.currencyCode || '',
    onChange: e => upd('currencyCode', e.target.value),
    placeholder: "USD, PKR, INR..."
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Default Tax Rate (%)"), React.createElement("input", {
    type: "number",
    step: "0.01",
    min: "0",
    value: form.taxRate ?? '',
    onChange: e => upd('taxRate', e.target.value)
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Low Stock Default"), React.createElement("input", {
    type: "number",
    step: "1",
    min: "0",
    value: form.lowStockDefault ?? '',
    onChange: e => upd('lowStockDefault', e.target.value)
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, React.createElement("i", {
    className: "fas fa-toggle-on"
  }), " Prices Include Tax"), React.createElement("div", null, React.createElement("input", {
    type: "checkbox",
    className: "toggle",
    checked: !!form.taxInclusive,
    onChange: e => upd('taxInclusive', e.target.checked)
  }))))), React.createElement(LteCard, {
    title: "Receipt / Invoice",
    icon: "fa-receipt"
  }, React.createElement("div", {
    className: "form-grid"
  }, React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Invoice Prefix"), React.createElement("input", {
    type: "text",
    value: form.invoicePrefix || '',
    onChange: e => upd('invoicePrefix', e.target.value),
    placeholder: "INV-"
  }))), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Receipt Header"), React.createElement("textarea", {
    rows: "2",
    value: form.receiptHeader || '',
    onChange: e => upd('receiptHeader', e.target.value),
    placeholder: "Shown above receipt items"
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Receipt Footer"), React.createElement("textarea", {
    rows: "2",
    value: form.receiptFooter || '',
    onChange: e => upd('receiptFooter', e.target.value),
    placeholder: "Thank you message"
  }))), React.createElement(LteCard, {
    title: "Fjalor\xEB (pagesa, magazine, nj\xEBsi)",
    icon: "fa-book"
  }, React.createElement("p", {
    style: {
      fontSize: 13,
      color: '#6c757d',
      marginTop: 0
    }
  }, "Shto vlera q\xEB p\xEBrdoren n\xEB dropdown kur nuk gjenden. Mund t\u2019i shtosh edhe direkt nga POS / format me \u201CShto: \u2026\u201D."), React.createElement("div", {
    className: "form-grid"
  }, React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "M\xEBnyra pagese (presje)"), React.createElement("input", {
    type: "text",
    value: (form.paymentMethods || []).map(p => typeof p === 'string' ? p : p.label || p.value).join(', '),
    onChange: e => upd('paymentMethods', e.target.value.split(',').map(s => s.trim()).filter(Boolean).map(s => ({
      value: s,
      label: s
    }))),
    placeholder: "Cash, Kart\xEB, Mobile, Bank\xEB, Kredi"
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Magazina (presje)"), React.createElement("input", {
    type: "text",
    value: (form.warehouses || []).join(', '),
    onChange: e => upd('warehouses', e.target.value.split(',').map(s => s.trim()).filter(Boolean)),
    placeholder: "Magazina Kryesore, Dyqani, Depo 2"
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Nj\xEBsi mat\xEBse (presje)"), React.createElement("input", {
    type: "text",
    value: (form.customUnits || []).join(', '),
    onChange: e => upd('customUnits', e.target.value.split(',').map(s => s.trim()).filter(Boolean)),
    placeholder: "cop\xEB, koli, pako, kg, L"
  })), React.createElement("div", {
    className: "form-group"
  }, React.createElement("label", null, "Kategori shpenzimesh (presje)"), React.createElement("input", {
    type: "text",
    value: (form.expenseCategories || []).join(', '),
    onChange: e => upd('expenseCategories', e.target.value.split(',').map(s => s.trim()).filter(Boolean)),
    placeholder: "Qira, Transport, Paga, Utilities"
  })))), React.createElement(LteCard, {
    title: "Product Categories",
    icon: "fa-tags"
  }, React.createElement("div", {
    className: "pos-scan-box",
    style: {
      marginBottom: 14
    }
  }, React.createElement("div", {
    className: "form-group",
    style: {
      flex: 1,
      marginBottom: 0
    }
  }, React.createElement("label", null, "New Category"), React.createElement("input", {
    type: "text",
    value: newCat,
    onChange: e => setNewCat(e.target.value),
    onKeyDown: e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addCat();
      }
    },
    placeholder: "e.g. Beverages"
  })), React.createElement("button", {
    className: "btn btn-success",
    onClick: addCat
  }, React.createElement("i", {
    className: "fas fa-plus"
  }), " Add")), React.createElement("div", {
    className: "cat-chip-wrap"
  }, categories.length === 0 ? React.createElement("p", {
    style: {
      color: '#999'
    }
  }, "No categories yet.") : categories.map(c => React.createElement("span", {
    className: "cat-chip",
    key: c.id
  }, React.createElement("i", {
    className: "fas fa-tag"
  }), " ", c.name, React.createElement("button", {
    onClick: () => delCat(c),
    title: "Delete"
  }, React.createElement("i", {
    className: "fas fa-times"
  })))))));
}
function AlphaReportsView({
  user,
  role
}) {
  const today = new Date().toISOString().slice(0, 10);
  const first = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const [from, setFrom] = useState(first);
  const [to, setTo] = useState(today);
  const [sel, setSel] = useState('Rap_BlerjeRegjistriPermbledhes');
  const {
    loading,
    data
  } = useFetch(() => Promise.all([fbGetPurchaseOrders(), fbGetSales(), fbGetProducts(), fbGetExpenses()]), [from, to]);
  const pos = useMemo(() => data && data[0] && data[0].success ? data[0].data : [], [data]);
  const sales = useMemo(() => data && data[1] && data[1].success ? data[1].data : [], [data]);
  const products = useMemo(() => data && data[2] && data[2].success ? data[2].data : [], [data]);
  const expenses = useMemo(() => data && data[3] && data[3].success ? data[3].data : [], [data]);
  const built = useMemo(() => buildAlphaReport(sel, {
    from,
    to
  }, {
    pos,
    sales,
    products,
    expenses
  }), [sel, from, to, pos, sales, products, expenses]);
  const REPORTS = [{
    id: 'Rap_BlerjeRegjistriPermbledhes',
    label: 'Regjistri Përmbledhës i blerjeve'
  }, {
    id: 'Rap_BlerjeRegjistriAnalitik',
    label: 'Regjistri Analitik i blerjeve'
  }, {
    id: 'Rap_LibriShitjes',
    label: 'Libri i Shitjeve'
  }, {
    id: 'Rap_ArtikujTeShitur',
    label: 'Artikuj të shitur'
  }, {
    id: 'Rap_GjendjaArtikujveSasiVlere',
    label: 'Gjendja e artikujve (sasi/vlerë)'
  }, {
    id: 'Rap_ArkaDitariKlasik',
    label: 'Ditari Klasik i arkës'
  }];
  const doPdf = () => saveFaturePdf(built.html, sel + '.pdf');
  const doXlsx = () => {
    const API = window.sistemiGenitAPI;
    if (API && API.exportAlphaXlsx) API.exportAlphaXlsx({
      spec: built.spec,
      rows: built.rows,
      totals: built.totals,
      defaultName: sel + '.xlsx'
    }).then(res => {
      if (res && res.success && window.Swal) Swal.fire({
        icon: 'success',
        title: 'Excel u ruajt',
        text: res.path,
        timer: 2500
      });else if (res && !/Anuluar/.test(res.message || '') && window.Swal) Swal.fire({
        icon: 'error',
        title: 'Excel',
        text: res.message || ''
      });
    });
  };
  if (loading) return React.createElement(TopLoadingBar, null);
  return React.createElement("div", {
    className: "data-section"
  }, React.createElement("div", {
    className: "section-header"
  }, React.createElement("h2", null, React.createElement("i", {
    className: "fas fa-table-list"
  }), " Raporte Alpha"), React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, React.createElement("button", {
    type: "button",
    className: "btn btn-preview",
    onClick: () => openHtmlDocument(built.spec.title, built.html, false)
  }, React.createElement("i", {
    className: "fas fa-eye"
  }), " Preview"), React.createElement("button", {
    type: "button",
    className: "btn btn-primary",
    onClick: () => openHtmlDocument(built.spec.title, built.html, true)
  }, React.createElement("i", {
    className: "fas fa-print"
  }), " Printo"), React.createElement("button", {
    type: "button",
    className: "btn btn-pdf",
    onClick: doPdf
  }, React.createElement("i", {
    className: "fas fa-file-pdf"
  }), " PDF"), React.createElement("button", {
    type: "button",
    className: "btn btn-excel",
    onClick: doXlsx
  }, React.createElement("i", {
    className: "fas fa-file-excel"
  }), " Excel"))), React.createElement("div", {
    className: "module-toolbar"
  }, React.createElement("div", {
    className: "left",
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      flexWrap: 'wrap'
    }
  }, React.createElement("select", {
    value: sel,
    onChange: e => setSel(e.target.value),
    style: {
      padding: 6
    }
  }, REPORTS.map(r => React.createElement("option", {
    key: r.id,
    value: r.id
  }, r.label))), React.createElement("label", {
    style: {
      color: '#808080'
    }
  }, "Nga"), React.createElement("input", {
    type: "date",
    value: from,
    onChange: e => setFrom(e.target.value)
  }), React.createElement("label", {
    style: {
      color: '#808080'
    }
  }, "Deri"), React.createElement("input", {
    type: "date",
    value: to,
    onChange: e => setTo(e.target.value)
  })), React.createElement("div", {
    className: "right"
  }, React.createElement("span", {
    className: "type-chip"
  }, built.rows.length, " rreshta"))), React.createElement("div", {
    style: {
      background: '#f5f5f5',
      padding: 12,
      borderRadius: 6,
      overflow: 'auto'
    }
  }, React.createElement("div", {
    dangerouslySetInnerHTML: {
      __html: built.html
    }
  })));
}
function MainContent({
  activeMenu,
  user,
  role,
  setActiveMenu
}) {
  if (!canAccessMenu(role, activeMenu) && activeMenu !== 'about') {
    return React.createElement("div", {
      className: "data-section",
      style: {
        padding: 24
      }
    }, React.createElement("div", {
      className: "section-header"
    }, React.createElement("h2", null, React.createElement("i", {
      className: "fas fa-lock"
    }), " Nuk ke t\xEB drejt\xEB aksesi")), React.createElement("div", {
      style: {
        padding: 24,
        background: '#fff'
      }
    }, React.createElement("p", {
      style: {
        color: '#6c757d',
        marginBottom: 14
      }
    }, "Roli yt (", React.createElement("b", null, role || 'User'), ") nuk lejon k\xEBt\xEB modul. K\xEBrkoji Admin-it t\xEB t\xEB jap\xEB t\xEB drejta."), React.createElement("button", {
      className: "btn btn-primary",
      onClick: () => setActiveMenu(role === 'Admin' ? 'dashboard' : 'pos')
    }, React.createElement("i", {
      className: "fas fa-arrow-left"
    }), " Kthehu")));
  }
  switch (activeMenu) {
    case 'dashboard':
      return React.createElement(DashboardView, {
        user: user,
        role: role,
        setActiveMenu: setActiveMenu
      });
    case 'pos':
      return React.createElement(POSView, {
        user: user,
        role: role,
        setActiveMenu: setActiveMenu
      });
    case 'products':
      return React.createElement(ProductsView, {
        user: user,
        role: role,
        setActiveMenu: setActiveMenu
      });
    case 'stock':
      return React.createElement(StockView, {
        user: user,
        role: role,
        setActiveMenu: setActiveMenu
      });
    case 'sales-history':
      return React.createElement(SalesHistoryView, {
        user: user,
        role: role
      });
    case 'reports':
      return React.createElement(ReportsView, {
        user: user,
        role: role,
        setActiveMenu: setActiveMenu
      });
    case 'alpha-reports':
      return React.createElement(AlphaReportsView, {
        user: user,
        role: role
      });
    case 'records':
      return React.createElement(RecordsView, {
        user: user,
        role: role,
        setActiveMenu: setActiveMenu
      });
    case 'suppliers':
      return React.createElement(SuppliersView, {
        user: user,
        role: role,
        setActiveMenu: setActiveMenu
      });
    case 'purchase-orders':
      return React.createElement(PurchaseOrdersView, {
        user: user,
        role: role,
        setActiveMenu: setActiveMenu
      });
    case 'warehouse-receipts-in':
      return React.createElement(WarehouseReceiptsInView, {
        user: user,
        role: role
      });
    case 'expenses':
      return React.createElement(ExpensesView, {
        user: user,
        role: role,
        setActiveMenu: setActiveMenu
      });
    case 'users':
      return React.createElement(UsersView, {
        user: user,
        role: role
      });
    case 'settings':
      return React.createElement(SettingsView, {
        user: user,
        role: role
      });
    case 'import-export':
      return React.createElement(ImportExportView, {
        user: user,
        role: role
      });
    case 'logs':
      return React.createElement(LogsView, null);
    case 'about':
      return React.createElement(AboutView, null);
    default:
      return null;
  }
}
function Dashboard({
  user,
  role,
  onLogout
}) {
  const [activeMenu, setActiveMenu] = useState(role === 'Admin' ? 'dashboard' : 'records');
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sb_collapsed') === '1');
  const toggleSidebar = () => setCollapsed(c => {
    localStorage.setItem('sb_collapsed', c ? '0' : '1');
    return !c;
  });
  const {
    data: logsData
  } = useFetch(() => fbGetLogs(), [activeMenu]);
  const notifs = useMemo(() => logsData && logsData.success ? logsData.data.slice(0, 5).map(l => ({
    text: `${l.action}: ${l.detail}`,
    icon: 'fa-bell'
  })) : [], [logsData]);
  const [cfgKey, setCfgKey] = useState(0);
  const {
    data: cfgData
  } = useFetch(() => Promise.all([fbGetSettings(), fbGetCategories()]), [cfgKey]);
  const settings = useMemo(() => cfgData && cfgData[0] && cfgData[0].success ? cfgData[0].data : {}, [cfgData]);
  const categories = useMemo(() => cfgData && cfgData[1] && cfgData[1].success ? cfgData[1].data : [], [cfgData]);
  useEffect(() => {
    if (settings && Object.keys(settings).length) applySettings(settings);
  }, [settings]);
  const refreshConfig = useCallback(() => setCfgKey(k => k + 1), []);
  const [appsOpen, setAppsOpen] = useState(false);
  const titles = {
    dashboard: 'Paneli',
    pos: 'POS / Shitje',
    products: 'Produktet',
    stock: 'Inventari',
    'sales-history': 'Porositë',
    reports: 'Raportet',
    records: 'Klientët',
    suppliers: 'Furnitorët',
    'purchase-orders': 'Porosi Blerje',
    'warehouse-receipts-in': 'Fletë Hyrje',
    expenses: 'Shpenzimet',
    users: 'Përdoruesit',
    settings: 'Cilësimet',
    'import-export': 'Import / Eksport',
    logs: 'Aktiviteti',
    about: 'Rreth'
  };
  const icons = {
    dashboard: 'fa-gauge-high',
    pos: 'fa-cash-register',
    products: 'fa-boxes-stacked',
    stock: 'fa-dolly',
    'sales-history': 'fa-file-invoice',
    reports: 'fa-chart-pie',
    records: 'fa-address-book',
    suppliers: 'fa-truck-field',
    'purchase-orders': 'fa-bag-shopping',
    'warehouse-receipts-in': 'fa-box-open',
    expenses: 'fa-money-bill-wave',
    users: 'fa-users-cog',
    settings: 'fa-gear',
    'import-export': 'fa-file-import',
    logs: 'fa-clock-rotate-left',
    about: 'fa-circle-info'
  };
  return React.createElement(ConfigContext.Provider, {
    value: {
      settings,
      categories,
      refreshConfig,
      setActiveMenu
    }
  }, React.createElement("div", {
    className: "app-container"
  }, React.createElement(OdooTopbar, {
    title: titles[activeMenu] || 'Sistemi Genit',
    userName: user?.name,
    role: role,
    notifs: notifs,
    onLogout: onLogout,
    setActiveMenu: setActiveMenu,
    toggleSidebar: toggleSidebar,
    onOpenApps: () => setAppsOpen(true)
  }), React.createElement("div", {
    className: "o-body"
  }, React.createElement(Sidebar, {
    activeMenu: activeMenu,
    setActiveMenu: setActiveMenu,
    role: role,
    user: user,
    onLogout: onLogout,
    collapsed: collapsed
  }), React.createElement("div", {
    className: "main-content o-main"
  }, React.createElement(MainContent, {
    activeMenu: activeMenu,
    user: user,
    role: role,
    setActiveMenu: setActiveMenu
  }))), appsOpen && React.createElement(OdooAppsMenu, {
    role: role,
    user: user,
    setActiveMenu: setActiveMenu,
    onClose: () => setAppsOpen(false)
  })));
}
function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [setupRequired, setSetupRequired] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  useEffect(() => {
    let mounted = true;
    (async function () {
      try {
        const needsSetup = await fbNeedsInitialSetup();
        if (!mounted) return;
        setSetupRequired(needsSetup);
        if (needsSetup) {
          localStorage.removeItem('fb_user');
        } else {
          const saved = localStorage.getItem('fb_user');
          if (saved) {
            try {
              const u = JSON.parse(saved);
              setIsLoggedIn(true);
              setCurrentUser(u);
              setUserRole(u.role);
            } catch (e) {
              localStorage.removeItem('fb_user');
            }
          }
        }
      } catch (e) {
        console.error('Startup check failed', e);
        setSetupRequired(true);
      } finally {
        if (mounted) setCheckingSession(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);
  const handleLogin = (user, role) => {
    localStorage.setItem('fb_user', JSON.stringify(user));
    setSetupRequired(false);
    setIsLoggedIn(true);
    setCurrentUser(user);
    setUserRole(role);
  };
  const handleLogout = () => {
    localStorage.removeItem('fb_user');
    setIsLoggedIn(false);
    setCurrentUser(null);
    setUserRole(null);
  };
  if (checkingSession || setupRequired === null) return React.createElement("div", {
    className: "login-container"
  }, React.createElement("div", {
    className: "login-box"
  }, React.createElement("i", {
    className: "fas fa-spinner fa-spin",
    style: {
      fontSize: '40px',
      color: 'var(--navy-primary)'
    }
  })));
  if (setupRequired) return React.createElement(InitialSetupPage, {
    onComplete: handleLogin
  });
  return React.createElement("div", null, !isLoggedIn ? React.createElement(LoginPage, {
    onLogin: handleLogin
  }) : React.createElement(Dashboard, {
    user: currentUser,
    role: userRole,
    onLogout: handleLogout
  }));
}
class ErrorBoundary extends React.Component {
  state = {
    err: null
  };
  static getDerivedStateFromError(err) {
    return {
      err
    };
  }
  componentDidCatch(err) {
    console.error('ui crash', err);
  }
  render() {
    if (this.state.err) return React.createElement("div", {
      className: "login-container"
    }, React.createElement("div", {
      className: "login-box"
    }, React.createElement("i", {
      className: "fas fa-triangle-exclamation",
      style: {
        fontSize: 40,
        color: 'var(--danger)'
      }
    }), React.createElement("h2", null, "Something broke"), React.createElement("pre", {
      style: {
        maxWidth: '70vw',
        whiteSpace: 'pre-wrap',
        fontSize: 11,
        color: '#a33',
        textAlign: 'left'
      }
    }, String(this.state.err && this.state.err.message || this.state.err || '')), React.createElement("button", {
      className: "btn btn-primary",
      onClick: () => location.reload()
    }, React.createElement("i", {
      className: "fas fa-rotate"
    }), " Reload")));
    return this.props.children;
  }
}
(function bindOdooListRows() {
  if (!window.jQuery) return;
  var $ = window.jQuery;
  function ensureSelectionBar(wrapper) {
    var $w = $(wrapper);
    if ($w.find('.o-selection-bar').length) return $w.find('.o-selection-bar');
    var $bar = $('<div class="o-selection-bar">' + '<span class="o-selection-chip"><span class="o-sel-count">0</span> selected <button type="button" class="o-sel-clear" title="Pastro">×</button></span>' + '<div class="o-actions-wrap">' + '<button type="button" class="o-actions-btn"><i class="fas fa-cog"></i> Actions <i class="fas fa-caret-down"></i></button>' + '<div class="o-actions-menu">' + '<button type="button" data-o-act="multi-edit"><i class="fas fa-pen-to-square"></i> Ndrysho fushë (multi)</button>' + '<button type="button" data-o-act="export-xlsx"><i class="fas fa-file-excel"></i> Excel (selek./filtruar)</button>' + '<button type="button" data-o-act="export-pdf"><i class="fas fa-file-pdf"></i> PDF (selek./filtruar)</button>' + '<button type="button" data-o-act="export-print"><i class="fas fa-print"></i> Preview (selek./filtruar)</button>' + '<button type="button" data-o-act="export-all"><i class="fas fa-database"></i> Eksporto të gjitha</button>' + '<button type="button" class="danger" data-o-act="delete"><i class="fas fa-trash"></i> Fshi të zgjedhurat</button>' + '</div>' + '</div>' + '</div>');
    var $btns = $w.find('.dt-buttons').first();
    if ($btns.length) $btns.after($bar);else $w.prepend($bar);
    return $bar;
  }
  function selectedRows(api) {
    var rows = [];
    api.rows({
      page: 'current'
    }).every(function () {
      var node = this.node();
      if (node && $(node).find('input.o-row-check').prop('checked')) {
        rows.push({
          idx: this.index(),
          data: this.data(),
          node: node
        });
      }
    });
    return rows;
  }
  function refreshSelectionUI(api) {
    try {
      var $table = $(api.table().node());
      var $wrap = $table.closest('.dataTables_wrapper');
      var $bar = ensureSelectionBar($wrap);
      var n = $table.find('tbody input.o-row-check:checked').length;
      $bar.toggleClass('visible', n > 0);
      $bar.find('.o-sel-count').text(n);
      var all = $table.find('tbody input.o-row-check');
      var checked = $table.find('tbody input.o-row-check:checked');
      $table.find('thead input.o-check-all').prop('checked', all.length > 0 && all.length === checked.length);
      $table.find('thead input.o-check-all').prop('indeterminate', checked.length > 0 && checked.length < all.length);
    } catch (e) {}
  }
  function injectCheckboxColumn(api) {
    try {
      var $table = $(api.table().node());
      var $firstTh = $table.find('thead tr th').first();
      if ($firstTh.length && !$firstTh.find('input.o-check-all').length) {
        $firstTh.prepend('<span class="o-check-wrap"><input type="checkbox" class="o-check-all" title="Zgjidh të gjitha"/> </span>');
      }
      $table.find('tbody tr').each(function () {
        var $tr = $(this);
        var $firstTd = $tr.children('td').first();
        if ($firstTd.length && !$firstTd.find('input.o-row-check').length) {
          $firstTd.prepend('<span class="o-check-wrap"><input type="checkbox" class="o-row-check"/> </span>');
        }
        var $view = $tr.find('[data-action="view"]').first();
        if ($view.length && !$tr.find('.o-open-form').length) {
          var $last = $tr.children('td').last();
          $last.append(' <button type="button" class="o-open-form" title="Hap"><i class="fas fa-arrow-right"></i></button>');
        }
      });
      ensureSelectionBar($table.closest('.dataTables_wrapper'));
      refreshSelectionUI(api);
    } catch (e) {
      console.warn('checkbox inject', e);
    }
  }
  $(document).on('init.dt draw.dt', 'table', function (e, settings) {
    try {
      var api = new $.fn.dataTable.Api(settings);
      var $table = $(api.table().node());
      $table.find('tbody .o-check-wrap').remove();
      $table.find('tbody .o-open-form').remove();
      injectCheckboxColumn(api);
      var moneyRe = /balanc|total|çmim|cmim|shum|amount|price|cost|profit|value|detyrim|fitim|vler|pages|grade/i;
      api.columns().every(function () {
        var header = ($(this.header()).text() || '').trim();
        if (moneyRe.test(header)) {
          $(this.header()).addClass('odoo-num');
          $(this.nodes()).addClass('odoo-num');
        }
      });
    } catch (err) {}
  });
  $(document).on('change', 'table.dataTable thead input.o-check-all', function (e) {
    e.stopPropagation();
    var on = this.checked;
    var $table = $(this).closest('table');
    $table.find('tbody input.o-row-check').prop('checked', on);
    $table.find('tbody tr').toggleClass('odoo-selected', on);
    try {
      var api = $table.DataTable();
      refreshSelectionUI(api);
    } catch (err) {}
  });
  $(document).on('change', 'table.dataTable tbody input.o-row-check', function (e) {
    e.stopPropagation();
    var $tr = $(this).closest('tr');
    $tr.toggleClass('odoo-selected', this.checked);
    try {
      var api = $(this).closest('table').DataTable();
      refreshSelectionUI(api);
    } catch (err) {}
  });
  $(document).on('click', 'table.dataTable td.o-check-col', function (e) {
    e.stopPropagation();
  });
  $(document).on('click', 'table.dataTable tbody tr', function (e) {
    if ($(e.target).closest('button,a,input,label,.product-action-btn,.toggle,.o-check-col,.o-open-form').length) return;
    var $tr = $(this);
    $tr.addClass('odoo-selected');
  });
  $(document).on('dblclick', 'table.dataTable tbody tr', function (e) {
    if ($(e.target).closest('button,a,input,label,.product-action-btn,.toggle,.o-check-col').length) return;
    var $btn = $(this).find('[data-action="view"]').first();
    if ($btn.length) $btn.trigger('click');
  });
  $(document).on('click', 'table.dataTable .o-open-form', function (e) {
    e.preventDefault();
    e.stopPropagation();
    var $btn = $(this).closest('tr').find('[data-action="view"]').first();
    if ($btn.length) $btn.trigger('click');
  });
  $(document).on('click', '.o-sel-clear', function () {
    var $wrap = $(this).closest('.dataTables_wrapper');
    $wrap.find('input.o-row-check, input.o-check-all').prop('checked', false);
    $wrap.find('tbody tr').removeClass('odoo-selected');
    $wrap.find('.o-selection-bar').removeClass('visible');
  });
  $(document).on('click', '.o-actions-btn', function (e) {
    e.preventDefault();
    e.stopPropagation();
    $(this).closest('.o-actions-wrap').toggleClass('open');
  });
  $(document).on('click', function () {
    $('.o-actions-wrap').removeClass('open');
  });
  $(document).on('click', '.o-actions-menu', function (e) {
    e.stopPropagation();
  });
  $(document).on('click', '.o-actions-menu [data-o-act]', function () {
    var act = $(this).data('o-act');
    var $wrap = $(this).closest('.dataTables_wrapper');
    var $table = $wrap.find('table.dataTable').first();
    var api;
    try {
      api = $table.DataTable();
    } catch (e) {
      return;
    }
    var title = $table.attr('id') || 'Raporti';
    var $h = $wrap.closest('.data-section').find('.section-header h2').first();
    if ($h.length) title = $h.text().trim() || title;
    if (act === 'multi-edit') {
      var selected = [];
      api.rows({
        page: 'current'
      }).every(function () {
        var node = this.node();
        if (node && $(node).find('input.o-row-check').prop('checked')) {
          selected.push(this.data());
        }
      });
      if (!selected.length) {
        if (window.Swal) Swal.fire({
          icon: 'info',
          title: 'Zgjidh rreshta',
          text: 'Shëno checkbox-et për multi-edit.'
        });
        return;
      }
      var tableId = $table.attr('id') || '';
      var fieldOpts = [];
      if (tableId === 'salesTable') {
        fieldOpts = [{
          value: 'paymentMethod',
          label: 'Pagesa (Cash/Card/Mobile/Bank/Credit)'
        }, {
          value: 'status',
          label: 'Statusi (completed/credit)'
        }, {
          value: 'customerName',
          label: 'Emri i klientit'
        }];
      } else if (tableId === 'productsTable') {
        fieldOpts = [{
          value: 'category',
          label: 'Kategoria'
        }, {
          value: 'status',
          label: 'Statusi (active/discontinued)'
        }, {
          value: 'reorderLevel',
          label: 'Nivel furnizimi'
        }, {
          value: 'price',
          label: 'Çmimi'
        }, {
          value: 'cost',
          label: 'Kosto'
        }];
      } else if (tableId === 'poTable') {
        fieldOpts = [{
          value: 'status',
          label: 'Statusi (draft/ordered/received/cancelled)'
        }, {
          value: 'expectedDate',
          label: 'Data e pritjes (YYYY-MM-DD)'
        }, {
          value: 'notes',
          label: 'Shënime'
        }];
      } else if (tableId === 'recordsTable') {
        fieldOpts = [{
          value: 'customerType',
          label: 'Tipi (Retail/Wholesale/VIP/Lead)'
        }, {
          value: 'category',
          label: 'Grupi'
        }, {
          value: 'active',
          label: 'Aktiv (1/0)'
        }, {
          value: 'amount',
          label: 'Balanca'
        }];
      } else if (tableId === 'expensesTable') {
        fieldOpts = [{
          value: 'category',
          label: 'Kategoria'
        }, {
          value: 'paymentMethod',
          label: 'Pagesa'
        }, {
          value: 'amount',
          label: 'Shuma'
        }];
      } else {
        if (window.Swal) Swal.fire({
          icon: 'info',
          title: 'Multi-edit',
          text: 'Ky modul nuk ka multi-edit ende. Përdor Shitjet, Produktet, PO, Klientët ose Shpenzimet.'
        });
        return;
      }
      var optionsHtml = fieldOpts.map(function (o) {
        return '<option value="' + o.value + '">' + o.label + '</option>';
      }).join('');
      if (!window.Swal) return;
      Swal.fire({
        title: 'Ndrysho ' + selected.length + ' rreshta',
        html: '<div style="text-align:left">' + '<label style="font-size:12px;color:#6c757d">Fusha</label>' + '<select id="o-me-field" class="swal2-select" style="width:100%;display:block;margin:6px 0 12px">' + optionsHtml + '</select>' + '<label style="font-size:12px;color:#6c757d">Vlera e re</label>' + '<input id="o-me-value" class="swal2-input" style="width:100%;margin:6px 0" placeholder="Shkruaj vlerën">' + '<div class="o-multi-edit-hint">Si Odoo multi_edit: e njëjta vlerë aplikohet te të gjithë të zgjedhurit.</div>' + '</div>',
        showCancelButton: true,
        confirmButtonText: 'Confirm',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#714B67',
        preConfirm: function () {
          var field = (document.getElementById('o-me-field') || {}).value;
          var value = (document.getElementById('o-me-value') || {}).value;
          if (!field) {
            Swal.showValidationMessage('Zgjidh fushën');
            return false;
          }
          if (value === undefined || value === null || String(value).trim() === '') {
            Swal.showValidationMessage('Shkruaj vlerën');
            return false;
          }
          return {
            field: field,
            value: String(value).trim()
          };
        }
      }).then(function (res) {
        if (!res.isConfirmed || !res.value) return;
        var field = res.value.field;
        var value = res.value.value;
        var numFields = {
          amount: 1,
          price: 1,
          cost: 1,
          reorderLevel: 1
        };
        var patchVal = value;
        if (numFields[field]) patchVal = Number(value);
        if (field === 'active') patchVal = value === '1' || value === 'true' || value === 'Po' || value === 'po';
        var userObj = null;
        try {
          userObj = JSON.parse(localStorage.getItem('fb_user') || 'null');
        } catch (e) {}
        var jobs = selected.map(function (row) {
          var id = row && row.id;
          if (!id) return Promise.resolve({
            success: false
          });
          var patch = {};
          patch[field] = patchVal;
          if (tableId === 'salesTable' && typeof fbUpdateSale === 'function') return fbUpdateSale(id, patch, userObj);
          if (tableId === 'productsTable' && typeof fbUpdateProduct === 'function') return fbUpdateProduct(id, patch, userObj);
          if (tableId === 'poTable' && typeof fbUpdatePurchaseOrder === 'function') return fbUpdatePurchaseOrder(id, patch, userObj);
          if (tableId === 'recordsTable' && typeof fbUpdateRecord === 'function') return fbUpdateRecord(id, patch, userObj);
          if (tableId === 'expensesTable' && typeof fbUpdateExpense === 'function') return fbUpdateExpense(id, patch, userObj);
          return Promise.resolve({
            success: false,
            message: 'API mungon'
          });
        });
        Promise.all(jobs).then(function (results) {
          var ok = results.filter(function (r) {
            return r && r.success;
          }).length;
          var fail = results.length - ok;
          Swal.fire({
            icon: fail ? 'warning' : 'success',
            title: 'Multi-edit',
            text: ok + ' u përditësuan' + (fail ? ', ' + fail + ' dështuan' : ''),
            timer: 2000,
            showConfirmButton: false
          });
          try {
            window.dispatchEvent(new CustomEvent('erp-data-changed', {
              detail: {
                tableId: tableId
              }
            }));
          } catch (e) {}
          setTimeout(function () {
            try {
              api.ajax && api.ajax.reload && api.ajax.reload();
            } catch (e) {}
          }, 300);
          var $ref = $table.closest('.data-section').find('.btn-refresh, .btn-secondary .fa-rotate').closest('button');
          if ($ref.length) $ref.trigger('click');else {
            $table.find('input.o-row-check, input.o-check-all').prop('checked', false);
            $table.find('tbody tr').removeClass('odoo-selected');
            $wrap.find('.o-selection-bar').removeClass('visible');
          }
        });
      });
      return;
    }
    if (act === 'export-xlsx' || act === 'export-pdf' || act === 'export-print' || act === 'export-all') {
      var mode = act === 'export-xlsx' ? 'xlsx' : act === 'export-pdf' ? 'pdf' : act === 'export-print' ? 'print' : 'xlsx';
      if (act === 'export-all') {
        if (window.Swal) {
          Swal.fire({
            title: 'Eksporto të gjitha',
            showDenyButton: true,
            showCancelButton: true,
            confirmButtonText: 'Excel',
            denyButtonText: 'PDF',
            cancelButtonText: 'Anulo',
            confirmButtonColor: '#0f7b3a',
            denyButtonColor: '#c62828'
          }).then(function (res) {
            if (res.isConfirmed) erpExportFromDataTable(api, title, 'xlsx', 'all');else if (res.isDenied) erpExportFromDataTable(api, title, 'pdf', 'all');
          });
        } else erpExportFromDataTable(api, title, 'xlsx', 'all');
      } else {
        if (typeof erpExportFromDataTable === 'function') erpExportFromDataTable(api, title, mode, 'auto');
      }
    } else if (act === 'delete') {
      var n = $table.find('tbody input.o-row-check:checked').length;
      if (!n) return;
      if (window.Swal) {
        Swal.fire({
          icon: 'warning',
          title: 'Fshi ' + n + ' rreshta?',
          text: 'Veprimi varet nga e drejta jote. Do të fshihet çdo rresht i zgjedhur që ka buton Fshi.',
          showCancelButton: true,
          confirmButtonText: 'Confirm',
          cancelButtonText: 'Cancel',
          confirmButtonColor: '#714B67'
        }).then(function (res) {
          if (!res.isConfirmed) return;
          $table.find('tbody tr').each(function () {
            var $tr = $(this);
            if ($tr.find('input.o-row-check').prop('checked')) {
              var $del = $tr.find('[data-action="delete"]').first();
              if ($del.length) $del.trigger('click');
            }
          });
        });
      }
    }
    $(this).closest('.o-actions-wrap').removeClass('open');
  });
  if (jQuery.fn && jQuery.fn.dataTable) {
    jQuery.extend(true, jQuery.fn.dataTable.defaults, {
      pageLength: 80,
      lengthMenu: [[20, 40, 80, 100, -1], [20, 40, 80, 100, 'Të gjitha']],
      autoWidth: false,
      deferRender: true,
      language: Object.assign({}, jQuery.fn.dataTable.defaults.language || {}, {
        search: 'Kërko:',
        lengthMenu: '_MENU_',
        info: '_START_-_END_ / _TOTAL_',
        infoEmpty: '0 / 0',
        infoFiltered: '(nga _MAX_)',
        zeroRecords: 'Nuk u gjet asnjë regjistrim',
        emptyTable: 'Nuk ka të dhëna',
        paginate: {
          first: '«',
          previous: '‹',
          next: '›',
          last: '»'
        }
      })
    });
  }
})();
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(ErrorBoundary, null, React.createElement(App, null)));