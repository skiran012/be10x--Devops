export const CASH_TYPES = ['cash', 'bank', 'savings'];
export const isCashType = (t) => CASH_TYPES.includes(t);
export const isLiabilityType = (t) => t === 'card' || t === 'loan';
export const UNCATEGORIZED_ID = 'cat-uncategorized';
export const INTEREST_CATEGORY_ID = 'cat-interest';
