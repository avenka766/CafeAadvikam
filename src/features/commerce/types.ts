import type { Branch } from '@/branch/types';

export type WalletStatus = 'active' | 'suspended' | 'closed';
export type WalletCustomerType = 'Regular' | 'VIP' | 'Wholesale' | 'Corporate' | 'Staff' | 'Other';
export type WalletDeductionPriority = 'promotional_first' | 'paid_first' | 'proportional';
export type WalletTransactionType = 'credit' | 'debit' | 'refund' | 'reversal' | 'adjustment' | 'cashback' | 'expiry';
export type WalletPaymentMode = 'cash' | 'upi' | 'card' | 'bank_transfer' | 'cheque' | 'opening_balance' | 'promotional_credit' | 'adjustment';

export interface WalletCustomer {
  id: string;
  customerId: string | null;
  walletNumber: string;
  customerName: string;
  mobile: string;
  alternateMobile: string | null;
  email: string | null;
  dateOfBirth: string | null;
  anniversaryDate: string | null;
  address: string | null;
  customerType: WalletCustomerType;
  preferredBranch: Branch | null;
  status: WalletStatus;
  paidBalance: number;
  promotionalBalance: number;
  totalBalance: number;
  lifetimeCredits: number;
  lifetimeSpend: number;
  totalPurchases: number;
  transactionLimit: number | null;
  dailyLimit: number | null;
  highValueAuthorizationLimit?: number | null;
  deductionPriority: WalletDeductionPriority;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  lastRechargeAt?: string | null;
  lastPurchaseAt?: string | null;
  mergedIntoWalletId?: string | null;
  expiringPromotionalAmount?: number;
  promotionalExpiryDate?: string | null;
  birthdayEligible?: boolean;
  anniversaryEligible?: boolean;
  inactiveDays?: number | null;
  repeatPurchaseCount?: number | null;
  repeatWindowDays?: number | null;
  preOrderCutoffDate?: string | null;
  pickupStartDate?: string | null;
  pickupEndDate?: string | null;
  depositRequired?: number | null;
}

export interface WalletTransaction {
  id: string;
  walletId: string;
  walletNumber?: string;
  customerName?: string;
  branch: Branch | null;
  billId: string | null;
  billNumber: string | null;
  campaignId: string | null;
  transactionType: WalletTransactionType;
  amount: number;
  paidAmount: number;
  promotionalAmount: number;
  previousPaidBalance: number;
  previousPromotionalBalance: number;
  newPaidBalance: number;
  newPromotionalBalance: number;
  paymentMode: WalletPaymentMode | 'wallet' | null;
  referenceNumber: string | null;
  description: string | null;
  status: 'completed' | 'reversed' | 'failed' | 'pending';
  idempotencyKey: string;
  createdBy: string | null;
  approvedBy: string | null;
  createdAt: string;
  reversalReference: string | null;
}

export type PromotionStatus = 'Draft' | 'Scheduled' | 'Active' | 'Paused' | 'Completed' | 'Expired' | 'Cancelled';
export type PromotionRuleType =
  | 'purchase_value_percentage'
  | 'purchase_value_fixed'
  | 'buy_x_get_y'
  | 'bundle'
  | 'quantity_discount'
  | 'time_based'
  | 'wallet_cashback'
  | 'coupon'
  | 'birthday'
  | 'anniversary'
  | 'first_purchase'
  | 'repeat_visit'
  | 'referral'
  | 'pre_order'
  | 'limited_time_product'
  | 'inactive_customer';

export interface PromotionRule {
  id?: string;
  type: PromotionRuleType;
  minimumPurchase?: number;
  maximumPurchase?: number | null;
  percentageDiscount?: number;
  fixedDiscount?: number;
  maximumDiscount?: number | null;
  minimumQuantity?: number | null;
  promptRange?: number;
  cashbackAmount?: number;
  cashbackPercentage?: number;
  maximumCashback?: number | null;
  promotionalExpiryDays?: number | null;
  couponCode?: string | null;
  couponType?: 'manual' | 'qr' | 'automatic' | 'customer_specific' | 'public';
  usageLimit?: number | null;
  usagePerCustomer?: number | null;
  buyQuantity?: number | null;
  getQuantity?: number | null;
  freeItemId?: string | null;
  freeItemName?: string | null;
  activeDays?: number[];
  startTime?: string | null;
  endTime?: string | null;
  inactiveDays?: number | null;
  repeatPurchaseCount?: number | null;
  repeatWindowDays?: number | null;
  preOrderCutoffDate?: string | null;
  pickupStartDate?: string | null;
  pickupEndDate?: string | null;
  depositRequired?: number | null;
  config?: Record<string, unknown>;
}

export interface PromotionCampaign {
  id: string;
  campaignName: string;
  campaignCode: string;
  title: string;
  message: string;
  description: string | null;
  terms: string | null;
  status: PromotionStatus;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  activeDays: number[];
  priority: number;
  autoApply: boolean;
  cashierApprovalRequired: boolean;
  customerConsentRequired: boolean;
  canCombineWithWallet: boolean;
  canStack: boolean;
  canCombineWithManualDiscount: boolean;
  canCombineWithCustomerPricing: boolean;
  maximumPromotionsPerBill: number;
  bestOfferOnly: boolean;
  branches: Branch[];
  customerSegments: string[];
  productIds: string[];
  categories: string[];
  excludedProductIds: string[];
  excludedCategories: string[];
  excludeCustomItems: boolean;
  excludeDeliveryCharges: boolean;
  excludePackagingCharges: boolean;
  excludeTaxes: boolean;
  rules: PromotionRule[];
  totalBudget: number | null;
  dailyBudget: number | null;
  totalRedemptionLimit: number | null;
  dailyRedemptionLimit: number | null;
  perCustomerLimit: number | null;
  maximumDiscountPerBill: number | null;
  automaticPauseOnBudget: boolean;
  redemptions: number;
  discountGiven: number;
  revenueGenerated: number;
  createdAt: string;
  updatedAt: string;
  internalNotes: string | null;
  imageUrl?: string | null;
  billingChannels?: string[];
  perMobileLimit?: number | null;
  maximumWalletCashbackPerCustomer?: number | null;
  approvalLimit?: number | null;
  offersShown?: number;
  promptsDisplayed?: number;
  promptsAccepted?: number;
  promotionsApplied?: number;
  walletCashbackIssued?: number;
  incrementalAmount?: number;
  cancelledBills?: number;
  refundedBills?: number;
  estimatedMargin?: number;
  topBranch?: string | null;
}

export interface PromotionCartLine {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unitPrice: number;
  inStock?: boolean;
  isCustom?: boolean;
  margin?: number;
}

export interface PromotionEvaluationInput {
  branch: Branch;
  customer?: WalletCustomer | null;
  lines: PromotionCartLine[];
  packagingCharges?: number;
  deliveryCharges?: number;
  taxes?: number;
  couponCode?: string;
  at?: Date;
  paymentIncludesWallet?: boolean;
  selectedCampaignIds?: string[];
  billingChannel?: string;
}

export interface PromotionSuggestion {
  itemId: string;
  itemName: string;
  price: number;
  message: string;
}

export interface AppliedPromotion {
  campaignId: string;
  campaignName: string;
  campaignCode: string;
  discount: number;
  cashback: number;
  freeItems: Array<{ itemId?: string; name: string; quantity: number }>;
  reason: string;
}

export interface PromotionEvaluation {
  originalSubtotal: number;
  eligibleSubtotal: number;
  discount: number;
  payableSubtotal: number;
  cashback: number;
  applied: AppliedPromotion[];
  eligible: Array<{ campaignId: string; campaignName: string; estimatedDiscount: number; requiresSelection?: boolean }>;
  nearThreshold: null | {
    campaignId: string;
    campaignName: string;
    threshold: number;
    remaining: number;
    expectedDiscount: number;
    message: string;
    suggestions: PromotionSuggestion[];
  };
  excludedLines: Array<{ id: string; name: string; reason: string }>;
  reasons: string[];
}

export interface WalletCheckoutSelection {
  wallet: WalletCustomer;
  amount: number;
  otherMode: 'cash' | 'upi' | 'card' | 'credit' | null;
}
