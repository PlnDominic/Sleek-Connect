'use client';

import { Icon } from './Icon';
import { useWishlist } from './WishlistProvider';

/** The heart: saves a product to the wishlist, or removes it. */
interface SaveButtonProps {
  slug: string;
  name: string;
  className?: string;
  /** Show "Save" / "Saved" next to the heart. */
  withLabel?: boolean;
}

export function SaveButton({ slug, name, className, withLabel = false }: SaveButtonProps) {
  const { has, toggle } = useWishlist();
  const saved = has(slug);
  return (
    <button
      type="button"
      aria-label={saved ? `Remove ${name} from saved items` : `Save ${name}`}
      aria-pressed={saved}
      className={className}
      data-saved={saved || undefined}
      onClick={() => toggle(slug)}
    >
      <Icon name={saved ? 'heartFilled' : 'heart'} size={17} />
      {withLabel && <span>{saved ? 'Saved' : 'Save'}</span>}
    </button>
  );
}
