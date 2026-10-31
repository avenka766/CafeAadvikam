export const AUDIT_SOURCES = [
  {id:'finance_entries',title:'Finance supplier and salary payment ledger',current:false},
  {id:'loss_catalog',title:'Current branch prices for loss estimates',current:true},
  {id:'waste_logs',title:'Branch dump, damage and transfer logs',current:false},
  {id:'stock_counts',title:'Branch physical stock counts',current:false},
  {id:'stock_variances',title:'Confirmed branch stock variations',current:false},
  {id:'planner_orders',title:'Planner order and dispatch logs',current:true},
  {id:'branch_incoming',title:'Branch dispatch receipt confirmations',current:false},
  {id:'employees',title:'Employee salary and bank details',current:true},
  {id:'attendance',title:'Daily attendance and meals',current:false},
  {id:'contract_teams',title:'Contract teams',current:true},
  {id:'salary_deductions',title:'Monthly salary deduction decisions',current:false},
  {id:'credit_accounts',title:'Customer credit accounts and balances',current:true},
  {id:'credit_invoices',title:'Customer credit invoice allocations',current:true},
  {id:'credit_allocations',title:'Credit receipt allocation details',current:true},
  {
    "id": "branch_bills",
    "title": "Branch sales bills",
    "current": false
  },
  {
    "id": "branch_items",
    "title": "Branch item lines",
    "current": false
  },
  {
    "id": "branch_payments",
    "title": "Branch money receipts",
    "current": false
  },
  {
    "id": "branch_returns",
    "title": "Sales returns",
    "current": false
  },
  {
    "id": "branch_advances",
    "title": "Branch advance orders",
    "current": true
  },
  {
    "id": "branch_credits",
    "title": "Customer credit balances",
    "current": true
  },
  {
    "id": "credit_receipts",
    "title": "Credit receipt references",
    "current": false
  },
  {
    "id": "advance_receipts",
    "title": "Advance receipt references",
    "current": false
  },
  {
    "id": "operations",
    "title": "Expenses and operations",
    "current": false
  },
  {
    "id": "bill_references",
    "title": "Secondary bill references",
    "current": false
  },
  {
    "id": "cafe_orders",
    "title": "Cafe sales and payments",
    "current": false
  },
  {
    "id": "planner_sales",
    "title": "Planner normal / festival sales",
    "current": false
  },
  {
    "id": "dispatches",
    "title": "Dispatch / TO invoices",
    "current": false
  },
  {
    "id": "hosur_bills",
    "title": "Hosur bill references",
    "current": false
  },
  {
    "id": "hosur_collections",
    "title": "Hosur credit collections",
    "current": false
  },
  {
    "id": "hosur_credit",
    "title": "Hosur balances",
    "current": true
  },
  {
    "id": "planner_advances",
    "title": "Planner advance sales",
    "current": true
  },
  {
    "id": "cake_orders",
    "title": "Cake order register",
    "current": true
  },
  {
    "id": "snb_purchases",
    "title": "SNB purchase invoices",
    "current": false
  },
  {
    "id": "vrsnb_purchases",
    "title": "VRSNB purchase invoices",
    "current": false
  },
  {
    "id": "store_purchases",
    "title": "Central store invoices",
    "current": false
  },
  {
    "id": "snb_purchase_items",
    "title": "SNB purchase item lines",
    "current": false
  },
  {
    "id": "vrsnb_purchase_items",
    "title": "VRSNB purchase item lines",
    "current": false
  },
  {
    "id": "snb_supplier_payments",
    "title": "SNB supplier payments",
    "current": false
  },
  {
    "id": "vrsnb_supplier_payments",
    "title": "VRSNB supplier payments",
    "current": false
  },
  {
    "id": "purchase_returns",
    "title": "Supplier purchase returns",
    "current": false
  },
  {
    "id": "snb_deposits",
    "title": "SNB bank deposits",
    "current": false
  },
  {
    "id": "vrsnb_deposits",
    "title": "VRSNB bank deposits",
    "current": false
  },
  {
    "id": "stock_movements",
    "title": "Unified stock movements",
    "current": false
  },
  {
    "id": "stock_adjustments",
    "title": "Stock corrections",
    "current": false
  },
  {
    "id": "stock_balances",
    "title": "Current stock balances",
    "current": true
  },
  {
    "id": "snb_stock_movements",
    "title": "SNB stock movement references",
    "current": false
  },
  {
    "id": "vrsnb_stock_movements",
    "title": "VRSNB stock movement references",
    "current": false
  },
  {
    "id": "snb_cash_book",
    "title": "SNB cash book references",
    "current": false
  },
  {
    "id": "vrsnb_cash_book",
    "title": "VRSNB cash book references",
    "current": false
  },
  {
    "id": "credit_payments",
    "title": "Cafe credit collections",
    "current": false
  },
  {
    "id": "salary_advances",
    "title": "Salary advances",
    "current": false
  }
,

  {
    "id": "branch_closures",
    "title": "Branch cashier closures",
    "current": false
  },
  {
    "id": "admin_closures",
    "title": "Admin daily closures",
    "current": false
  },
  {
    "id": "snb_closures",
    "title": "SNB closure references",
    "current": false
  },
  {
    "id": "vrsnb_closures",
    "title": "VRSNB closure references",
    "current": false
  },
  {
    "id": "hosur_closures",
    "title": "Hosur daily closures",
    "current": false
  },
  {
    "id": "salary_records",
    "title": "Monthly salary records",
    "current": false
  },
  {
    "id": "tax_invoices",
    "title": "GST tax invoice documents",
    "current": false
  }
] as const;
export type AuditSourceId = typeof AUDIT_SOURCES[number]['id'];
export type AuditRaw = Record<string, any>;
export type AuditSourceState = {rows:AuditRaw[];status:'loading'|'ready'|'error';error:string;scope?:string};
export type AuditSnapshot = Partial<Record<AuditSourceId,AuditSourceState>>;

