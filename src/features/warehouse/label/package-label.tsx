import type { WarehousePackage, WarehouseReturnAddress } from "../types";
import {
  formatDimensions,
  formatLbs,
  packageWeight,
  pluralise,
  recipientLines,
} from "../components/format";

/**
 * The label that goes on the box (081). Server-rendered; the QR and barcode
 * arrive as SVG strings from `codes.ts`.
 *
 * Designed for a 203-dpi thermal printer first and a laser second: pure black
 * on white, heavy rules, nothing that depends on colour or a thin hairline.
 * The Tomame mark is the only image, and it survives being dithered.
 *
 * Structure, top to bottom, in the order a handler's eye needs it: who we are
 * and how it flies; who it is for; the machine-readable reference; the route;
 * how to handle it; where it goes back to. The QR opens this package's page
 * for signed-in staff — contents, photos, customers. For anyone else it opens
 * a sign-in screen, so a label photographed at an airport leaks nothing.
 */

export interface LabelCodes {
  qr: string;
  barcode: string;
  scanUrl: string;
}

function stamp(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  return d
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/New_York" })
    .toUpperCase();
}

function Svg({ markup, className }: { markup: string; className?: string }) {
  // The markup is produced by bwip-js from our own reference string, never from
  // user input, so it is safe to inline.
  return <div className={className} dangerouslySetInnerHTML={{ __html: markup }} />;
}

/**
 * The wordmark alone. The globe-and-plane mark is a detailed colour
 * illustration, and at 203 dpi in 1-bit it printed as a grey smudge. The
 * wordmark is a pre-thresholded 1-bit PNG (`logo-wordmark-label.png`, pure
 * black on transparent): the colour WebP dithered to speckle even filtered.
 */
function BrandMark({ height }: { height: number }) {
  return <img src="/images/brand/logo-wordmark-label.png" alt="Tomame" style={{ height }} className="tm-label-img" />;
}

function returnLine(address: WarehouseReturnAddress): string {
  return [address.name, address.line1, address.line2, address.city].filter(Boolean).join(", ");
}

/**
 * `format` picks the stock. `4x6` is a thermal LABEL printer's die-cut label
 * (Zebra, Rollo, Munbyn…). `roll80` is the same design at 72 mm wide — the
 * printable width of an 80 mm RECEIPT roll (Epson TM, Xprinter…), which cannot
 * take a 4-inch label at all. Everything is sized to survive 203 dpi.
 */
export function Label4x6({
  pkg,
  codes,
  address,
  format = "4x6",
}: {
  pkg: WarehousePackage;
  codes: LabelCodes;
  address: WarehouseReturnAddress;
  format?: "4x6" | "roll80";
}) {
  const weight = packageWeight(pkg);
  const dims = formatDimensions(pkg);
  const recipient = pkg.recipients[0];
  const marks = [
    pkg.this_way_up ? "↑↑ THIS WAY UP" : null,
    pkg.fragile ? "FRAGILE" : null,
    pkg.keep_dry ? "☂ KEEP DRY" : null,
  ].filter((m): m is string => !!m);
  const originCode = cityCode(pkg.origin);
  const destCode = cityCode(pkg.destination);
  // 72 mm instead of 4 in: the fixed-width columns give way to the content.
  const narrow = format === "roll80";

  return (
    <article
      className={`tm-label ${format === "roll80" ? "tm-label-roll80" : "tm-label-4x6"}`}
      aria-label={`Label for ${pkg.reference}`}
    >
      {/* Brand + service */}
      <header className="flex items-stretch border-b-[3px] border-black">
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-[0.04in] px-[0.14in] py-[0.1in]">
          <BrandMark height={narrow ? 17 : 22} />
          <span className="truncate text-[8.5px] leading-tight font-semibold">
            {address.name}
            {address.phone ? ` · ${address.phone}` : ""}
            {address.email ? ` · ${address.email}` : ""}
          </span>
        </div>
        <div
          className={`flex shrink-0 flex-col items-center justify-center bg-black px-[0.06in] text-white ${narrow ? "w-[0.8in]" : "w-[1.25in]"}`}
        >
          <span className="font-display text-[26px] leading-none font-extrabold tracking-[-0.02em]">
            {pkg.service === "air" ? "AIR" : "SEA"}
          </span>
          <span className="mt-[2px] text-[7.5px] leading-none font-bold tracking-[0.18em]">FREIGHT</span>
        </div>
      </header>

      {/* Kind band */}
      <div className="flex items-center justify-between bg-black px-[0.14in] py-[0.05in] text-white">
        <span className="text-[10.5px] leading-none font-extrabold tracking-[0.14em]">
          {pkg.is_consolidated ? "CONSOLIDATED CARTON" : "PARCEL"}
        </span>
        <span className="text-[10.5px] leading-none font-bold tracking-[0.08em]">{stamp(pkg.sealed_at)}</span>
      </div>

      {/* Deliver to */}
      <section className="flex min-h-0 flex-1 flex-col gap-[0.03in] border-b-[3px] border-black px-[0.14in] py-[0.09in]">
        <span className="text-[8px] leading-none font-extrabold tracking-[0.16em]">DELIVER TO</span>
        {pkg.is_consolidated ? (
          <>
            <span className="font-display text-[21px] leading-[1.05] font-extrabold tracking-[-0.01em]">
              {pluralise(pkg.recipients.length, "customer")}
            </span>
            <span className="text-[10px] leading-snug font-semibold">
              Break down on arrival in {pkg.destination}. Contents by name:
            </span>
            <span className="line-clamp-2 text-[10px] leading-snug font-bold">
              {pkg.recipients.map((r) => r.name ?? "Customer").join(" · ")}
            </span>
          </>
        ) : recipient ? (
          <>
            <span className="line-clamp-1 font-display text-[23px] leading-[1.05] font-extrabold tracking-[-0.01em]">
              {recipient.name ?? "Tomame customer"}
            </span>
            {recipientLines(recipient)
              .slice(0, 3)
              .map((line) => (
                <span key={line} className="line-clamp-1 text-[11px] leading-snug font-semibold">
                  {line}
                </span>
              ))}
            {recipient.phone ? <span className="text-[11.5px] leading-snug font-extrabold">{recipient.phone}</span> : null}
          </>
        ) : (
          <span className="font-display text-[20px] leading-tight font-extrabold">{pkg.destination}</span>
        )}
      </section>

      {/* Figures */}
      <section className="grid grid-cols-3 border-b-[3px] border-black">
        <Figure label="ITEMS" value={String(pkg.unit_count)} />
        <Figure
          label={weight.estimated ? "WEIGHT (EST.)" : "WEIGHT"}
          value={weight.value ? formatLbs(weight.value, 1).replace(" lb", "") : "—"}
          unit={weight.value ? "lb" : undefined}
          divider
        />
        <Figure label="SIZE (IN)" value={dims ? dims.replace(" in", "").replace(/ × /g, "×") : "—"} divider small={!!dims} />
      </section>

      {/* Package reference */}
      <section className="flex flex-col gap-[0.04in] border-b-[3px] border-black px-[0.14in] pt-[0.08in] pb-[0.07in]">
        <div className="flex items-baseline justify-between">
          <span className="text-[8px] leading-none font-extrabold tracking-[0.16em]">PACKAGE</span>
          <span className="text-[8px] leading-none font-bold tracking-[0.1em]">
            {pkg.line_count} LINE{pkg.line_count === 1 ? "" : "S"}
          </span>
        </div>
        <Svg markup={codes.barcode} className="h-[0.62in] w-full" />
        <span className="text-center font-mono text-[25px] leading-none font-extrabold tracking-[0.06em]">
          {pkg.reference}
        </span>
      </section>

      {/* QR + route */}
      <section className="flex border-b-[3px] border-black">
        <div
          className={`flex shrink-0 flex-col items-center justify-center gap-[0.03in] border-r-[3px] border-black p-[0.08in] ${narrow ? "w-[1.18in]" : "w-[1.42in]"}`}
        >
          <Svg markup={codes.qr} className={narrow ? "size-[0.98in]" : "size-[1.12in]"} />
          <span className="text-center text-[7px] leading-tight font-extrabold tracking-[0.1em]">SCAN FOR CONTENTS</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-[0.05in] px-[0.12in] py-[0.08in]">
          <div className="flex items-center justify-between gap-2">
            <RouteStop code={originCode} name={narrow ? null : pkg.origin} />
            <span className="flex flex-1 items-center" aria-hidden>
              <span className="h-[2px] flex-1 bg-black" />
              <span className="px-[3px] text-[14px] leading-none">{pkg.service === "air" ? "✈" : "⛴"}</span>
              <span className="h-[2px] flex-1 bg-black" />
            </span>
            <RouteStop code={destCode} name={narrow ? null : pkg.destination} align="right" />
          </div>
          <div className="flex flex-col gap-[2px]">
            {pkg.tracking_number ? (
              <Meta
                label={pkg.carrier ? pkg.carrier.toUpperCase() : "WAYBILL"}
                value={pkg.tracking_number}
                mono
                stacked={narrow}
              />
            ) : null}
            {pkg.box?.departs_at ? <Meta label="DEPARTS" value={stamp(pkg.box.departs_at)} /> : null}
            <Meta label="SERVICE" value={pkg.service === "air" ? "Air · 5–7 days" : "Sea"} />
          </div>
        </div>
      </section>

      {/* Handling */}
      <section
        className="grid border-b-[3px] border-black"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, marks.length)}, minmax(0,1fr))` }}
      >
        {(marks.length ? marks : ["HANDLE WITH CARE"]).map((mark, i) => (
          <span
            key={mark}
            className={`flex items-center justify-center px-[0.04in] py-[0.07in] text-center text-[10px] leading-none font-extrabold tracking-[0.06em] ${i > 0 ? "border-l-[3px] border-black" : ""} ${mark === "FRAGILE" ? "bg-black text-white" : ""}`}
          >
            {mark}
          </span>
        ))}
      </section>

      {/* Return */}
      <footer className="flex items-center justify-between gap-2 px-[0.14in] py-[0.06in]">
        <span className="line-clamp-1 text-[7.5px] leading-tight font-semibold">
          {returnLine(address) ? `If undeliverable return to ${returnLine(address)}` : "tomame · concierge shopping to Ghana"}
        </span>
        <span className="shrink-0 text-[7.5px] font-extrabold tracking-[0.08em]">
          {format === "roll80" ? "80 MM" : "4×6"}
        </span>
      </footer>
    </article>
  );
}

/**
 * The small label. QR only: a Code 128 squeezed into one inch prints each bar
 * about 1.5 dots wide on a 203-dpi head and did not decode in testing, while
 * the QR at this size did. The reference is printed large for a human instead.
 */
export function Label2x1({ pkg, codes }: { pkg: WarehousePackage; codes: LabelCodes }) {
  const weight = packageWeight(pkg);
  return (
    <article className="tm-label tm-label-2x1 flex-row items-stretch" aria-label={`Small label for ${pkg.reference}`}>
      <div className="flex w-[0.94in] shrink-0 items-center justify-center border-r-2 border-black p-[0.05in]">
        <Svg markup={codes.qr} className="size-[0.84in]" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between px-[0.07in] py-[0.06in]">
        <div className="flex items-center justify-between gap-1">
          <img src="/images/brand/logo-wordmark-label.png" alt="Tomame" style={{ height: 10 }} className="tm-label-img" />
          <span className="bg-black px-[3px] py-[1px] text-[7px] leading-none font-extrabold tracking-[0.1em] text-white">
            {pkg.service === "air" ? "AIR" : "SEA"}
          </span>
        </div>
        <span className="font-mono text-[14.5px] leading-none font-extrabold whitespace-nowrap">{pkg.reference}</span>
        <span className="flex flex-col gap-[2px]">
          <span className="truncate text-[8px] leading-none font-extrabold">
            {pluralise(pkg.unit_count, "item")}
            {weight.value ? ` · ${formatLbs(weight.value, 1)}` : ""}
          </span>
          <span className="truncate text-[8px] leading-none font-bold">
            {pkg.is_consolidated
              ? `${pkg.recipients.length} customers`
              : (pkg.recipients[0]?.name ?? pkg.destination)}
          </span>
        </span>
      </div>
    </article>
  );
}

/**
 * The packing slip. Goes inside the box, or taped to it in a sleeve: the
 * customs officer and the Accra team both need to know what is in a sealed
 * carton without opening it. Item names and quantities only — no prices.
 */
export function Manifest({
  pkg,
  codes,
  address,
}: {
  pkg: WarehousePackage;
  codes: LabelCodes;
  address: WarehouseReturnAddress;
}) {
  const weight = packageWeight(pkg);
  return (
    <article className="tm-label tm-label-manifest" aria-label={`Manifest for ${pkg.reference}`}>
      <header className="flex items-center justify-between gap-3 border-b-[3px] border-black px-[0.16in] py-[0.12in]">
        <div className="flex min-w-0 flex-col gap-[0.05in]">
          <BrandMark height={24} />
          <span className="text-[9px] leading-none font-extrabold tracking-[0.16em]">PACKING MANIFEST</span>
          <span className="font-mono text-[22px] leading-none font-extrabold tracking-[0.03em]">{pkg.reference}</span>
        </div>
        <Svg markup={codes.qr} className="size-[0.8in] shrink-0" />
      </header>
      <div className="grid grid-cols-3 border-b-[3px] border-black text-[8.5px] font-bold">
        <span className="px-[0.16in] py-[0.06in]">
          <span className="block text-[7px] font-extrabold tracking-[0.14em]">SEALED</span>
          {stamp(pkg.sealed_at)}
        </span>
        <span className="border-l-2 border-black px-[0.1in] py-[0.06in]">
          <span className="block text-[7px] font-extrabold tracking-[0.14em]">CONTENTS</span>
          {pluralise(pkg.unit_count, "item")} · {weight.value ? formatLbs(weight.value, 1) : "—"}
        </span>
        <span className="border-l-2 border-black px-[0.1in] py-[0.06in]">
          <span className="block text-[7px] font-extrabold tracking-[0.14em]">ROUTE</span>
          {cityCode(pkg.origin)} → {cityCode(pkg.destination)}
        </span>
      </div>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b-2 border-black text-[8px] font-extrabold tracking-[0.12em]">
            <th className="w-[0.3in] px-[0.16in] py-[0.06in]">#</th>
            <th className="py-[0.06in]">ITEM</th>
            <th className="py-[0.06in]">FOR</th>
            <th className="px-[0.16in] py-[0.06in] text-right">QTY</th>
          </tr>
        </thead>
        <tbody>
          {pkg.lines.map((line, i) => (
            <tr key={line.id} className="border-b border-black align-top text-[9.5px]">
              <td className="px-[0.16in] py-[0.05in] font-bold">{i + 1}</td>
              <td className="py-[0.05in] pr-2">
                <span className="line-clamp-2 font-semibold">{line.item?.title ?? line.description}</span>
                {line.item ? <span className="font-mono text-[8.5px]">{line.item.order_no}</span> : null}
              </td>
              <td className="py-[0.05in] pr-2 font-semibold">{line.item?.recipient.name ?? "—"}</td>
              <td className="px-[0.16in] py-[0.05in] text-right font-extrabold">{line.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <footer className="mt-auto flex items-center justify-between gap-2 border-t-[3px] border-black px-[0.16in] py-[0.07in] text-[8px] font-semibold">
        <span>
          {address.name}
          {address.phone ? ` · ${address.phone}` : ""}
        </span>
        <span className="font-extrabold">Packed by {pkg.sealed_by_name ?? pkg.created_by_name ?? "Tomame"}</span>
      </footer>
    </article>
  );
}

function Figure({
  label,
  value,
  unit,
  divider,
  small,
}: {
  label: string;
  value: string;
  unit?: string;
  divider?: boolean;
  small?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-[0.03in] px-[0.12in] py-[0.07in] ${divider ? "border-l-[3px] border-black" : ""}`}>
      <span className="text-[7.5px] leading-none font-extrabold tracking-[0.14em]">{label}</span>
      <span className={`font-display leading-none font-extrabold tracking-[-0.02em] ${small ? "text-[15px]" : "text-[24px]"}`}>
        {value}
        {unit ? <span className="ml-[2px] text-[11px] font-bold">{unit}</span> : null}
      </span>
    </div>
  );
}

function RouteStop({ code, name, align = "left" }: { code: string; name: string | null; align?: "left" | "right" }) {
  return (
    <span className={`flex min-w-0 flex-col ${align === "right" ? "items-end text-right" : ""}`}>
      <span className="font-display text-[22px] leading-none font-extrabold tracking-[-0.01em]">{code}</span>
      {name ? <span className="max-w-[0.9in] truncate text-[7.5px] leading-tight font-bold">{name}</span> : null}
    </span>
  );
}

function Meta({ label, value, mono, stacked }: { label: string; value: string; mono?: boolean; stacked?: boolean }) {
  if (stacked) {
    return (
      <span className="flex flex-col gap-[1px] text-[8.5px] leading-tight">
        <span className="font-extrabold tracking-[0.1em]">{label}</span>
        <span className={`font-bold break-all ${mono ? "font-mono" : ""}`}>{value}</span>
      </span>
    );
  }
  return (
    <span className="flex items-baseline justify-between gap-2 text-[8.5px] leading-tight">
      <span className="shrink-0 font-extrabold tracking-[0.1em]">{label}</span>
      <span className={`truncate font-bold ${mono ? "font-mono" : ""}`}>{value}</span>
    </span>
  );
}

/** A three-letter stop for the route line — the airport where we know it. */
const CITY_CODES: Record<string, string> = {
  "new york": "NYC",
  "new jersey": "EWR",
  accra: "ACC",
  kumasi: "KMS",
  london: "LON",
  guangzhou: "CAN",
  cincinnati: "CVG",
  delaware: "ILG",
  houston: "HOU",
  atlanta: "ATL",
};

export function cityCode(place: string): string {
  const key = place.toLowerCase();
  for (const [city, code] of Object.entries(CITY_CODES)) {
    if (key.includes(city)) return code;
  }
  const letters = place.replace(/[^A-Za-z]/g, "").toUpperCase();
  return letters.slice(0, 3) || "—";
}
