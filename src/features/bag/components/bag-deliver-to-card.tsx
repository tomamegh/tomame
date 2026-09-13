"use client";

import { formatAddressLabel } from "@/features/addresses/format";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Buildings, CheckCircle, HouseLine, MapPin, Plus, Storefront } from "@phosphor-icons/react/ssr";

import type { DeliveryZoneRow } from "@/db/queries/delivery-zones";
import { useAddresses } from "@/features/addresses/hooks/useAddresses";
import type { DeliveryAddress } from "@/features/addresses/types";
import { ApiFetchError } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import { bagKeys } from "../hooks/useAddToBag";
import { useSetBagDelivery } from "../hooks/useBag";
import type { BagDelivery } from "../types";
import { AddressFormDialog } from "./address-form-dialog";

const LOGIN_HREF = `/auth/login?next=${encodeURIComponent("/app/bag")}`;

export interface BagDeliverToCardProps {
  /** The chosen delivery from the cart, or null while nothing is picked. */
  delivery: BagDelivery | null;
  /** Every active zone; the card splits door from pickup itself. */
  zones: DeliveryZoneRow[];
  /** Server-rendered addresses, kept live by the addresses query. */
  addresses: DeliveryAddress[];
  isSignedIn: boolean;
}

/** The mock's three glyphs, picked off the customer's own label. */
function AddressIcon({ label, selected }: { label: string; selected: boolean }) {
  const className = cn("size-5 shrink-0", selected ? "text-tm-coral" : "text-[#8A7F79]");
  if (/home/i.test(label)) return <HouseLine weight="duotone" className={className} aria-hidden />;
  if (/office|work/i.test(label)) return <Buildings weight="duotone" className={className} aria-hidden />;
  return <MapPin weight="duotone" className={className} aria-hidden />;
}

/**
 * "Deliver to" — `v2-bag` lines 236–243. White card, radius 24, `tmUp .5s .16s`,
 * a three-up grid of address tiles with the selected one carrying a 2 px coral
 * border and a filled check-circle, then the dashed pickup / add tiles.
 *
 * Choosing a tile is a `PATCH /api/cart`: the zone fee is priced into the bag
 * server-side, so the rail's delivery row and total move with it. Nothing here
 * knows what a zone costs.
 */
export function BagDeliverToCard({ delivery, zones, addresses, isSignedIn }: BagDeliverToCardProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: savedAddresses } = useAddresses(addresses, isSignedIn);
  const setDelivery = useSetBagDelivery();
  const [dialogOpen, setDialogOpen] = useState(false);

  const pickupZone = useMemo(() => zones.find((zone) => zone.kind === "pickup") ?? null, [zones]);
  const doorZones = useMemo(() => zones.filter((zone) => zone.kind === "door"), [zones]);

  const selectedAddressId = delivery?.kind === "door" ? delivery.address_id : null;
  const pickupSelected = delivery?.kind === "pickup";
  const busy = setDelivery.isPending;

  const goToLogin = useCallback(() => router.push(LOGIN_HREF), [router]);

  const choose = useCallback(
    (input: { delivery_address_id: string } | { delivery_zone_id: string }) => {
      setDelivery.mutate(input, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: bagKeys.all });
          // The chrome (nav count, ETA copy) is server-rendered, so refresh it too.
          router.refresh();
        },
        onError: (error) => {
          if (error instanceof ApiFetchError && error.status === 401) {
            goToLogin();
            return;
          }
          toast.error({ title: "Could not set the delivery", description: error.message });
        },
      });
    },
    [goToLogin, queryClient, router, setDelivery],
  );

  const onCreated = useCallback((address: DeliveryAddress) => choose({ delivery_address_id: address.id }), [choose]);

  const tileBase =
    "flex flex-col gap-1.5 rounded-2xl p-3.5 text-left transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tm-coral disabled:cursor-not-allowed";

  return (
    <section
      aria-labelledby="bag-deliver-to"
      className="tm-up flex flex-col gap-3.5 rounded-[24px] border border-tm-border bg-card p-[22px] [animation-delay:0.16s] [animation-duration:0.5s]"
    >
      <h3 id="bag-deliver-to" className="font-display text-lg leading-none font-bold">
        Deliver to
      </h3>

      <div className={cn("grid gap-3 sm:grid-cols-3", busy && "opacity-60")} aria-busy={busy}>
        {savedAddresses.map((address) => {
          const selected = address.id === selectedAddressId;
          return (
            <button
              key={address.id}
              type="button"
              aria-pressed={selected}
              disabled={!isSignedIn || busy}
              onClick={() => choose({ delivery_address_id: address.id })}
              className={cn(tileBase, selected ? "border-2 border-tm-coral bg-[#FFF8F5]" : "border border-tm-border hover:border-tm-coral/40")}
            >
              <span className="flex items-center justify-between">
                <AddressIcon label={address.label} selected={selected} />
                {selected && <CheckCircle weight="fill" className="size-[18px] text-tm-coral" aria-hidden />}
              </span>
              <span className="text-sm leading-[1.2] font-semibold">
                {formatAddressLabel(address)}
              </span>
              <span className="text-xs leading-[1.4] text-tm-text-2">
                {address.line1} · {address.phone}
              </span>
            </button>
          );
        })}

        {pickupZone &&
          (pickupSelected ? (
            <button
              type="button"
              aria-pressed
              disabled={!isSignedIn || busy}
              onClick={() => choose({ delivery_zone_id: pickupZone.id })}
              className={cn(tileBase, "border-2 border-tm-coral bg-[#FFF8F5]")}
            >
              <span className="flex items-center justify-between">
                <Storefront weight="duotone" className="size-5 shrink-0 text-tm-coral" aria-hidden />
                <CheckCircle weight="fill" className="size-[18px] text-tm-coral" aria-hidden />
              </span>
              <span className="text-sm leading-[1.2] font-semibold">Pickup · {pickupZone.name}</span>
              {pickupZone.note && <span className="text-xs leading-[1.4] text-tm-text-2">{pickupZone.note}</span>}
            </button>
          ) : (
            <button
              type="button"
              aria-pressed={false}
              disabled={!isSignedIn || busy}
              onClick={() => choose({ delivery_zone_id: pickupZone.id })}
              className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-[#E8DDD6] p-3.5 text-[13px] leading-none font-semibold text-tm-text-2 transition-opacity hover:border-tm-coral/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tm-coral disabled:cursor-not-allowed"
            >
              <Plus className="size-4" aria-hidden />
              Pickup point
            </button>
          ))}

        <button
          type="button"
          disabled={!isSignedIn || busy}
          onClick={() => setDialogOpen(true)}
          className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-[#E8DDD6] p-3.5 text-[13px] leading-none font-semibold text-tm-text-2 transition-opacity hover:border-tm-coral/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tm-coral disabled:cursor-not-allowed"
        >
          <Plus className="size-4" aria-hidden />
          Add address
        </button>
      </div>

      {!isSignedIn && (
        <Link href={LOGIN_HREF} className="text-[13px] leading-[1.4] font-semibold text-tm-coral hover:underline">
          Sign in to choose where it goes
        </Link>
      )}

      {isSignedIn && (
        <AddressFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          zones={doorZones}
          onCreated={onCreated}
          onUnauthorized={goToLogin}
        />
      )}
    </section>
  );
}
