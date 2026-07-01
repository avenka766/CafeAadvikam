import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const failures = [];
const passes = [];

function read(relativePath) {
  const absolutePath = join(projectRoot, relativePath);
  if (!existsSync(absolutePath)) return null;
  return readFileSync(absolutePath, 'utf8');
}

function check(name, assertion, details) {
  try {
    const result = typeof assertion === 'function' ? assertion() : assertion;
    if (result) {
      passes.push(name);
      return;
    }
    failures.push({ name, details });
  } catch (error) {
    failures.push({
      name,
      details: `${details ?? 'Check threw an error.'} ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

function walk(directory, extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.sql'])) {
  const absoluteDirectory = join(projectRoot, directory);
  if (!existsSync(absoluteDirectory)) return [];

  const files = [];
  for (const entry of readdirSync(absoluteDirectory)) {
    const absolutePath = join(absoluteDirectory, entry);
    const relativePath = relative(projectRoot, absolutePath);
    const stats = statSync(absolutePath);

    if (stats.isDirectory()) {
      if (['node_modules', 'dist', '.git'].includes(entry)) continue;
      files.push(...walk(relativePath, extensions));
      continue;
    }

    if (extensions.has(extname(entry))) files.push(relativePath);
  }
  return files;
}

const packageJsonText = read('package.json');
const packageJson = packageJsonText ? JSON.parse(packageJsonText) : null;
const authStore = read('src/stores/authStore.ts') ?? '';
const branchBilling = read('src/branch/tabs/BranchBillingProTab.tsx') ?? '';
const bottomNav = read('src/components/layout/BottomNav.tsx') ?? '';
const hosurDashboard = read('src/pages/HosurDashboard.tsx') ?? '';
const branchBusinessModules = read('src/branch/tabs/BranchBusinessModules.tsx') ?? '';
const adminSnb = read('src/pages/AdminSNBDashboard.tsx') ?? '';
const adminVrsnb = read('src/pages/AdminVRSNBDashboard.tsx') ?? '';
const bakeryOrderPage = read('src/pages/BakeryOrderPage.tsx') ?? '';
const branchCatalogStore = read('src/stores/branchCatalogStore.ts') ?? '';
const recipeStore = read('src/bakery/recipeStore.ts') ?? '';
const storeDashboard = read('src/bakery/StoreDashboard.tsx') ?? '';
const invoiceStore = read('src/bakery/invoiceStore.ts') ?? '';
const adminInvoicesTab = read('src/bakery/AdminInvoicesTab.tsx') ?? '';
const razorpayFunction = read('supabase/functions/create-razorpay-order/index.ts') ?? '';
const unifiedMigration = read('supabase/migrations/20260627190000_unified_branch_catalog_and_live_recipes.sql') ?? '';
const stockLinkRepairMigration = read('supabase/migrations/20260627213000_repair_branch_item_stock_links.sql') ?? '';
const priceAuthRepairMigration = read('supabase/migrations/20260627233000_fix_branch_price_persistence_and_staff_login.sql') ?? '';
const adminInvoiceRepairMigration = read('supabase/migrations/20260628040000_fix_admin_invoice_review_workflow.sql') ?? '';
const snbMixComboRestoreMigration = read('supabase/migrations/20260701033000_restore_snb_mix_combo_flexible_stock.sql') ?? '';
const completeBranchFixMigration = read('supabase/migrations/20260630030000_branch_snb_vrsnb_complete_fixes.sql') ?? '';
const snbPurchaseWorkflowRepairMigration = read('supabase/migrations/20260701013000_fix_snb_purchase_workflow_dropdowns.sql') ?? '';
const branchUpiClosureAuditMigration = read('supabase/migrations/20260701024500_add_branch_upi_closure_audit.sql') ?? '';
const branchClosureRpcMigration = read('supabase/migrations/20260701043000_fix_branch_closure_schema_cache_rpc.sql') ?? '';
const snbPurchaseRevisionMigration = read('supabase/migrations/20260701073000_snb_synced_invoice_revision_workflow.sql') ?? '';
const adminNotificationsTab = read('src/bakery/AdminNotificationsTab.tsx') ?? '';
const notificationStore = read('src/bakery/notificationStore.ts') ?? '';
const snbAdminReports = read('src/hooks/useSnbAdminReports.ts') ?? '';
const paymentModeEdit = read('src/branch/tabs/PaymentModeEditTab.tsx') ?? '';
const branchDashboard = read('src/branch/BranchDashboard.tsx') ?? '';
const branchStore = read('src/branch/branchStore.ts') ?? '';
const branchOpsStore = read('src/branch/branchOpsStore.ts') ?? '';
const branchStockForm = read('src/bakery/BranchStockForm.tsx') ?? '';
const orderReceiverDashboard = read('src/bakery/OrderReceiverDashboard.tsx') ?? '';
const adminDashboard = read('src/pages/AdminDashboard.tsx') ?? '';
const ownerDashboard = read('src/pages/OwnerDashboard.tsx') ?? '';
const snbHistory = read('src/pages/SNBHistoryPage.tsx') ?? '';
const vrsnbHistory = read('src/pages/VRSNBHistoryPage.tsx') ?? '';
const globalCss = read('src/index.css') ?? '';
const itemPriceStore = read('src/stores/itemPriceStore.ts') ?? '';
const qualityGate = read('.github/workflows/quality-gate.yml') ?? '';
const sourceFiles = [...walk('src'), ...walk('supabase/functions')];
const sourceText = sourceFiles
  .map((file) => `\n/* ${file} */\n${read(file) ?? ''}`)
  .join('\n');

check(
  'Audit command points to this script',
  packageJson?.scripts?.['test:audit'] === 'node scripts/audit-regression.mjs',
  'package.json must keep scripts.test:audit set to node scripts/audit-regression.mjs.',
);

check(
  'GitHub quality gate runs the audit command',
  /npm run test:audit/.test(qualityGate),
  '.github/workflows/quality-gate.yml must run npm run test:audit.',
);

check(
  'Staff login uses the secure server RPC',
  authStore.includes("supabase.rpc('login_staff_secure'"),
  'Client-side authentication must use login_staff_secure.',
);

check(
  'Staff logout uses the secure server RPC',
  authStore.includes("supabase.rpc('logout_staff_secure'"),
  'Client-side logout must call logout_staff_secure before ending the session.',
);

check(
  'Branch checkout uses the atomic checkout RPC',
  branchBilling.includes("supabase.rpc('complete_branch_checkout_canonical'")
    || branchBilling.includes("supabase.rpc('complete_branch_checkout'"),
  'Branch billing must use an atomic checkout RPC so stock, payment and audit writes remain atomic.',
);

check(
  'SNB and VRSNB bottom navigation exposes Payment Mode Edit',
  bottomNav.includes('/branch/snb?tab=payment-edit')
    && bottomNav.includes('/branch/vrsnb?tab=payment-edit'),
  'Both branch biller bottom navigation bars must include the Payment Mode Edit route.',
);

check(
  'Only SNB Mix & Combo may bill through insufficient stock',
  branchBilling.includes("branch !== 'SNB'")
    && branchBilling.includes("normalizedCategory === 'mix & combo'")
    && branchBilling.includes("normalizedCategory === 'mix and combo'")
    && branchBilling.includes('const disabled = stock <= 0 && !allowInsufficientStock;')
    && branchBilling.includes('allowInsufficientStock={isSnbFlexibleStockItem(branch, qtyPopupItem)}')
    && branchBilling.includes("supabase.rpc('complete_branch_checkout_canonical_v4'")
    && snbMixComboRestoreMigration.includes("if p_branch = 'SNB' then")
    && snbMixComboRestoreMigration.includes("in ('mix & combo', 'mix and combo')")
    && snbMixComboRestoreMigration.includes('complete_branch_checkout_canonical_v3'),
  'SNB Mix & Combo may bypass stock validation, while VRSNB and every other category must remain strictly stock-controlled.',
);


check(
  'Branch operational screens use the live catalogue',
  branchBilling.includes('useBranchCatalogStore')
    && branchBusinessModules.includes('useOperationalCatalog')
    && adminSnb.includes('useBranchCatalogStore')
    && adminVrsnb.includes('useBranchCatalogStore')
    && bakeryOrderPage.includes('useBranchCatalogStore'),
  'Billing, advance orders, quotations, Admin quotations and customer ordering must use branch_items rather than static arrays.',
);

check(
  'Branch catalogue supports persistence and realtime refresh',
  branchCatalogStore.includes("from('branch_items')")
    && branchCatalogStore.includes("rpc('create_branch_item'")
    && branchCatalogStore.includes("rpc('update_branch_item'")
    && branchCatalogStore.includes("postgres_changes"),
  'New items and price changes must persist and refresh across open branch screens.',
);

check(
  'Branch prices have one canonical source and transactional legacy mirroring',
  priceAuthRepairMigration.includes('sync_branch_item_price_compat_trigger')
    && priceAuthRepairMigration.includes('on conflict (branch, barcode) do update')
    && !branchCatalogStore.includes("from('branch_item_prices').upsert")
    && !itemPriceStore.includes("from('branch_item_prices')"),
  'Browser code must not write legacy price rows; branch_items must mirror them transactionally in the database.',
);

check(
  'Staff creation and password updates write the login hash column',
  priceAuthRepairMigration.includes('password_hash,')
    && priceAuthRepairMigration.includes('set password = v_hash')
    && priceAuthRepairMigration.includes('password_hash = v_hash')
    && priceAuthRepairMigration.includes('set_staff_credential_secure')
    && authStore.includes("rpc('set_staff_credential_secure'")
    && priceAuthRepairMigration.includes("coalesce(nullif(v_user.password_hash, ''), nullif(v_user.password, ''))"),
  'New staff, changed passwords and login verification must use the same bcrypt hash.',
);


check(
  'Branch stock linking is canonical and duplicate-safe',
  branchCatalogStore.includes("rpc('ensure_branch_stock_link'")
    && !branchCatalogStore.includes(".from('branch_stock').insert")
    && !branchCatalogStore.includes(".from('branch_stock')")
    && stockLinkRepairMigration.includes('branch_stock_branch_barcode_unique')
    && stockLinkRepairMigration.includes('ensure_branch_stock_link'),
  'Admin item changes must use the database stock-link RPC and enforce one stock row per branch/barcode.',
);

check(
  'Item-name normalization lowercases before stripping characters',
  !unifiedMigration.includes('lower(regexp_replace')
    && unifiedMigration.includes("regexp_replace(lower(")
    && stockLinkRepairMigration.includes("normalize_branch_item_name"),
  'Never strip [^a-z0-9] before lowercasing; uppercase item names would collapse to an empty key.',
);

check(
  'Public payment amount is resolved server-side',
  razorpayFunction.includes("from('branch_items')")
    && razorpayFunction.includes(".in('barcode'")
    && !/Number\(raw\.price/.test(razorpayFunction),
  'The Razorpay function must ignore browser-submitted prices and resolve authorised prices from branch_items.',
);

check(
  'Store production uses the live recipe store',
  storeDashboard.includes('useRecipeStore')
    && storeDashboard.includes('calculateMaterials')
    && recipeStore.includes("from('bakery_recipes')")
    && recipeStore.includes('postgres_changes'),
  'Recipe Management, production requirements and stock deductions must share bakery_recipes.',
);

check(
  'Admin invoice totals are normalised before rendering',
  invoiceStore.includes('grandTotal: toFiniteNumber(r.grand_total)')
    && invoiceStore.includes('mapLineItems(r.line_items)'),
  'PostgREST numeric values may arrive as strings; invoice rows must be normalised before calling number formatters.',
);

check(
  'Admin invoice review uses secure RPCs and visible errors',
  invoiceStore.includes("rpc('list_store_invoices_secure'")
    && invoiceStore.includes("rpc('review_store_invoice_secure'")
    && adminInvoicesTab.includes('Unable to load invoices')
    && adminInvoicesTab.includes('actionError'),
  'Admin invoice reads/reviews must use role-checked RPCs and must not silently close on failure.',
);

check(
  'Invoice review statuses stay synchronized',
  adminInvoiceRepairMigration.includes('sync_store_invoice_status_columns')
    && adminInvoiceRepairMigration.includes('purchase_status = p_status')
    && adminInvoiceRepairMigration.includes('review_store_invoice_secure'),
  'status and purchase_status must remain synchronized for Admin and Owner reporting.',
);

check(
  'Unified branch catalogue migration is present',
  unifiedMigration.includes('create table if not exists public.branch_items')
    && unifiedMigration.includes('create or replace function public.complete_branch_checkout_canonical')
    && unifiedMigration.includes('create or replace function public.canonicalize_branch_sale_items'),
  'The database migration must install the persistent catalogue and canonical atomic checkout functions.',
);

check(
  'Hosur counter opening uses the secure RPC',
  hosurDashboard.includes("supabase.rpc('open_hosur_counter_secure'"),
  'Hosur counter opening must use open_hosur_counter_secure.',
);

check(
  'Hosur counter closing uses the secure RPC',
  hosurDashboard.includes("supabase.rpc('close_hosur_counter_secure'"),
  'Hosur counter closing must use close_hosur_counter_secure.',
);

check(
  'Required business-safety migrations are present',
  existsSync(join(projectRoot, 'supabase/migrations/20260626173000_hosur_counter_reopen_same_day.sql'))
    && existsSync(join(projectRoot, 'supabase/migrations/20260626213000_vrsnb_customer_booking_tracking.sql')),
  'Critical counter and customer-order migrations must remain committed.',
);

check(
  'Billing supports percentage and fixed-value discounts',
  branchBilling.includes("useState<DiscountMode>('percent')")
    && branchBilling.includes("discountMode === 'percent'")
    && branchBilling.includes("discountMode === 'value'")
    && branchBilling.includes('Discount value cannot exceed the subtotal'),
  'The branch billing screen must support validated percentage and fixed-value discounts.',
);

check(
  'Billing keyboard shortcuts match the original SNB and VRSNB workflow',
  [
    "['F1', 'Change Salesperson']",
    "['F2', 'Change Quantity']",
    "['F3', 'Cash Payment']",
    "['F4', 'UPI Payment']",
    "['F5', 'Card Payment']",
    "['F6', 'Split Payment']",
    "['F7', 'Credit Sale']",
    "['F8', 'Cash Tendered']",
    "['F9', 'Hold Bill']",
    "['F10', 'Final Bill']",
    "['F11', 'Recall Hold']",
    "['F12', 'Search Items']",
    "if (requiresSalesperson)",
    "focusCartQuantity()",
    "focusPaymentField('split')",
    "void checkoutRef.current()",
    "setShowHold(true)",
    "focusSearch(false)",
  ].every((token) => branchBilling.includes(token)),
  'F1-F12 must preserve the original salesperson, quantity, payment, tender, hold, final bill, recall and search workflow.',
);

check(
  'Branch daily closure requires and stores a UPI settlement audit',
  branchBusinessModules.includes("actual_upi: actualUpi")
    && branchBusinessModules.includes("upi_difference: upiDifference")
    && branchBusinessModules.includes('Enter the verified UPI amount before saving the closure')
    && branchBusinessModules.includes('UPI audit remarks because the verified amount does not match')
    && branchUpiClosureAuditMigration.includes('actual_upi numeric(14,2)')
    && branchUpiClosureAuditMigration.includes('counted_upi numeric(14,2)'),
  'SNB and VRSNB closure must compare verified UPI with system UPI, require mismatch remarks, and persist both values.',
);

check(
  'Branch counter closure is atomic and resilient to PostgREST schema-cache lag',
  branchBusinessModules.includes("supabase.rpc('finalize_branch_counter_closure_secure'")
    && branchBusinessModules.includes("candidate?.code === 'PGRST204'")
    && branchBusinessModules.includes('delete legacyClosurePayload.actual_upi')
    && branchClosureRpcMigration.includes('create or replace function public.finalize_branch_counter_closure_secure')
    && branchClosureRpcMigration.includes("select pg_notify('pgrst','reload schema')"),
  'Counter closure must use the atomic closure RPC and keep a safe compatibility path for stale UPI-column schema caches.',
);

check(
  'Closed counters do not retain live Cash, UPI or Card totals',
  branchBusinessModules.includes('const hasActiveCounter = Boolean(branchCounterOpenRecord);')
    && branchBusinessModules.includes('const useClosedLedgerForLiveTotals: boolean = false;')
    && branchBusinessModules.includes('const todayBills = hasActiveCounter ? bills.filter')
    && branchBusinessModules.includes('const todayCreditCollections = hasActiveCounter ? branchCreditPayments.filter')
    && branchBusinessModules.includes("setActualUpiInput('');")
    && branchBusinessModules.includes("setOpening('0');"),
  'After counter finalization, the live closure workspace must reset current-session collections instead of showing the finalized day ledger.',
);


check(
  'Payment edit supports full split allocations through a secure RPC',
  paymentModeEdit.includes("rpc('edit_branch_bill_payment_allocations'")
    && paymentModeEdit.includes("const editableModes: EditableMode[] = ['cash', 'upi', 'card']")
    && completeBranchFixMigration.includes('edit_branch_bill_payment_allocations')
    && completeBranchFixMigration.includes("old_mode in ('cash','upi','card','split')"),
  'Payment Edit must preserve and replace Cash/UPI/Card split allocations atomically.',
);

check(
  'Advance orders reserve stock and recognise revenue only on completion',
  branchStore.includes("rpc('create_branch_advance_order_reserved'")
    && branchStore.includes("rpc('complete_branch_advance_order_reserved'")
    && branchStore.includes('Do not write branch_sales until the reserved order is completed')
    && completeBranchFixMigration.includes('branch_stock_reservations')
    && completeBranchFixMigration.includes('record_completed_branch_advance_sale'),
  'Part-paid advance orders must reserve stock and must not be counted as completed sales before fulfilment.',
);

check(
  'Credit returns reduce outstanding before issuing a refund',
  branchOpsStore.includes("rpc('process_branch_return_credit_safe'")
    && completeBranchFixMigration.includes('process_branch_return_credit_safe')
    && completeBranchFixMigration.includes("'creditAdjusted'")
    && completeBranchFixMigration.includes("'refundAmount'"),
  'Credit returns must first reduce the unpaid balance and refund only the excess amount.',
);

check(
  'Branch operational tabs use compact split workspaces and today-only closure data',
  branchBusinessModules.includes('branch-split-workspace')
    && branchBusinessModules.includes("eq('closure_date', date)")
    && branchBusinessModules.includes("closure_date: todayIso()")
    && branchBusinessModules.includes("Today's Bills"),
  'Advance, Return, History, Payment Edit and Closure screens must fit compact displays and Closure must be today-only.',
);

check(
  'Responsive rules cover compact branch and receiver screens',
  globalCss.includes('.branch-command-screen')
    && globalCss.includes('.branch-split-workspace')
    && globalCss.includes('.order-receiver-workspace')
    && globalCss.includes('@media (max-height: 900px)'),
  'The branch and receiver dashboards must remain usable on the 30×23 display, tablets and phones.',
);

check(
  'Order entry shows live stock and requires a complete-order note',
  branchStockForm.includes('Live stock:')
    && branchStockForm.includes('complete order')
    && branchStockForm.includes('orderNote.trim()')
    && branchStockForm.includes('subscribeToStock'),
  'SNB/VRSNB Order users must see current branch stock and provide a complete-order note.',
);

check(
  'Order receiver shows shared operations, advance orders and live status',
  orderReceiverDashboard.includes('rpc("get_branch_receiver_shared_operations"')
    && orderReceiverDashboard.includes('rpc("get_branch_receiver_advance_orders"')
    && orderReceiverDashboard.includes('Live Status')
    && orderReceiverDashboard.includes('Purchase Return')
    && orderReceiverDashboard.includes('Transfer Out'),
  'SNB Order must receive Admin purchase/return/dump/damage/transfer data and Branch advance-order status.',
);

check(
  'VRSNB Admin includes all requested parity tabs',
  ['Sales & Returns','Low Stock / Stock','Expenses','Complaints','Waste Logs','Credit','Cashier Report','Cashier Closure','Daily Closure Report','Branch Report','Stock Audit']
    .every((label) => adminVrsnb.includes(label)),
  'VRSNB Admin must expose the requested SNB Admin-equivalent operational and reporting tabs.',
);

check(
  'SNB and VRSNB stock rows are deterministically deduplicated',
  adminSnb.includes("sort((a, b) => Number(new Date(a.updatedAt || a.lastUpdatedAt || 0))")
    && adminVrsnb.includes("sort((a, b) => Number(new Date(a.updatedAt || a.lastUpdatedAt || 0))"),
  'Duplicate stock rows must keep the latest database record instead of depending on response order.',
);

check(
  'SNB purchase returns and supplier payments have a resilient database read path',
  snbAdminReports.includes("rpc(\"get_snb_purchase_workflow_data\"")
    && snbAdminReports.includes('const derivedOutstanding = purchaseInvoices.map')
    && snbPurchaseWorkflowRepairMigration.includes('create or replace function public.get_snb_purchase_workflow_data')
    && snbPurchaseWorkflowRepairMigration.includes("c.role not in ('admin_snb', 'admin', 'owner')"),
  'Purchase-return invoices and supplier balances must load through a role-checked snapshot with a direct-table fallback.',
);

check(
  'Supplier payment allocations survive invoice search filtering',
  adminSnb.includes('const allocationRows = allSupplierRows')
    && adminSnb.includes('allSupplierRows.forEach((row) =>')
    && adminSnb.includes('const visibleSuppliers = useMemo'),
  'Searching the invoice list must not remove already-entered allocations from the payment batch total.',
);

check(
  'Admin balance cards and credit collections respect the selected date range',
  adminSnb.includes('movementInRange')
    && adminVrsnb.includes('movementInRange')
    && adminSnb.includes('paymentsInRange')
    && adminVrsnb.includes('creditPaymentsInRange'),
  'Balance and collection KPIs must be scoped to the active date range.',
);

check(
  'Advance collections are not counted as branch revenue twice',
  adminSnb.includes("- adminLedger.toNumber(row.advance_collected)")
    && adminVrsnb.includes("- adminLedger.toNumber(row.advance_collected)")
    && adminDashboard.includes("- adminLedger.toNumber(ledger.advance_collected)")
    && ownerDashboard.includes("- ownerLedger.toNumber(row.advance_collected)")
    && ownerDashboard.includes("- salesLedger.toNumber(row.advance_collected)")
    && branchBusinessModules.includes("- num(closureLedger.advance_collected)"),
  'Ledger sales totals must exclude advance receipts before they are presented as completed revenue.',
);

check(
  'History shows unit price, line revenue and pagination',
  snbHistory.includes('Unit Price') && snbHistory.includes('Line Revenue') && snbHistory.includes('PAGE_SIZE')
    && vrsnbHistory.includes('Unit Price') && vrsnbHistory.includes('Line Revenue') && vrsnbHistory.includes('PAGE_SIZE'),
  'SNB and VRSNB history must remain reconcilable and bounded for large datasets.',
);

check(
  'Stock audit confirmation can be safely reversed',
  adminSnb.includes('rpc("reverse_branch_stock_count_report"')
    && adminVrsnb.includes('rpc("reverse_branch_stock_count_report"')
    && completeBranchFixMigration.includes('reverse_branch_stock_count_report')
    && completeBranchFixMigration.includes('changed after confirmation'),
  'Confirmed stock audits need a guarded, audited reversal path.',
);

check(
  'Barcode namespaces are separated and collision-checked',
  completeBranchFixMigration.includes("p_branch='SNB' then 1000 else 2000")
    && completeBranchFixMigration.includes("p_branch='SNB' then 1999 else 2999")
    && completeBranchFixMigration.includes('validate_branch_item_barcode_namespace'),
  'SNB and VRSNB must use separate barcode ranges and reject collisions.',
);

check(
  'Waste, damage, dump, transfer-out and complaints support VRSNB securely',
  completeBranchFixMigration.includes("new.branch='VRSNB'")
    && completeBranchFixMigration.includes('record_branch_waste_secure')
    && completeBranchFixMigration.includes('create_branch_complaint_ticket')
    && completeBranchFixMigration.includes('vrsnb_complaint_select'),
  'VRSNB Admin must use the same atomic waste and complaint workflows as SNB Admin.',
);

check(
  'Owner and main admin polling is bounded',
  ownerDashboard.includes('startPolling(60)')
    && !ownerDashboard.includes('startPolling(7)'),
  'Owner reporting must not issue heavy database polling every few seconds.',
);


check(
  'Synced SNB purchase invoices use an audited edit and re-sync workflow',
  adminSnb.includes('save_snb_purchase_invoice_revision_secure')
    && adminSnb.includes('Reason for Editing Synced Invoice')
    && adminSnb.includes('Save Changes & Require Re-sync')
    && adminSnb.includes('Sync Again')
    && snbPurchaseRevisionMigration.includes("'purchase_invoice_revision'")
    && snbPurchaseRevisionMigration.includes("sync_status = 'Re-sync Required'"),
  'A synced purchase invoice edit must require a reason, create a revision, and wait for a second stock sync.',
);

check(
  'SNB purchase invoice re-sync applies only stock deltas and notifies authorized roles',
  snbPurchaseRevisionMigration.includes('coalesce(item.quantity, 0) - coalesce(item.synced_quantity, 0)')
    && snbPurchaseRevisionMigration.includes('reserved_quantity')
    && snbPurchaseRevisionMigration.includes("array['admin_snb', 'admin', 'owner']")
    && notificationStore.includes("'snb_purchase_invoice_revision'")
    && adminNotificationsTab.includes('SNB Invoice Revision'),
  'Re-sync must add or deduct only the edited difference, block unsafe reductions, and surface the audit notification.',
);

const exposedSecretPatterns = [
  /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*['"][^'"]{12,}['"]/i,
  /WHATSAPP_ACCESS_TOKEN\s*[:=]\s*['"][^'"]{12,}['"]/i,
  /RAZORPAY_KEY_SECRET\s*[:=]\s*['"][^'"]{8,}['"]/i,
  /sb_secret_[A-Za-z0-9_-]{16,}/,
];

check(
  'Browser and function source contains no hard-coded privileged secrets',
  !exposedSecretPatterns.some((pattern) => pattern.test(sourceText)),
  'Move privileged credentials to Supabase/Vercel secrets and read them from the runtime environment.',
);

const committedEnvironmentFiles = readdirSync(projectRoot).filter(
  (entry) => entry === '.env' || (entry.startsWith('.env.') && entry !== '.env.example'),
);
check(
  'No private environment file is committed at the project root',
  committedEnvironmentFiles.length === 0,
  `Remove committed environment files: ${committedEnvironmentFiles.join(', ') || 'unknown'}.`,
);

for (const name of passes) console.log(`✓ ${name}`);

if (failures.length > 0) {
  console.error(`\nBusiness safety audit failed (${failures.length} check${failures.length === 1 ? '' : 's'}):`);
  for (const failure of failures) {
    console.error(`\n✗ ${failure.name}`);
    if (failure.details) console.error(`  ${failure.details}`);
  }
  process.exitCode = 1;
} else {
  console.log(`\nBusiness safety audit passed (${passes.length} checks).`);
}
