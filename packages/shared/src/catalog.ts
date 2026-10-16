/**
 * Starter catalogue from the design handoff.
 * The web store reads the catalogue from Supabase; this file generates supabase/seed.sql
 * (`npm run db:seed:generate`) and is what the mobile app reads until it moves to Supabase.
 */
import { colors } from './tokens';

/** Photos shipped in `assets/images`. Each app maps these keys to its own image source. */
export type ImageKey =
  | 'heroModel'
  | 'babyWash'
  | 'vitaminCSerum'
  | 'sheaBodyButter'
  | 'matteLipColour'
  | 'flashSale'
  | 'giftCollection';

export const imageFiles: Record<ImageKey, string> = {
  heroModel: 'hero-model.jpg',
  babyWash: 'baby-wash.jpg',
  vitaminCSerum: 'vitamin-c-serum.jpg',
  sheaBodyButter: 'shea-body-butter.jpg',
  matteLipColour: 'matte-lip-colour.jpg',
  flashSale: 'flash-sale.jpg',
  giftCollection: 'gift-collection.jpg',
};

/** Narrows a stored image key to one the apps have a photo for. */
export function asImageKey(key: string | null | undefined): ImageKey | undefined {
  return key && key in imageFiles ? (key as ImageKey) : undefined;
}

export type Department = 'beauty' | 'kids';

/** Shape used for the tinted placeholder when a product has no photo yet. */
export type ProductKind = 'bottle' | 'jar' | 'tube' | 'garment' | 'toy' | 'gift';

export type AgeBandId = '0-6m' | '6-12m' | '1-2y' | '3-5y' | '6-8y' | '9-12y';

export interface AgeBand {
  id: AgeBandId;
  label: string;
  stage: string;
}

export const ageBands: AgeBand[] = [
  { id: '0-6m', label: '0–6m', stage: 'Newborn' },
  { id: '6-12m', label: '6–12m', stage: 'Crawlers' },
  { id: '1-2y', label: '1–2y', stage: 'Toddlers' },
  { id: '3-5y', label: '3–5y', stage: 'Pre-school' },
  { id: '6-8y', label: '6–8y', stage: 'Early school' },
  { id: '9-12y', label: '9–12y', stage: 'Big kids' },
];

export type KidsFilter = 'bath' | 'toys' | 'clothing' | 'gifts';

export interface ProductSize {
  id: string;
  label: string;
  price: number;
  /** Undefined when stock isn't known (e.g. the bundled catalogue). */
  inStock?: boolean;
}

export interface Product {
  slug: string;
  name: string;
  brand?: string;
  department: Department;
  /** Category id from `categories`. */
  category: string;
  kidsFilter?: KidsFilter;
  /** Price in GHS for the default size. */
  price: number;
  /** Previous price in GHS when the product is on sale. */
  was?: number;
  badge?: string;
  /** Short trust or suitability line shown on product cards. */
  tag: string;
  summary: string;
  image?: ImageKey;
  tint: string;
  kind: ProductKind;
  sizes?: ProductSize[];
  defaultSize?: string;
  ageBands?: AgeBandId[];
  /** False when no size can be bought right now; undefined when stock isn't known. */
  inStock?: boolean;
  /** Sub-collection shown in the breadcrumb, e.g. "Bath time". */
  collection?: string;
  details?: ProductDetails;
  /** Regulatory and pack information (PRD FR-014). Missing values render as placeholders. */
  compliance?: ProductCompliance;
  /** The batch a shopper would receive next for each size (earliest expiry first). */
  currentBatches?: { sizeId?: string; batch: string; expiresOn?: string }[];
}

export interface ProductCompliance {
  ingredients?: string;
  countryOfOrigin?: string;
  regulatoryReference?: string;
  periodAfterOpening?: string;
}

/** Product-page content. Fields the catalogue team hasn't supplied render as placeholders. */
export interface ProductDetails {
  description: string;
  highlights: string[];
  freeFrom?: string[];
  recommendedAge?: string;
  warnings?: string;
  howToUse?: string;
  gallery?: GalleryView[];
}

export interface GalleryView {
  label: string;
  image: ImageKey;
  /** CSS object-position keyword used to frame the photo. */
  position: 'center' | 'left' | 'right';
}

export const products: Product[] = [
  {
    slug: 'gentle-baby-wash-shampoo',
    name: 'Gentle Baby Wash & Shampoo',
    brand: 'Little Nest',
    department: 'kids',
    category: 'baby-care',
    kidsFilter: 'bath',
    price: 85,
    badge: 'New',
    tag: 'Ages 0+ · Tear-free',
    summary: 'Mild hair and body wash, pH balanced for newborn skin.',
    image: 'babyWash',
    tint: colors.tealSoft,
    kind: 'bottle',
    sizes: [
      { id: '200', label: '200 ml', price: 50 },
      { id: '400', label: '400 ml', price: 85 },
    ],
    defaultSize: '400',
    ageBands: ['0-6m', '6-12m', '1-2y'],
    collection: 'Bath time',
    details: {
      description: 'A mild, tear-free wash for hair and body. Fragrance-free and pH balanced for newborn skin.',
      highlights: ['Ages 0+', 'Tear-free', 'Fragrance-free'],
      freeFrom: ['No added fragrance', 'No parabens', 'No hydroquinone or mercury'],
      recommendedAge: 'From birth (0+)',
      warnings: 'For external use only. Avoid direct contact with eyes. Stop use if irritation occurs.',
      howToUse:
        "Wet baby's hair and body with warm water. Massage a small amount into a lather, then rinse well. Suitable for daily use.",
      gallery: [
        { label: 'Front view', image: 'babyWash', position: 'center' },
        { label: 'Back label view', image: 'babyWash', position: 'left' },
        { label: 'Texture view', image: 'sheaBodyButter', position: 'center' },
        { label: 'Seal and batch code view', image: 'babyWash', position: 'right' },
      ],
    },
  },
  {
    slug: 'vitamin-c-brightening-serum',
    name: 'Vitamin C Brightening Serum',
    department: 'beauty',
    category: 'skincare',
    price: 220,
    was: 260,
    badge: '-15%',
    tag: 'Patch test advised',
    summary: 'A lightweight daily serum for brighter, more even-looking skin.',
    image: 'vitaminCSerum',
    tint: colors.blush,
    kind: 'bottle',
    sizes: [{ id: '30', label: '30 ml', price: 220 }],
    defaultSize: '30',
  },
  {
    slug: 'whipped-shea-body-butter',
    name: 'Whipped Shea Body Butter',
    department: 'beauty',
    category: 'skincare',
    price: 145,
    badge: 'New',
    tag: 'Fragrance-free',
    summary: 'Light, whipped shea butter that sinks in fast.',
    image: 'sheaBodyButter',
    tint: colors.surface,
    kind: 'jar',
  },
  {
    slug: 'velvet-matte-lip-colour',
    name: 'Velvet Matte Lip Colour',
    department: 'beauty',
    category: 'makeup',
    price: 75,
    was: 90,
    badge: '-15%',
    tag: 'Vegan formula',
    summary: 'Soft-matte colour with a comfortable, non-drying feel.',
    image: 'matteLipColour',
    tint: colors.blush,
    kind: 'tube',
  },
  {
    slug: 'organic-cotton-bodysuits',
    name: 'Organic Cotton Bodysuits, 3-pack',
    department: 'kids',
    category: 'baby-care',
    kidsFilter: 'clothing',
    price: 160,
    badge: 'New',
    tag: 'Ages 0–12m',
    summary: 'Soft organic cotton with easy snap fastenings.',
    tint: colors.tealPale,
    kind: 'garment',
    ageBands: ['0-6m', '6-12m'],
  },
  {
    slug: 'wooden-stacking-blocks',
    name: 'Wooden Stacking Blocks',
    department: 'kids',
    category: 'kids-toys',
    kidsFilter: 'toys',
    price: 120,
    was: 135,
    badge: '-10%',
    tag: 'Ages 1–3 · No small parts',
    summary: 'Chunky, smooth-edged blocks finished with non-toxic paint.',
    tint: colors.blush,
    kind: 'toy',
    ageBands: ['1-2y', '3-5y'],
  },
  {
    slug: 'wooden-number-puzzle',
    name: 'Wooden Number Puzzle',
    department: 'kids',
    category: 'kids-toys',
    kidsFilter: 'toys',
    price: 135,
    tag: 'Ages 2–5 · Chunky pieces',
    summary: 'Bright, non-toxic pieces for learning numbers, colours and shapes.',
    tint: colors.tealSoft,
    kind: 'toy',
    ageBands: ['1-2y', '3-5y'],
  },
  {
    slug: 'newborn-gift-hamper',
    name: 'Newborn Gift Hamper',
    department: 'kids',
    category: 'baby-care',
    kidsFilter: 'gifts',
    price: 450,
    tag: 'Ages 0–6m',
    summary: 'A wrapped set of newborn essentials, ready to give.',
    image: 'giftCollection',
    tint: colors.surface,
    kind: 'gift',
    ageBands: ['0-6m'],
  },
  {
    slug: 'argan-hair-oil',
    name: 'Argan Hair Oil, 250 ml',
    department: 'beauty',
    category: 'hair-care',
    price: 130,
    badge: 'New',
    tag: 'All hair types',
    summary: 'A light oil that smooths and adds shine without weighing hair down.',
    tint: colors.blush,
    kind: 'bottle',
  },
  {
    slug: 'shea-cocoa-body-butter',
    name: 'Shea & Cocoa Body Butter',
    department: 'beauty',
    category: 'skincare',
    price: 145,
    tag: 'Fragrance-free · 200 g',
    summary: 'Rich, fast-absorbing moisture made with Ghanaian shea.',
    tint: colors.surface,
    kind: 'jar',
  },
];

export function getProduct(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug);
}

export function getSize(product: Product, sizeId?: string): ProductSize | undefined {
  const id = sizeId ?? product.defaultSize;
  return product.sizes?.find((s) => s.id === id);
}

export function unitPrice(product: Product, sizeId?: string): number {
  return getSize(product, sizeId)?.price ?? product.price;
}

/** Whether a size (or a one-size product) can be bought; true when stock isn't known. */
export function isAvailable(product: Product, sizeId?: string): boolean {
  if (product.sizes?.length) return getSize(product, sizeId)?.inStock !== false;
  return product.inStock !== false;
}

export const departmentLabels: Record<Department, string> = {
  beauty: 'Beauty',
  kids: 'Baby & Kids',
};

function pick(slugs: string[]): Product[] {
  return slugs.map((slug) => {
    const product = getProduct(slug);
    if (!product) throw new Error(`Unknown product slug: ${slug}`);
    return product;
  });
}

export interface Category {
  id: string;
  name: string;
  department: Department;
  image?: ImageKey;
  tint: string;
  kind: ProductKind;
}

export const categories: Category[] = [
  { id: 'skincare', name: 'Skincare', department: 'beauty', image: 'vitaminCSerum', tint: colors.blush, kind: 'bottle' },
  { id: 'makeup', name: 'Makeup', department: 'beauty', image: 'matteLipColour', tint: colors.blush, kind: 'tube' },
  { id: 'hair-care', name: 'Hair Care', department: 'beauty', tint: colors.surface, kind: 'bottle' },
  { id: 'fragrance', name: 'Fragrance', department: 'beauty', tint: colors.blush, kind: 'bottle' },
  { id: 'baby-care', name: 'Baby Care', department: 'kids', image: 'babyWash', tint: colors.tealSoft, kind: 'bottle' },
  { id: 'kids-toys', name: 'Kids & Toys', department: 'kids', tint: colors.tealPale, kind: 'toy' },
];

/** Category shortcuts on the mobile home screen, per department. */
export const appCategories: Record<Department, Category[]> = {
  beauty: [
    categories[0],
    categories[1],
    { ...categories[2], name: 'Hair' },
    categories[3],
  ],
  kids: [
    { id: 'bath', name: 'Bath', department: 'kids', image: 'babyWash', tint: colors.tealSoft, kind: 'bottle' },
    { id: 'clothing', name: 'Clothing', department: 'kids', tint: colors.tealPale, kind: 'garment' },
    { id: 'toys', name: 'Toys', department: 'kids', tint: colors.blush, kind: 'toy' },
    { id: 'gifts', name: 'Gifts', department: 'kids', image: 'giftCollection', tint: colors.surface, kind: 'gift' },
  ],
};

export const newArrivals = pick([
  'gentle-baby-wash-shampoo',
  'vitamin-c-brightening-serum',
  'whipped-shea-body-butter',
  'velvet-matte-lip-colour',
  'organic-cotton-bodysuits',
  'wooden-stacking-blocks',
]);

export const bestSellers = pick(['shea-cocoa-body-butter', 'gentle-baby-wash-shampoo', 'wooden-number-puzzle']);

export const appNewArrivals: Record<Department, Product[]> = {
  beauty: pick(['vitamin-c-brightening-serum', 'whipped-shea-body-butter', 'velvet-matte-lip-colour', 'argan-hair-oil']),
  kids: pick(['gentle-baby-wash-shampoo', 'organic-cotton-bodysuits', 'wooden-stacking-blocks', 'wooden-number-puzzle']),
};

export const relatedProducts = pick([
  'organic-cotton-bodysuits',
  'wooden-stacking-blocks',
  'wooden-number-puzzle',
  'newborn-gift-hamper',
]);

export function productsForAgeBand(band: AgeBandId, filter?: KidsFilter): Product[] {
  return products.filter(
    (p) => p.ageBands?.includes(band) && (filter === undefined || p.kidsFilter === filter),
  );
}

export const deliveryAreas = ['East Legon', 'Osu', 'Airport Residential', 'Spintex', 'Dansoman'];

export type MomoNetwork = 'mtn' | 'telecel' | 'at';

export const momoNetworks: { id: MomoNetwork; label: string }[] = [
  { id: 'mtn', label: 'MTN MoMo' },
  { id: 'telecel', label: 'Telecel Cash' },
  { id: 'at', label: 'AT Money' },
];
