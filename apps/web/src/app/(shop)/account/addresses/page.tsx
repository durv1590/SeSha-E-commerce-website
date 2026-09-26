import type { AddressDto } from '@seshakart/types';
import { AddressBook } from '@/components/account/AddressBook';
import { serverApi } from '@/lib/api/server';

export const metadata = { title: 'Addresses' };

export default async function AddressesPage() {
  const { data } = await serverApi<AddressDto[]>('/users/me/addresses');
  return <AddressBook initial={data} />;
}
