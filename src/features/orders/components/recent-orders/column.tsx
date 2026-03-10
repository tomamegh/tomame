"use client";

import { useState } from "react";
import Image from "next/image";
import { Order } from "@/features/orders/types";
import { ColumnDef } from "@tanstack/react-table";
import { ExternalLinkIcon, PackageIcon, CopyIcon, CheckIcon } from "lucide-react";
import { OrderStatusBadge } from "../order-status-badge";

function CopyableId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const truncated = `${id.slice(0, 6)}…${id.slice(-4)}`;

  const copy = () => {
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 font-mono text-xs text-stone-500 hover:text-stone-800 transition-colors group"
      title={id}
    >
      <span>{truncated}</span>
      {copied ? (
        <CheckIcon className="size-3 text-emerald-500 shrink-0" />
      ) : (
        <CopyIcon className="size-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </button>
  );
}

export const recentOrdersColumn: ColumnDef<Order>[] = [
  {
    accessorKey: "id",
    header: "Order ID",
    cell: ({ row }) => <CopyableId id={row.original.id} />,
  },
  {
    accessorKey: "product_name",
    header: "Product",
    cell: ({ row }) => (
      <div className="flex items-center gap-3 min-w-0">
        <div className="size-9 rounded-lg overflow-hidden bg-stone-100 border border-stone-200 shrink-0 flex items-center justify-center">
          {row.original.product_image_url ? (
            <Image
              src={row.original.product_image_url}
              alt={row.original.product_name}
              width={36}
              height={36}
              className="object-cover w-full h-full"
            />
          ) : (
            <PackageIcon className="size-4 text-stone-300" />
          )}
        </div>
        <span
          className="block max-w-40 truncate text-sm text-stone-700 font-medium"
          title={row.original.product_name}
        >
          {row.original.product_name}
        </span>
      </div>
    ),
  },
  {
    accessorKey: "product_url",
    header: "Source",
    cell: ({ row }) => (
      <a
        href={row.original.product_url ?? "#"}
        target="_blank"
        rel="noopener noreferrer"
        className="border border-accent rounded-md flex items-center gap-1.5 px-2 py-1 text-xs w-fit hover:bg-muted transition-colors"
      >
        {row.original.origin_country}
        <ExternalLinkIcon className="size-3" />
      </a>
    ),
  },
  {
    accessorKey: "quantity",
    header: "Qty",
  },
  {
    accessorKey: "estimated_price_usd",
    header: "Price",
    cell: ({ row }) => (
      <span className="text-sm">${(row.original.estimated_price_usd ?? 0).toFixed(2)}</span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <OrderStatusBadge status={row.original.status} />,
  },
];
