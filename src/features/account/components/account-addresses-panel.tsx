"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Buildings, CheckCircle, HouseLine, MapPin, Plus } from "@phosphor-icons/react/ssr";

import type { DeliveryZoneRow } from "@/db/queries/delivery-zones";
import { AddressFormDialog } from "@/features/addresses/components/address-form-dialog";
import { formatAddressLabel } from "@/features/addresses/format";
import {
  useAddresses,
  useDeleteAddress,
  useUpdateAddress,
} from "@/features/addresses/hooks/useAddresses";
import type { DeliveryAddress } from "@/features/addresses/types";
import { formatGhs } from "@/features/marketing/format";
import { ApiFetchError } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import { AccountEmpty, AccountPanel } from "./account-panel";

/** The bag's three glyphs, picked off the customer's own label. One rule, two screens. */
function AddressIcon({ label, isDefault }: { label: string; isDefault: boolean }) {
  const className = cn("size-5 shrink-0", isDefault ? "text-tm-coral" : "text-tm-text-3");
  if (/home/i.test(label)) return <HouseLine weight="duotone" className={className} aria-hidden />;
  if (/office|work/i.test(label)) return <Buildings weight="duotone" className={className} aria-hidden />;
  return <MapPin weight="duotone" className={className} aria-hidden />;
}

/**
 * Addresses — the same `delivery_addresses` rows the bag's Deliver-to card
 * offers, and the same dialog to add one.
 *
 * Nothing here is a second implementation: the list comes from
 * `useAddresses`, the form from `AddressFormDialog` (moved out of the bag in
 * Phase 6 precisely so this tab could use it), and the default flag moves
 * server-side. This screen only adds what the bag has no room for — removing an
 * address, and promoting one to default without going through a checkout.
 *
 * Zone names and fees are the admin's rows, never a hard-coded map: the fee
 * shown against an address is what that address will actually be charged.
 */
export function AccountAddressesPanel({
  addresses,
  zones,
  blurb,
}: {
  addresses: DeliveryAddress[];
  zones: DeliveryZoneRow[];
  blurb: string;
}) {
  const router = useRouter();
  const { data: saved } = useAddresses(addresses, true);
  const updateAddress = useUpdateAddress();
  const deleteAddress = useDeleteAddress();
  const [dialogOpen, setDialogOpen] = useState(false);

  const zoneOf = useCallback(
    (id: string | null) => (id ? (zones.find((zone) => zone.id === id) ?? null) : null),
    [zones],
  );

  const goToLogin = useCallback(
    () => router.push(`/auth/login?next=${encodeURIComponent("/app/account?tab=addresses")}`),
    [router],
  );

  const onCreated = useCallback(() => router.refresh(), [router]);

  const makeDefault = useCallback(
    (address: DeliveryAddress) => {
      updateAddress.mutate(
        { id: address.id, input: { is_default: true } },
        {
          onSuccess: () => {
            toast.success({ title: `${address.label} is now your default` });
            router.refresh();
          },
          onError: (error) => {
            if (error instanceof ApiFetchError && error.status === 401) return goToLogin();
            toast.error({ title: "Could not change the default", description: error.message });
          },
        },
      );
    },
    [goToLogin, router, updateAddress],
  );

  const remove = useCallback(
    (address: DeliveryAddress) => {
      deleteAddress.mutate(
        { id: address.id },
        {
          onSuccess: () => {
            toast.success({ title: "Address removed", description: formatAddressLabel(address) });
            router.refresh();
          },
          onError: (error) => {
            if (error instanceof ApiFetchError && error.status === 401) return goToLogin();
            toast.error({ title: "Could not remove the address", description: error.message });
          },
        },
      );
    },
    [deleteAddress, goToLogin, router],
  );

  const busy = updateAddress.isPending || deleteAddress.isPending;

  return (
    <AccountPanel
      title="Addresses"
      blurb={blurb}
      action={
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className={cn(
            "flex items-center gap-1.5 rounded-full border border-tm-border bg-tm-paper px-3.5 py-2",
            "text-[13px] leading-none font-semibold transition-colors hover:border-tm-coral/40 hover:text-tm-coral-strong",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tm-coral",
          )}
        >
          <Plus weight="bold" className="size-3.5" aria-hidden />
          Add an address
        </button>
      }
    >
      {saved.length === 0 ? (
        <AccountEmpty
          title="No addresses saved"
          body="Add one here, or add it at checkout — either way it is saved for next time. The zone you choose is what sets the delivery fee."
        />
      ) : (
        <ul className={cn("grid gap-3 sm:grid-cols-2", busy && "opacity-60")} aria-busy={busy}>
          {saved.map((address) => {
            const zone = zoneOf(address.delivery_zone_id);
            return (
              <li
                key={address.id}
                className={cn(
                  "flex flex-col gap-2 rounded-2xl p-3.5",
                  address.is_default ? "border-2 border-tm-coral bg-[#FFF8F5]" : "border border-tm-border",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <AddressIcon label={address.label} isDefault={address.is_default} />
                  {address.is_default ? (
                    <span className="flex items-center gap-1 text-xs leading-none font-semibold text-tm-coral">
                      <CheckCircle weight="fill" className="size-[15px]" aria-hidden />
                      Default
                    </span>
                  ) : null}
                </div>

                <p className="text-sm leading-[1.2] font-semibold">{formatAddressLabel(address)}</p>

                <p className="text-xs leading-[1.5] text-tm-text-2">
                  {address.recipient_name} · {address.phone}
                  <br />
                  {address.line1}
                  {address.line2 ? `, ${address.line2}` : ""}
                  <br />
                  {[address.area, address.city, address.region].filter(Boolean).join(", ")}
                  {address.digital_address ? ` · ${address.digital_address}` : ""}
                </p>

                {zone ? (
                  <p className="text-xs leading-none font-medium text-tm-text-3">
                    {zone.name} · {zone.fee_ghs > 0 ? formatGhs(zone.fee_ghs) : "Free"} delivery
                  </p>
                ) : null}

                <div className="mt-auto flex flex-wrap gap-3 pt-1">
                  {!address.is_default && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => makeDefault(address)}
                      className="text-xs leading-none font-semibold text-tm-coral-strong underline-offset-2 hover:underline disabled:opacity-60"
                    >
                      Make default
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => remove(address)}
                    className="text-xs leading-none font-semibold text-tm-text-3 underline-offset-2 hover:text-tm-ink hover:underline disabled:opacity-60"
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/*
        Deleting the default promotes the oldest remaining address server-side,
        so the customer is never left with a bag that has nowhere to go. Said
        here because the button gives no other clue that something else moves.
      */}
      {saved.length > 1 ? (
        <p className="text-xs leading-[1.45] font-medium text-tm-text-3">
          Removing your default promotes the oldest address you have left.
        </p>
      ) : null}

      <AddressFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        zones={zones}
        onCreated={onCreated}
        onUnauthorized={goToLogin}
      />
    </AccountPanel>
  );
}
