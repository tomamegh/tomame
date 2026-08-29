import MyOrdersComponent from '@/features/orders/components/my-orders'
import React from 'react'

interface Props {
  searchParams: Promise<{ payment?: string }>
}

// `payment` is read here rather than with useSearchParams in the client tree so
// this route keeps its static prerender. Paystack redirects land here whenever
// the return could not be tied back to a specific order.
async function OrdersPage({ searchParams }: Props) {
  const { payment } = await searchParams

  return (
    <MyOrdersComponent paymentStatus={payment ?? null} />
  )
}

export default OrdersPage
