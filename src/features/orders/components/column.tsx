'use client';

import { ColumnDef } from "@tanstack/react-table";
import { Order } from "../types";

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