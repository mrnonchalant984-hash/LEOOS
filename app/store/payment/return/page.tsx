import { PaymentReturnClient } from './payment-return-client';

export const metadata = { title: 'Payment update | LeoX Store' };

export default async function PaymentReturnPage({ searchParams }: PageProps<'/store/payment/return'>) {
  const params = await searchParams;
  return <PaymentReturnClient reference={typeof params.reference === 'string' ? params.reference : ''} />;
}
