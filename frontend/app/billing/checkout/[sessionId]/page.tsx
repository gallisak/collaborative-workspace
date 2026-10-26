import type { Metadata } from 'next';
import { CheckoutPage } from '@/pages/checkout';

export const metadata: Metadata = { title: 'Checkout', robots: { index: false } };

export default function Page({ params }: PageProps<'/billing/checkout/[sessionId]'>) {
  return <CheckoutPage params={params} />;
}
