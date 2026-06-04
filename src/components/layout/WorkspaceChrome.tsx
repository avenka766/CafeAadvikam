import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  CalendarCheck,
  ChefHat,
  ClipboardList,
  FileText,
  Flame,
  History,
  Inbox,
  LayoutDashboard,
  Package,
  QrCode,
  Receipt,
  Settings2,
  ShoppingCart,
  Store,
  Trash2,
  Users,
  UtensilsCrossed,
  WalletCards,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';

interface WorkspaceChromeProps {
  children: React.ReactNode;
}

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  group: 'Main' | 'Operations' | 'Reports' | 'Admin';
}

interface PageMeta {
  title: string;
  eyebrow: string;
  description: string;
  accent: string;
}

const PAGE_META: Array<{ match: RegExp; meta: PageMeta }> = [
  { match: /^\/admin-dashboard/, meta: { title: 'Admin Command Center', eyebrow: 'Owner operations', description: 'Sales, cash, UPI, card, purchases, stock, staff activity and pending actions in one clean view.', accent: 'Sales • Stock • Reports' } },
  { match: /^\/billing/, meta: { title: 'Fast Billing Counter', eyebrow: 'POS desk', description: 'Rush-hour friendly billing workspace with visible orders, payments, totals, credit and quick settlement tools.', accent: 'Orders • Payments • Print' } },
  { match: /^\/order-pad/, meta: { title: 'Order Pad', eyebrow: 'Service counter', description: 'Take dine-in, takeaway and table orders quickly with cleaner order entry and dispatch tracking.', accent: 'Menu • Cart • Tables' } },
  { match: /^\/kitchen/, meta: { title: 'Kitchen', eyebrow: 'Production screen', description: 'A high-contrast preparation board for chefs to see urgent, cooking and ready orders clearly.', accent: 'Prepare • Ready • Waste' } },
  { match: /^\/owner/, meta: { title: 'Executive Business Dashboard', eyebrow: 'Owner cockpit', description: 'Complete owner visibility for sales, profit, credit, store purchases, branch stock, closure status, alerts and business performance.', accent: 'Sales • Profit • Stock' } },
  { match: /^\/menu-management/, meta: { title: 'Cafe Menu Studio', eyebrow: 'Menu control', description: 'Manage menu items, pricing, images and availability without clutter.', accent: 'Items • Prices • Availability' } },
  { match: /^\/sales-report/, meta: { title: 'Sales Reports', eyebrow: 'Analytics', description: 'Readable reports with date filters, branch totals, payment mix and export-ready tables.', accent: 'Filters • Totals • Export' } },
  { match: /^\/staff-management/, meta: { title: 'Staff Management', eyebrow: 'People admin', description: 'Create, update and manage staff access with clear roles and clean account controls.', accent: 'Users • Roles • Access' } },
  { match: /^\/attendance-salary/, meta: { title: 'Attendance & Salary', eyebrow: 'HR operations', description: 'Attendance, salary, advances and payroll records organized for admin review.', accent: 'Attendance • Salary • Advance' } },
  { match: /^\/order-history/, meta: { title: 'Order History', eyebrow: 'Past orders', description: 'Search, inspect and audit completed orders from billing, kitchen and admin workflows.', accent: 'History • Search • Receipts' } },
  { match: /^\/daily-closure/, meta: { title: 'Daily Closure', eyebrow: 'Counter handover', description: 'Close the day with payment-wise collection, total sales, credit, advance and cashier summaries.', accent: 'Cash • UPI • Card' } },
  { match: /^\/qr-menu/, meta: { title: 'QR Menu Manager', eyebrow: 'Digital menu', description: 'Generate and manage QR menu access for modern table ordering.', accent: 'QR • Tables • Share' } },
  { match: /^\/bakery\/store/, meta: { title: 'Store Dashboard', eyebrow: 'Store room', description: 'Stock, purchase orders, invoices, custom requirements and bakery reports in a store-first layout.', accent: 'Stock • PO • Invoice' } },
  { match: /^\/bakery\/baker/, meta: { title: 'Baker Production Board', eyebrow: 'Baking team', description: 'A production-first dashboard for accepted orders, recipe quantities and batch preparation.', accent: 'Recipes • Batches • Dispatch' } },
  { match: /^\/bakery\/packing/, meta: { title: 'Packing & Dispatch', eyebrow: 'Packing desk', description: 'Pack orders branch-wise, record shortages/excess, and dispatch items with fewer mistakes.', accent: 'Pack • Check • Dispatch' } },
  { match: /^\/bakery\/receive/, meta: { title: 'Branch Order Receiver', eyebrow: 'Branch demand', description: 'Place bakery requirements, review order history and receive discrepancy notifications.', accent: 'Order • History • Alerts' } },
  { match: /^\/bakery\/items/, meta: { title: 'Item Master Studio', eyebrow: 'Master data', description: 'Cafe and bakery item management with clearer category, price and availability controls.', accent: 'Cafe • Bakery • Recipes' } },
  { match: /^\/bakery\/recipes/, meta: { title: 'Recipe Management', eyebrow: 'Production data', description: 'Recipe ingredients, output quantities and bakery item formulas in a readable editing surface.', accent: 'Ingredients • Output • Costing' } },
  { match: /^\/branch\/vrsnb/, meta: { title: 'VRSNB Branch Dashboard', eyebrow: 'Branch POS', description: 'VRSNB branch billing, credit, stock and cashier closure redesigned for counter speed.', accent: 'Billing • Credit • Stock' } },
  { match: /^\/branch\/snb/, meta: { title: 'SNB Branch Dashboard', eyebrow: 'Branch POS', description: 'SNB branch sales, cashier closure and stock operations in a cleaner workflow.', accent: 'Sales • Stock • Cash' } },
  { match: /^\/branch\/hosur/, meta: { title: 'Hosur Branch', eyebrow: 'Branch operations', description: 'Shop-wise ordering, receiving, billing, credit, WhatsApp reminders and reports for Hosur city supply workflow.', accent: 'Shops • Credit • WhatsApp' } },
  { match: /^\/admin-vrsnb/, meta: { title: 'VRSNB Admin Dashboard', eyebrow: 'Branch admin', description: 'VRSNB purchase, reports, stock and payment oversight with premium dashboard navigation.', accent: 'PO • Reports • Stock' } },
  { match: /^\/admin-snb/, meta: { title: 'SNB Admin Dashboard', eyebrow: 'Branch admin', description: 'SNB purchase, cashier closure, salesperson reports and bank/cash oversight in one place.', accent: 'Cash • Bank • Purchase' } },
  { match: /^\/admin\/invoices/, meta: { title: 'Invoice Review Desk', eyebrow: 'Finance', description: 'Review submitted invoices, supplier bills and pending finance actions with clean status cards.', accent: 'Invoices • Review • Approve' } },
  { match: /^\/admin\/alerts/, meta: { title: 'Admin Alerts Center', eyebrow: 'Notifications', description: 'Credit, discrepancy and operational alerts organized for fast follow-up.', accent: 'Alerts • Credit • Exceptions' } },
  { match: /^\/debug\/incoming/, meta: { title: 'Incoming Debug Monitor', eyebrow: 'Developer utility', description: 'Operational debug page for incoming bakery records and delivery checks.', accent: 'Debug • Inspect • Validate' } },
];

const DEFAULT_META: PageMeta = {
  title: 'Cafe Aadvikam Workspace',
  eyebrow: 'Premium operations',
  description: 'A clean, fast and practical workspace for cafe, bakery and restaurant billing operations.',
  accent: 'Clean • Fast • Reliable',
};

function navForRole(role?: string): NavItem[] {
  switch (role) {
    case 'admin':
      return [
        { label: 'Dashboard', path: '/admin-dashboard', icon: <LayoutDashboard className="size-4" />, group: 'Main' },
        { label: 'Billing', path: '/billing', icon: <Receipt className="size-4" />, group: 'Operations' },
        { label: 'Orders', path: '/order-history', icon: <History className="size-4" />, group: 'Operations' },
        { label: 'Daily Closure', path: '/daily-closure', icon: <WalletCards className="size-4" />, group: 'Reports' },
        { label: 'Bakery Store', path: '/bakery/store', icon: <Store className="size-4" />, group: 'Operations' },
        { label: 'Packing', path: '/bakery/packing', icon: <Package className="size-4" />, group: 'Operations' },
        { label: 'Items', path: '/bakery/items', icon: <Settings2 className="size-4" />, group: 'Admin' },
        { label: 'Recipes', path: '/bakery/recipes', icon: <ChefHat className="size-4" />, group: 'Admin' },
        { label: 'Reports', path: '/sales-report', icon: <BarChart3 className="size-4" />, group: 'Reports' },
        { label: 'Attendance', path: '/attendance-salary', icon: <CalendarCheck className="size-4" />, group: 'Admin' },
        { label: 'Staff', path: '/staff-management', icon: <Users className="size-4" />, group: 'Admin' },
        { label: 'Invoices', path: '/admin/invoices', icon: <FileText className="size-4" />, group: 'Reports' },
        { label: 'Alerts', path: '/admin/alerts', icon: <Bell className="size-4" />, group: 'Reports' },
        { label: 'QR Menu', path: '/qr-menu', icon: <QrCode className="size-4" />, group: 'Admin' },
      ];
    case 'owner':
      return [
        { label: 'Owner Hub', path: '/owner', icon: <LayoutDashboard className="size-4" />, group: 'Main' },
      ];
    case 'billing':
      return [
        { label: 'Billing', path: '/billing', icon: <Receipt className="size-4" />, group: 'Main' },
        { label: 'History', path: '/order-history', icon: <History className="size-4" />, group: 'Reports' },
        { label: 'Daily Closure', path: '/daily-closure', icon: <WalletCards className="size-4" />, group: 'Reports' },
      ];
    case 'order_taker':
      return [
        { label: 'Order Pad', path: '/order-pad', icon: <ClipboardList className="size-4" />, group: 'Main' },
        { label: 'History', path: '/order-history', icon: <History className="size-4" />, group: 'Reports' },
      ];
    case 'kitchen':
      return [
        { label: 'Kitchen', path: '/kitchen', icon: <UtensilsCrossed className="size-4" />, group: 'Main' },
        { label: 'History', path: '/order-history', icon: <History className="size-4" />, group: 'Reports' },
        { label: 'Waste Log', path: '/kitchen?tab=waste', icon: <Trash2 className="size-4" />, group: 'Reports' },
      ];
    case 'store':
      return [{ label: 'Store', path: '/bakery/store', icon: <Store className="size-4" />, group: 'Main' }];
    case 'baker':
      return [{ label: 'Baker', path: '/bakery/baker', icon: <Flame className="size-4" />, group: 'Main' }];
    case 'packing':
      return [{ label: 'Packing', path: '/bakery/packing', icon: <Package className="size-4" />, group: 'Main' }];
    case 'receiver_vrsnb':
      return [{ label: 'VRSNB Order', path: '/bakery/receive/vrsnb', icon: <Inbox className="size-4" />, group: 'Main' }];
    case 'receiver_snb':
      return [{ label: 'SNB Order', path: '/bakery/receive/snb', icon: <Inbox className="size-4" />, group: 'Main' }];
    case 'receiver_hosur':
      return [{ label: 'Hosur Order', path: '/bakery/receive/hosur', icon: <Inbox className="size-4" />, group: 'Main' }];
    case 'branch_vrsnb':
      return [{ label: 'VRSNB Branch', path: '/branch/vrsnb', icon: <ShoppingCart className="size-4" />, group: 'Main' }];
    case 'branch_snb':
      return [{ label: 'SNB Branch', path: '/branch/snb', icon: <ShoppingCart className="size-4" />, group: 'Main' }];
    case 'branch_hosur':
      return [{ label: 'Hosur Branch', path: '/branch/hosur', icon: <ShoppingCart className="size-4" />, group: 'Main' }];
    case 'admin_vrsnb':
      return [
        { label: 'Dashboard', path: '/admin-vrsnb', icon: <LayoutDashboard className="size-4" />, group: 'Main' },
        { label: 'Items', path: '/admin-vrsnb/items', icon: <Settings2 className="size-4" />, group: 'Admin' },
        { label: 'History', path: '/admin-vrsnb/history', icon: <History className="size-4" />, group: 'Reports' },
        { label: 'Alerts', path: '/admin/alerts', icon: <Bell className="size-4" />, group: 'Reports' },
      ];
    case 'admin_snb':
      return [
        { label: 'Dashboard', path: '/admin-snb', icon: <LayoutDashboard className="size-4" />, group: 'Main' },
        { label: 'Items', path: '/admin-snb/items', icon: <Settings2 className="size-4" />, group: 'Admin' },
        { label: 'History', path: '/admin-snb/history', icon: <History className="size-4" />, group: 'Reports' },
      ];
    default:
      return [];
  }
}

function routeMeta(pathname: string): PageMeta {
  return PAGE_META.find((item) => item.match.test(pathname))?.meta ?? DEFAULT_META;
}

export default function WorkspaceChrome({ children }: WorkspaceChromeProps) {
  const { currentUser } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const meta = routeMeta(location.pathname);
  const hideWorkspaceHero = /^\/(order-pad|kitchen|billing)/.test(location.pathname) || /^\/bakery\/store/.test(location.pathname) || /^\/branch\//.test(location.pathname) || (currentUser?.role === 'kitchen' && /^\/order-history/.test(location.pathname));
  const items = useMemo(() => navForRole(currentUser?.role), [currentUser?.role]);
  const groups = useMemo(() => {
    const names: NavItem['group'][] = ['Main', 'Operations', 'Reports', 'Admin'];
    return names.map((name) => ({ name, items: items.filter((item) => item.group === name) })).filter((group) => group.items.length > 0);
  }, [items]);

  return (
    <div className="workspace-redesign min-h-[100dvh] bg-[hsl(var(--background))]">
      <aside className="workspace-sidebar hidden lg:flex">
        <div className="workspace-brand-card">
          <div className="workspace-brand-mark"><Sparkles className="size-5" /></div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-white/45">Aadvikam</p>
            <h2 className="font-display text-2xl font-black leading-none text-white">Cafe OS</h2>
          </div>
        </div>


        <nav className="workspace-nav-scroll">
          {groups.map((group) => (
            <section key={group.name} className="space-y-2">
              <p className="workspace-nav-group">{group.name}</p>
              <div className="space-y-1.5">
                {group.items.map((item) => {
                  const currentRoute = `${location.pathname}${location.search}`;
                  const isQueryRoute = item.path.includes('?');
                  const active = isQueryRoute
                    ? currentRoute === item.path
                    : (location.pathname === item.path && !location.search) || location.pathname.startsWith(item.path + '/');
                  return (
                    <button
                      key={item.path}
                      type="button"
                      onClick={() => navigate(item.path)}
                      className={cn('workspace-nav-item', active && 'workspace-nav-item-active')}
                    >
                      <span className="workspace-nav-icon">{item.icon}</span>
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>

        <div className="workspace-sidebar-footer">
          <ShieldCheck className="size-4 text-emerald-300" />
          <div>
            <p className="text-xs font-bold text-white">Protected workspace</p>
            <p className="text-[11px] text-white/45">Role based access active</p>
          </div>
        </div>
      </aside>

      <div className="workspace-main-shell">
        {!hideWorkspaceHero && (
          <section className="workspace-hero">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="workspace-eyebrow">{meta.eyebrow}</span>
                <span className="workspace-live-pill"><span /> Live dashboard</span>
              </div>
              <div>
                <h1>{meta.title}</h1>
                <p>{meta.description}</p>
              </div>
            </div>
            <div className="workspace-hero-card">
              <WalletCards className="size-5" />
              <div>
                <span>{meta.accent}</span>
                <strong>{currentUser?.displayName || currentUser?.username || 'Staff'}</strong>
              </div>
            </div>
          </section>
        )}

        <div className="workspace-content-frame">
          {children}
        </div>
      </div>
    </div>
  );
}
