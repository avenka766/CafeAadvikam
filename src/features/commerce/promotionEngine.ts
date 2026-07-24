import type {
  AppliedPromotion,
  PromotionCampaign,
  PromotionCartLine,
  PromotionEvaluation,
  PromotionEvaluationInput,
  PromotionRule,
  PromotionSuggestion,
} from './types';

const money = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function timeMinutes(value: string | null | undefined) {
  if (!value) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
}

function isCampaignLive(campaign: PromotionCampaign, at: Date) {
  if (campaign.status !== 'Active') return false;
  const today = dateKey(at);
  if (today < campaign.startDate || today > campaign.endDate) return false;
  if (campaign.activeDays.length && !campaign.activeDays.includes(at.getDay())) return false;
  const currentMinutes = at.getHours() * 60 + at.getMinutes();
  const start = timeMinutes(campaign.startTime);
  const end = timeMinutes(campaign.endTime);
  if (start !== null && currentMinutes < start) return false;
  if (end !== null && currentMinutes > end) return false;
  return true;
}

function campaignMatchesCustomer(campaign: PromotionCampaign, input: PromotionEvaluationInput) {
  const wallet = input.customer;
  if (wallet && wallet.status !== 'active') return false;
  if (!campaign.customerSegments.length) return true;
  return campaign.customerSegments.some((segment) => {
    const normalized = segment.toLowerCase().trim();
    if (normalized === 'all') return true;
    if (!wallet) return normalized === 'new' || normalized === 'new customers';
    if (normalized === 'existing' || normalized === 'existing customers' || normalized === 'wallet' || normalized === 'wallet customers') return true;
    if (normalized === wallet.customerType.toLowerCase()) return true;
    if (normalized === 'birthday' || normalized === 'birthday customers') return wallet.birthdayEligible === true;
    if (normalized === 'anniversary' || normalized === 'anniversary customers') return wallet.anniversaryEligible === true;
    if (normalized === 'inactive' || normalized === 'inactive customers') return Number(wallet.inactiveDays || 0) >= 30;
    return false;
  });
}

function ruleMatchesCustomer(rule: PromotionRule, input: PromotionEvaluationInput) {
  const wallet = input.customer;
  if (rule.type === 'wallet_cashback' && !wallet) return false;
  if (rule.type === 'first_purchase') return Boolean(wallet && wallet.totalPurchases === 0);
  if (rule.type === 'birthday') return wallet?.birthdayEligible === true;
  if (rule.type === 'anniversary') return wallet?.anniversaryEligible === true;
  if (rule.type === 'inactive_customer') return Boolean(wallet && Number(wallet.inactiveDays || 0) >= Number(rule.inactiveDays || 30));
  return true;
}

function couponMatches(rule: PromotionRule, couponCode: string | undefined) {
  if (rule.type !== 'coupon') return true;
  const required = String(rule.couponCode || '').trim().toUpperCase();
  const entered = String(couponCode || '').trim().toUpperCase();
  return Boolean(entered && (!required || required === entered));
}

function eligibleLines(campaign: PromotionCampaign, lines: PromotionCartLine[]) {
  const excluded: Array<{ id: string; name: string; reason: string }> = [];
  const eligible = lines.filter((line) => {
    if (line.isCustom && campaign.excludeCustomItems) {
      excluded.push({ id: line.id, name: line.name, reason: 'Custom items are excluded' });
      return false;
    }
    if (campaign.excludedProductIds.includes(line.id)) {
      excluded.push({ id: line.id, name: line.name, reason: 'Product is excluded' });
      return false;
    }
    if (campaign.excludedCategories.includes(line.category)) {
      excluded.push({ id: line.id, name: line.name, reason: 'Category is excluded' });
      return false;
    }
    const productScoped = campaign.productIds.length === 0 || campaign.productIds.includes(line.id);
    const categoryScoped = campaign.categories.length === 0 || campaign.categories.includes(line.category);
    if (!productScoped || !categoryScoped) return false;
    return true;
  });
  return { eligible, excluded };
}

function estimatedDiscount(rule: PromotionRule, subtotal: number, quantity: number) {
  if (rule.minimumPurchase && subtotal < rule.minimumPurchase) return 0;
  if (rule.maximumPurchase && subtotal > rule.maximumPurchase) return 0;
  if (rule.minimumQuantity && quantity < rule.minimumQuantity) return 0;
  let discount = 0;
  if (rule.type === 'purchase_value_percentage' || rule.type === 'quantity_discount' || rule.type === 'time_based' || rule.type === 'birthday' || rule.type === 'anniversary' || rule.type === 'first_purchase' || rule.type === 'inactive_customer') {
    discount = subtotal * Number(rule.percentageDiscount || 0) / 100;
  }
  if (rule.type === 'purchase_value_fixed' || rule.type === 'referral' || rule.type === 'pre_order') {
    discount = Number(rule.fixedDiscount || 0);
  }
  if (rule.type === 'coupon') {
    discount = Number(rule.fixedDiscount || 0) || subtotal * Number(rule.percentageDiscount || 0) / 100;
  }
  if (rule.maximumDiscount) discount = Math.min(discount, rule.maximumDiscount);
  return money(Math.min(subtotal, Math.max(0, discount)));
}

function cashbackFor(rule: PromotionRule, subtotal: number) {
  if (rule.type !== 'wallet_cashback') return 0;
  if (rule.minimumPurchase && subtotal < rule.minimumPurchase) return 0;
  let cashback = Number(rule.cashbackAmount || 0) + subtotal * Number(rule.cashbackPercentage || 0) / 100;
  if (rule.maximumCashback) cashback = Math.min(cashback, rule.maximumCashback);
  return money(Math.max(0, cashback));
}

function freeItemsFor(rule: PromotionRule, quantity: number, lines: PromotionCartLine[]) {
  if (rule.type !== 'buy_x_get_y' || !rule.buyQuantity || quantity < rule.buyQuantity) return [];
  const multiples = Math.floor(quantity / rule.buyQuantity);
  const freeQuantity = multiples * Number(rule.getQuantity || 1);
  if (freeQuantity <= 0) return [];

  const available = lines.filter((line) => line.inStock !== false && line.unitPrice > 0);
  const requestedId = String(rule.freeItemId || '').trim().toLowerCase();
  const requestedName = String(rule.freeItemName || '').trim().toLowerCase();
  const matched = requestedId || requestedName
    ? available.find((line) => String(line.id).trim().toLowerCase() === requestedId
      || line.name.trim().toLowerCase() === requestedId
      || line.name.trim().toLowerCase() === requestedName)
    : [...available].sort((left, right) => left.unitPrice - right.unitPrice)[0];

  // Never advertise a free product that is unavailable or outside the eligible catalogue.
  if (!matched) return [];
  return [{ itemId: matched.id, name: matched.name, quantity: freeQuantity }];
}

function suggestionCandidates(lines: PromotionCartLine[], remaining: number): PromotionSuggestion[] {
  return lines
    .filter((line) => line.inStock !== false && line.unitPrice > 0)
    .filter((line) => line.unitPrice <= Math.max(remaining * 1.6, remaining + 100))
    .sort((a, b) => {
      const aGap = Math.abs(a.unitPrice - remaining) - Number(a.margin || 0) * 0.01;
      const bGap = Math.abs(b.unitPrice - remaining) - Number(b.margin || 0) * 0.01;
      return aGap - bGap;
    })
    .slice(0, 3)
    .map((line) => ({
      itemId: line.id,
      itemName: line.name,
      price: line.unitPrice,
      message: `Add ${line.name} for ₹${money(line.unitPrice).toLocaleString('en-IN')} to move closer to the offer.`,
    }));
}

export function evaluatePromotions(campaigns: PromotionCampaign[], input: PromotionEvaluationInput): PromotionEvaluation {
  const at = input.at ?? new Date();
  const originalSubtotal = money(input.lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0));
  const candidates: Array<{ campaign: PromotionCampaign; applied: AppliedPromotion; eligibleSubtotal: number; excluded: PromotionEvaluation['excludedLines'] }> = [];
  const eligibleCampaigns: PromotionEvaluation['eligible'] = [];
  const reasons: string[] = [];
  let nearThreshold: PromotionEvaluation['nearThreshold'] = null;
  let allExcluded: PromotionEvaluation['excludedLines'] = [];

  campaigns.forEach((campaign) => {
    if (!isCampaignLive(campaign, at)) return;
    if (campaign.branches.length && !campaign.branches.includes(input.branch)) return;
    if (campaign.billingChannels?.length && (!input.billingChannel || !campaign.billingChannels.includes(input.billingChannel))) return;
    if (!campaignMatchesCustomer(campaign, input)) return;
    if (input.paymentIncludesWallet && !campaign.canCombineWithWallet) return;
    const matchingCoupon = campaign.rules.some((rule) => rule.type === 'coupon' && couponMatches(rule, input.couponCode));
    const requiresSelection = !campaign.autoApply || campaign.cashierApprovalRequired || campaign.customerConsentRequired;
    const selectedByCashier = Boolean(input.selectedCampaignIds?.includes(campaign.id));
    const scoped = eligibleLines(campaign, input.lines);
    const subtotal = money(scoped.eligible.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0));
    const quantity = scoped.eligible.reduce((sum, line) => sum + line.quantity, 0);
    allExcluded = [...allExcluded, ...scoped.excluded];
    let discount = 0;
    let cashback = 0;
    const freeItems: AppliedPromotion['freeItems'] = [];
    let qualifyingRule = false;

    campaign.rules.forEach((rule) => {
      if (!ruleMatchesCustomer(rule, input) || !couponMatches(rule, input.couponCode)) return;
      const ruleDiscount = estimatedDiscount(rule, subtotal, quantity);
      const ruleCashback = cashbackFor(rule, subtotal);
      const ruleFreeItems = freeItemsFor(rule, quantity, scoped.eligible);
      if (ruleDiscount > 0 || ruleCashback > 0 || ruleFreeItems.length > 0) qualifyingRule = true;
      discount += ruleDiscount;
      cashback += ruleCashback;
      freeItems.push(...ruleFreeItems);

      const threshold = Number(rule.minimumPurchase || 0);
      const remaining = money(threshold - subtotal);
      const promptRange = Number(rule.promptRange || 0);
      if (!qualifyingRule && threshold > 0 && remaining > 0 && promptRange > 0 && remaining <= promptRange) {
        const expected = rule.percentageDiscount
          ? money(threshold * rule.percentageDiscount / 100)
          : money(rule.fixedDiscount || 0);
        const proposal = {
          campaignId: campaign.id,
          campaignName: campaign.campaignName,
          threshold,
          remaining,
          expectedDiscount: expected,
          message: `Add eligible items worth ₹${remaining.toLocaleString('en-IN')} more to unlock ${rule.percentageDiscount ? `${rule.percentageDiscount}% off` : `₹${Number(rule.fixedDiscount || 0).toLocaleString('en-IN')} off`}.`,
          suggestions: suggestionCandidates(scoped.eligible, remaining),
        };
        if (!nearThreshold || proposal.remaining < nearThreshold.remaining) nearThreshold = proposal;
      }
    });

    discount = money(Math.min(subtotal, discount));
    if (campaign.maximumDiscountPerBill) discount = Math.min(discount, campaign.maximumDiscountPerBill);
    cashback = money(cashback);
    if (discount > 0 || cashback > 0 || freeItems.length > 0) {
      const applied: AppliedPromotion = {
        campaignId: campaign.id,
        campaignName: campaign.campaignName,
        campaignCode: campaign.campaignCode,
        discount,
        cashback,
        freeItems,
        reason: `${campaign.title || campaign.campaignName} applied`,
      };
      eligibleCampaigns.push({ campaignId: campaign.id, campaignName: campaign.campaignName, estimatedDiscount: discount, requiresSelection });
      if (!requiresSelection || selectedByCashier || matchingCoupon) {
        candidates.push({ campaign, applied, eligibleSubtotal: subtotal, excluded: scoped.excluded });
      }
    }
  });

  candidates.sort((a, b) => {
    const aValue = a.applied.discount + a.applied.cashback;
    const bValue = b.applied.discount + b.applied.cashback;
    if (a.campaign.bestOfferOnly || b.campaign.bestOfferOnly) return bValue - aValue;
    return b.campaign.priority - a.campaign.priority || bValue - aValue;
  });

  const applied: AppliedPromotion[] = [];
  for (const candidate of candidates) {
    if (!applied.length) {
      applied.push(candidate.applied);
      if (candidate.campaign.bestOfferOnly) break;
      continue;
    }
    const previous = candidates.find((entry) => entry.applied.campaignId === applied[0].campaignId)?.campaign;
    if (!candidate.campaign.canStack || !previous?.canStack) continue;
    const max = Math.min(candidate.campaign.maximumPromotionsPerBill || 1, previous.maximumPromotionsPerBill || 1);
    if (applied.length < max) applied.push(candidate.applied);
  }

  const discount = money(Math.min(originalSubtotal, applied.reduce((sum, item) => sum + item.discount, 0)));
  const cashback = money(applied.reduce((sum, item) => sum + item.cashback, 0));
  const eligibleSubtotal = candidates[0]?.eligibleSubtotal ?? originalSubtotal;
  if (!applied.length && !nearThreshold) reasons.push('No active promotion matches this cart, customer, branch, date, or time.');

  return {
    originalSubtotal,
    eligibleSubtotal,
    discount,
    payableSubtotal: money(Math.max(0, originalSubtotal - discount)),
    cashback,
    applied,
    eligible: eligibleCampaigns,
    nearThreshold,
    excludedLines: Array.from(new Map(allExcluded.map((row) => [row.id, row])).values()),
    reasons,
  };
}

export function promotionBoundaryEligible(value: number, threshold: number) {
  return money(value) >= money(threshold);
}
