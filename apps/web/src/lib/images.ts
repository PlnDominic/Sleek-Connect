import type { StaticImageData } from 'next/image';
import type { ImageKey } from '@sleek/shared';
import babyWash from '@sleek/shared/assets/images/baby-wash.jpg';
import flashSale from '@sleek/shared/assets/images/flash-sale.jpg';
import giftCollection from '@sleek/shared/assets/images/gift-collection.jpg';
import heroModel from '@sleek/shared/assets/images/hero-model.jpg';
import matteLipColour from '@sleek/shared/assets/images/matte-lip-colour.jpg';
import sheaBodyButter from '@sleek/shared/assets/images/shea-body-butter.jpg';
import vitaminCSerum from '@sleek/shared/assets/images/vitamin-c-serum.jpg';

export const images: Record<ImageKey, StaticImageData> = {
  babyWash,
  flashSale,
  giftCollection,
  heroModel,
  matteLipColour,
  sheaBodyButter,
  vitaminCSerum,
};
