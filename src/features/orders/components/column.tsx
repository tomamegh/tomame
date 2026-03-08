'use client';

import { ColumnDef } from "@tanstack/react-table";
import { Order } from "../types";

// id: string;
//   productUrl: string;
//   productName: string;
//   productImageUrl: string | null;
//   estimatedPriceUsd: number;
//   quantity: number;
//   originCountry: OriginCountry;
//   specialInstructions: string | null;
//   status: OrderStatus;
//   pricing: OrderPricing;
//   needsReview: boolean;
//   reviewReasons: string[];
//   reviewedBy: string | null;
//   reviewedAt: string | null;
//   extractionMetadata: Record<string, unknown> | null;
//   trackingNumber: string | null;
//   carrier: string | null;
//   estimatedDeliveryDate: string | null;
//   deliveredAt: string | null;
//   createdAt: string;
//   updatedAt: string;

export const ordersColumn:ColumnDef<Order>[] = [
    {
        accessorKey: 'id',
        header: 'ID',
    },
    {
        accessorKey: 'productName',
        header: 'Product Name',
    },
    {
        accessorKey: 'productImageUrl',
        header: 'Product Image',
    },
    {
        accessorKey: 'productUrl',
        header: 'Source',
    },
    {
        accessorKey: 'status',
        header: 'Status',
    },
]