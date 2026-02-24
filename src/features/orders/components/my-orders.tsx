"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import { OrdersList } from "./orders-list";
import { Card, CardContent } from "@/components/ui/card";

export default function MyOrdersComponent() {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-800">My Orders</h1>
          <p className="text-stone-400 text-sm mt-1">
            Track your product requests and sourcing status
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => setShowForm((v) => !v)}
          className="gap-2"
        >
          <PlusIcon className="w-4 h-4" />
          {showForm ? "Cancel" : "New Order"}
        </Button>
      </div>

      <Card>
        <CardContent>
          <OrdersList />
        </CardContent>
      </Card>
    </div>
  );
}
