"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import { OrdersList } from "./orders-list";
import { Card, CardContent } from "@/components/ui/card";

export default function MyOrdersComponent() {
  return (
    <div className="space-y-10">
        <div>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-stone-800">My Orders</h1>
            <Button variant="primary" className="gap-2" asChild>
              <Link href="/app">
                <PlusIcon className="w-4 h-4" />
                <span>New</span>
              </Link>
            </Button>
          </div>
          <p className="text-stone-400 text-sm mt-1">
            Track your product requests and sourcing status
          </p>
        </div>

      <Card className="p-0 bg-transparent shadow-none border-none">
        <CardContent className="p-0 bg-transparent">
          <OrdersList />
        </CardContent>
      </Card>
    </div>
  );
}
