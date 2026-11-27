"use client";

import { useMemo, useState } from "react";
import {
  ChevronDownIcon,
  ExternalLinkIcon,
  Loader2Icon,
  MessageCircleIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";

import { AdminCard } from "@/components/layout/admin";
import { StoreImage } from "@/components/store-image";
import { Button } from "@/components/ui/button";
import { TomameCategory } from "@/config/categories";
import { resolveChosenOptions } from "@/features/extraction/item-options";
import { choiceForPick } from "@/features/extraction/variant-choices";
import { ItemOptionsCard } from "@/features/quotes/components/item-options-card";
import { apiFetch, ApiFetchError } from "@/lib/api-client";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import type { ApiSuccessResponse } from "@/types/api";
import { OFFLINE_PAYMENT_METHODS, type OfflinePaymentMethod } from "../schema";
import type {
  AssistedCustomerLookup,
  AssistedLineView,
  PlacedAssistedOrder,
} from "../services/assisted-order.service";

const CATEGORIES = Object.values(TomameCategory).sort((a, b) =>
  a.localeCompare(b),
);
const FIELD =
  "h-9 w-full min-w-0 rounded-[10px] border border-tm-border bg-tm-paper px-3 text-[13px] text-tm-ink focus-visible:border-tm-coral/50 focus-visible:outline-none";
const LABEL =
  "flex min-w-0 flex-col gap-1 text-[12px] font-semibold text-tm-text-2";
const METHOD_LABELS: Record<OfflinePaymentMethod, string> = {
  momo: "MoMo to Tomame",
  bank_transfer: "Bank transfer",
  cash: "Cash",
  card: "Card (our terminal)",
  other: "Other",
};

interface Item extends AssistedLineView {
  key: string;
  quantity: number;
  chosen: Record<string, string>;
  note: string;
  pricing: boolean;
}

interface CatalogHit {
  id: string;
  title: string;
  image_url: string | null;
  product_url: string;
  price_usd: number | null;
  total_ghs: number | null;
  store: string;
}

const message = (error: unknown) =>
  error instanceof ApiFetchError || error instanceof Error
    ? error.message
    : "Something went wrong";
const ghs = (n: number) =>
  `GH₵${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await apiFetch<ApiSuccessResponse<T>>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.data;
}

const toItem = (line: AssistedLineView, previous?: Item): Item => ({
  ...line,
  key: previous?.key ?? line.extraction_cache_id,
  quantity: previous?.quantity ?? 1,
  chosen: previous?.chosen ?? {},
  note: previous?.note ?? "",
  pricing: false,
});

function itemProblem(item: Item): string | null {
  if (item.pay_hold && item.pay_hold.kind === "freight_check")
    return "Freight is being checked. Refresh in a few seconds.";
  if (item.pay_hold)
    return item.pay_hold.kind === "unavailable"
      ? "The store says it's unavailable."
      : "Price not confirmed. Set the store's price.";
  if (item.unit_total_ghs == null)
    return (
      item.pricing_unavailable_reason ??
      "Not priced yet. Set the store's price."
    );
  const missing = resolveChosenOptions(item.questions, item.chosen).missing;
  if (missing.length)
    return `Choose the ${missing.join(" and ").toLowerCase()}.`;
  return null;
}

/**
 * "Buy for a customer": staff paste links (or search the catalogue), settle the
 * size and any price the reader could not confirm, enter the customer, and
 * place the order under the customer's own account as paid to us. The customer
 * gets the normal emails and can sign in with that email later to follow it.
 */
export function BuyForCustomer() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [url, setUrl] = useState("");
  const [reading, setReading] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<CatalogHit[] | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [lookup, setLookup] = useState<AssistedCustomerLookup | null>(null);
  const [looking, setLooking] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");

  const [deliveryKind, setDeliveryKind] = useState<
    "pickup" | "address" | "new_address"
  >("new_address");
  const [zoneId, setZoneId] = useState("");
  const [addressId, setAddressId] = useState("");
  const [addr, setAddr] = useState({
    line1: "",
    area: "",
    city: "Accra",
    digital_address: "",
    zone: "",
  });

  const [payMode, setPayMode] = useState<"pay_link" | "offline">("pay_link");
  const [method, setMethod] = useState<OfflinePaymentMethod>("momo");
  const [reference, setReference] = useState("");
  const [payNote, setPayNote] = useState("");
  const [whatsapp, setWhatsapp] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState<PlacedAssistedOrder | null>(null);

  const zones = lookup?.zones ?? [];
  const pickupZones = zones.filter((z) => z.kind === "pickup");
  const doorZones = zones.filter((z) => z.kind === "door");

  const replace = (key: string, line: AssistedLineView) =>
    setItems((list) => list.map((i) => (i.key === key ? toItem(line, i) : i)));
  const patch = (key: string, p: Partial<Item>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...p } : i)));

  const addLink = async (link: string) => {
    const value = link.trim();
    if (!value) return;
    if (items.length >= 10)
      return toast.error({ title: "Ten items at most per order" });
    setReading(true);
    try {
      const line = await post<AssistedLineView>(
        "/api/admin/assisted-orders/quote",
        { product_url: value },
      );
      setItems((list) =>
        list.some((i) => i.extraction_cache_id === line.extraction_cache_id)
          ? list
          : [...list, toItem(line)],
      );
      setUrl("");
    } catch (error) {
      toast.error({
        title: "Couldn't read that link",
        description: message(error),
      });
    } finally {
      setReading(false);
    }
  };

  const search = async () => {
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      const res = await apiFetch<ApiSuccessResponse<{ results: CatalogHit[] }>>(
        `/api/catalog/search?q=${encodeURIComponent(query.trim())}&limit=8`,
      );
      setHits(res.data.results);
    } catch (error) {
      toast.error({ title: "Search failed", description: message(error) });
    } finally {
      setSearching(false);
    }
  };

  const refresh = async (keys?: string[]) => {
    const target = items.filter((i) => !keys || keys.includes(i.key));
    if (!target.length) return;
    try {
      const lines = await post<AssistedLineView[]>(
        "/api/admin/assisted-orders/preview",
        { extraction_cache_ids: target.map((i) => i.extraction_cache_id) },
      );
      for (const item of target) {
        const line = lines.find(
          (l) => l.extraction_cache_id === item.extraction_cache_id,
        );
        if (line) replace(item.key, line);
      }
    } catch (error) {
      toast.error({ title: "Couldn't refresh", description: message(error) });
    }
  };

  const pickVariant = async (item: Item, option: string, value: string) => {
    if (!item.variant_choices) return;
    const choice = choiceForPick(item.variant_choices, option, value);
    if (!choice) return;
    setBusyKey(item.key);
    try {
      const { extraction_cache_id } = await post<{
        extraction_cache_id: string;
      }>(`/api/extractions/${item.extraction_cache_id}/variant`, {
        variant_id: choice.id,
      });
      const [line] = await post<AssistedLineView[]>(
        "/api/admin/assisted-orders/preview",
        { extraction_cache_ids: [extraction_cache_id] },
      );
      if (line) replace(item.key, line);
    } catch (error) {
      toast.error({
        title: "Couldn't switch the option",
        description: message(error),
      });
    } finally {
      setBusyKey(null);
    }
  };

  const setPrice = async (
    item: Item,
    form: { price: string; category: string; weight: string; title: string },
  ) => {
    const usd = Number.parseFloat(form.price);
    const lbs = form.weight.trim() ? Number.parseFloat(form.weight) : null;
    if (!(usd > 0))
      return toast.error({ title: "Enter the store's price in USD" });
    if (!form.category) return toast.error({ title: "Pick the category" });
    if (lbs != null && !(lbs > 0))
      return toast.error({ title: "The weight must be a number of pounds" });
    setBusyKey(item.key);
    try {
      const line = await post<AssistedLineView>(
        "/api/admin/assisted-orders/price",
        {
          extraction_cache_id: item.extraction_cache_id,
          price_usd: usd,
          category: form.category,
          weight_lbs: lbs,
          title: form.title.trim() || null,
        },
      );
      replace(item.key, line);
      toast.success({ title: "Price set" });
    } catch (error) {
      toast.error({
        title: "Couldn't set the price",
        description: message(error),
      });
    } finally {
      setBusyKey(null);
    }
  };

  const findCustomer = async () => {
    if (!email.trim()) return;
    setLooking(true);
    try {
      const res = await apiFetch<ApiSuccessResponse<AssistedCustomerLookup>>(
        `/api/admin/assisted-orders?email=${encodeURIComponent(email.trim())}`,
      );
      const found = res.data;
      setLookup(found);
      if (found.customer) {
        setFirstName(found.customer.first_name ?? firstName);
        setLastName(found.customer.last_name ?? lastName);
        setPhone(found.customer.phone ?? phone);
        const preferred =
          found.addresses.find((a) => a.is_default) ?? found.addresses[0];
        if (preferred) {
          setDeliveryKind("address");
          setAddressId(preferred.id);
        }
      }
    } catch (error) {
      toast.error({
        title: "Couldn't look up the customer",
        description: message(error),
      });
    } finally {
      setLooking(false);
    }
  };

  const problems = items.map(itemProblem);
  const estimate = items.reduce(
    (sum, i) => sum + (i.unit_total_ghs ?? 0) * i.quantity,
    0,
  );
  const deliveryReady =
    deliveryKind === "pickup"
      ? !!zoneId
      : deliveryKind === "address"
        ? !!addressId
        : !!(addr.line1.trim() && addr.city.trim() && addr.zone);
  const blocker = !items.length
    ? "Add an item"
    : (problems.find(Boolean) ??
      (!lookup
        ? "Look up the customer's email"
        : !firstName.trim() || !lastName.trim() || !phone.trim()
          ? "Customer name and phone"
          : !deliveryReady
            ? "Choose delivery"
            : null));

  const place = async () => {
    if (blocker) return toast.error({ title: blocker });
    setPlacing(true);
    try {
      const delivery =
        deliveryKind === "pickup"
          ? { kind: "pickup", delivery_zone_id: zoneId }
          : deliveryKind === "address"
            ? { kind: "address", delivery_address_id: addressId }
            : {
                kind: "new_address",
                address: {
                  label: "Home",
                  recipient_name: `${firstName.trim()} ${lastName.trim()}`,
                  phone: phone.trim(),
                  line1: addr.line1.trim(),
                  ...(addr.area.trim() && { area: addr.area.trim() }),
                  city: addr.city.trim(),
                  delivery_zone_id: addr.zone,
                  ...(addr.digital_address.trim() && {
                    digital_address: addr.digital_address.trim().toUpperCase(),
                  }),
                },
              };
      const result = await post<PlacedAssistedOrder>(
        "/api/admin/assisted-orders",
        {
          customer: {
            email: email.trim(),
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            phone: phone.trim(),
          },
          lines: items.map((i) => ({
            extraction_cache_id: i.extraction_cache_id,
            quantity: i.quantity,
            ...(Object.keys(i.chosen).length && { chosen_options: i.chosen }),
            ...(i.note.trim() && { special_instructions: i.note.trim() }),
          })),
          delivery,
          payment:
            payMode === "pay_link"
              ? { mode: "pay_link" }
              : {
                  mode: "offline",
                  method,
                  ...(reference.trim() && { reference: reference.trim() }),
                  ...(payNote.trim() && { note: payNote.trim() }),
                },
          whatsapp_updates: whatsapp,
        },
      );
      setPlaced(result);
      toast.success({
        title:
          result.status === "paid"
            ? "Order placed and marked paid"
            : "Order placed. Pay link emailed.",
      });
    } catch (error) {
      toast.error({
        title: "Couldn't place the order",
        description: message(error),
      });
    } finally {
      setPlacing(false);
    }
  };

  const reset = () => {
    setItems([]);
    setPlaced(null);
    setHits(null);
    setQuery("");
    setEmail("");
    setLookup(null);
    setFirstName("");
    setLastName("");
    setPhone("");
    setReference("");
    setPayNote("");
    setAddr({
      line1: "",
      area: "",
      city: "Accra",
      digital_address: "",
      zone: "",
    });
  };

  return (
    <AdminCard
      title="Buy for a customer"
      blurb="Paste links or search, settle size and price, then place the order under the customer's own account. They either pay online from the link we email them, or you record that they paid us. Either way they sign in with that email to see it."
      action={
        <Button
          size="sm"
          variant="outline"
          className="rounded-full"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? "Hide" : "Start an order"}
          <ChevronDownIcon
            className={cn("size-4 transition-transform", open && "rotate-180")}
          />
        </Button>
      }
    >
      {!open ? null : placed ? (
        <PlacedSummary placed={placed} email={email} onAnother={reset} />
      ) : (
        <div className="flex flex-col gap-6 p-5">
          {/* Items */}
          <section className="flex flex-col gap-3">
            <h3 className="text-[13px] font-bold text-tm-ink">1. Items</h3>
            <div className="grid gap-2 md:grid-cols-2">
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void addLink(url);
                }}
              >
                <input
                  className={FIELD}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Paste a product link"
                  aria-label="Product link"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={reading || !url.trim()}
                  className="shrink-0 rounded-full"
                >
                  {reading ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    "Read link"
                  )}
                </Button>
              </form>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void search();
                }}
              >
                <input
                  className={FIELD}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Or search the catalogue"
                  aria-label="Search products"
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  disabled={searching}
                  className="shrink-0 rounded-full"
                >
                  {searching ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <SearchIcon className="size-4" />
                  )}
                </Button>
              </form>
            </div>
            {reading ? (
              <p className="text-[12px] text-tm-text-3">
                Reading the store page. This can take up to a minute.
              </p>
            ) : null}
            {hits ? (
              <div className="flex flex-col divide-y divide-tm-hairline rounded-[12px] border border-tm-border">
                {hits.length === 0 ? (
                  <p className="p-3 text-[12px] text-tm-text-3">
                    Nothing in the catalogue for that. Paste the store link
                    instead.
                  </p>
                ) : null}
                {hits.map((h) => (
                  <div key={h.id} className="flex items-center gap-3 p-2.5">
                    <div className="relative size-10 shrink-0 overflow-hidden rounded-[8px] bg-tm-paper">
                      {h.image_url ? (
                        <StoreImage
                          src={h.image_url}
                          alt=""
                          fill
                          sizes="40px"
                          className="object-contain"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-tm-ink">
                        {h.title}
                      </p>
                      <p className="text-[12px] text-tm-text-3">
                        {h.store} ·{" "}
                        {h.price_usd != null
                          ? `$${h.price_usd.toFixed(2)}`
                          : "no price"}
                        {h.total_ghs != null
                          ? ` · about ${ghs(h.total_ghs)}`
                          : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      disabled={reading}
                      onClick={() => void addLink(h.product_url)}
                    >
                      Add
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}

            {items.map((item, index) => (
              <ItemRow
                key={item.key}
                item={item}
                problem={problems[index] ?? null}
                busy={busyKey === item.key}
                onPatch={(p) => patch(item.key, p)}
                onRemove={() =>
                  setItems((list) => list.filter((i) => i.key !== item.key))
                }
                onRefresh={() => void refresh([item.key])}
                onPickVariant={(option, value) =>
                  void pickVariant(item, option, value)
                }
                onSetPrice={(form) => void setPrice(item, form)}
              />
            ))}
          </section>

          {/* Customer */}
          <section className="flex flex-col gap-3">
            <h3 className="text-[13px] font-bold text-tm-ink">2. Customer</h3>
            <form
              className="flex gap-2 md:max-w-[520px]"
              onSubmit={(e) => {
                e.preventDefault();
                void findCustomer();
              }}
            >
              <input
                className={FIELD}
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setLookup(null);
                }}
                placeholder="customer@email.com"
                aria-label="Customer email"
              />
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={looking || !email.trim()}
                className="shrink-0 rounded-full"
              >
                {looking ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  "Look up"
                )}
              </Button>
            </form>
            {lookup ? (
              <p className="text-[12px] text-tm-text-2">
                {lookup.customer
                  ? lookup.customer.role !== "user"
                    ? "This email is a staff account. Use the customer's own email."
                    : "Existing customer. Missing name or phone will be filled in; nothing they set is overwritten."
                  : "No account yet. One will be made with this email; they sign in later with an emailed code."}
              </p>
            ) : null}
            {lookup ? (
              <div className="grid gap-2 sm:grid-cols-3">
                <label className={LABEL}>
                  First name
                  <input
                    className={FIELD}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </label>
                <label className={LABEL}>
                  Last name
                  <input
                    className={FIELD}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </label>
                <label className={LABEL}>
                  Phone (WhatsApp)
                  <input
                    className={FIELD}
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="024 412 3456"
                  />
                </label>
              </div>
            ) : null}
          </section>

          {/* Delivery */}
          {lookup ? (
            <section className="flex flex-col gap-3">
              <h3 className="text-[13px] font-bold text-tm-ink">3. Delivery</h3>
              <div
                className="flex flex-wrap gap-2"
                role="radiogroup"
                aria-label="Delivery"
              >
                {(
                  [
                    ["address", "Saved address", lookup.addresses.length > 0],
                    ["new_address", "New address", doorZones.length > 0],
                    ["pickup", "Pickup point", pickupZones.length > 0],
                  ] as const
                )
                  .filter(([, , show]) => show)
                  .map(([kind, label]) => (
                    <button
                      key={kind}
                      type="button"
                      role="radio"
                      aria-checked={deliveryKind === kind}
                      onClick={() => setDeliveryKind(kind)}
                      className={cn(
                        "rounded-full border px-3.5 py-1.5 text-[12px] font-medium",
                        deliveryKind === kind
                          ? "border-tm-coral bg-tm-tint text-tm-coral-strong"
                          : "border-tm-border text-tm-ink",
                      )}
                    >
                      {label}
                    </button>
                  ))}
              </div>
              {deliveryKind === "address" ? (
                <select
                  className={cn(FIELD, "md:max-w-[520px]")}
                  value={addressId}
                  onChange={(e) => setAddressId(e.target.value)}
                  aria-label="Saved address"
                >
                  <option value="">Choose an address…</option>
                  {lookup.addresses.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}: {a.line1}, {a.city}
                    </option>
                  ))}
                </select>
              ) : deliveryKind === "pickup" ? (
                <select
                  className={cn(FIELD, "md:max-w-[520px]")}
                  value={zoneId}
                  onChange={(e) => setZoneId(e.target.value)}
                  aria-label="Pickup point"
                >
                  <option value="">Choose a pickup point…</option>
                  {pickupZones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name} · {ghs(z.fee_ghs)}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className={LABEL}>
                    Street or house
                    <input
                      className={FIELD}
                      value={addr.line1}
                      onChange={(e) =>
                        setAddr({ ...addr, line1: e.target.value })
                      }
                    />
                  </label>
                  <label className={LABEL}>
                    Area
                    <input
                      className={FIELD}
                      value={addr.area}
                      onChange={(e) =>
                        setAddr({ ...addr, area: e.target.value })
                      }
                    />
                  </label>
                  <label className={LABEL}>
                    City
                    <input
                      className={FIELD}
                      value={addr.city}
                      onChange={(e) =>
                        setAddr({ ...addr, city: e.target.value })
                      }
                    />
                  </label>
                  <label className={LABEL}>
                    Delivery zone
                    <select
                      className={FIELD}
                      value={addr.zone}
                      onChange={(e) =>
                        setAddr({ ...addr, zone: e.target.value })
                      }
                    >
                      <option value="">Choose a zone…</option>
                      {doorZones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name} · {ghs(z.fee_ghs)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={LABEL}>
                    GhanaPost GPS (optional)
                    <input
                      className={FIELD}
                      value={addr.digital_address}
                      onChange={(e) =>
                        setAddr({ ...addr, digital_address: e.target.value })
                      }
                      placeholder="GA-183-4310"
                    />
                  </label>
                </div>
              )}
            </section>
          ) : null}

          {/* Payment */}
          {lookup ? (
            <section className="flex flex-col gap-3">
              <h3 className="text-[13px] font-bold text-tm-ink">4. Payment</h3>
              <div
                className="flex flex-wrap gap-2"
                role="radiogroup"
                aria-label="Payment"
              >
                {(
                  [
                    ["pay_link", "They'll pay online"],
                    ["offline", "They paid us already"],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={payMode === mode}
                    onClick={() => setPayMode(mode)}
                    className={cn(
                      "rounded-full border px-3.5 py-1.5 text-[12px] font-medium",
                      payMode === mode
                        ? "border-tm-coral bg-tm-tint text-tm-coral-strong"
                        : "border-tm-border text-tm-ink",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {payMode === "pay_link" ? (
                <p className="text-[12px] text-tm-text-2">
                  We email {email.trim() || "them"} the order with a &ldquo;Sign
                  in and pay&rdquo; link. They sign in with that email (a code,
                  no password) and pay by MoMo or card. Unpaid orders cancel
                  after the usual window.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-3">
                  <label className={LABEL}>
                    How they paid us
                    <select
                      className={FIELD}
                      value={method}
                      onChange={(e) =>
                        setMethod(e.target.value as OfflinePaymentMethod)
                      }
                    >
                      {OFFLINE_PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {METHOD_LABELS[m]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={LABEL}>
                    Reference (MoMo ID, receipt)
                    <input
                      className={FIELD}
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      maxLength={120}
                    />
                  </label>
                  <label className={LABEL}>
                    Note
                    <input
                      className={FIELD}
                      value={payNote}
                      onChange={(e) => setPayNote(e.target.value)}
                      maxLength={500}
                    />
                  </label>
                </div>
              )}
              <label className="flex items-center gap-2 text-[13px] text-tm-ink">
                <input
                  type="checkbox"
                  checked={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.checked)}
                />
                Send them WhatsApp updates about this order
              </label>
            </section>
          ) : null}

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-tm-hairline pt-4">
            <div className="text-[13px] text-tm-text-2">
              {items.length ? (
                <>
                  Items about{" "}
                  <span className="font-semibold text-tm-ink">
                    {ghs(estimate)}
                  </span>
                  , before delivery and box savings. The final total is struck
                  when you place it.
                </>
              ) : (
                "Add items to see the total."
              )}
            </div>
            <div className="flex items-center gap-3">
              {blocker ? (
                <span className="text-[12px] text-tm-coral-strong">
                  {blocker}
                </span>
              ) : null}
              <Button
                onClick={() => void place()}
                disabled={placing || !!blocker}
                className="tm-cta-gradient rounded-full border-0 text-white hover:opacity-90"
              >
                {placing ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : null}
                {payMode === "pay_link"
                  ? "Place and email pay link"
                  : "Place paid order"}
              </Button>
            </div>
          </footer>
        </div>
      )}
    </AdminCard>
  );
}

function ItemRow({
  item,
  problem,
  busy,
  onPatch,
  onRemove,
  onRefresh,
  onPickVariant,
  onSetPrice,
}: {
  item: Item;
  problem: string | null;
  busy: boolean;
  onPatch: (p: Partial<Item>) => void;
  onRemove: () => void;
  onRefresh: () => void;
  onPickVariant: (option: string, value: string) => void;
  onSetPrice: (form: {
    price: string;
    category: string;
    weight: string;
    title: string;
  }) => void;
}) {
  const [form, setForm] = useState({
    price:
      item.price != null && item.currency === "USD" ? String(item.price) : "",
    category: item.category ?? "",
    weight: item.weight_lbs != null ? String(item.weight_lbs) : "",
    title: "",
  });
  const open = item.questions.filter((q) => !q.pinned);
  const { missing } = useMemo(
    () => resolveChosenOptions(item.questions, item.chosen),
    [item.questions, item.chosen],
  );
  const selected =
    item.variant_choices?.choices.find(
      (c) => c.id === item.variant_choices?.selectedId,
    ) ?? null;
  const showPrice =
    item.pricing ||
    (problem != null &&
      !problem.startsWith("Choose") &&
      !problem.startsWith("Freight"));

  return (
    <div className="flex flex-col gap-3 rounded-[16px] border border-tm-border p-3.5">
      <div className="flex items-start gap-3">
        <div className="relative size-14 shrink-0 overflow-hidden rounded-[10px] bg-tm-paper">
          {item.image ? (
            <StoreImage
              src={item.image}
              alt=""
              fill
              sizes="56px"
              className="object-contain"
            />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <a
            href={item.product_url}
            target="_blank"
            rel="noreferrer"
            className="line-clamp-2 text-[13px] font-semibold text-tm-ink hover:underline"
          >
            {item.title ?? item.product_url}
            <ExternalLinkIcon className="ml-1 inline size-3 text-tm-text-3" />
          </a>
          <p className="mt-0.5 text-[12px] text-tm-text-3">
            {item.store ?? "store"} ·{" "}
            {item.price != null
              ? `${item.currency ?? ""} ${item.price.toFixed(2)}`
              : "no price"}
            {item.price_source === "staff" ? " · set by staff" : ""}
            {item.category ? ` · ${item.category}` : ""}
            {item.weight_lbs ? ` · ${item.weight_lbs} lb` : ""}
          </p>
          <p className="mt-1 text-[13px] font-semibold text-tm-ink">
            {item.unit_total_ghs != null
              ? `${ghs(item.unit_total_ghs)} each, landed`
              : "Not priced"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {busy ? (
            <Loader2Icon className="size-4 animate-spin text-tm-text-3" />
          ) : null}
          <Button
            size="icon"
            variant="ghost"
            onClick={onRefresh}
            aria-label="Refresh this item"
          >
            <RefreshCwIcon className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={onRemove}
            aria-label="Remove this item"
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </div>

      {problem ? (
        <p className="rounded-[10px] bg-tm-tint px-3 py-2 text-[12px] font-medium text-tm-coral-strong">
          {problem}
        </p>
      ) : null}

      {item.variant_choices ? (
        <div className="flex flex-wrap gap-2">
          {item.variant_choices.options.map((o) => (
            <label key={o.name} className={cn(LABEL, "w-auto")}>
              {o.name}
              <select
                className={cn(FIELD, "w-44")}
                value={selected?.options[o.name] ?? ""}
                disabled={busy}
                onChange={(e) => onPickVariant(o.name, e.target.value)}
              >
                {!selected ? <option value="">Choose…</option> : null}
                {o.values.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      ) : null}

      {open.length ? (
        <ItemOptionsCard
          questions={open}
          value={item.chosen}
          missing={missing}
          onChange={(name, value) =>
            onPatch({ chosen: { ...item.chosen, [name]: value } })
          }
          note="Check it against the store's page: this is what we buy."
          className="p-3"
        />
      ) : null}

      <div className="grid gap-2 sm:grid-cols-[90px_minmax(0,1fr)]">
        <label className={LABEL}>
          Quantity
          <input
            className={FIELD}
            type="number"
            min={1}
            max={100}
            value={item.quantity}
            onChange={(e) =>
              onPatch({
                quantity: Math.max(
                  1,
                  Math.min(100, Number.parseInt(e.target.value, 10) || 1),
                ),
              })
            }
          />
        </label>
        <label className={LABEL}>
          Note for the buyer (optional)
          <input
            className={FIELD}
            value={item.note}
            maxLength={1000}
            onChange={(e) => onPatch({ note: e.target.value })}
            placeholder="e.g. the black one in the second photo"
          />
        </label>
      </div>

      {showPrice ? (
        <fieldset className="flex flex-col gap-2 rounded-[12px] bg-tm-paper/60 p-3">
          <legend className="px-1 text-[12px] font-semibold text-tm-text-2">
            Set the store's price
          </legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[120px_minmax(0,1fr)_110px]">
            <input
              className={FIELD}
              inputMode="decimal"
              placeholder="Price, USD"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              aria-label="Store price in USD"
            />
            <select
              className={FIELD}
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              aria-label="Category"
            >
              <option value="">Category…</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              className={FIELD}
              inputMode="decimal"
              placeholder="Weight, lb"
              value={form.weight}
              onChange={(e) => setForm({ ...form, weight: e.target.value })}
              aria-label="Weight in pounds (optional)"
            />
          </div>
          {!item.title ? (
            <input
              className={FIELD}
              placeholder="Product name"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              aria-label="Product name"
              maxLength={300}
            />
          ) : null}
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy}
              onClick={() => onSetPrice(form)}
              className="rounded-full"
            >
              Save price
            </Button>
            {item.pricing ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onPatch({ pricing: false })}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </fieldset>
      ) : (
        <button
          type="button"
          className="self-start text-[12px] font-medium text-tm-text-2 underline underline-offset-2"
          onClick={() => onPatch({ pricing: true })}
        >
          Price is wrong? Set it by hand
        </button>
      )}
    </div>
  );
}

function PlacedSummary({
  placed,
  email,
  onAnother,
}: {
  placed: PlacedAssistedOrder;
  email: string;
  onAnother: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 p-5">
      <p className="text-[15px] font-bold text-tm-ink">
        {placed.status === "paid"
          ? "Placed and paid"
          : "Placed, waiting for them to pay"}
        : {ghs(placed.total_ghs)} · {placed.order_ids.length} item
        {placed.order_ids.length === 1 ? "" : "s"}
      </p>
      <p className="text-[13px] text-tm-text-2">
        {placed.account_created
          ? "A new account was made for "
          : "On the account of "}
        <span className="font-semibold text-tm-ink">{email}</span>. It shows
        under their orders when they sign in with that email (we email them a
        code).
        {placed.payment_reference
          ? ` Payment ${placed.payment_reference}.`
          : ""}
      </p>
      <p
        className={cn(
          "text-[13px] font-medium",
          placed.emailed_to ? "text-tm-text-2" : "text-tm-coral-strong",
        )}
      >
        {placed.emailed_to
          ? placed.status === "paid"
            ? `Order email sent to ${placed.emailed_to}, with every item, the total and how to sign in. The usual "paid" email went too.`
            : `Pay link emailed to ${placed.emailed_to}: every item, the total, and a button that signs them in to pay.`
          : placed.status === "paid"
            ? "The order email could not be sent. Send them the WhatsApp message below so they know how to sign in."
            : "The pay-link email could not be sent. Send them the WhatsApp message below: it has the sign-in-and-pay link."}
      </p>
      <div className="flex flex-wrap gap-2">
        {placed.whatsapp_href ? (
          <Button
            asChild
            size="sm"
            className="rounded-full bg-[#25D366] text-white hover:bg-[#1fb857]"
          >
            <a href={placed.whatsapp_href} target="_blank" rel="noreferrer">
              <MessageCircleIcon className="size-4" /> Tell them on WhatsApp
            </a>
          </Button>
        ) : null}
        {placed.order_ids.map((id, i) => (
          <Button
            key={id}
            asChild
            size="sm"
            variant="outline"
            className="rounded-full"
          >
            <Link href={`/admin/orders/${id}`}>Order {i + 1}</Link>
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={onAnother}>
          Start another
        </Button>
      </div>
    </div>
  );
}
