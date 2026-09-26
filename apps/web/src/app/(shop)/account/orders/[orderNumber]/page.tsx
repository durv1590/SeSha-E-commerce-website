import type { OrderDetailDto } from '@seshakart/types';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { OrderDetailView } from '@/components/orders/OrderDetailView';
import { ApiError } from '@/lib/api/errors';
import { serverApi } from '@/lib/api/server';

type Props = { params: Promise<{ orderNumber: string }> };

export async function generateMetadata({ params }: Props) {
  return { title: `Order ${(await params).orderNumber.toUpperCase()}` };
}

export default async function OrderPage({ params }: Props) {
  const orderNumber = (await params).orderNumber.toUpperCase();
  if (!/^SK\d{10,16}$/.test(orderNumber)) notFound();
  let order: OrderDetailDto;
  try {
    order = (await serverApi<OrderDetailDto>(`/orders/${orderNumber}`)).data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  return (
    <div className="flex flex-col gap-3">
      <Link
        href="/account/orders"
        className="inline-flex items-center gap-1 self-start text-small font-semibold"
      >
        <ChevronLeft size={16} aria-hidden="true" />
        All orders
      </Link>
      <OrderDetailView initial={order} />
    </div>
  );
}
