import Link from "next/link";
import { warehousePageUser } from "@/features/warehouse/services/page-user";
import {
  ArrowRightIcon,
  BoxesIcon,
  CheckCircle2Icon,
  InboxIcon,
  MessageSquareWarningIcon,
  PackageCheckIcon,
  PackageOpenIcon,
  PlaneTakeoffIcon,
} from "lucide-react";

import { groupByRecipient, pluralise, recipientPlace, formatRelative, formatLbs, packageWeight } from "@/features/warehouse/components/format";
import { PackageBox } from "@/features/warehouse/components/package-box";
import { PackageCard } from "@/features/warehouse/components/package-card";
import { GuideTourCard } from "@/features/warehouse/guide/components/guide-tour-card";
import { NewPackageButton, PackItemsButton } from "@/features/warehouse/components/warehouse-actions";
import { ItemThumb, WarehouseHeading } from "@/features/warehouse/components/warehouse-ui";
import { getWarehouseDashboard } from "@/features/warehouse/services/warehouse.service";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * `/warehouse` — the hub at a glance (081).
 *
 * Read top to bottom it is the physical flow of the building: parcels expected,
 * parcels on the shelf, boxes on the bench, boxes taped and waiting, boxes gone.
 * Each stage is a link to the screen where that work is done, and the next job
 * — received items grouped by the person they belong to — has a one-tap "pack".
 */
export default async function WarehouseOverviewPage() {
  const user = await warehousePageUser("/warehouse");
  const data = await getWarehouseDashboard(user);
  const firstName = user.profile?.first_name?.trim() || null;
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "America/New_York" }).format(new Date()),
  );
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const flow = [
    { label: "Expected", value: data.counts.awaiting, hint: data.counts.not_bought > 0 ? `Purchased, on the way · ${data.counts.not_bought} not bought yet` : "Purchased, on the way to us", href: "/warehouse/receive?stage=awaiting", icon: InboxIcon, tone: "text-tm-text-2" },
    { label: "On the shelf", value: data.counts.received, hint: "Logged in, not packed", href: "/warehouse/receive?stage=received", icon: PackageOpenIcon, tone: "text-tm-amber" },
    { label: "Packing", value: data.counts.packing, hint: "Open on the bench", href: "/warehouse/packages?status=packing", icon: BoxesIcon, tone: "text-tm-amber" },
    { label: "Sealed", value: data.counts.sealed, hint: "Labelled, ready to go", href: "/warehouse/packages?status=sealed", icon: PackageCheckIcon, tone: "text-tm-coral" },
    { label: "Shipped", value: data.counts.shipped_7d, hint: "Left in the last 7 days", href: "/warehouse/packages?status=shipped", icon: PlaneTakeoffIcon, tone: "text-tm-green" },
  ];

  const groups = groupByRecipient(data.ready_to_pack);

  return (
    <div className="flex flex-col gap-7">
      <WarehouseHeading
        kicker={`US hub · ${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "America/New_York" })}`}
        title={`${greeting}${firstName ? `, ${firstName}` : ""}`}
        blurb="Log parcels in as they arrive, pack them by customer, print the label, and ship. Everything you do here updates the customer's tracking."
        action={
          <>
            <Link
              href="/warehouse/receive"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-tm-border bg-card px-4 text-[13px] font-semibold text-tm-ink transition-colors hover:bg-tm-paper"
            >
              <InboxIcon className="size-4" aria-hidden />
              Receive parcels
            </Link>
            <NewPackageButton variant="primary" />
          </>
        }
      />

      {/* 081 guide: offered until this device has finished it or closed the card. */}
      <GuideTourCard />

      {/* The flow of the building */}
      <section aria-label="Hub pipeline" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {flow.map((stage, i) => (
          <Link
            key={stage.label}
            href={stage.href}
            className={cn(
              "group tm-up relative flex flex-col gap-2.5 overflow-hidden rounded-[20px] border border-tm-border bg-card p-3.5 [animation-duration:0.5s] sm:gap-3 sm:p-4",
              "transition-[border-color,transform,box-shadow] hover:-translate-y-0.5 hover:border-tm-coral/35 hover:shadow-[0_16px_36px_-28px_rgba(43,36,34,0.5)]",
              i === 4 && "col-span-2 sm:col-span-1",
            )}
            style={{ animationDelay: `${0.05 + i * 0.05}s` }}
          >
            <div className="flex items-center justify-between">
              <span className={cn("flex size-8 items-center justify-center rounded-[11px] bg-tm-paper sm:size-9 sm:rounded-[12px]", stage.tone)}>
                <stage.icon className="size-[18px]" aria-hidden />
              </span>
              <ArrowRightIcon className="size-4 -translate-x-1 text-tm-text-3 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" aria-hidden />
            </div>
            <div className="flex flex-col gap-1">
              <span className="tm-nums font-display text-[26px] leading-none font-bold tracking-[-0.02em] text-tm-ink sm:text-[30px]">
                {stage.value}
              </span>
              <span className="text-[13px] font-semibold text-tm-ink">{stage.label}</span>
              <span className="hidden text-[12px] font-medium text-tm-text-3 sm:block">{stage.hint}</span>
            </div>
            {/* The connector to the next stage */}
            {i < flow.length - 1 ? (
              <span className="pointer-events-none absolute top-1/2 -right-px hidden h-px w-3 bg-tm-border lg:block" aria-hidden />
            ) : null}
          </Link>
        ))}
      </section>

      {(data.counts.held > 0 || data.counts.issues_open > 0) && (
        <Link
          href="/warehouse/issues"
          className="tm-up flex items-center gap-3 rounded-[18px] border border-[#f5d9b0] bg-tm-amber-bg px-4 py-3.5 [animation-duration:0.5s] hover:border-tm-amber/50"
        >
          <MessageSquareWarningIcon className="size-5 shrink-0 text-tm-amber" aria-hidden />
          <span className="text-[13.5px] font-semibold text-[#7a4a06]">
            {[
              data.counts.issues_open ? pluralise(data.counts.issues_open, "customer issue") + " open" : null,
              data.counts.held ? pluralise(data.counts.held, "item") + " on hold" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            <span className="font-medium">. Check before you seal anything.</span>
          </span>
          <ArrowRightIcon className="ml-auto size-4 text-tm-amber" aria-hidden />
        </Link>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-7 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* On the bench */}
        <section className="flex min-w-0 flex-col gap-4">
          <SectionHead title="On the bench" count={data.active.length} href="/warehouse/packages" />
          {data.active.length === 0 ? (
            <EmptyBench />
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {data.active.map((pkg, i) => (
                <PackageCard key={pkg.id} pkg={pkg} index={i} />
              ))}
            </div>
          )}
        </section>

        <aside className="flex min-w-0 flex-col gap-7">
          {/* The next job */}
          <section className="flex flex-col gap-4">
            <SectionHead title="Ready to pack" count={data.counts.received} href="/warehouse/receive?stage=received" />
            {groups.length === 0 ? (
              <p className="rounded-[18px] border border-dashed border-tm-border bg-card px-4 py-6 text-[13px] font-medium text-tm-text-3">
                Nothing on the shelf. Parcels you log in on{" "}
                <Link href="/warehouse/receive" className="font-semibold text-tm-coral-strong underline-offset-2 hover:underline">
                  Receive
                </Link>{" "}
                appear here, grouped by customer.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {groups.slice(0, 6).map((group, i) => (
                  <li
                    key={group.key}
                    className="tm-up flex flex-col gap-3 rounded-[18px] border border-tm-border bg-card p-4 [animation-duration:0.5s]"
                    style={{ animationDelay: `${0.1 + i * 0.05}s` }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-[14px] font-semibold text-tm-ink">
                          {group.recipient.name ?? "Customer"}
                        </span>
                        <span className="truncate text-[12px] font-medium text-tm-text-3">
                          {[recipientPlace(group.recipient), pluralise(group.items.length, "item")].filter(Boolean).join(" · ")}
                        </span>
                      </div>
                      <PackItemsButton
                        orderIds={group.items.filter((it) => !it.held).map((it) => it.order_id)}
                        label="Pack"
                        className="h-8 px-3.5"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      {group.items.slice(0, 6).map((item) => (
                        <Link key={item.order_id} href={`/warehouse/items/${item.order_id}`} title={item.title}>
                          <ItemThumb item={item} size={38} rounded={10} />
                        </Link>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-4">
            <SectionHead title="Recently shipped" href="/warehouse/packages?status=shipped" />
            {data.recently_shipped.length === 0 ? (
              <p className="text-[13px] font-medium text-tm-text-3">Nothing has left this week yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-tm-hairline overflow-hidden rounded-[18px] border border-tm-border bg-card">
                {data.recently_shipped.map((pkg) => (
                  <li key={pkg.id}>
                    <Link href={`/warehouse/packages/${pkg.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-tm-paper/70">
                      <CheckCircle2Icon className="size-5 shrink-0 text-tm-green" aria-hidden />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-mono text-[13px] font-bold text-tm-ink">{pkg.reference}</span>
                        <span className="truncate text-[12px] font-medium text-tm-text-3">
                          {pluralise(pkg.unit_count, "item")} · {formatLbs(packageWeight(pkg).value)}
                          {pkg.tracking_number ? ` · ${pkg.tracking_number}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-[12px] font-medium text-tm-text-3">{formatRelative(pkg.shipped_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function SectionHead({ title, count, href }: { title: string; count?: number; href?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 font-display text-[18px] leading-none font-bold text-tm-ink">
        {title}
        {count !== undefined ? (
          <span className="rounded-full bg-tm-tint px-2 py-1 font-sans text-[12px] leading-none font-bold text-tm-coral-strong">
            {count}
          </span>
        ) : null}
      </h2>
      {href ? (
        <Link href={href} className="text-[13px] font-semibold text-tm-text-2 transition-colors hover:text-tm-ink">
          See all
        </Link>
      ) : null}
    </div>
  );
}

function EmptyBench() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[22px] border border-dashed border-tm-border bg-card px-6 py-12 text-center">
      <PackageBox status="packing" size={92} />
      <p className="font-display text-[17px] font-bold text-tm-ink">The bench is clear</p>
      <p className="max-w-[46ch] text-[13px] font-medium text-tm-text-2">
        Start a package from the shelf, or scan items into a new one. Open and sealed packages live here until they ship.
      </p>
      <NewPackageButton />
    </div>
  );
}
