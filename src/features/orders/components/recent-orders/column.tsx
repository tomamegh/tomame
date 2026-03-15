"use client";

import { Order } from "@/features/orders/types";
import { ColumnDef } from "@tanstack/react-table";
import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";

export const recentOrdersColumn: ColumnDef<Order>[] = [
  {
    accessorKey: "id",
    header: "Order ID",
  },
  {
    accessorKey: "productName",
    header: "Product Name",
  },
  {
    accessorKey: "productImageUrl",
    header: "Source",
    cell: ({ row }) => {
      return (
        <Link
          href={row.original.productUrl}
          target="_blank"
          className="border border-accent rounded-md flex items-center gap-2 px-2 py-1"
        >
          {row.original.originCountry}
          <ExternalLinkIcon />
        </Link>
      );
    },
  },
  {
    accessorKey: "quantity",
    header: "Quantity",
  },
  {
    accessorKey: "estimatedPriceUsd",
    header: "Price",
  },
  {
    accessorKey: "status",
    header: "Status",
  },
];
