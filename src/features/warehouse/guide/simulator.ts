/**
 * The practice bench (081 guide): a pure, self-contained copy of the warehouse
 * rules, small enough to learn on and strict enough to teach the real thing.
 *
 * Nothing here talks to a server. The messages are the real app's wording
 * wherever the app has one (`sealBlocker`, the receive dialog, the service's
 * 409s), so an operator who hits a wall in practice hits the same words on the
 * bench. Where practice is stricter than the app — packing a parcel that was
 * never logged in — it says so, because that is the habit being taught.
 */

export type SimStage = "expected" | "shelf" | "packed" | "shipped";
export type SimPackageStatus = "packing" | "sealed" | "shipped";

export interface SimParcel {
  id: string;
  orderNo: string;
  title: string;
  customer: string;
  place: string;
  listedLbs: number;
  stage: SimStage;
  weightLbs: number | null;
  hold: string | null;
}

export interface SimPackage {
  reference: string;
  status: SimPackageStatus;
  items: string[];
  printCount: number;
  carrier: string | null;
}

export interface SimFeedEntry {
  id: number;
  customer: string;
  title: string;
  detail: string | null;
}

export type SimTone = "success" | "warning" | "error" | "info";

export interface SimNotice {
  tone: SimTone;
  title: string;
  detail?: string;
}

export interface SimState {
  parcels: SimParcel[];
  selected: string[];
  pkg: SimPackage | null;
  feed: SimFeedEntry[];
  notice: SimNotice | null;
  /** Printed while the box was sealed — the only print that counts as done. */
  printedSealed: boolean;
  /** The operator tried to pack the held parcel and was stopped. */
  metHold: boolean;
  nextFeedId: number;
}

export type SimAction =
  | { type: "receive"; id: string; weight: string }
  | { type: "toggle"; id: string }
  | { type: "pack" }
  | { type: "remove"; id: string }
  | { type: "seal" }
  | { type: "reopen" }
  | { type: "print" }
  | { type: "ship"; carrier: string }
  | { type: "dismiss" }
  | { type: "reset" };

export const SIM_REFERENCE = "PKG-20001";

export function initialSimState(): SimState {
  return {
    parcels: [
      {
        id: "p1",
        orderNo: "TM-00101",
        title: "Wireless earbuds",
        customer: "Ama Owusu",
        place: "Osu, Accra",
        listedLbs: 0.5,
        stage: "expected",
        weightLbs: null,
        hold: null,
      },
      {
        id: "p2",
        orderNo: "TM-00102",
        title: "Running shoes",
        customer: "Ama Owusu",
        place: "Osu, Accra",
        listedLbs: 2.1,
        stage: "expected",
        weightLbs: null,
        hold: null,
      },
      {
        id: "p3",
        orderNo: "TM-00103",
        title: "Phone case",
        customer: "Kofi Boateng",
        place: "Adum, Kumasi",
        listedLbs: 0.2,
        stage: "shelf",
        weightLbs: 0.3,
        hold: "Customer says the photo shows the wrong colour.",
      },
    ],
    selected: [],
    pkg: null,
    feed: [],
    notice: null,
    printedSealed: false,
    metHold: false,
    nextFeedId: 1,
  };
}

/** "1.40" → 1.4; blank, zero, negative or junk → null. Mirrors the receive dialog. */
export function parseWeight(raw: string): number | null {
  const cleaned = raw.trim();
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

export function formatSimLbs(value: number | null): string {
  if (value === null) return "not weighed";
  return `${value.toFixed(2).replace(/\.?0+$/, "")} lb`;
}

/** The box's weight: the parcels' own scale readings added up. */
export function simPackageWeight(state: SimState): number | null {
  if (!state.pkg || state.pkg.items.length === 0) return null;
  const total = state.pkg.items.reduce((sum, id) => sum + (find(state, id)?.weightLbs ?? 0), 0);
  return Math.round(total * 100) / 100;
}

/** Why the practice box cannot be sealed yet — the app's `sealBlocker`, word for word. */
export function simSealBlocker(state: SimState): string | null {
  const pkg = state.pkg;
  if (!pkg) return "Pack something first.";
  if (pkg.status !== "packing") return null;
  if (pkg.items.length === 0) return "Add at least one item first.";
  const held = pkg.items.filter((id) => find(state, id)?.hold).length;
  if (held > 0) return `${held} item${held === 1 ? " is" : "s are"} on hold.`;
  return null;
}

export function isSelectable(parcel: SimParcel): boolean {
  return parcel.stage === "shelf" && !parcel.hold;
}

function find(state: SimState, id: string): SimParcel | undefined {
  return state.parcels.find((p) => p.id === id);
}

function patch(state: SimState, id: string, change: Partial<SimParcel>): SimParcel[] {
  return state.parcels.map((p) => (p.id === id ? { ...p, ...change } : p));
}

function withFeed(state: SimState, customer: string, title: string, detail: string | null): Pick<SimState, "feed" | "nextFeedId"> {
  return {
    feed: [{ id: state.nextFeedId, customer, title, detail }, ...state.feed].slice(0, 8),
    nextFeedId: state.nextFeedId + 1,
  };
}

function notice(state: SimState, tone: SimTone, title: string, detail?: string): SimState {
  return { ...state, notice: { tone, title, ...(detail ? { detail } : {}) } };
}

export function simReducer(state: SimState, action: SimAction): SimState {
  switch (action.type) {
    case "reset":
      return initialSimState();

    case "dismiss":
      return { ...state, notice: null };

    case "receive": {
      const parcel = find(state, action.id);
      if (!parcel) return state;
      if (parcel.stage !== "expected" && parcel.stage !== "shelf") {
        return notice(state, "error", `${parcel.orderNo} is already packed`, "Take it out of the package to re-weigh it.");
      }
      const weight = parseWeight(action.weight);
      if (weight === null) {
        return notice(
          state,
          "error",
          "Check the weight",
          "Enter the scale reading in pounds, e.g. 1.4. On the bench you may leave it blank and weigh later; in practice, weigh it.",
        );
      }
      const reweigh = parcel.stage === "shelf";
      if (reweigh && parcel.weightLbs === weight) {
        return notice(state, "info", `${parcel.orderNo} already weighs ${formatSimLbs(weight)}`, "Nothing changed, so nothing new was sent to the customer.");
      }
      return {
        ...state,
        parcels: patch(state, parcel.id, { stage: "shelf", weightLbs: weight }),
        ...withFeed(state, parcel.customer, reweigh ? "Re-weighed at our US hub" : "Arrived at our US hub", formatSimLbs(weight)),
        notice: {
          tone: "success",
          title: reweigh ? `${parcel.orderNo} re-weighed` : `${parcel.orderNo} logged in`,
          detail: `${formatSimLbs(weight)} recorded. The customer's tracking now shows it at the hub.`,
        },
      };
    }

    case "toggle": {
      const parcel = find(state, action.id);
      if (!parcel) return state;
      if (parcel.hold) {
        return {
          ...notice(state, "warning", `${parcel.orderNo} is on hold`, `${parcel.hold} It cannot be packed or sealed until someone releases it.`),
          metHold: true,
        };
      }
      if (parcel.stage === "expected") {
        return notice(
          state,
          "warning",
          `Log ${parcel.orderNo} in first`,
          "The app would let you tick it, but a parcel packed without logging in has no weight, and the customer is never told it arrived.",
        );
      }
      if (parcel.stage !== "shelf") {
        return notice(state, "info", `${parcel.orderNo} is already in ${state.pkg?.reference ?? "a package"}`);
      }
      const on = state.selected.includes(parcel.id);
      return {
        ...state,
        selected: on ? state.selected.filter((id) => id !== parcel.id) : [...state.selected, parcel.id],
        notice: null,
      };
    }

    case "pack": {
      if (state.selected.length === 0) return notice(state, "info", "Nothing selected", "Tick the items that go in the box.");
      if (state.pkg && state.pkg.status === "sealed") {
        return notice(state, "error", "This package is sealed. Reopen it to change what is inside.");
      }
      if (state.pkg && state.pkg.status === "shipped") {
        return notice(state, "error", "This package has shipped.");
      }
      const ids = state.selected;
      const parcels = state.parcels.map((p) => (ids.includes(p.id) ? { ...p, stage: "packed" as const } : p));
      const pkg: SimPackage = state.pkg
        ? { ...state.pkg, items: [...state.pkg.items, ...ids] }
        : { reference: SIM_REFERENCE, status: "packing", items: [...ids], printCount: 0, carrier: null };
      const count = `${ids.length} item${ids.length === 1 ? "" : "s"}`;
      return {
        ...state,
        parcels,
        pkg,
        selected: [],
        notice: state.pkg
          ? { tone: "success", title: `Added to ${pkg.reference}`, detail: `${count} packed.` }
          : { tone: "success", title: `${pkg.reference} started`, detail: `${count} packed. Seal it, then print the label.` },
      };
    }

    case "remove": {
      const pkg = state.pkg;
      const parcel = find(state, action.id);
      if (!pkg || !parcel || !pkg.items.includes(parcel.id)) return state;
      if (pkg.status !== "packing") return notice(state, "error", "This package is sealed. Reopen it to change what is inside.");
      return {
        ...state,
        parcels: patch(state, parcel.id, { stage: "shelf" }),
        pkg: { ...pkg, items: pkg.items.filter((id) => id !== parcel.id) },
        notice: { tone: "info", title: `${parcel.orderNo} is back on the shelf` },
      };
    }

    case "seal": {
      const blocker = simSealBlocker(state);
      if (blocker || !state.pkg) return notice(state, "error", "Could not seal it", blocker ?? undefined);
      if (state.pkg.status !== "packing") return notice(state, "info", "This package is already sealed.");
      return {
        ...state,
        pkg: { ...state.pkg, status: "sealed" },
        notice: { tone: "success", title: `${state.pkg.reference} sealed`, detail: "Print the label and stick it on the top." },
      };
    }

    case "reopen": {
      if (!state.pkg || state.pkg.status !== "sealed") {
        return notice(state, "error", "Only a sealed package that has not shipped can be reopened.");
      }
      return {
        ...state,
        pkg: { ...state.pkg, status: "packing" },
        notice: { tone: "info", title: `${state.pkg.reference} reopened`, detail: "Contents can change again. Reprint the label after." },
      };
    }

    case "print": {
      const pkg = state.pkg;
      if (!pkg) return notice(state, "info", "Nothing to print yet", "Pack a box first. Labels belong to packages.");
      const next = { ...state, pkg: { ...pkg, printCount: pkg.printCount + 1 } };
      if (pkg.status === "packing") {
        return {
          ...next,
          notice: {
            tone: "warning",
            title: "Printed, but the box is still open",
            detail: "Seal it first so the label cannot fall out of date. You will need to print again.",
          },
        };
      }
      return {
        ...next,
        printedSealed: next.printedSealed || pkg.status === "sealed",
        notice: {
          tone: "success",
          title: pkg.printCount === 0 ? "Label printed" : `Label reprinted (×${pkg.printCount + 1})`,
          detail: "Stick it flat on the top of the box, away from the tape seam.",
        },
      };
    }

    case "ship": {
      const pkg = state.pkg;
      if (!pkg || pkg.status !== "sealed") {
        return notice(state, "error", pkg?.status === "shipped" ? "This package has already shipped." : "Seal the package before shipping it.");
      }
      const carrier = action.carrier.trim() || null;
      let next: SimState = {
        ...state,
        pkg: { ...pkg, status: "shipped", carrier },
        parcels: state.parcels.map((p) => (pkg.items.includes(p.id) ? { ...p, stage: "shipped" as const } : p)),
      };
      for (const customer of new Set(pkg.items.map((id) => find(state, id)?.customer).filter((c): c is string => !!c))) {
        next = { ...next, ...withFeed(next, customer, "On its way to Ghana", carrier) };
      }
      const orders = pkg.items.length;
      return {
        ...next,
        notice: {
          tone: "success",
          title: `${pkg.reference} is on its way`,
          detail: `${orders} customer order${orders === 1 ? "" : "s"} moved to in transit and notified.`,
        },
      };
    }
  }
}

export interface SimGoal {
  id: "receive-1" | "receive-2" | "pack" | "seal" | "print" | "ship";
  label: string;
  hint: string;
  done: boolean;
}

/** The six things practice asks for, in the order the bench does them. */
export function simGoals(state: SimState): SimGoal[] {
  const p1 = find(state, "p1");
  const p2 = find(state, "p2");
  const pkg = state.pkg;
  const both = !!pkg && pkg.items.includes("p1") && pkg.items.includes("p2");
  const sealedOrLater = !!pkg && pkg.status !== "packing";
  return [
    {
      id: "receive-1",
      label: "Log in TM-00101 with its weight",
      hint: "Press Log in on the earbuds, type the scale reading, press Enter.",
      done: !!p1 && p1.stage !== "expected" && p1.weightLbs !== null,
    },
    {
      id: "receive-2",
      label: "Log in TM-00102 with its weight",
      hint: "Same again for the running shoes.",
      done: !!p2 && p2.stage !== "expected" && p2.weightLbs !== null,
    },
    {
      id: "pack",
      label: "Pack both of Ama's items in one box",
      hint: "Tick both, then New package. One customer, one box.",
      done: both || (!!pkg && pkg.status === "shipped"),
    },
    {
      id: "seal",
      label: "Seal the package",
      hint: "Sealing freezes what is inside.",
      done: sealedOrLater && both,
    },
    {
      id: "print",
      label: "Print the label once it is sealed",
      hint: "A label printed on an open box can fall out of date.",
      done: state.printedSealed,
    },
    {
      id: "ship",
      label: "Mark it shipped",
      hint: "In practice it is safe. On the bench it notifies every customer and cannot be undone.",
      done: pkg?.status === "shipped",
    },
  ];
}

export function isSimComplete(state: SimState): boolean {
  return simGoals(state).every((goal) => goal.done);
}
