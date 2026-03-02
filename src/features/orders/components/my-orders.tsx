"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import { OrdersList } from "./orders-list";
import { Card, CardContent } from "@/components/ui/card";

export default function MyOrdersComponent() {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-10">
        <div>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-stone-800">My Orders</h1>
            <Button
              variant="primary"
              onClick={() => setShowForm((v) => !v)}
              className="gap-2"
            >
              <PlusIcon className="w-4 h-4" />
              <span>{showForm ? "Cancel" : "New"}</span>
            </Button>
          </div>
          <p className="text-stone-400 text-sm mt-1">
            Track your product requests and sourcing status
          </p>
        </div>

      <Card>
        <CardContent>
          <OrdersList />
        </CardContent>
      </Card>
    </div>
  );
}
