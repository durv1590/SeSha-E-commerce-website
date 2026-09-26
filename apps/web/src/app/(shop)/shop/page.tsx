import { permanentRedirect } from 'next/navigation';

/** /shop is a permanent alias of the full catalogue. */
export default function ShopPage() {
  permanentRedirect('/products');
}
