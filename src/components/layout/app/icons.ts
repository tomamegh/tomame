import type { Icon } from "@phosphor-icons/react";
import {
  BookmarkSimple,
  House,
  Path,
  Storefront,
} from "@phosphor-icons/react/ssr";

import type { AppNavIconName } from "./types";

/**
 * The four tab glyphs, named after the `ph-*` classes in
 * `design/TmNavLight.dc.html`. Mapped explicitly rather than looked up
 * dynamically: a dynamic lookup pulls the whole Phosphor barrel into the RSC
 * graph, and the barrel calls `useContext`, which breaks in a server component.
 * Import from `@phosphor-icons/react/ssr` only.
 */
export const APP_NAV_ICONS: Record<AppNavIconName, Icon> = {
  house: House,
  storefront: Storefront,
  bookmark: BookmarkSimple,
  path: Path,
};
