/** Public address of a photo in the product-images Storage bucket. Works on the server and in the browser. */
export function photoUrl(path: string): string;
export function photoUrl(path: string | null | undefined): string | undefined;
export function photoUrl(path: string | null | undefined) {
  if (!path) return undefined;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${path}`;
}
