/**
 * The seller terms and product standards vendors accept. The version is recorded when a vendor applies or accepts again
 * (vendor_private.terms_version); change it, and the date, whenever the text on /sell/terms or /sell/standards changes in a way
 * vendors must agree to again. A lawyer should review these before launch (docs/LEGAL_AND_PRIVACY.md).
 */
export const vendorTermsVersion = '2026-11-03';
export const vendorTermsUpdated = '3 November 2026';

/** What may not be sold. Shown in the seller terms, and checked when a store or product is approved. */
export const prohibitedProducts = [
  'Counterfeit, replica or “inspired by” copies of a brand’s products, or products you can’t show came from the brand or an authorised distributor.',
  'Anything past its expiry date, or with less than six months left unless the listing says so and the price reflects it.',
  'Opened, used, refilled or tampered-with products, and testers or samples not meant for sale.',
  'Products that are banned, recalled or withdrawn in Ghana, or that need a registration or licence (for example from the Food and Drugs Authority) that you don’t have.',
  'Skin-lightening or bleaching products with banned or restricted ingredients such as mercury or hydroquinone.',
  'Prescription or controlled medicines, and medical devices that need a licence.',
  'Alcohol, tobacco, vapes, weapons, and adult products.',
  'Children’s products that don’t meet basic safety rules: toys with small parts sold for under-3s, loose cords on baby clothing, unlabelled baby food.',
  'Stolen goods, goods you don’t have in stock, and anything illegal to sell in Ghana.',
] as const;

/** How a product is judged. The admin's approval checklist uses the same eight points. */
export const productStandards: { title: string; points: string[] }[] = [
  {
    title: 'Photos',
    points: [
      'Photos of the real product you will send, not another brand’s picture or a stock image of something similar.',
      'At least three where you can: the front, the back or label, and the product out of its box. Plain background, well lit, no watermarks or logos of other shops.',
      'A photo of the label showing the batch number and expiry date for cosmetics, baby products and food.',
    ],
  },
  {
    title: 'Name and description',
    points: [
      'The name says the brand, the product and the size. No all-capitals, no “BEST”, no misleading brand names.',
      'The description is accurate and says what the product is, what is in the pack and who it is for.',
    ],
  },
  {
    title: 'Claims',
    points: [
      'No medical or “cure” claims: never say a product cures, treats, heals or prevents an illness or condition (acne, eczema, infections, diabetes and so on).',
      'No guaranteed results, and no “before and after” promises you can’t prove.',
    ],
  },
  {
    title: 'Ingredients and materials',
    points: [
      'Cosmetics and skincare: the full ingredients list (INCI names), copied from the pack.',
      'Toys, clothing and home goods: the materials, the recommended age, and any size or weight limits.',
    ],
  },
  {
    title: 'Expiry and batch',
    points: [
      'The batch number and expiry (or “period after opening” symbol) on every pack, matching what you list.',
      'Keep at least six months before expiry on anything you send out; tell us about shorter dates before you list them.',
    ],
  },
  {
    title: 'Authenticity',
    points: [
      'Buy from the brand or an authorised distributor, and keep the invoices: we may ask to see them at any time.',
      'If a shopper reports a fake and it is upheld, the item is refunded from your earnings, the product comes off, and a second upheld case ends your store (see the seller terms).',
    ],
  },
  {
    title: 'Registration',
    points: [
      'Cosmetics, baby food, supplements and other regulated products carry the registration number the Food and Drugs Authority requires; put it in the listing.',
    ],
  },
  {
    title: 'Safety',
    points: [
      'Warnings and age guidance from the pack are in the listing (choking hazard, patch test, keep out of reach of children).',
      'Packaging is sealed, clean and undamaged, and each product is packed so it arrives intact.',
    ],
  },
];
