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
const hosurDashboard = read('src/pages/HosurDashboard.tsx') ?? '';
const branchBusinessModules = read('src/branch/tabs/BranchBusinessModules.tsx') ?? '';
const adminSnb = read('src/pages/AdminSNBDashboard.tsx') ?? '';
const adminVrsnb = read('src/pages/AdminVRSNBDashboard.tsx') ?? '';
const bakeryOrderPage = read('src/pages/BakeryOrderPage.tsx') ?? '';
const branchCatalogStore = read('src/stores/branchCatalogStore.ts') ?? '';
const recipeStore = read('src/bakery/recipeStore.ts') ?? '';
const storeDashboard = read('src/bakery/StoreDashboard.tsx') ?? '';
const razorpayFunction = read('supabase/functions/create-razorpay-order/index.ts') ?? '';
const unifiedMigration = read('supabase/migrations/20260627190000_unified_branch_catalog_and_live_recipes.sql') ?? '';
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
