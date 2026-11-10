import type { Metadata } from "next";

import { DeliveriesBoard } from "@/features/drivers/components/deliveries-board";
import { getDriverBoard } from "@/features/drivers/services/driver.service";
import { deliveriesPageUser } from "@/features/warehouse/services/page-user";

export const metadata: Metadata = { title: "Deliveries" };
export const dynamic = "force-dynamic";

/**
 * `/warehouse/deliveries` — a driver's stops (102). Photograph the hand-over,
 * ask for the customer's code, confirm. Staff see every driver's stops here.
 */
export default async function DeliveriesPage() {
  const user = await deliveriesPageUser("/warehouse/deliveries");
  const board = await getDriverBoard(user);
  const firstName = user.profile?.first_name?.trim() || null;
  return <DeliveriesBoard board={board} firstName={firstName} />;
}
