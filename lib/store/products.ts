export const STORE_CATEGORIES = [
  'Electronics',
  'Phones and accessories',
  'Computers',
  'Fashion',
  'Shoes and clothing',
  'Vehicles',
  'Property',
  'Furniture',
  'Home appliances',
  'Beauty and personal care',
  'Agriculture',
  'Industrial equipment',
  'Construction materials',
  'Sports and recreation',
  'Books and education',
  'Musical instruments',
  'Business equipment',
  'Wholesale',
  'Services',
  'Other',
] as const;

export const PRODUCT_CONDITIONS = ['new', 'used', 'refurbished'] as const;

export type ProductCondition = (typeof PRODUCT_CONDITIONS)[number];

export type ProductInput = {
  title: string;
  description: string;
  category: string;
  price: number;
  currency: string;
  condition: string;
  countryCode: string;
  region: string;
  city: string;
};

export type ProductValidation =
  | { valid: true; value: Omit<ProductInput, 'condition'> & { condition: ProductCondition } }
  | { valid: false; error: string };

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const result = value.trim();
  if (!result || result.length > maxLength || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(result)) return null;
  return result;
}

export function validateProductInput(input: unknown): ProductValidation {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, error: 'Enter valid product details.' };
  }

  const value = input as Record<string, unknown>;
  const title = cleanText(value.title, 120);
  const description = cleanText(value.description, 5000);
  const category = cleanText(value.category, 80);
  const currency = cleanText(value.currency, 3)?.toUpperCase();
  const condition = cleanText(value.condition, 20)?.toLowerCase();
  const countryCode = cleanText(value.countryCode, 2)?.toUpperCase();
  const regionValue = value.region ?? '';
  const region = typeof regionValue === 'string' && regionValue.trim() === '' ? '' : cleanText(regionValue, 100);
  const city = cleanText(value.city, 100);
  const price = typeof value.price === 'number' ? value.price : Number.NaN;

  if (!title || title.length < 3) return { valid: false, error: 'Product name must be between 3 and 120 characters.' };
  if (!description || description.length < 10) return { valid: false, error: 'Description must be between 10 and 5,000 characters.' };
  if (!category || !STORE_CATEGORIES.includes(category as (typeof STORE_CATEGORIES)[number])) return { valid: false, error: 'Choose a supported product category.' };
  if (!Number.isFinite(price) || price <= 0 || price > 1_000_000_000_000) return { valid: false, error: 'Enter a valid positive price.' };
  if (!currency || !/^[A-Z]{3}$/.test(currency)) return { valid: false, error: 'Use a three-letter currency code such as NGN or KES.' };
  if (!condition || !PRODUCT_CONDITIONS.includes(condition as ProductCondition)) return { valid: false, error: 'Choose New, Used, or Refurbished.' };
  if (!countryCode || !/^[A-Z]{2}$/.test(countryCode)) return { valid: false, error: 'Use a two-letter country code such as NG or KE.' };
  if (!city) return { valid: false, error: 'Enter the product city.' };
  if (region === null) return { valid: false, error: 'Region must be 100 characters or fewer.' };

  return { valid: true, value: { title, description, category, price, currency, condition: condition as ProductCondition, countryCode, region, city } };
}

export function productSlug(title: string, id = globalThis.crypto.randomUUID()): string {
  const base = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 72)
    .replace(/-+$/g, '') || 'listing';
  return `${base}-${id.replace(/-/g, '').slice(0, 10).toLowerCase()}`;
}

export function formatProductPrice(price: number, currency: string, locale = 'en') {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 2 }).format(price);
  } catch {
    return `${currency} ${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(price)}`;
  }
}
