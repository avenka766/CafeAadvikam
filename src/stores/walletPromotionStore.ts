import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { Branch } from '@/branch/types';
import type {
  PromotionCampaign,
  PromotionRule,
  WalletCustomer,
  WalletCustomerType,
  WalletDeductionPriority,
  WalletPaymentMode,
  WalletStatus,
  WalletTransaction,
} from '@/features/commerce/types';

const amount = (value: unknown) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const text = (value: unknown) => value == null ? null : String(value);
const normalizePhone = (value: string) => value.replace(/\D/g, '').slice(-10);

function walletFromRow(row: Record<string, unknown>): WalletCustomer {
  const paid = amount(row.paid_balance);
  const promotional = amount(row.promotional_balance);
  return {
    id: String(row.id),
    customerId: text(row.customer_id),
    walletNumber: String(row.wallet_number || row.id),
    customerName: String(row.customer_name || 'Customer'),
    mobile: String(row.mobile || ''),
    alternateMobile: text(row.alternate_mobile),
    email: text(row.email),
    dateOfBirth: text(row.date_of_birth),
    anniversaryDate: text(row.anniversary_date),
    address: text(row.address),
    customerType: String(row.customer_type || 'Regular') as WalletCustomerType,
    preferredBranch: (row.preferred_branch ? String(row.preferred_branch) : null) as Branch | null,
    status: String(row.status || 'active').toLowerCase() as WalletStatus,
    paidBalance: paid,
    promotionalBalance: promotional,
    totalBalance: amount(row.total_balance ?? paid + promotional),
    lifetimeCredits: amount(row.lifetime_credits),
    lifetimeSpend: amount(row.lifetime_spend),
    totalPurchases: Number(row.total_purchases || 0),
    transactionLimit: row.transaction_limit == null ? null : amount(row.transaction_limit),
    dailyLimit: row.daily_limit == null ? null : amount(row.daily_limit),
    highValueAuthorizationLimit: row.high_value_authorization_limit == null ? null : amount(row.high_value_authorization_limit),
    deductionPriority: String(row.deduction_priority || 'promotional_first') as WalletDeductionPriority,
    notes: text(row.notes),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || row.created_at || new Date().toISOString()),
    createdBy: text(row.created_by_username || row.created_by),
    lastRechargeAt: text(row.last_recharge_at),
    lastPurchaseAt: text(row.last_purchase_at),
    mergedIntoWalletId: text(row.merged_into_wallet_id),
    expiringPromotionalAmount: amount(row.expiring_promotional_amount),
    promotionalExpiryDate: text(row.next_promotional_expiry),
    birthdayEligible: Boolean(row.birthday_eligible),
    anniversaryEligible: Boolean(row.anniversary_eligible),
    inactiveDays: row.inactive_days == null ? null : Number(row.inactive_days),
  };
}

function transactionFromRow(row: Record<string, unknown>): WalletTransaction {
  return {
    id: String(row.id),
    walletId: String(row.wallet_id),
    walletNumber: text(row.wallet_number) || undefined,
    customerName: text(row.customer_name) || undefined,
    branch: (row.branch ? String(row.branch) : null) as Branch | null,
    billId: text(row.bill_id),
    billNumber: text(row.bill_number),
    campaignId: text(row.campaign_id),
    transactionType: String(row.transaction_type || 'credit') as WalletTransaction['transactionType'],
    amount: amount(row.amount),
    paidAmount: amount(row.paid_amount),
    promotionalAmount: amount(row.promotional_amount),
    previousPaidBalance: amount(row.previous_paid_balance),
    previousPromotionalBalance: amount(row.previous_promotional_balance),
    newPaidBalance: amount(row.new_paid_balance),
    newPromotionalBalance: amount(row.new_promotional_balance),
    paymentMode: (row.payment_mode ? String(row.payment_mode) : null) as WalletTransaction['paymentMode'],
    referenceNumber: text(row.reference_number),
    description: text(row.description),
    status: String(row.status || 'completed') as WalletTransaction['status'],
    idempotencyKey: String(row.idempotency_key || row.id),
    createdBy: text(row.created_by_username || row.created_by),
    approvedBy: text(row.approved_by_username || row.approved_by),
    createdAt: String(row.created_at || new Date().toISOString()),
    reversalReference: text(row.reversal_reference),
  };
}

function campaignFromRow(row: Record<string, unknown>): PromotionCampaign {
  const rules = Array.isArray(row.rules) ? row.rules as PromotionRule[] : [];
  return {
    id: String(row.id),
    campaignName: String(row.campaign_name || 'Promotion'),
    campaignCode: String(row.campaign_code || ''),
    title: String(row.customer_title || row.campaign_name || 'Promotion'),
    message: String(row.customer_message || ''),
    description: text(row.description),
    terms: text(row.terms_and_conditions),
    status: String(row.status || 'Draft') as PromotionCampaign['status'],
    startDate: String(row.start_date || new Date().toISOString().slice(0, 10)),
    endDate: String(row.end_date || new Date().toISOString().slice(0, 10)),
    startTime: text(row.start_time),
    endTime: text(row.end_time),
    activeDays: Array.isArray(row.active_days) ? row.active_days.map(Number) : [],
    priority: Number(row.priority || 0),
    autoApply: Boolean(row.auto_apply),
    cashierApprovalRequired: Boolean(row.cashier_approval_required),
    customerConsentRequired: Boolean(row.customer_consent_required),
    canCombineWithWallet: row.combine_with_wallet !== false,
    canStack: Boolean(row.can_stack),
    canCombineWithManualDiscount: Boolean(row.combine_with_manual_discount),
    canCombineWithCustomerPricing: Boolean(row.combine_with_customer_pricing),
    maximumPromotionsPerBill: Number(row.maximum_promotions_per_bill || 1),
    bestOfferOnly: row.best_offer_only !== false,
    branches: Array.isArray(row.branches) ? row.branches as Branch[] : [],
    customerSegments: Array.isArray(row.customer_segments) ? row.customer_segments.map(String) : [],
    productIds: Array.isArray(row.product_ids) ? row.product_ids.map(String) : [],
    categories: Array.isArray(row.categories) ? row.categories.map(String) : [],
    excludedProductIds: Array.isArray(row.excluded_product_ids) ? row.excluded_product_ids.map(String) : [],
    excludedCategories: Array.isArray(row.excluded_categories) ? row.excluded_categories.map(String) : [],
    excludeCustomItems: Boolean(row.exclude_custom_items),
    excludeDeliveryCharges: Boolean(row.exclude_delivery_charges),
    excludePackagingCharges: Boolean(row.exclude_packaging_charges),
    excludeTaxes: Boolean(row.exclude_taxes),
    rules,
    totalBudget: row.total_budget == null ? null : amount(row.total_budget),
    dailyBudget: row.daily_budget == null ? null : amount(row.daily_budget),
    totalRedemptionLimit: row.total_redemption_limit == null ? null : Number(row.total_redemption_limit),
    dailyRedemptionLimit: row.daily_redemption_limit == null ? null : Number(row.daily_redemption_limit),
    perCustomerLimit: row.per_customer_limit == null ? null : Number(row.per_customer_limit),
    maximumDiscountPerBill: row.maximum_discount_per_bill == null ? null : amount(row.maximum_discount_per_bill),
    automaticPauseOnBudget: Boolean(row.automatic_pause_on_budget),
    redemptions: Number(row.redemptions || 0),
    discountGiven: amount(row.discount_given),
    revenueGenerated: amount(row.revenue_generated),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || row.created_at || new Date().toISOString()),
    internalNotes: text(row.internal_notes),
    imageUrl: text(row.image_url),
    billingChannels: Array.isArray(row.billing_channels) ? row.billing_channels.map(String) : [],
    perMobileLimit: row.per_mobile_limit == null ? null : Number(row.per_mobile_limit),
    maximumWalletCashbackPerCustomer: row.maximum_wallet_cashback_per_customer == null ? null : amount(row.maximum_wallet_cashback_per_customer),
    approvalLimit: row.approval_limit == null ? null : amount(row.approval_limit),
    offersShown: Number(row.offers_shown || 0),
    promptsDisplayed: Number(row.prompts_displayed || 0),
    promptsAccepted: Number(row.prompts_accepted || 0),
    promotionsApplied: Number(row.promotions_applied || 0),
    walletCashbackIssued: amount(row.wallet_cashback_issued),
    incrementalAmount: amount(row.incremental_amount),
    cancelledBills: Number(row.cancelled_bills || 0),
    refundedBills: Number(row.refunded_bills || 0),
    estimatedMargin: amount(row.estimated_margin),
    topBranch: text(row.top_branch),
  };
}

type NewWalletInput = {
  customerName: string;
  mobile: string;
  alternateMobile?: string;
  email?: string;
  dateOfBirth?: string;
  anniversaryDate?: string;
  address?: string;
  customerType: WalletCustomerType;
  preferredBranch?: Branch | null;
  openingBalance?: number;
  notes?: string;
  status?: WalletStatus;
};

type CreditWalletInput = {
  walletId: string;
  amount: number;
  paymentMode: WalletPaymentMode;
  referenceNumber?: string;
  description?: string;
  promotionalBonus?: number;
  promotionalExpiryDate?: string;
  branch?: Branch | null;
  notes?: string;
  idempotencyKey: string;
};

type WalletCustomerUpdateInput = {
  customerName: string; mobile: string; alternateMobile?: string; email?: string; dateOfBirth?: string; anniversaryDate?: string;
  address?: string; customerType: WalletCustomerType; preferredBranch?: Branch | null; notes?: string; reason: string;
};

type WalletAdjustmentInput = {
  walletId: string; paidDelta: number; promotionalDelta: number; reason: string; adminPin: string; branch?: Branch | null;
  promotionalExpiryDate?: string; idempotencyKey: string;
};

type NewCampaignInput = Omit<PromotionCampaign, 'id' | 'createdAt' | 'updatedAt' | 'redemptions' | 'discountGiven' | 'revenueGenerated'>;

type WalletPromotionState = {
  wallets: WalletCustomer[];
  walletTransactions: WalletTransaction[];
  promotions: PromotionCampaign[];
  loadingWallets: boolean;
  loadingPromotions: boolean;
  error: string;
  lastLoadedAt: number | null;
  loadWallets: (force?: boolean) => Promise<void>;
  loadPromotions: (force?: boolean) => Promise<void>;
  findWallets: (query: string) => WalletCustomer[];
  searchBillingWallets: (query: string, branch: Branch) => Promise<WalletCustomer[]>;
  loadBillingPromotions: (branch: Branch) => Promise<PromotionCampaign[]>;
  recordPromotionExposure: (campaignId: string, branch: Branch, eventType: 'offer_shown' | 'prompt_displayed' | 'prompt_accepted', idempotencyKey: string, incrementalAmount?: number) => Promise<void>;
  createWallet: (input: NewWalletInput) => Promise<WalletCustomer>;
  creditWallet: (input: CreditWalletInput) => Promise<WalletTransaction>;
  updateWalletCustomer: (walletId: string, input: WalletCustomerUpdateInput) => Promise<WalletCustomer>;
  adjustWalletBalance: (input: WalletAdjustmentInput) => Promise<WalletTransaction>;
  mergeWallets: (sourceWalletId: string, targetWalletId: string, reason: string, adminPin: string) => Promise<WalletCustomer>;
  reverseWalletTransaction: (transactionId: string, reason: string, adminPin?: string) => Promise<WalletTransaction>;
  updateWalletStatus: (walletId: string, status: WalletStatus, reason: string, adminPin?: string) => Promise<void>;
  updateWalletLimits: (walletId: string, transactionLimit: number | null, dailyLimit: number | null, deductionPriority: WalletDeductionPriority, highValueAuthorizationLimit: number | null) => Promise<void>;
  createPromotion: (input: NewCampaignInput) => Promise<PromotionCampaign>;
  updatePromotion: (campaignId: string, input: NewCampaignInput) => Promise<PromotionCampaign>;
  updatePromotionStatus: (campaignId: string, status: PromotionCampaign['status'], reason?: string) => Promise<void>;
};

export const useWalletPromotionStore = create<WalletPromotionState>((set, get) => ({
  wallets: [],
  walletTransactions: [],
  promotions: [],
  loadingWallets: false,
  loadingPromotions: false,
  error: '',
  lastLoadedAt: null,

  loadWallets: async (force = false) => {
    if (get().loadingWallets) return;
    if (!force && get().lastLoadedAt && Date.now() - get().lastLoadedAt! < 30_000) return;
    set({ loadingWallets: true, error: '' });
    const [{ data: walletRows, error: walletError }, { data: transactionRows, error: transactionError }] = await Promise.all([
      supabase.from('wallet_customer_summary').select('*').order('updated_at', { ascending: false }).limit(2000),
      supabase.from('wallet_transaction_summary').select('*').order('created_at', { ascending: false }).limit(3000),
    ]);
    if (walletError) {
      set({ loadingWallets: false, error: /wallet_customer_summary|schema cache|does not exist/i.test(walletError.message) ? 'Wallet database migration is not installed yet.' : walletError.message });
      return;
    }
    set({
      wallets: (walletRows || []).map((row) => walletFromRow(row as Record<string, unknown>)),
      walletTransactions: transactionError ? get().walletTransactions : (transactionRows || []).map((row) => transactionFromRow(row as Record<string, unknown>)),
      loadingWallets: false,
      lastLoadedAt: Date.now(),
    });
  },

  loadPromotions: async (force = false) => {
    if (get().loadingPromotions) return;
    if (!force && get().lastLoadedAt && Date.now() - get().lastLoadedAt! < 30_000 && get().promotions.length) return;
    set({ loadingPromotions: true, error: '' });
    const { data, error } = await supabase.from('promotion_campaign_summary').select('*').order('priority', { ascending: false }).order('updated_at', { ascending: false }).limit(1000);
    if (error) {
      set({ loadingPromotions: false, error: /promotion_campaign_summary|schema cache|does not exist/i.test(error.message) ? 'Promotions database migration is not installed yet.' : error.message });
      return;
    }
    set({ promotions: (data || []).map((row) => campaignFromRow(row as Record<string, unknown>)), loadingPromotions: false, lastLoadedAt: Date.now() });
  },

  findWallets: (query) => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return get().wallets.slice(0, 20);
    const phone = normalizePhone(query);
    return get().wallets.filter((wallet) =>
      wallet.customerName.toLowerCase().includes(normalized) ||
      wallet.walletNumber.toLowerCase().includes(normalized) ||
      (phone && normalizePhone(wallet.mobile).includes(phone))
    ).slice(0, 20);
  },

  searchBillingWallets: async (query, branch) => {
    const value = query.trim();
    if (!value) return [];
    const { data, error } = await supabase.rpc('search_wallets_for_billing_secure', {
      p_query: value,
      p_branch: branch,
      p_limit: 20,
    });
    if (error) throw new Error(error.message);
    return (Array.isArray(data) ? data : []).map((row) => walletFromRow(row as Record<string, unknown>));
  },

  loadBillingPromotions: async (branch) => {
    const { data, error } = await supabase.rpc('get_active_promotions_for_billing_secure', { p_branch: branch });
    if (error) throw new Error(error.message);
    return (Array.isArray(data) ? data : []).map((row) => campaignFromRow(row as Record<string, unknown>));
  },

  recordPromotionExposure: async (campaignId, branch, eventType, idempotencyKey, incrementalAmount = 0) => {
    const { error } = await supabase.rpc('record_campaign_exposure_secure', {
      p_promotion_id: campaignId,
      p_branch: branch,
      p_event_type: eventType,
      p_idempotency_key: idempotencyKey,
      p_incremental_amount: amount(incrementalAmount),
    });
    if (error) throw new Error(error.message);
  },

  createWallet: async (input) => {
    const mobile = normalizePhone(input.mobile);
    if (mobile.length !== 10) throw new Error('Enter a valid 10-digit mobile number.');
    if (get().wallets.some((wallet) => normalizePhone(wallet.mobile) === mobile)) throw new Error('A wallet already exists for this mobile number.');
    const { data, error } = await supabase.rpc('create_customer_wallet_secure', {
      p_customer_name: input.customerName.trim(),
      p_mobile: mobile,
      p_alternate_mobile: normalizePhone(input.alternateMobile || '') || null,
      p_email: input.email?.trim() || null,
      p_date_of_birth: input.dateOfBirth || null,
      p_anniversary_date: input.anniversaryDate || null,
      p_address: input.address?.trim() || null,
      p_customer_type: input.customerType,
      p_preferred_branch: input.preferredBranch || null,
      p_opening_balance: amount(input.openingBalance),
      p_notes: input.notes?.trim() || null,
      p_status: input.status || 'active',
      p_idempotency_key: `wallet-create:${mobile}`,
    });
    if (error) throw new Error(error.message.includes('WALLET_EXISTS') ? 'A wallet already exists for this mobile number.' : error.message);
    const created = walletFromRow((data || {}) as Record<string, unknown>);
    set((state) => ({ wallets: [created, ...state.wallets.filter((wallet) => wallet.id !== created.id)] }));
    return created;
  },

  creditWallet: async (input) => {
    if (amount(input.amount) <= 0 && amount(input.promotionalBonus) <= 0) throw new Error('Enter a paid amount or promotional bonus greater than zero.');
    const { data, error } = await supabase.rpc('credit_customer_wallet_secure', {
      p_wallet_id: input.walletId,
      p_paid_amount: amount(input.amount),
      p_promotional_amount: amount(input.promotionalBonus),
      p_payment_mode: input.paymentMode,
      p_reference_number: input.referenceNumber?.trim() || null,
      p_description: input.description?.trim() || null,
      p_promotional_expiry_date: input.promotionalExpiryDate || null,
      p_branch: input.branch || null,
      p_notes: input.notes?.trim() || null,
      p_idempotency_key: input.idempotencyKey,
    });
    if (error) throw new Error(error.message);
    const transaction = transactionFromRow((data || {}) as Record<string, unknown>);
    await get().loadWallets(true);
    return transaction;
  },

  updateWalletCustomer: async (walletId, input) => {
    const { data, error } = await supabase.rpc('update_wallet_customer_secure', {
      p_wallet_id: walletId,
      p_customer: {
        customerName: input.customerName.trim(), mobile: normalizePhone(input.mobile), alternateMobile: normalizePhone(input.alternateMobile || ''),
        email: input.email?.trim() || '', dateOfBirth: input.dateOfBirth || '', anniversaryDate: input.anniversaryDate || '',
        address: input.address?.trim() || '', customerType: input.customerType, preferredBranch: input.preferredBranch || '', notes: input.notes?.trim() || '',
      },
      p_reason: input.reason.trim() || 'Customer details updated',
    });
    if (error) throw new Error(error.message.includes('WALLET_EXISTS') ? 'Another wallet already uses this mobile number.' : error.message);
    const updated = walletFromRow((data || {}) as Record<string, unknown>);
    set((state) => ({ wallets: state.wallets.map((wallet) => wallet.id === updated.id ? updated : wallet) }));
    return updated;
  },

  adjustWalletBalance: async (input) => {
    const { data, error } = await supabase.rpc('adjust_wallet_balance_secure', {
      p_wallet_id: input.walletId, p_paid_delta: amount(input.paidDelta), p_promotional_delta: amount(input.promotionalDelta),
      p_reason: input.reason.trim(), p_admin_pin: input.adminPin, p_branch: input.branch || null,
      p_promotional_expiry_date: input.promotionalExpiryDate || null, p_idempotency_key: input.idempotencyKey,
    });
    if (error) throw new Error(error.message);
    const transaction = transactionFromRow((data || {}) as Record<string, unknown>);
    await get().loadWallets(true);
    return transaction;
  },

  mergeWallets: async (sourceWalletId, targetWalletId, reason, adminPin) => {
    const { data, error } = await supabase.rpc('merge_customer_wallets_secure', {
      p_source_wallet_id: sourceWalletId, p_target_wallet_id: targetWalletId, p_reason: reason.trim(), p_admin_pin: adminPin,
      p_idempotency_key: `wallet-merge:${sourceWalletId}:${targetWalletId}`,
    });
    if (error) throw new Error(error.message);
    const target = walletFromRow((data || {}) as Record<string, unknown>);
    await get().loadWallets(true);
    return target;
  },

  reverseWalletTransaction: async (transactionId, reason, adminPin) => {
    if (!reason.trim()) throw new Error('Reversal reason is required.');
    const { data, error } = await supabase.rpc('reverse_wallet_transaction_secure', {
      p_transaction_id: transactionId,
      p_reason: reason.trim(),
      p_admin_pin: adminPin || null,
      p_idempotency_key: `wallet-reversal:${transactionId}`,
    });
    if (error) throw new Error(error.message);
    const transaction = transactionFromRow((data || {}) as Record<string, unknown>);
    await get().loadWallets(true);
    return transaction;
  },

  updateWalletStatus: async (walletId, status, reason, adminPin) => {
    const { error } = await supabase.rpc('set_wallet_status_secure', { p_wallet_id: walletId, p_status: status, p_reason: reason.trim(), p_admin_pin: adminPin || null });
    if (error) throw new Error(error.message);
    await get().loadWallets(true);
  },

  updateWalletLimits: async (walletId, transactionLimit, dailyLimit, deductionPriority, highValueAuthorizationLimit) => {
    const { error } = await supabase.rpc('set_wallet_limits_secure', {
      p_wallet_id: walletId,
      p_transaction_limit: transactionLimit,
      p_daily_limit: dailyLimit,
      p_deduction_priority: deductionPriority,
    });
    if (error) throw new Error(error.message);
    await get().loadWallets(true);
  },

  createPromotion: async (input) => {
    const save = async (campaignId: string | null) => {
      const { data, error } = await supabase.rpc('upsert_promotion_campaign_secure', {
        p_campaign_id: campaignId,
        p_campaign: {
          campaign_name: input.campaignName, campaign_code: input.campaignCode, customer_title: input.title, customer_message: input.message,
          description: input.description, terms_and_conditions: input.terms, status: input.status, start_date: input.startDate, end_date: input.endDate,
          start_time: input.startTime, end_time: input.endTime, active_days: input.activeDays, priority: input.priority, image_url: input.imageUrl || null,
          auto_apply: input.autoApply, cashier_approval_required: input.cashierApprovalRequired, customer_consent_required: input.customerConsentRequired,
          combine_with_wallet: input.canCombineWithWallet, can_stack: input.canStack, combine_with_manual_discount: input.canCombineWithManualDiscount,
          combine_with_customer_pricing: input.canCombineWithCustomerPricing, maximum_promotions_per_bill: input.maximumPromotionsPerBill,
          best_offer_only: input.bestOfferOnly, branches: input.branches, billing_channels: input.billingChannels || [], customer_segments: input.customerSegments,
          product_ids: input.productIds, categories: input.categories, excluded_product_ids: input.excludedProductIds, excluded_categories: input.excludedCategories,
          exclude_custom_items: input.excludeCustomItems, exclude_delivery_charges: input.excludeDeliveryCharges, exclude_packaging_charges: input.excludePackagingCharges,
          exclude_taxes: input.excludeTaxes, rules: input.rules, total_budget: input.totalBudget, daily_budget: input.dailyBudget,
          total_redemption_limit: input.totalRedemptionLimit, daily_redemption_limit: input.dailyRedemptionLimit, per_customer_limit: input.perCustomerLimit,
          per_mobile_limit: input.perMobileLimit ?? null, maximum_discount_per_bill: input.maximumDiscountPerBill,
          maximum_wallet_cashback_per_customer: input.maximumWalletCashbackPerCustomer ?? null, approval_limit: input.approvalLimit ?? null,
          automatic_pause_on_budget: input.automaticPauseOnBudget, internal_notes: input.internalNotes,
        },
        p_reason: campaignId ? 'Campaign updated' : 'Campaign created',
      });
      if (error) throw new Error(error.message);
      const campaign = campaignFromRow((data || {}) as Record<string, unknown>);
      set((state) => ({ promotions: [campaign, ...state.promotions.filter((item) => item.id !== campaign.id)] }));
      return campaign;
    };
    return save(null);
  },

  updatePromotion: async (campaignId, input) => {
    const { data, error } = await supabase.rpc('upsert_promotion_campaign_secure', {
      p_campaign_id: campaignId,
      p_campaign: {
        campaign_name: input.campaignName, campaign_code: input.campaignCode, customer_title: input.title, customer_message: input.message,
        description: input.description, terms_and_conditions: input.terms, status: input.status, start_date: input.startDate, end_date: input.endDate,
        start_time: input.startTime, end_time: input.endTime, active_days: input.activeDays, priority: input.priority, image_url: input.imageUrl || null,
        auto_apply: input.autoApply, cashier_approval_required: input.cashierApprovalRequired, customer_consent_required: input.customerConsentRequired,
        combine_with_wallet: input.canCombineWithWallet, can_stack: input.canStack, combine_with_manual_discount: input.canCombineWithManualDiscount,
        combine_with_customer_pricing: input.canCombineWithCustomerPricing, maximum_promotions_per_bill: input.maximumPromotionsPerBill,
        best_offer_only: input.bestOfferOnly, branches: input.branches, billing_channels: input.billingChannels || [], customer_segments: input.customerSegments,
        product_ids: input.productIds, categories: input.categories, excluded_product_ids: input.excludedProductIds, excluded_categories: input.excludedCategories,
        exclude_custom_items: input.excludeCustomItems, exclude_delivery_charges: input.excludeDeliveryCharges, exclude_packaging_charges: input.excludePackagingCharges,
        exclude_taxes: input.excludeTaxes, rules: input.rules, total_budget: input.totalBudget, daily_budget: input.dailyBudget,
        total_redemption_limit: input.totalRedemptionLimit, daily_redemption_limit: input.dailyRedemptionLimit, per_customer_limit: input.perCustomerLimit,
        per_mobile_limit: input.perMobileLimit ?? null, maximum_discount_per_bill: input.maximumDiscountPerBill,
        maximum_wallet_cashback_per_customer: input.maximumWalletCashbackPerCustomer ?? null, approval_limit: input.approvalLimit ?? null,
        automatic_pause_on_budget: input.automaticPauseOnBudget, internal_notes: input.internalNotes,
      },
      p_reason: 'Campaign updated',
    });
    if (error) throw new Error(error.message);
    const campaign = campaignFromRow((data || {}) as Record<string, unknown>);
    set((state) => ({ promotions: [campaign, ...state.promotions.filter((item) => item.id !== campaign.id)] }));
    return campaign;
  },

  updatePromotionStatus: async (campaignId, status, reason) => {
    const { error } = await supabase.rpc('set_promotion_status_secure', { p_campaign_id: campaignId, p_status: status, p_reason: reason?.trim() || null });
    if (error) throw new Error(error.message);
    await get().loadPromotions(true);
  },
}));
