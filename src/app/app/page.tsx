"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { CircleDollarSignIcon, PackageSearchIcon, ShoppingCartIcon } from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const [productUrl, setProductUrl] = useState("");

  const stats = [
    { label: "Total Orders", value: "12", change: "+2 this month", icon: ShoppingCartIcon },
    { label: "Saved", value: "$340", change: "+$120 this month", icon: CircleDollarSignIcon },
    { label: "Products", value: "8", change: "2 pending", icon: PackageSearchIcon },
  ];

  function handleDiscover() {
    const trimmed = productUrl.trim();
    if (!trimmed) return;
    router.push(`/app/orders?productUrl=${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-stone-800 mb-2">
          Welcome back!
        </h1>
        <p className="text-stone-500">
          Here&apos;s what&apos;s happening with your orders today.
        </p>
      </div>

      <Field orientation="horizontal" className="py-5">
        <Input
          type="search"
          placeholder="Paste your product link..."
          className="bg-white p-5 rounded-r-full rounded-l-full border-0"
          value={productUrl}
          onChange={(e) => setProductUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleDiscover();
          }}
        />
        <Button
          className="p-5 rounded-r-full rounded-l-full gradient-primary"
          onClick={handleDiscover}
        >
          Discover
        </Button>
      </Field>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
        {stats.map((stat, i) => (
          <Card key={i} className="card-hover">
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="text-stone-800">{stat.label}</CardTitle>
              <div className="bg-stone-100 p-2 rounded-md"><stat.icon className="stroke-stone-800"/></div>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-start">
                  <p className="text-3xl font-bold text-stone-800">
                    {stat.value}
                  </p>
              </div>
              <p className="text-xs text-stone-400">{stat.change}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Orders */}
      <Card className="card-hover">
        <CardHeader>
          <h2 className="text-xl font-bold text-stone-800">Recent Orders</h2>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              {
                id: "ORD-001",
                product: "Sony WH1000XM5 Headphones",
                status: "shipped",
                date: "2024-02-10",
                total: "$320.50",
              },
              {
                id: "ORD-002",
                product: "Apple AirPods Pro",
                status: "processing",
                date: "2024-02-08",
                total: "$280.00",
              },
              {
                id: "ORD-003",
                product: "Samsung Watch 5",
                status: "delivered",
                date: "2024-02-05",
                total: "$245.75",
              },
            ].map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between p-4 border border-stone-200/40 rounded-xl hover:shadow-[0_4px_16px_-4px_rgba(120,113,108,0.1)] transition-all duration-300 bg-white/60"
              >
                <div>
                  <p className="font-semibold text-stone-800">
                    {order.product}
                  </p>
                  <p className="text-sm text-stone-400">{order.id}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      order.status === "delivered"
                        ? "bg-emerald-50 text-emerald-700"
                        : order.status === "shipped"
                          ? "bg-teal-50 text-teal-700"
                          : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {order.status.charAt(0).toUpperCase() +
                      order.status.slice(1)}
                  </span>
                  <p className="font-semibold text-stone-800">{order.total}</p>
                </div>
              </div>
            ))}
          </div>
          <Link href="/dashboard/orders" className="inline-block mt-4">
            <Button variant="ghost">View All Orders</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
