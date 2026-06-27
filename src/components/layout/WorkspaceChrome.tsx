import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  AlertTriangle,
  Bell,
  CalendarCheck,
  ChefHat,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Flame,
  History,
  Inbox,
  LayoutDashboard,
  LogOut,
  Package,
  QrCode,
  Receipt,
  CreditCard,
  Settings2,
  ShoppingCart,
  Trash2,
  Truck,
  Users,
  UtensilsCrossed,
  WalletCards,
  Sparkles,
  ShieldCheck,
  Store,
  Smartphone,
  Menu,
  X,
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
  group: 'Main' | 'Operations' | 'Sales' | 'Stock' | 'Reports' | 'Admin';
}

interface PageMeta {
  title: string;
  eyebrow: string;
  description: string;
  accent: string;
}

const PAGE_META: Array<{ match: RegExp; meta: PageMeta }> = [
  // CHANGE 1: admin-dashboard entry removed so no header card renders for that route
  { match: /^\/billing/, meta: { title: 'Fast Billing Counter', eyebrow: 'POS desk', description: 'Rush-hour friendly billing workspace with visible orders, payments, totals, credit and quick settlement tools.', accent: 'Orders • Payments • Print' } },
  { match: /^\/order-pad/, meta: { title: 'Order Pad', eyebrow: 'Service counter', description: 'Take dine-in, takeaway and table orders quickly with cleaner order entry and dispatch tracking.', accent: 'Menu • Cart • Tables' } },
  { match: /^\/kitchen/, meta: { title: 'Kitchen', eyebrow: 'Production screen', description: 'A high-contrast preparation board for chefs to see urgent, cooking and ready orders clearly.', accent: 'Prepare • Ready • Waste' } },
  { match: /^\/owner/, meta: { title: 'Executive Business Dashboard', eyebrow: 'Owner cockpit', description: 'Complete owner visibility for sales, profit, credit, store purchases, branch stock, closure status, alerts and business performance.', accent: 'Sales • Profit • Stock' } },
  { match: /^\/menu-management/, meta: { title: 'Cafe Menu Studio', eyebrow: 'Menu control', description: 'Manage menu items, pricing, images and availability without clutter.', accent: 'Items • Prices • Availability' } },
  { match: /^\/sales-report/, meta: { title: 'Sales Reports', eyebrow: 'Analytics', description: 'Readable reports with date filters, branch totals, payment mix and export-ready tables.', accent: 'Filters • Totals • Export' } },
  { match: /^\/staff-management/, meta: { title: 'Staff Management', eyebrow: 'People admin', description: 'Create, update and manage staff access with clear roles and clean account controls.', accent: 'Users • Roles • Access' } },
  { match: /^\/attendance-salary/, meta: { title: 'Attendance & Salary', eyebrow: 'HR operations', description: 'Attendance, salary, advances and payroll records organized for admin review.', accent: 'Attendance • Salary • Advance' } },
  { match: /^\/order-history/, meta: { title: 'Order History', eyebrow: 'Past orders', description: 'Search, inspect and audit completed orders from billing, kitchen and admin workflows.', accent: 'History • Search • Receipts' } },
  { match: /^\/daily-closure/, meta: { title: 'Cashier Counter Open & Closure', eyebrow: 'Counter handover', description: 'Open and close the cashier counter with payment-wise collection, credit, advance and cash difference.', accent: 'Open • Count • Close' } },
  { match: /^\/qr-menu/, meta: { title: 'QR Menu Manager', eyebrow: 'Digital menu', description: 'Generate and manage QR menu access for modern table ordering.', accent: 'QR • Tables • Share' } },
  { match: /^\/bakery\/store/, meta: { title: 'Store Dashboard', eyebrow: 'Store room', description: 'Stock, purchase orders, invoices, custom requirements and bakery reports in a store-first layout.', accent: 'Stock • PO • Invoice' } },
  { match: /^\/bakery\/baker/, meta: { title: 'Baker Dashboard', eyebrow: 'Baking team', description: 'Active baking orders, completed work and daily closure in one clean workspace.', accent: 'Orders • Completed • Closure' } },
  { match: /^\/bakery\/packing/, meta: { title: 'Packing Dashboard', eyebrow: 'Packing desk', description: 'Pack active baker orders, review dispatched orders, and close the packing day.', accent: 'Pack • Dispatch • Closure' } },
  { match: /^\/bakery\/receive/, meta: { title: 'Order Receiver', eyebrow: 'Branch demand', description: 'Place requirements, review order history and receive discrepancy notifications.', accent: 'Order • History • Alerts' } },
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
        { label: 'Online Orders', path: '/admin-dashboard?tab=public-orders', icon: <Smartphone className="size-4" />, group: 'Main' },
        { label: 'Dashboard Overview', path: '/admin-dashboard?tab=overview', icon: <LayoutDashboard className="size-4" />, group: 'Main' },
        { label: 'Cafe Control', path: '/admin-dashboard?tab=cafe', icon: <Store className="size-4" />, group: 'Main' },
        { label: 'Branch Sales', path: '/admin-dashboard?tab=branches', icon: <BarChart3 className="size-4" />, group: 'Main' },
        { label: 'Items', path: '/bakery/items', icon: <Package className="size-4" />, group: 'Operations' },
        { label: 'Daily Closure', path: '/admin-dashboard?tab=daily-closure', icon: <WalletCards className="size-4" />, group: 'Operations' },
        { label: 'Credit Pending', path: '/admin-dashboard?tab=credits', icon: <CreditCard className="size-4" />, group: 'Operations' },
        { label: 'Advance Orders', path: '/admin-dashboard?tab=advance', icon: <ClipboardList className="size-4" />, group: 'Operations' },
        { label: 'Stock Disputes', path: '/admin-dashboard?tab=stock-disputes', icon: <AlertTriangle className="size-4" />, group: 'Stock' },
        { label: 'Stock Variance', path: '/admin-dashboard?tab=stock-variance', icon: <ClipboardCheck className="size-4" />, group: 'Stock' },
        { label: 'Waste & Loss', path: '/admin-dashboard?tab=waste', icon: <Trash2 className="size-4" />, group: 'Stock' },
        { label: 'Invoices', path: '/admin-dashboard?tab=invoices', icon: <Receipt className="size-4" />, group: 'Reports' },
        { label: 'Audit Logs', path: '/admin-dashboard?tab=audit', icon: <ShieldCheck className="size-4" />, group: 'Reports' },
        { label: 'Alerts', path: '/admin-dashboard?tab=alerts', icon: <Bell className="size-4" />, group: 'Reports' },
        { label: 'Complaints', path: '/admin-dashboard?tab=complaints', icon: <FileText className="size-4" />, group: 'Reports' },
        { label: 'Attendance & Payroll', path: '/admin-dashboard?tab=attendance', icon: <CalendarCheck className="size-4" />, group: 'Admin' },
        { label: 'Staff Management', path: '/staff-management', icon: <Users className="size-4" />, group: 'Admin' },
        { label: 'QR Table Codes', path: '/qr-menu', icon: <QrCode className="size-4" />, group: 'Admin' },
      ];
    case 'owner':
      return [
        { label: 'Branch Overview', path: '/owner?tab=branches', icon: <Store className="size-4" />, group: 'Main' },
        { label: 'Sales & Profit', path: '/owner?tab=sales', icon: <BarChart3 className="size-4" />, group: 'Reports' },
        { label: 'Credit Tracking', path: '/owner?tab=credit', icon: <CreditCard className="size-4" />, group: 'Reports' },
        { label: 'Store Purchases', path: '/owner?tab=purchases', icon: <ShoppingCart className="size-4" />, group: 'Operations' },
        { label: 'Daily Closure', path: '/owner?tab=closure', icon: <WalletCards className="size-4" />, group: 'Reports' },
        { label: 'Stock Variance', path: '/owner?tab=variance', icon: <AlertTriangle className="size-4" />, group: 'Reports' },
        { label: 'Owner Alerts', path: '/owner?tab=alerts', icon: <Bell className="size-4" />, group: 'Reports' },
        { label: 'Complaints', path: '/owner?tab=complaints', icon: <Bell className="size-4" />, group: 'Reports' },
        { label: 'Audit Logs', path: '/owner?tab=audit', icon: <ShieldCheck className="size-4" />, group: 'Reports' },
        { label: 'Staff & Payroll', path: '/owner?tab=attendance', icon: <CalendarCheck className="size-4" />, group: 'Admin' },
        { label: 'Waste & Loss', path: '/owner?tab=waste', icon: <Trash2 className="size-4" />, group: 'Reports' },
      ];
    case 'billing':
      return [
        { label: 'Billing', path: '/billing', icon: <Receipt className="size-4" />, group: 'Main' },
        { label: 'History', path: '/order-history', icon: <History className="size-4" />, group: 'Reports' },
        { label: 'Cashier Counter', path: '/daily-closure', icon: <WalletCards className="size-4" />, group: 'Reports' },
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
      return [
        { label: 'Orders', path: '/bakery/store', icon: <Package className="size-4" />, group: 'Main' },
        { label: 'History', path: '/bakery/store?tab=history', icon: <History className="size-4" />, group: 'Main' },
        { label: 'Inventory', path: '/bakery/store?tab=inventory', icon: <Store className="size-4" />, group: 'Operations' },
        { label: 'Suppliers', path: '/bakery/store?tab=suppliers', icon: <Users className="size-4" />, group: 'Operations' },
        { label: 'Invoices', path: '/bakery/store?tab=invoices', icon: <FileText className="size-4" />, group: 'Operations' },
        { label: 'Analytics', path: '/bakery/store?tab=analytics', icon: <BarChart3 className="size-4" />, group: 'Reports' },
        { label: 'Custom Deduction', path: '/bakery/store?tab=custom', icon: <Sparkles className="size-4" />, group: 'Reports' },
        { label: 'Daily Closure', path: '/bakery/store?tab=closure', icon: <WalletCards className="size-4" />, group: 'Reports' },
        { label: 'Reports', path: '/bakery/store?tab=report', icon: <ClipboardList className="size-4" />, group: 'Reports' },
        { label: 'Recipes', path: '/bakery/store?tab=recipes', icon: <ChefHat className="size-4" />, group: 'Admin' },
      ];
    case 'baker':
      return [
        { label: 'Orders', path: '/bakery/baker', icon: <Flame className="size-4" />, group: 'Main' },
        { label: 'Completed', path: '/bakery/baker?tab=completed', icon: <CheckCircle2 className="size-4" />, group: 'Main' },
        { label: 'Daily Closure', path: '/bakery/baker?tab=closure', icon: <BarChart3 className="size-4" />, group: 'Reports' },
      ];
    case 'packing':
      return [
        { label: 'Packing Orders / Transfer Out', path: '/bakery/packing', icon: <Package className="size-4" />, group: 'Main' },
        { label: 'Transfer In', path: '/bakery/packing?tab=transfer-in', icon: <Truck className="size-4" />, group: 'Main' },
        { label: 'Billing', path: '/bakery/packing?tab=billing', icon: <ShoppingCart className="size-4" />, group: 'Sales' },
        { label: 'Leftover Items', path: '/bakery/packing?tab=leftover', icon: <AlertTriangle className="size-4" />, group: 'Stock' },
        { label: 'Dispatched', path: '/bakery/packing?tab=dispatched', icon: <Truck className="size-4" />, group: 'Stock' },
        { label: 'Daily Closure', path: '/bakery/packing?tab=closure', icon: <ClipboardList className="size-4" />, group: 'Reports' },
      ];
    case 'receiver_vrsnb':
      return [
        { label: 'VRSNB Order', path: '/bakery/receive/vrsnb', icon: <Inbox className="size-4" />, group: 'Main' },
        { label: 'History', path: '/bakery/receive/vrsnb?tab=history', icon: <History className="size-4" />, group: 'Main' },
        { label: 'Alert', path: '/bakery/receive/vrsnb?tab=alerts', icon: <Bell className="size-4" />, group: 'Main' },
        { label: 'Stock / Incoming', path: '/bakery/receive/vrsnb?tab=stock', icon: <Package className="size-4" />, group: 'Operations' },
        { label: 'Stock Count', path: '/bakery/receive/vrsnb?tab=stock-count', icon: <ClipboardCheck className="size-4" />, group: 'Operations' },
      ];
    case 'receiver_snb':
      return [
        { label: 'SNB Order', path: '/bakery/receive/snb', icon: <Inbox className="size-4" />, group: 'Main' },
        { label: 'History', path: '/bakery/receive/snb?tab=history', icon: <History className="size-4" />, group: 'Main' },
        { label: 'Alert', path: '/bakery/receive/snb?tab=alerts', icon: <Bell className="size-4" />, group: 'Main' },
        { label: 'Stock / Incoming', path: '/bakery/receive/snb?tab=stock', icon: <Package className="size-4" />, group: 'Operations' },
        { label: 'Purchase Order', path: '/bakery/receive/snb?tab=po', icon: <ShoppingCart className="size-4" />, group: 'Operations' },
        { label: 'Stock Count', path: '/bakery/receive/snb?tab=stock-count', icon: <ClipboardCheck className="size-4" />, group: 'Operations' },
      ];
    case 'branch_vrsnb':
      return [
        { label: 'New Bill', path: '/branch/vrsnb', icon: <Receipt className="size-4" />, group: 'Main' },
        { label: 'Advance Orders', path: '/branch/vrsnb?tab=advance', icon: <FileText className="size-4" />, group: 'Main' },
        { label: 'Alerts', path: '/branch/vrsnb?tab=alerts', icon: <Bell className="size-4" />, group: 'Main' },
        { label: 'Returns', path: '/branch/vrsnb?tab=returns', icon: <Trash2 className="size-4" />, group: 'Operations' },
        { label: 'Bill History', path: '/branch/vrsnb?tab=history', icon: <History className="size-4" />, group: 'Reports' },
        { label: 'Cashier Closure', path: '/branch/vrsnb?tab=closure', icon: <WalletCards className="size-4" />, group: 'Reports' },
      ];
    case 'branch_snb':
      return [
        { label: 'New Bill', path: '/branch/snb', icon: <Receipt className="size-4" />, group: 'Main' },
        { label: 'Advance Orders', path: '/branch/snb?tab=advance', icon: <FileText className="size-4" />, group: 'Main' },
        { label: 'Returns', path: '/branch/snb?tab=returns', icon: <Trash2 className="size-4" />, group: 'Operations' },
        { label: 'Bill History', path: '/branch/snb?tab=history', icon: <History className="size-4" />, group: 'Reports' },
        { label: 'Cashier Closure', path: '/branch/snb?tab=closure', icon: <WalletCards className="size-4" />, group: 'Reports' },
        { label: 'Alerts', path: '/branch/snb?tab=alerts', icon: <Bell className="size-4" />, group: 'Reports' },
      ];
    case 'branch_hosur':
      return [
        { label: 'Shop Master', path: '/branch/hosur?tab=shops', icon: <Store className="size-4" />, group: 'Main' },
        { label: 'New Order', path: '/branch/hosur?tab=newOrder', icon: <ShoppingCart className="size-4" />, group: 'Main' },
        { label: 'Received From Packing', path: '/branch/hosur?tab=receiving', icon: <Package className="size-4" />, group: 'Main' },
        { label: 'Billing', path: '/branch/hosur?tab=billing', icon: <Receipt className="size-4" />, group: 'Main' },
        { label: 'Credit Ledger', path: '/branch/hosur?tab=credit', icon: <CreditCard className="size-4" />, group: 'Operations' },
        { label: 'Payment Collection', path: '/branch/hosur?tab=collection', icon: <WalletCards className="size-4" />, group: 'Operations' },
        { label: 'WhatsApp Logs', path: '/branch/hosur?tab=whatsapp', icon: <QrCode className="size-4" />, group: 'Operations' },
        { label: 'Reminder History', path: '/branch/hosur?tab=reminders', icon: <Bell className="size-4" />, group: 'Operations' },
        { label: 'Daily Closure', path: '/branch/hosur?tab=closure', icon: <ClipboardCheck className="size-4" />, group: 'Reports' },
        { label: 'Reports', path: '/branch/hosur?tab=reports', icon: <BarChart3 className="size-4" />, group: 'Reports' },
        { label: 'Notifications', path: '/branch/hosur?tab=notifications', icon: <Bell className="size-4" />, group: 'Reports' },
      ];
    case 'admin_vrsnb':
      return [
        { label: 'Dashboard Overview', path: '/admin-vrsnb?tab=overview', icon: <LayoutDashboard className="size-4" />, group: 'Main' },
        { label: 'Sales & Returns', path: '/admin-vrsnb?tab=sales', icon: <Receipt className="size-4" />, group: 'Main' },
        { label: 'Low Stock / Stock', path: '/admin-vrsnb?tab=stock', icon: <Package className="size-4" />, group: 'Operations' },
        { label: 'Expenses', path: '/admin-vrsnb?tab=expenses', icon: <WalletCards className="size-4" />, group: 'Operations' },
        { label: 'Complaints', path: '/admin-vrsnb?tab=complaints', icon: <Bell className="size-4" />, group: 'Reports' },
        { label: 'Waste Logs', path: '/admin-vrsnb?tab=waste', icon: <Trash2 className="size-4" />, group: 'Reports' },
        { label: 'Quotations', path: '/admin-vrsnb?tab=quotations', icon: <FileText className="size-4" />, group: 'Operations' },
        { label: 'Credit', path: '/admin-vrsnb?tab=credit', icon: <CreditCard className="size-4" />, group: 'Reports' },
        { label: 'Cashier Report', path: '/admin-vrsnb?tab=cashier-report', icon: <BarChart3 className="size-4" />, group: 'Reports' },
        { label: 'Cashier Closure', path: '/admin-vrsnb?tab=cashier-closure', icon: <WalletCards className="size-4" />, group: 'Reports' },
        { label: 'Daily Closure Report', path: '/admin-vrsnb?tab=closure', icon: <WalletCards className="size-4" />, group: 'Reports' },
        { label: 'Branch Reports', path: '/admin-vrsnb?tab=reports', icon: <BarChart3 className="size-4" />, group: 'Reports' },
        { label: 'Stock Audit', path: '/admin-vrsnb?tab=audit-stock', icon: <ClipboardCheck className="size-4" />, group: 'Reports' },
        { label: 'Admin Notifications', path: '/admin-vrsnb?tab=notifications', icon: <Bell className="size-4" />, group: 'Reports' },
        { label: 'Items', path: '/admin-vrsnb/items', icon: <Settings2 className="size-4" />, group: 'Admin' },
      ];
    case 'admin_snb':
      return [
        { label: 'Dashboard Overview', path: '/admin-snb?tab=overview', icon: <LayoutDashboard className="size-4" />, group: 'Main' },
        { label: 'Sales & Returns', path: '/admin-snb?tab=sales', icon: <Receipt className="size-4" />, group: 'Main' },
        { label: 'Low Stock / Stock', path: '/admin-snb?tab=stock', icon: <Package className="size-4" />, group: 'Operations' },
        { label: 'Suppliers', path: '/admin-snb?tab=suppliers', icon: <Truck className="size-4" />, group: 'Operations' },
        { label: 'Expenses', path: '/admin-snb?tab=expenses', icon: <WalletCards className="size-4" />, group: 'Operations' },
        { label: 'Complaints', path: '/admin-snb?tab=complaints', icon: <Bell className="size-4" />, group: 'Reports' },
        { label: 'Waste Logs', path: '/admin-snb?tab=waste', icon: <Trash2 className="size-4" />, group: 'Reports' },
        { label: 'Quotations', path: '/admin-snb?tab=quotations', icon: <FileText className="size-4" />, group: 'Operations' },
        { label: 'Credit', path: '/admin-snb?tab=credit', icon: <CreditCard className="size-4" />, group: 'Reports' },
        { label: 'Purchase Invoices', path: '/admin-snb?tab=invoices', icon: <ShoppingCart className="size-4" />, group: 'Operations' },
        { label: 'Supplier Payments', path: '/admin-snb?tab=payments', icon: <WalletCards className="size-4" />, group: 'Operations' },
        { label: 'Bank Deposits', path: '/admin-snb?tab=bank', icon: <ShieldCheck className="size-4" />, group: 'Operations' },
        { label: 'Current Cash', path: '/admin-snb?tab=current-cash', icon: <WalletCards className="size-4" />, group: 'Reports' },
        { label: 'Salesperson Management', path: '/admin-snb?tab=salespersons', icon: <Users className="size-4" />, group: 'Admin' },
        { label: 'Salesperson Report', path: '/admin-snb?tab=salesperson-report', icon: <BarChart3 className="size-4" />, group: 'Reports' },
        { label: 'Cashier Report', path: '/admin-snb?tab=cashier-report', icon: <BarChart3 className="size-4" />, group: 'Reports' },
        { label: 'Cashier Closure', path: '/admin-snb?tab=cashier-closure', icon: <WalletCards className="size-4" />, group: 'Reports' },
        { label: 'Daily Closure Report', path: '/admin-snb?tab=closure', icon: <WalletCards className="size-4" />, group: 'Reports' },
        { label: 'Branch Reports', path: '/admin-snb?tab=reports', icon: <FileText className="size-4" />, group: 'Reports' },
        { label: 'Stock Audit', path: '/admin-snb?tab=audit-stock', icon: <ClipboardCheck className="size-4" />, group: 'Reports' },
        { label: 'Admin Notifications', path: '/admin-snb?tab=notifications', icon: <Bell className="size-4" />, group: 'Reports' },
        { label: 'Items', path: '/admin-snb/items', icon: <Settings2 className="size-4" />, group: 'Admin' },
      ];
    default:
      return [];
  }
}

function routeMeta(pathname: string): PageMeta {
  return PAGE_META.find((item) => item.match.test(pathname))?.meta ?? DEFAULT_META;
}

export default function WorkspaceChrome({ children }: WorkspaceChromeProps) {
  const { currentUser, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const meta = routeMeta(location.pathname);
  const isBillingFullscreen = /^\/branch\/(snb|vrsnb)/.test(location.pathname) && (!location.search || !location.search.includes('tab=') || location.search.includes('tab=billing'));
  const isBranchBillingRoute = /^\/branch\/(snb|vrsnb)/.test(location.pathname);
  // CHANGE 1: also hide workspace hero for /admin-dashboard
  const hideWorkspaceHero = /^\/(order-pad|kitchen|billing)/.test(location.pathname)
    || /^\/(daily-closure|order-history)/.test(location.pathname)
    || /^\/bakery\/(store|baker|packing|receive)/.test(location.pathname)
    || /^\/branch\//.test(location.pathname)
    || /^\/admin-dashboard/.test(location.pathname)
    || /^\/admin-(snb|vrsnb)/.test(location.pathname)
    || /^\/owner/.test(location.pathname)
    || (currentUser?.role === 'kitchen' && /^\/order-history/.test(location.pathname));
  const items = useMemo(() => navForRole(currentUser?.role), [currentUser?.role]);
  const groups = useMemo(() => {
    const names: NavItem['group'][] = ['Main', 'Operations', 'Sales', 'Stock', 'Reports', 'Admin'];
    return names.map((name) => ({ name, items: items.filter((item) => item.group === name) })).filter((group) => group.items.length > 0);
  }, [items]);

  const goTo = (path: string) => {
    navigate(path);
    setMobileNavOpen(false);
  };


  const exitDashboard = () => {
    setMobileNavOpen(false);
    logout();
    window.location.replace('/login');
  };

  const renderNavGroups = (mobile = false) => groups.map((group) => (
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
              onClick={() => goTo(item.path)}
              className={cn('workspace-nav-item', mobile && 'min-h-12', active && 'workspace-nav-item-active')}
            >
              <span className="workspace-nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  ));

  return (
    <div className={cn('workspace-redesign min-h-[100dvh] bg-[hsl(var(--background))]', isBranchBillingRoute && 'workspace-branch-billing')}>
      {items.length > 0 && !isBranchBillingRoute && (
        <>
          <button
            type="button"
            aria-label="Open dashboard menu"
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen(true)}
            className="workspace-mobile-menu-button md:hidden"
          >
            <Menu className="size-5" />
            <span>Menu</span>
          </button>

          {mobileNavOpen && (
            <div className="workspace-mobile-nav-layer md:hidden" role="dialog" aria-modal="true" aria-label="Dashboard navigation">
              <button type="button" className="workspace-mobile-nav-backdrop" aria-label="Close dashboard menu" onClick={() => setMobileNavOpen(false)} />
              <aside className="workspace-mobile-drawer">
                <div className="workspace-mobile-drawer-head">
                  <div className="workspace-brand-card">
                    <div className="workspace-brand-mark"><Sparkles className="size-5" /></div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.28em] text-white/45">Aadvikam</p>
                      <h2 className="font-display text-2xl font-black leading-none text-white">Cafe OS</h2>
                    </div>
                  </div>
                  <button type="button" aria-label="Close dashboard menu" onClick={() => setMobileNavOpen(false)} className="workspace-mobile-close">
                    <X className="size-5" />
                  </button>
                </div>
                <nav className="workspace-nav-scroll workspace-mobile-nav-scroll">{renderNavGroups(true)}</nav>
                <div className="workspace-sidebar-footer workspace-sidebar-footer-with-exit">
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <ShieldCheck className="size-4 shrink-0 text-emerald-300" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-white">{currentUser?.displayName || currentUser?.username || 'Staff'}</p>
                      <p className="truncate text-[11px] text-white/45 capitalize">{currentUser?.role?.replace(/_/g, ' ') || 'Role based access active'}</p>
                    </div>
                  </div>
                  <button type="button" onClick={exitDashboard} className="workspace-exit-button" aria-label="Exit dashboard" title="Exit dashboard">
                    <LogOut className="size-4" /><span>Exit</span>
                  </button>
                </div>
              </aside>
            </div>
          )}
        </>
      )}

      <aside className={isBranchBillingRoute ? "hidden" : "workspace-sidebar hidden md:flex"}>
        <div className="workspace-brand-card">
          <div className="workspace-brand-mark"><Sparkles className="size-5" /></div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-white/45">Aadvikam</p>
            <h2 className="font-display text-2xl font-black leading-none text-white">Cafe OS</h2>
          </div>
        </div>

        <nav className="workspace-nav-scroll">{renderNavGroups()}</nav>

        <div className="workspace-sidebar-footer workspace-sidebar-footer-with-exit">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <ShieldCheck className="size-4 shrink-0 text-emerald-300" />
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-white">{currentUser?.displayName || currentUser?.username || 'Staff'}</p>
              <p className="truncate text-[11px] text-white/45 capitalize">{currentUser?.role?.replace(/_/g, ' ') || 'Role based access active'}</p>
            </div>
          </div>
          <button type="button" onClick={exitDashboard} className="workspace-exit-button" aria-label="Exit dashboard" title="Exit dashboard">
            <LogOut className="size-4" /><span>Exit</span>
          </button>
        </div>
      </aside>

      <div className={isBranchBillingRoute ? "flex h-full min-h-0 w-full flex-col overflow-hidden" : "workspace-main-shell"}>
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

        <div className={cn('workspace-content-frame', isBranchBillingRoute && 'branch-billing-content-frame min-h-0 flex-1 overflow-hidden')}>
          {children}
        </div>
      </div>
    </div>
  );
}
