import { Redirect } from 'expo-router';

/** The Bag tab is never selected (it opens the drawer instead); if it ever is, go straight to the drawer. */
export default function CartTab() {
  return <Redirect href="/bag" />;
}
