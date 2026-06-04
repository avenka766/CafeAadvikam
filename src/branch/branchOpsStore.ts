import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Branch } from "./types";

type PayMode = "cash" | "upi" | "card" | "split" | "bank" | "credit";
type PoStatus =
  | "Draft"
  | "Approved"
  | "Ordered"
  | "Received"
  | "Partially Received"
  | "Closed"
  | "Rejected"
  | "Cancelled";
type StoreOrderStatus =
  | "Pending Store Confirmation"
  | "Confirmed"
  | "Rejected"
  | "Ready"
  | "Delivered";

export interface BranchBillItem {
  itemName: string;
  quantity: number;
  unit: "pcs" | "kg";
  price: number;
  tax: number;
  discount: number;
  lineTotal: number;
}

export interface BranchBillRecord {
  id: string;
  branch: Branch;
  billNo: string;
  invoiceNo: number;
  items: BranchBillItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  tendered: number;
  balance: number;
  paymentMode: PayMode;
  split?: { cash?: number; upi?: number; card?: number };
  salesperson: string;
  biller: string;
  createdAt: string;
  printCount: number;
  status: "Original Bill" | "Duplicate Bill" | "Returned";
  creditCustomerName?: string;
  creditCustomerMobile?: string;
  creditDueDate?: string;
  creditRemarks?: string;
}

export interface BranchCreditPayment {
  id: string;
  amount: number;
  mode: "cash" | "upi" | "card" | "bank";
  reference: string;
  remarks: string;
  collectedBy: string;
  createdAt: string;
}

export interface BranchCreditSale {
  id: string;
  branch: Branch;
  billId: string;
  billNo: string;
  customerName: string;
  mobile: string;
  total: number;
  paidAmount: number;
  balanceDue: number;
  dueDate: string;
  remarks: string;
  salesperson: string;
  biller: string;
  status: "Open" | "Part Paid" | "Paid" | "Written Off";
  payments: BranchCreditPayment[];
  createdAt: string;
  updatedAt: string;
}

export interface HoldBill {
  id: string;
  branch: Branch;
  createdAt: string;
  salesperson: string;
  items: BranchBillItem[];
  note?: string;
}

export interface SalespersonProfile {
  id: string;
  branch: Branch;
  name: string;
  mobile?: string;
  address?: string;
  role?: string;
  active: boolean;
  status?: "Active" | "Inactive";
  joiningDate?: string;
  assignedBranch?: Branch | string;
  remarks?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CakeAdvanceOrder {
  id: string;
  branch: Branch;
  orderNo: string;
  customerName: string;
  mobile: string;
  orderDate: string;
  deliveryDate: string;
  deliveryTime: string;
  cakeKg: string;
  flavor: string;
  shape: string;
  messageOnCake: string;
  designNotes: string;
  attachmentName?: string;
  orderValue: number;
  advanceAmount: number;
  balanceAmount: number;
  salesperson: string;
  paymentMode: "cash" | "upi" | "card";
  status:
    | "Pending Store Confirmation"
    | "Store Confirmed"
    | "Store Rejected"
    | "Ready for Final Invoice"
    | "Paid In Full";
  storeConfirmedBy?: string;
  storeConfirmedAt?: string;
  finalInvoiceBillNo?: string;
  createdAt: string;
}

export interface QuotationRecord {
  id: string;
  branch: Branch;
  quoteNo: string;
  customerName: string;
  mobile?: string;
  items: BranchBillItem[];
  total: number;
  salesperson: string;
  createdAt: string;
  status: "Open" | "Converted" | "Cancelled";
}

export interface ReturnRecord {
  id: string;
  branch: Branch;
  returnNo: string;
  originalBillNo: string;
  items: BranchBillItem[];
  total: number;
  returnedBy: string;
  reason: string;
  createdAt: string;
}

export interface PurchaseRecord {
  id: string;
  branch: Branch;
  supplier: string;
  invoiceNo: string;
  invoiceDate?: string;
  itemName: string;
  quantity: number;
  unit?: "pcs" | "kg" | "ltr" | "nos" | "bunch";
  cost: number;
  tax: number;
  discount?: number;
  total: number;
  createdAt: string;
  enteredBy: string;
  paidAmount: number;
  paymentMethod?: "cash" | "upi" | "card" | "bank" | "credit";
  remarks?: string;
  syncStatus?: "Not Synced" | "Synced" | "Partially Synced";
  syncedToStock?: boolean;
  syncedAt?: string;
  syncedBy?: string;
}

export interface PurchasePayment {
  id: string;
  branch: Branch;
  purchaseId?: string;
  supplier: string;
  amount: number;
  mode: "cash" | "upi" | "card" | "bank";
  reference: string;
  remarks: string;
  paidBy: string;
  createdAt: string;
}

export interface PurchaseOrderRecord {
  id: string;
  branch: Branch;
  poNo: string;
  supplier: string;
  itemName: string;
  quantity: number;
  expectedRate: number;
  totalAmount: number;
  expectedDeliveryDate: string;
  remarks: string;
  status: PoStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CashMovement {
  id: string;
  branch: Branch;
  dateTime: string;
  amount: number;
  paymentMode: PayMode;
  direction: "in" | "out";
  purpose: string;
  enteredBy: string;
  referenceNumber: string;
  remarks: string;
}

export interface BankDeposit {
  id: string;
  branch: Branch;
  depositDate: string;
  amount: number;
  bankAccount: string;
  paymentMode:
    | "Cash Deposit"
    | "UPI Transfer"
    | "Card Settlement"
    | "Bank Transfer";
  slipNo: string;
  transactionRef: string;
  remarks: string;
  enteredBy: string;
  createdAt: string;
}

export interface CashierClosure {
  id: string;
  branch: Branch;
  cashier: string;
  openingCash: number;
  closingCash: number;
  expectedCash: number;
  difference: number;
  cash: number;
  upi: number;
  card: number;
  returns: number;
  discounts: number;
  billsCount: number;
  duplicateBills: number;
  creditSales?: number;
  creditCollections?: number;
  notes: string;
  createdAt: string;
}

export interface BranchNotification {
  id: string;
  branch: Branch;
  type:
    | "Stock Dispute"
    | "Store Confirmation"
    | "Cash Alert"
    | "Advance Order"
    | "Duplicate Print"
    | "Purchase Approval";
  title: string;
  details: string;
  createdAt: string;
  raisedBy: string;
  status: "Unread" | "Seen" | "Resolved";
}

export interface StoreOrderRecord {
  id: string;
  branch: Branch;
  sourceOrderId: string;
  orderNo: string;
  customerName: string;
  mobile: string;
  details: string;
  requiredAt: string;
  status: StoreOrderStatus;
  confirmerName?: string;
  confirmedAt?: string;
  remarks?: string;
  createdAt: string;
}

export interface AuditLogRecord {
  id: string;
  branch: Branch;
  user: string;
  action: string;
  previousValue: string;
  newValue: string;
  createdAt: string;
}

interface BranchOpsState {
  bills: BranchBillRecord[];
  creditSales: BranchCreditSale[];
  holds: HoldBill[];
  salespeople: SalespersonProfile[];
  advanceCakeOrders: CakeAdvanceOrder[];
  quotations: QuotationRecord[];
  returns: ReturnRecord[];
  purchases: PurchaseRecord[];
  purchasePayments: PurchasePayment[];
  purchaseOrders: PurchaseOrderRecord[];
  cashMovements: CashMovement[];
  bankDeposits: BankDeposit[];
  cashierClosures: CashierClosure[];
  notifications: BranchNotification[];
  storeOrders: StoreOrderRecord[];
  auditLogs: AuditLogRecord[];
  addBill: (
    bill: Omit<BranchBillRecord, "id" | "createdAt" | "printCount" | "status">,
  ) => BranchBillRecord;
  markBillDuplicate: (billId: string, user: string) => void;
  collectCreditPayment: (
    creditId: string,
    payment: Omit<BranchCreditPayment, "id" | "createdAt">,
  ) => BranchCreditSale | undefined;
  writeOffCreditSale: (creditId: string, user: string, remarks: string) => void;
  addHold: (hold: Omit<HoldBill, "id" | "createdAt">) => HoldBill;
  removeHold: (id: string) => void;
  clearHolds: (branch: Branch) => void;
  addSalesperson: (
    branch: Branch,
    name: string,
    user: string,
    details?: Partial<SalespersonProfile>,
  ) => void;
  updateSalesperson: (
    id: string,
    name: string,
    active: boolean,
    user: string,
    details?: Partial<SalespersonProfile>,
  ) => void;
  removeSalesperson: (id: string, user: string) => void;
  addAdvanceCakeOrder: (
    order: Omit<CakeAdvanceOrder, "id" | "orderNo" | "createdAt" | "status">,
  ) => CakeAdvanceOrder;
  updateAdvanceStatus: (
    id: string,
    status: CakeAdvanceOrder["status"],
    user: string,
    details?: Partial<CakeAdvanceOrder>,
  ) => void;
  addQuotation: (
    quote: Omit<QuotationRecord, "id" | "quoteNo" | "createdAt" | "status">,
  ) => QuotationRecord;
  updateQuotationStatus: (
    id: string,
    status: QuotationRecord["status"],
    user: string,
  ) => void;
  addReturn: (
    ret: Omit<ReturnRecord, "id" | "returnNo" | "createdAt">,
  ) => ReturnRecord;
  addPurchase: (
    purchase: Omit<
      PurchaseRecord,
      | "id"
      | "createdAt"
      | "paidAmount"
      | "syncStatus"
      | "syncedToStock"
      | "syncedAt"
      | "syncedBy"
    >,
  ) => PurchaseRecord;
  addPurchasePayment: (
    payment: Omit<PurchasePayment, "id" | "createdAt">,
  ) => PurchasePayment;
  addPurchaseOrder: (
    po: Omit<
      PurchaseOrderRecord,
      "id" | "poNo" | "createdAt" | "updatedAt" | "status"
    >,
  ) => PurchaseOrderRecord;
  updatePoStatus: (id: string, status: PoStatus, user: string) => void;
  markPurchaseSynced: (
    purchaseId: string,
    user: string,
    status?: PurchaseRecord["syncStatus"],
  ) => void;
  addCashMovement: (
    movement: Omit<CashMovement, "id" | "dateTime">,
  ) => CashMovement;
  addBankDeposit: (
    deposit: Omit<BankDeposit, "id" | "createdAt">,
  ) => BankDeposit;
  addCashierClosure: (
    closure: Omit<CashierClosure, "id" | "createdAt">,
  ) => CashierClosure;
  addNotification: (
    notification: Omit<BranchNotification, "id" | "createdAt" | "status">,
  ) => BranchNotification;
  updateNotificationStatus: (
    id: string,
    status: BranchNotification["status"],
    user: string,
  ) => void;
  addStoreOrder: (
    order: Omit<StoreOrderRecord, "id" | "createdAt" | "status">,
  ) => StoreOrderRecord;
  updateStoreOrderStatus: (
    id: string,
    status: StoreOrderStatus,
    user: string,
    remarks?: string,
  ) => void;
  addAuditLog: (log: Omit<AuditLogRecord, "id" | "createdAt">) => void;
}

const uid = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const seq = (key: string, max = 99999) => {
  const current = Number(localStorage.getItem(key) || "0");
  const next = current >= max ? 1 : current + 1;
  localStorage.setItem(key, String(next));
  return next;
};
const audit = (
  branch: Branch,
  user: string,
  action: string,
  previousValue: string,
  newValue: string,
): AuditLogRecord => ({
  id: uid("audit"),
  branch,
  user,
  action,
  previousValue,
  newValue,
  createdAt: new Date().toISOString(),
});

export const useBranchOpsStore = create<BranchOpsState>()(
  persist(
    (set, get) => ({
      bills: [],
      creditSales: [],
      holds: [],
      salespeople: [],
      advanceCakeOrders: [],
      quotations: [],
      returns: [],
      purchases: [],
      purchasePayments: [],
      purchaseOrders: [],
      cashMovements: [],
      bankDeposits: [],
      cashierClosures: [],
      notifications: [],
      storeOrders: [],
      auditLogs: [],
      addAuditLog: (log) =>
        set((s) => ({
          auditLogs: [
            { ...log, id: uid("audit"), createdAt: new Date().toISOString() },
            ...s.auditLogs,
          ].slice(0, 1000),
        })),
      addBill: (bill) => {
        const newBill: BranchBillRecord = {
          ...bill,
          id: uid("bill"),
          createdAt: new Date().toISOString(),
          printCount: 1,
          status: "Original Bill",
        };
        const paymentMovements: CashMovement[] =
          bill.paymentMode === "credit"
            ? []
            : bill.paymentMode === "split"
              ? (
                  [
                    ["cash", bill.split?.cash ?? 0],
                    ["upi", bill.split?.upi ?? 0],
                    ["card", bill.split?.card ?? 0],
                  ] as const
                )
                  .filter(([, amount]) => amount > 0)
                  .map(([mode, amount]) => ({
                    id: uid("cash"),
                    branch: bill.branch,
                    dateTime: newBill.createdAt,
                    amount,
                    paymentMode: mode,
                    direction: "in",
                    purpose: "Bill collection - split",
                    enteredBy: bill.biller,
                    referenceNumber: bill.billNo,
                    remarks: bill.salesperson,
                  }))
              : [
                  {
                    id: uid("cash"),
                    branch: bill.branch,
                    dateTime: newBill.createdAt,
                    amount: bill.total,
                    paymentMode: bill.paymentMode,
                    direction: "in",
                    purpose: "Bill collection",
                    enteredBy: bill.biller,
                    referenceNumber: bill.billNo,
                    remarks: bill.salesperson,
                  },
                ];
        const creditEntry: BranchCreditSale | null =
          bill.paymentMode === "credit"
            ? {
                id: uid("credit"),
                branch: bill.branch,
                billId: newBill.id,
                billNo: bill.billNo,
                customerName:
                  bill.creditCustomerName?.trim() || "Credit Customer",
                mobile: bill.creditCustomerMobile?.trim() || "",
                total: bill.total,
                paidAmount: 0,
                balanceDue: bill.total,
                dueDate: bill.creditDueDate || "",
                remarks: bill.creditRemarks || "",
                salesperson: bill.salesperson,
                biller: bill.biller,
                status: "Open",
                payments: [],
                createdAt: newBill.createdAt,
                updatedAt: newBill.createdAt,
              }
            : null;
        set((s) => ({
          bills: [newBill, ...s.bills],
          creditSales: creditEntry
            ? [creditEntry, ...s.creditSales]
            : s.creditSales,
          cashMovements: [...paymentMovements, ...s.cashMovements],
          auditLogs: [
            audit(
              bill.branch,
              bill.biller,
              bill.paymentMode === "credit"
                ? "Credit Bill Created"
                : "Bill Printed - Original",
              "-",
              `${bill.billNo} ${bill.total}`,
            ),
            ...s.auditLogs,
          ],
        }));
        return newBill;
      },
      collectCreditPayment: (creditId, payment) => {
        let updatedCredit: BranchCreditSale | undefined;
        set((s) => {
          const credit = s.creditSales.find((c) => c.id === creditId);
          if (
            !credit ||
            credit.status === "Paid" ||
            credit.status === "Written Off"
          )
            return {};
          const amount = Math.max(
            0,
            Math.min(Number(payment.amount || 0), credit.balanceDue),
          );
          if (!amount) return {};
          const now = new Date().toISOString();
          const newPayment: BranchCreditPayment = {
            ...payment,
            amount,
            id: uid("cpay"),
            createdAt: now,
          };
          const paidAmount = Number((credit.paidAmount + amount).toFixed(2));
          const balanceDue = Number(
            Math.max(0, credit.total - paidAmount).toFixed(2),
          );
          const status: BranchCreditSale["status"] =
            balanceDue <= 0 ? "Paid" : "Part Paid";
          updatedCredit = {
            ...credit,
            paidAmount,
            balanceDue,
            status,
            payments: [newPayment, ...credit.payments],
            updatedAt: now,
          };
          const movement: CashMovement = {
            id: uid("cash"),
            branch: credit.branch,
            dateTime: now,
            amount,
            paymentMode: payment.mode,
            direction: "in",
            purpose: "Credit collection",
            enteredBy: payment.collectedBy,
            referenceNumber: credit.billNo,
            remarks: `${credit.customerName}${payment.remarks ? ` · ${payment.remarks}` : ""}`,
          };
          return {
            creditSales: s.creditSales.map((c) =>
              c.id === creditId ? updatedCredit! : c,
            ),
            cashMovements: [movement, ...s.cashMovements],
            auditLogs: [
              audit(
                credit.branch,
                payment.collectedBy,
                "Credit Payment Collection",
                `${credit.balanceDue}`,
                `${balanceDue}`,
              ),
              ...s.auditLogs,
            ],
          };
        });
        return updatedCredit;
      },
      writeOffCreditSale: (creditId, user, remarks) =>
        set((s) => {
          const credit = s.creditSales.find((c) => c.id === creditId);
          if (!credit || credit.status === "Paid") return {};
          const now = new Date().toISOString();
          return {
            creditSales: s.creditSales.map((c) =>
              c.id === creditId
                ? {
                    ...c,
                    status: "Written Off",
                    remarks: [c.remarks, remarks].filter(Boolean).join(" · "),
                    updatedAt: now,
                  }
                : c,
            ),
            auditLogs: [
              audit(
                credit.branch,
                user,
                "Credit Sale Written Off",
                `${credit.balanceDue}`,
                remarks || "-",
              ),
              ...s.auditLogs,
            ],
          };
        }),
      markBillDuplicate: (billId, user) =>
        set((s) => {
          const bill = s.bills.find((b) => b.id === billId);
          return {
            bills: s.bills.map((b) =>
              b.id === billId
                ? {
                    ...b,
                    printCount: b.printCount + 1,
                    status: "Duplicate Bill",
                  }
                : b,
            ),
            notifications: bill
              ? [
                  {
                    id: uid("note"),
                    branch: bill.branch,
                    type: "Duplicate Print",
                    title: "Duplicate bill printed",
                    details: `${bill.billNo} printed by ${user}`,
                    createdAt: new Date().toISOString(),
                    raisedBy: user,
                    status: "Unread",
                  },
                  ...s.notifications,
                ]
              : s.notifications,
            auditLogs: bill
              ? [
                  audit(
                    bill.branch,
                    user,
                    "Duplicate Bill Print",
                    String(bill.printCount),
                    String(bill.printCount + 1),
                  ),
                  ...s.auditLogs,
                ]
              : s.auditLogs,
          };
        }),
      addHold: (hold) => {
        const newHold = {
          ...hold,
          id: uid("hold"),
          createdAt: new Date().toISOString(),
        };
        set((s) => ({
          holds: [newHold, ...s.holds],
          auditLogs: [
            audit(
              hold.branch,
              hold.salesperson,
              "Hold Bill",
              "-",
              `${hold.items.length} items`,
            ),
            ...s.auditLogs,
          ],
        }));
        return newHold;
      },
      removeHold: (id) =>
        set((s) => ({ holds: s.holds.filter((h) => h.id !== id) })),
      clearHolds: (branch) =>
        set((s) => ({ holds: s.holds.filter((h) => h.branch !== branch) })),
      addSalesperson: (branch, name, user, details = {}) =>
        set((s) => ({
          salespeople: [
            {
              id: uid("sp"),
              branch,
              name: name.trim(),
              mobile: details.mobile ?? "",
              address: details.address ?? "",
              role: details.role ?? "Salesperson",
              active: details.active ?? true,
              status:
                details.status ??
                ((details.active ?? true) ? "Active" : "Inactive"),
              joiningDate:
                details.joiningDate ?? new Date().toISOString().slice(0, 10),
              assignedBranch: details.assignedBranch ?? branch,
              remarks: details.remarks ?? "",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            ...s.salespeople,
          ],
          auditLogs: [
            audit(branch, user, "Add Salesperson", "-", name.trim()),
            ...s.auditLogs,
          ],
        })),
      updateSalesperson: (id, name, active, user, details = {}) =>
        set((s) => {
          const prev = s.salespeople.find((p) => p.id === id);
          return {
            salespeople: s.salespeople.map((p) =>
              p.id === id
                ? {
                    ...p,
                    ...details,
                    name: name.trim(),
                    active,
                    status: details.status ?? (active ? "Active" : "Inactive"),
                    updatedAt: new Date().toISOString(),
                  }
                : p,
            ),
            auditLogs: prev
              ? [
                  audit(
                    prev.branch,
                    user,
                    "Update Salesperson",
                    `${prev.name}/${prev.active}`,
                    `${name}/${active}`,
                  ),
                  ...s.auditLogs,
                ]
              : s.auditLogs,
          };
        }),
      removeSalesperson: (id, user) =>
        set((s) => {
          const prev = s.salespeople.find((p) => p.id === id);
          return {
            salespeople: s.salespeople.filter((p) => p.id !== id),
            auditLogs: prev
              ? [
                  audit(
                    prev.branch,
                    user,
                    "Delete Salesperson",
                    prev.name,
                    "-",
                  ),
                  ...s.auditLogs,
                ]
              : s.auditLogs,
          };
        }),
      addAdvanceCakeOrder: (order) => {
        const orderNo = `${order.branch}-ADV-${String(seq(`adv-${order.branch}`)).padStart(4, "0")}`;
        const newOrder: CakeAdvanceOrder = {
          ...order,
          id: uid("adv"),
          orderNo,
          status: "Pending Store Confirmation",
          createdAt: new Date().toISOString(),
        };
        const storeOrder: StoreOrderRecord = {
          id: uid("store"),
          branch: order.branch,
          sourceOrderId: newOrder.id,
          orderNo,
          customerName: order.customerName,
          mobile: order.mobile,
          details: `${order.cakeKg}kg ${order.flavor} ${order.shape} cake · ${order.messageOnCake || "No message"}`,
          requiredAt: `${order.deliveryDate} ${order.deliveryTime}`,
          status: "Pending Store Confirmation",
          createdAt: newOrder.createdAt,
        };
        set((s) => ({
          advanceCakeOrders: [newOrder, ...s.advanceCakeOrders],
          storeOrders: [storeOrder, ...s.storeOrders],
          notifications: [
            {
              id: uid("note"),
              branch: order.branch,
              type: "Advance Order",
              title: "New cake advance order sent to store",
              details: `${orderNo} · ${order.customerName} · ${storeOrder.details}`,
              createdAt: newOrder.createdAt,
              raisedBy: order.salesperson,
              status: "Unread",
            },
            ...s.notifications,
          ],
          cashMovements: [
            {
              id: uid("cash"),
              branch: order.branch,
              dateTime: newOrder.createdAt,
              amount: order.advanceAmount,
              paymentMode: order.paymentMode,
              direction: "in",
              purpose: "Cake advance received",
              enteredBy: order.salesperson,
              referenceNumber: orderNo,
              remarks: order.customerName,
            },
            ...s.cashMovements,
          ],
          auditLogs: [
            audit(
              order.branch,
              order.salesperson,
              "Advance Cake Order",
              "-",
              `${orderNo} ${order.advanceAmount}`,
            ),
            ...s.auditLogs,
          ],
        }));
        return newOrder;
      },
      updateAdvanceStatus: (id, status, user, details = {}) =>
        set((s) => {
          const prev = s.advanceCakeOrders.find((o) => o.id === id);
          return {
            advanceCakeOrders: s.advanceCakeOrders.map((o) =>
              o.id === id ? { ...o, status, ...details } : o,
            ),
            auditLogs: prev
              ? [
                  audit(
                    prev.branch,
                    user,
                    "Advance Status",
                    prev.status,
                    status,
                  ),
                  ...s.auditLogs,
                ]
              : s.auditLogs,
          };
        }),
      addQuotation: (quote) => {
        const quoteNo = `${quote.branch}-QT-${String(seq(`quote-${quote.branch}`)).padStart(4, "0")}`;
        const newQuote = {
          ...quote,
          id: uid("qt"),
          quoteNo,
          createdAt: new Date().toISOString(),
          status: "Open" as const,
        };
        set((s) => ({
          quotations: [newQuote, ...s.quotations],
          auditLogs: [
            audit(
              quote.branch,
              quote.salesperson,
              "Create Quotation",
              "-",
              quoteNo,
            ),
            ...s.auditLogs,
          ],
        }));
        return newQuote;
      },
      updateQuotationStatus: (id, status, user) =>
        set((s) => {
          const prev = s.quotations.find((q) => q.id === id);
          return {
            quotations: s.quotations.map((q) =>
              q.id === id ? { ...q, status } : q,
            ),
            auditLogs: prev
              ? [
                  audit(
                    prev.branch,
                    user,
                    "Quotation Status",
                    prev.status,
                    status,
                  ),
                  ...s.auditLogs,
                ]
              : s.auditLogs,
          };
        }),
      addReturn: (ret) => {
        const returnNo = `${ret.branch}-RET-${String(seq(`return-${ret.branch}`)).padStart(4, "0")}`;
        const newRet = {
          ...ret,
          id: uid("ret"),
          returnNo,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({
          returns: [newRet, ...s.returns],
          cashMovements: [
            {
              id: uid("cash"),
              branch: ret.branch,
              dateTime: newRet.createdAt,
              amount: ret.total,
              paymentMode: "cash",
              direction: "out",
              purpose: "Return refund",
              enteredBy: ret.returnedBy,
              referenceNumber: returnNo,
              remarks: ret.reason,
            },
            ...s.cashMovements,
          ],
          auditLogs: [
            audit(
              ret.branch,
              ret.returnedBy,
              "Return Bill",
              ret.originalBillNo,
              `${returnNo} ${ret.total}`,
            ),
            ...s.auditLogs,
          ],
        }));
        return newRet;
      },
      addPurchase: (purchase) => {
        const newPurchase: PurchaseRecord = {
          ...purchase,
          id: uid("pur"),
          createdAt: new Date().toISOString(),
          paidAmount: 0,
          discount: purchase.discount ?? 0,
          unit: purchase.unit ?? "pcs",
          paymentMethod: purchase.paymentMethod ?? "credit",
          remarks: purchase.remarks ?? "",
          syncStatus: "Not Synced",
          syncedToStock: false,
        };
        set((s) => ({
          purchases: [newPurchase, ...s.purchases],
          auditLogs: [
            audit(
              purchase.branch,
              purchase.enteredBy,
              "Purchase Invoice Entry",
              "-",
              `${purchase.invoiceNo} ${purchase.total}`,
            ),
            ...s.auditLogs,
          ],
        }));
        return newPurchase;
      },
      addPurchasePayment: (payment) => {
        const newPayment = {
          ...payment,
          id: uid("ppay"),
          createdAt: new Date().toISOString(),
        };
        set((s) => ({
          purchasePayments: [newPayment, ...s.purchasePayments],
          purchases: payment.purchaseId
            ? s.purchases.map((p) =>
                p.id === payment.purchaseId
                  ? { ...p, paidAmount: p.paidAmount + payment.amount }
                  : p,
              )
            : s.purchases,
          cashMovements: [
            {
              id: uid("cash"),
              branch: payment.branch,
              dateTime: newPayment.createdAt,
              amount: payment.amount,
              paymentMode: payment.mode,
              direction: "out",
              purpose: "Purchase payment",
              enteredBy: payment.paidBy,
              referenceNumber: payment.reference,
              remarks: payment.supplier,
            },
            ...s.cashMovements,
          ],
          auditLogs: [
            audit(
              payment.branch,
              payment.paidBy,
              "Purchase Payment",
              "-",
              `${payment.supplier} ${payment.amount}`,
            ),
            ...s.auditLogs,
          ],
        }));
        return newPayment;
      },
      addPurchaseOrder: (po) => {
        const poNo = `${po.branch}-PO-${String(seq(`po-${po.branch}`)).padStart(4, "0")}`;
        const now = new Date().toISOString();
        const newPo = {
          ...po,
          id: uid("po"),
          poNo,
          status: "Draft" as PoStatus,
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({
          purchaseOrders: [newPo, ...s.purchaseOrders],
          auditLogs: [
            audit(po.branch, po.createdBy, "Create PO", "-", poNo),
            ...s.auditLogs,
          ],
        }));
        return newPo;
      },
      updatePoStatus: (id, status, user) =>
        set((s) => {
          const prev = s.purchaseOrders.find((p) => p.id === id);
          return {
            purchaseOrders: s.purchaseOrders.map((p) =>
              p.id === id
                ? { ...p, status, updatedAt: new Date().toISOString() }
                : p,
            ),
            auditLogs: prev
              ? [
                  audit(prev.branch, user, "PO Status", prev.status, status),
                  ...s.auditLogs,
                ]
              : s.auditLogs,
          };
        }),
      markPurchaseSynced: (purchaseId, user, status = "Synced") =>
        set((s) => {
          const prev = s.purchases.find((p) => p.id === purchaseId);
          const now = new Date().toISOString();
          return {
            purchases: s.purchases.map((p) =>
              p.id === purchaseId
                ? {
                    ...p,
                    syncStatus: status,
                    syncedToStock: status === "Synced",
                    syncedAt: now,
                    syncedBy: user,
                  }
                : p,
            ),
            auditLogs: prev
              ? [
                  audit(
                    prev.branch,
                    user,
                    "Purchase Stock Sync",
                    prev.syncStatus ?? "Not Synced",
                    `${prev.invoiceNo} · ${prev.itemName} · ${status}`,
                  ),
                  ...s.auditLogs,
                ]
              : s.auditLogs,
          };
        }),
      addCashMovement: (movement) => {
        const newMovement = {
          ...movement,
          id: uid("cash"),
          dateTime: new Date().toISOString(),
        };
        set((s) => ({
          cashMovements: [newMovement, ...s.cashMovements],
          auditLogs: [
            audit(
              movement.branch,
              movement.enteredBy,
              "Cash Movement",
              movement.direction,
              `${movement.purpose} ${movement.amount}`,
            ),
            ...s.auditLogs,
          ],
        }));
        return newMovement;
      },
      addBankDeposit: (deposit) => {
        const newDeposit = {
          ...deposit,
          id: uid("bank"),
          createdAt: new Date().toISOString(),
        };
        const mode: PayMode =
          deposit.paymentMode === "Cash Deposit"
            ? "cash"
            : deposit.paymentMode === "UPI Transfer"
              ? "upi"
              : deposit.paymentMode === "Card Settlement"
                ? "card"
                : "bank";
        set((s) => ({
          bankDeposits: [newDeposit, ...s.bankDeposits],
          cashMovements: [
            {
              id: uid("cash"),
              branch: deposit.branch,
              dateTime: newDeposit.createdAt,
              amount: deposit.amount,
              paymentMode: mode,
              direction: "out",
              purpose: "Bank deposit",
              enteredBy: deposit.enteredBy,
              referenceNumber: deposit.transactionRef || deposit.slipNo,
              remarks: deposit.bankAccount,
            },
            ...s.cashMovements,
          ],
          auditLogs: [
            audit(
              deposit.branch,
              deposit.enteredBy,
              "Bank Deposit",
              "-",
              `${deposit.bankAccount} ${deposit.amount}`,
            ),
            ...s.auditLogs,
          ],
        }));
        return newDeposit;
      },
      addCashierClosure: (closure) => {
        const newClosure = {
          ...closure,
          id: uid("closure"),
          createdAt: new Date().toISOString(),
        };
        set((s) => ({
          cashierClosures: [newClosure, ...s.cashierClosures],
          auditLogs: [
            audit(
              closure.branch,
              closure.cashier,
              "Cashier Closure",
              "-",
              `Difference ${closure.difference}`,
            ),
            ...s.auditLogs,
          ],
        }));
        return newClosure;
      },
      addNotification: (notification) => {
        const newNotification = {
          ...notification,
          id: uid("note"),
          createdAt: new Date().toISOString(),
          status: "Unread" as const,
        };
        set((s) => ({ notifications: [newNotification, ...s.notifications] }));
        return newNotification;
      },
      updateNotificationStatus: (id, status, user) =>
        set((s) => {
          const prev = s.notifications.find((n) => n.id === id);
          return {
            notifications: s.notifications.map((n) =>
              n.id === id ? { ...n, status } : n,
            ),
            auditLogs: prev
              ? [
                  audit(
                    prev.branch,
                    user,
                    "Notification Status",
                    prev.status,
                    status,
                  ),
                  ...s.auditLogs,
                ]
              : s.auditLogs,
          };
        }),
      addStoreOrder: (order) => {
        const newOrder = {
          ...order,
          id: uid("store"),
          status: "Pending Store Confirmation" as StoreOrderStatus,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ storeOrders: [newOrder, ...s.storeOrders] }));
        return newOrder;
      },
      updateStoreOrderStatus: (id, status, user, remarks) =>
        set((s) => {
          const order = s.storeOrders.find((o) => o.id === id);
          if (!order) return {};
          const confirmedAt =
            status === "Confirmed"
              ? new Date().toISOString()
              : order.confirmedAt;
          const notifications =
            status === "Confirmed"
              ? [
                  {
                    id: uid("note"),
                    branch: order.branch,
                    type: "Store Confirmation" as const,
                    title: "Store confirmed cake order",
                    details: `${order.orderNo} confirmed by ${user} at ${new Date().toLocaleString("en-IN")}`,
                    createdAt: new Date().toISOString(),
                    raisedBy: user,
                    status: "Unread" as const,
                  },
                  ...s.notifications,
                ]
              : s.notifications;
          return {
            storeOrders: s.storeOrders.map((o) =>
              o.id === id
                ? { ...o, status, confirmerName: user, confirmedAt, remarks }
                : o,
            ),
            advanceCakeOrders: s.advanceCakeOrders.map((a) =>
              a.id === order.sourceOrderId
                ? {
                    ...a,
                    status:
                      status === "Confirmed"
                        ? "Store Confirmed"
                        : status === "Rejected"
                          ? "Store Rejected"
                          : a.status,
                    storeConfirmedBy: user,
                    storeConfirmedAt: confirmedAt,
                  }
                : a,
            ),
            notifications,
            auditLogs: [
              audit(
                order.branch,
                user,
                "Store Order Status",
                order.status,
                status,
              ),
              ...s.auditLogs,
            ],
          };
        }),
    }),
    {
      name: "cafe-aadvikam-branch-ops-v1",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);

export function nextBranchInvoice(branch: Branch) {
  const invoiceNo = seq(`branch-invoice-${branch}`, 500);
  return {
    invoiceNo,
    billNo: `${branch}-${String(invoiceNo).padStart(3, "0")}`,
  };
}

export function money(value: number) {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 0 })}`;
}
