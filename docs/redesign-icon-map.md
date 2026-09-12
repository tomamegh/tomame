# Redesign icon map: Lucide -> Phosphor

Planning artifact for the UI redesign. **No component code is changed by this document.**

Handoff rule being applied: *"Icons: Phosphor (duotone for feature icons, fill for status, bold for arrows, regular for in-line). Not Lucide."*

| | |
|---|---|
| Distinct Lucide icon components in `src/` | **138** |
| Plus the `LucideIcon` *type* | 1 symbol, 4 import sites (`src/types/index.ts:1`, `src/features/admin/components/stat-card.tsx:11`, `src/features/orders/components/stats-row.tsx:11`, `src/components/layout/admin/nav-secondary.tsx:2`) |
| Import sites (icons only) | **375** |
| Render / reference sites | **419** |
| Files importing `lucide-react` | **106** |
| Distinct `ph-*` icons used across the mocks | **54** |
| Installed Phosphor package | none - `package.json:56` has `lucide-react: ^0.575.0` only |

Name verification: every Phosphor name below was checked against **@phosphor-icons/web@2.1.1** (`src/regular/style.css`, 1530 `.ph-*` classes) and **@phosphor-icons/react@2.1.10** (`dist/ssr/*.es.js`, 1513 components). Nothing in this document is UNVERIFIED; the five Lucide icons with no Phosphor counterpart are called out explicitly in section 2.

---

## 1. Lucide inventory (most-used first)

`Import sites` is the migration unit - the line you edit. `Renders` counts JSX/reference occurrences.

| Icon | Import sites (file:line) | Import sites | Renders | Context (what it labels) |
|---|---|---:|---:|---|
| `ArrowLeftIcon` | `src/app/app/orders/review/[id]/page.tsx:7`<br>`src/app/app/orders/new/page.tsx:6`<br>`src/app/app/orders/[id]/page.tsx:3`<br>`src/app/app/orders/[id]/checkout/page.tsx:7`<br>`src/app/admin/not-found.tsx:2`<br>`src/app/admin/policies/new/page.tsx:6`<br>`src/app/admin/policies/[slug]/policy-editor.tsx:5`<br>`src/app/admin/transactions/[id]/page.tsx:6`<br>`src/app/admin/users/[id]/user-detail-client.tsx:5`<br>`src/app/admin/orders/[id]/page.tsx:2`<br>`src/components/layout/admin/notifications.tsx:4` | 11 | 17 | Back link on every detail page and on the quote wizard steps |
| `ExternalLinkIcon` | `src/app/app/orders/review/[id]/page.tsx:7`<br>`src/app/admin/transactions/[id]/page.tsx:6`<br>`src/features/admin/components/latest-deliveries-table.tsx:4`<br>`src/features/admin/components/latest-orders-table.tsx:4`<br>`src/features/admin/components/latest-transactions-table.tsx:4`<br>`src/features/orders/components/admin-order-detail.tsx:6`<br>`src/features/orders/components/admin-orders-list.tsx:14`<br>`src/features/orders/components/order-card.tsx:5`<br>`src/features/orders/components/order-detail.tsx:5`<br>`src/features/orders/components/recent-orders/column.tsx:7`<br>`src/features/orders/components/admin-orders-table/columns.tsx:5`<br>`src/features/orders/components/user-orders/columns.tsx:5`<br>`src/features/extraction/components/product-preview.tsx:3`<br>`src/features/deliveries/components/deliveries-table/columns.tsx:5` | 14 | 16 | Open the source product / listing URL - order + txn detail, orders & deliveries tables, product preview |
| `XIcon` | `src/features/settings/components/pricing-constants-card.tsx:4`<br>`src/features/transactions/components/admin-transactions-table/toolbar.tsx:4`<br>`src/features/users/components/admin-users-table/toolbar.tsx:4`<br>`src/features/orders/components/admin-order-detail.tsx:6`<br>`src/features/orders/components/admin-orders-table/toolbar.tsx:4`<br>`src/features/orders/components/user-orders/toolbar.tsx:4`<br>`src/features/pricing/components/pricing-groups-table/toolbar.tsx:4`<br>`src/features/pricing/components/category-mappings-table/toolbar.tsx:4`<br>`src/features/notifications/components/admin-notifications-table/toolbar.tsx:4`<br>`src/features/deliveries/components/deliveries-table/toolbar.tsx:4`<br>`src/components/ui/combobox.tsx:5`<br>`src/components/ui/dialog.tsx:4`<br>`src/components/ui/sheet.tsx:8` | 13 | 15 | Dismiss - dialog & sheet close, clear active filter chip, combobox clear, cancel inline edit |
| `ChevronRightIcon` | `src/app/admin/policies/policies-list.tsx:5`<br>`src/features/transactions/components/admin-transactions-table/data-table.tsx:17`<br>`src/features/users/components/admin-users-table/data-table.tsx:17`<br>`src/features/orders/components/admin-orders-table/data-table.tsx:20`<br>`src/features/orders/components/user-orders/data-table.tsx:20`<br>`src/features/pricing/components/pricing-groups-table/data-table.tsx:15`<br>`src/features/pricing/components/category-mappings-table/data-table.tsx:15`<br>`src/features/notifications/components/admin-notifications-table/data-table.tsx:16`<br>`src/features/deliveries/components/deliveries-table/data-table.tsx:17`<br>`src/components/ui/breadcrumb.tsx:5`<br>`src/components/ui/dropdown-menu.tsx:7` | 11 | 11 | Next page (7 data tables), breadcrumb separator, dropdown submenu, policy row affordance |
| `RefreshCwIcon` | `src/features/settings/components/exchange-rates-card.tsx:3`<br>`src/features/transactions/components/admin-transactions-table/columns.tsx:5`<br>`src/features/transactions/components/admin-transactions-table/toolbar.tsx:4`<br>`src/features/users/components/admin-users-table/toolbar.tsx:4`<br>`src/features/orders/components/admin-orders-table/toolbar.tsx:4`<br>`src/features/orders/components/user-orders/toolbar.tsx:4`<br>`src/features/extraction/components/product-preview.tsx:3`<br>`src/features/pricing/components/pricing-groups-table/toolbar.tsx:4`<br>`src/features/pricing/components/category-mappings-table/toolbar.tsx:4`<br>`src/features/notifications/components/admin-notifications-table/toolbar.tsx:4`<br>`src/features/deliveries/components/deliveries-table/toolbar.tsx:4` | 11 | 11 | Refresh / retry - table toolbars, re-extract product, refresh exchange rates, retry payment |
| `CreditCardIcon` | `src/app/app/orders/review/[id]/page.tsx:7`<br>`src/app/app/orders/[id]/checkout/page.tsx:7`<br>`src/features/payments/components/transaction-item.tsx:1`<br>`src/features/transactions/components/transaction-channel-badge.tsx:2`<br>`src/features/transactions/components/transaction-stat-cards.tsx:1`<br>`src/features/transactions/components/admin-transactions-table/columns.tsx:5`<br>`src/features/orders/components/admin-order-detail.tsx:6`<br>`src/features/orders/components/order-detail.tsx:5`<br>`src/components/layout/admin/sidebar.tsx:4`<br>`src/components/examples/c-stepper-7.tsx:18` | 10 | 11 | Card payment channel badge, checkout payment step, txn stat card, payments nav |
| `PackageIcon` | `src/app/app/orders/review/[id]/page.tsx:7`<br>`src/app/app/orders/[id]/checkout/page.tsx:7`<br>`src/app/admin/transactions/[id]/page.tsx:6`<br>`src/features/orders/components/admin-order-detail.tsx:6`<br>`src/features/orders/components/order-detail.tsx:5`<br>`src/features/orders/components/recent-orders/column.tsx:7`<br>`src/features/orders/components/admin-orders-table/columns.tsx:5`<br>`src/features/orders/components/user-orders/columns.tsx:5`<br>`src/features/deliveries/components/stat-cards.tsx:1` | 9 | 9 | Product thumbnail fallback, order item cell, deliveries 'total' stat |
| `CheckIcon` | `src/features/orders/components/admin-order-detail.tsx:6`<br>`src/features/orders/components/recent-orders/column.tsx:7`<br>`src/components/ui/checkbox.tsx:4`<br>`src/components/ui/combobox.tsx:5`<br>`src/components/ui/dropdown-menu.tsx:7`<br>`src/components/ui/select.tsx:7`<br>`src/components/examples/c-stepper-7.tsx:18` | 7 | 9 | Checkbox tick, select / dropdown checked row, copy-confirmed, stepper completed |
| `AlertTriangleIcon` | `src/app/app/orders/review/[id]/page.tsx:7`<br>`src/features/admin/components/latest-orders-table.tsx:4`<br>`src/features/orders/components/admin-order-detail.tsx:6`<br>`src/features/orders/components/order-card.tsx:5`<br>`src/features/orders/components/admin-orders-table/columns.tsx:5`<br>`src/features/extraction/components/product-preview.tsx:3` | 6 | 9 | Warning - extraction gaps, needs-review order, missing product image |
| `CheckCircle2Icon` | `src/app/app/orders/review/[id]/page.tsx:7`<br>`src/app/app/orders/[id]/checkout/page.tsx:7`<br>`src/features/orders/components/admin-order-detail.tsx:6`<br>`src/features/orders/components/my-orders.tsx:5`<br>`src/features/orders/components/order-detail.tsx:5`<br>`src/components/layout/admin/notifications.tsx:4` | 6 | 9 | Success - payment verified, order placed banner, timeline completed step |
| `ArrowDownIcon` | `src/features/transactions/components/admin-transactions-table/columns.tsx:5`<br>`src/features/users/components/admin-users-table/columns.tsx:5`<br>`src/features/orders/components/admin-orders-table/columns.tsx:5`<br>`src/features/orders/components/user-orders/columns.tsx:5`<br>`src/features/pricing/components/pricing-groups-table/columns.tsx:4`<br>`src/features/pricing/components/category-mappings-table/columns.tsx:4`<br>`src/features/notifications/components/admin-notifications-table/columns.tsx:4`<br>`src/features/deliveries/components/deliveries-table/columns.tsx:5` | 8 | 8 | Table column sorted descending |
| `ArrowUpIcon` | `src/features/transactions/components/admin-transactions-table/columns.tsx:5`<br>`src/features/users/components/admin-users-table/columns.tsx:5`<br>`src/features/orders/components/admin-orders-table/columns.tsx:5`<br>`src/features/orders/components/user-orders/columns.tsx:5`<br>`src/features/pricing/components/pricing-groups-table/columns.tsx:4`<br>`src/features/pricing/components/category-mappings-table/columns.tsx:4`<br>`src/features/notifications/components/admin-notifications-table/columns.tsx:4`<br>`src/features/deliveries/components/deliveries-table/columns.tsx:5` | 8 | 8 | Table column sorted ascending |
| `ChevronLeftIcon` | `src/features/transactions/components/admin-transactions-table/data-table.tsx:17`<br>`src/features/users/components/admin-users-table/data-table.tsx:17`<br>`src/features/orders/components/admin-orders-table/data-table.tsx:20`<br>`src/features/orders/components/user-orders/data-table.tsx:20`<br>`src/features/pricing/components/pricing-groups-table/data-table.tsx:15`<br>`src/features/pricing/components/category-mappings-table/data-table.tsx:15`<br>`src/features/notifications/components/admin-notifications-table/data-table.tsx:16`<br>`src/features/deliveries/components/deliveries-table/data-table.tsx:17` | 8 | 8 | Previous page (7 data tables) |
| `ChevronsLeftIcon` | `src/features/transactions/components/admin-transactions-table/data-table.tsx:17`<br>`src/features/users/components/admin-users-table/data-table.tsx:17`<br>`src/features/orders/components/admin-orders-table/data-table.tsx:20`<br>`src/features/orders/components/user-orders/data-table.tsx:20`<br>`src/features/pricing/components/pricing-groups-table/data-table.tsx:15`<br>`src/features/pricing/components/category-mappings-table/data-table.tsx:15`<br>`src/features/notifications/components/admin-notifications-table/data-table.tsx:16`<br>`src/features/deliveries/components/deliveries-table/data-table.tsx:17` | 8 | 8 | First page (7 data tables) |
| `ChevronsRightIcon` | `src/features/transactions/components/admin-transactions-table/data-table.tsx:17`<br>`src/features/users/components/admin-users-table/data-table.tsx:17`<br>`src/features/orders/components/admin-orders-table/data-table.tsx:20`<br>`src/features/orders/components/user-orders/data-table.tsx:20`<br>`src/features/pricing/components/pricing-groups-table/data-table.tsx:15`<br>`src/features/pricing/components/category-mappings-table/data-table.tsx:15`<br>`src/features/notifications/components/admin-notifications-table/data-table.tsx:16`<br>`src/features/deliveries/components/deliveries-table/data-table.tsx:17` | 8 | 8 | Last page (7 data tables) |
| `ChevronsUpDownIcon` | `src/features/transactions/components/admin-transactions-table/columns.tsx:5`<br>`src/features/users/components/admin-users-table/columns.tsx:5`<br>`src/features/orders/components/admin-orders-table/columns.tsx:5`<br>`src/features/orders/components/user-orders/columns.tsx:5`<br>`src/features/pricing/components/pricing-groups-table/columns.tsx:4`<br>`src/features/pricing/components/category-mappings-table/columns.tsx:4`<br>`src/features/notifications/components/admin-notifications-table/columns.tsx:4`<br>`src/features/deliveries/components/deliveries-table/columns.tsx:5` | 8 | 8 | Table column unsorted / sortable affordance |
| `MoreHorizontalIcon` | `src/features/transactions/components/admin-transactions-table/columns.tsx:5`<br>`src/features/users/components/admin-users-table/columns.tsx:5`<br>`src/features/orders/components/admin-orders-table/columns.tsx:5`<br>`src/features/orders/components/user-orders/columns.tsx:5`<br>`src/features/pricing/components/pricing-groups-table/columns.tsx:4`<br>`src/features/notifications/components/admin-notifications-table/columns.tsx:4`<br>`src/features/deliveries/components/deliveries-table/columns.tsx:5`<br>`src/components/ui/breadcrumb.tsx:5` | 8 | 8 | Row actions menu trigger, breadcrumb ellipsis |
| `ShoppingCartIcon` | `src/app/app/orders/review/[id]/page.tsx:7`<br>`src/features/app/components/sidebar.tsx:4`<br>`src/features/admin/components/stat-cards.tsx:10`<br>`src/features/orders/components/order-detail.tsx:5`<br>`src/features/orders/components/order-stat-cards.tsx:1`<br>`src/features/extraction/components/product-preview.tsx:3`<br>`src/components/layout/admin/sidebar.tsx:4` | 7 | 8 | Orders nav item, admin orders stat, empty cart / order state |
| `SlidersHorizontalIcon` | `src/features/transactions/components/admin-transactions-table/toolbar.tsx:4`<br>`src/features/users/components/admin-users-table/toolbar.tsx:4`<br>`src/features/orders/components/admin-orders-table/toolbar.tsx:4`<br>`src/features/orders/components/user-orders/toolbar.tsx:4`<br>`src/features/notifications/components/admin-notifications-table/toolbar.tsx:4`<br>`src/features/deliveries/components/deliveries-table/toolbar.tsx:4` | 6 | 6 | Column visibility & view options in table toolbars |
| `TruckIcon` | `src/app/app/orders/review/[id]/page.tsx:7`<br>`src/features/orders/components/admin-order-detail.tsx:6`<br>`src/features/orders/components/order-card.tsx:5`<br>`src/features/orders/components/order-detail.tsx:5`<br>`src/features/deliveries/components/stat-cards.tsx:1`<br>`src/components/layout/admin/sidebar.tsx:4` | 6 | 6 | Deliveries nav + stat, in_transit status, shipping step on review |
| `ChevronDownIcon` | `src/features/auth/components/auth-button.tsx:10`<br>`src/components/ui/accordion.tsx:4`<br>`src/components/ui/combobox.tsx:5`<br>`src/components/ui/select.tsx:7`<br>`src/components/layout/dashboard-navbar.tsx:2` | 5 | 6 | Open affordance - accordion, select, combobox, navbar user menu |
| `PlusIcon` | `src/app/app/orders/review/[id]/page.tsx:7`<br>`src/app/admin/policies/page.tsx:2`<br>`src/features/users/components/add-user-form.tsx:24`<br>`src/features/orders/components/my-orders.tsx:5`<br>`src/features/pricing/components/pricing-groups-table/toolbar.tsx:4` | 5 | 6 | Create - new policy, add user, new order, add pricing group; quantity increment |
| `LayoutGridIcon` | `src/features/auth/components/auth-button.tsx:10`<br>`src/components/layout/dashboard-navbar.tsx:2`<br>`src/components/layout/admin/sidebar.tsx:4`<br>`src/components/layout/main/mobile-menu.tsx:5` | 4 | 6 | Dashboard nav item (app + admin sidebars, navbar, mobile menu) |
| `MailIcon` | `src/app/admin/users/[id]/user-detail-client.tsx:5`<br>`src/app/(marketing)/contact/page.tsx:4`<br>`src/features/notifications/components/notification-item.tsx:1`<br>`src/features/notifications/components/admin-notifications-table/columns.tsx:4`<br>`src/components/layout/admin/notifications.tsx:4` | 5 | 5 | Email notification channel, contact email card, notification item channel |
| `PackageSearchIcon` | `src/features/app/components/sidebar.tsx:4`<br>`src/features/auth/components/auth-button.tsx:10`<br>`src/features/extraction/components/product-preview.tsx:3`<br>`src/components/layout/dashboard-navbar.tsx:2`<br>`src/components/layout/main/mobile-menu.tsx:5` | 5 | 5 | My Orders nav item; extraction empty state |
| `ArrowRightIcon` | `src/app/app/orders/review/[id]/page.tsx:7`<br>`src/features/orders/components/order-card.tsx:5`<br>`src/features/orders/components/stats-row.tsx:4`<br>`src/components/marketing/hero.tsx:8` | 4 | 5 | Forward CTA - marketing hero, order card, stats row link |
| `Loader2Icon` | `src/app/admin/policies/new/page.tsx:6`<br>`src/app/admin/policies/[slug]/policy-editor.tsx:5`<br>`src/components/ui/sonner.tsx:3`<br>`src/components/ui/spinner.tsx:1` | 4 | 5 | In-progress spinner - policy save/delete, sonner loading, Spinner primitive |
| `UserIcon` | `src/app/admin/transactions/[id]/page.tsx:6`<br>`src/features/users/components/user-role-badge.tsx:3`<br>`src/features/users/components/user-stat-cards.tsx:1`<br>`src/features/orders/components/admin-order-detail.tsx:6` | 4 | 5 | Customer identity row, user role badge, customers stat |
| `AlertCircleIcon` | `src/app/app/orders/review/[id]/page.tsx:7`<br>`src/app/app/orders/new/page.tsx:6`<br>`src/features/orders/components/my-orders.tsx:5` | 3 | 5 | Error banner - order intake failure, review page error, order failed alert |
| `BellIcon` | `src/features/app/components/sidebar.tsx:4`<br>`src/features/notifications/components/notification-item.tsx:1`<br>`src/components/layout/dashboard-navbar.tsx:2`<br>`src/components/layout/admin/notifications.tsx:4` | 4 | 4 | Notifications nav item + bell trigger + notification list item |
| `CheckCircle2` | `src/app/(marketing)/contact/page.tsx:4`<br>`src/features/contact/components/contact-form.tsx:7`<br>`src/features/orders/components/order-status-timeline.tsx:3`<br>`src/lib/sonner/index.tsx:5` | 4 | 4 | Success - contact form sent, order timeline done step, sonner success |
| `CopyIcon` | `src/app/admin/transactions/[id]/page.tsx:6`<br>`src/features/orders/components/recent-orders/column.tsx:7`<br>`src/features/orders/components/admin-orders-table/columns.tsx:5`<br>`src/features/orders/components/user-orders/columns.tsx:5` | 4 | 4 | Copy order / transaction reference to clipboard |
| `HandCoinsIcon` | `src/features/admin/components/stat-cards.tsx:10`<br>`src/features/transactions/components/transaction-stat-cards.tsx:1`<br>`src/features/orders/components/order-stat-cards.tsx:1` | 3 | 4 | Revenue stat cards (admin dashboard, orders, transactions) |
| `BuildingIcon` | `src/features/transactions/components/transaction-channel-badge.tsx:2`<br>`src/features/transactions/components/admin-transactions-table/columns.tsx:5` | 2 | 4 | Bank-transfer payment channel badge |
| `ArrowRight` | `src/app/(marketing)/contact/page.tsx:4`<br>`src/app/(marketing)/faq/page.tsx:6`<br>`src/app/(marketing)/about/page.tsx:6` | 3 | 3 | Marketing page CTA arrow (about / contact / faq) |
| `BellOffIcon` | `src/features/notifications/components/admin-notifications-list.tsx:12`<br>`src/features/notifications/components/notifications-list.tsx:4`<br>`src/components/layout/admin/notifications.tsx:4` | 3 | 3 | Empty state for notification lists |
| `ClockIcon` | `src/features/extraction/components/product-preview.tsx:3`<br>`src/features/deliveries/components/stat-cards.tsx:1`<br>`src/components/layout/admin/notifications.tsx:4` | 3 | 3 | Pending - notification pending, pending-dispatch stat, cache age on preview |
| `FileTextIcon` | `src/app/admin/policies/policies-list.tsx:5`<br>`src/features/orders/components/stats-row.tsx:4`<br>`src/components/layout/admin/sidebar.tsx:4` | 3 | 3 | Policies nav + list row; active-orders stat |
| `LinkIcon` | `src/features/policies/components/rich-text-editor.tsx:13`<br>`src/features/orders/components/hero-section.tsx:8`<br>`src/components/marketing/hero.tsx:8` | 3 | 3 | Paste-a-link hero input; insert-link button in policy editor |
| `ShieldCheckIcon` | `src/app/app/orders/[id]/checkout/page.tsx:7`<br>`src/app/(marketing)/about/page.tsx:6`<br>`src/config/ui.ts:1` | 3 | 3 | Secure payment reassurance - checkout, marketing 'Trust' value, feature badge |
| `ShieldIcon` | `src/app/admin/users/[id]/user-detail-client.tsx:5`<br>`src/features/users/components/user-role-badge.tsx:3`<br>`src/features/users/components/user-stat-cards.tsx:1` | 3 | 3 | Admin role badge, admins stat, user detail role row |
| `UserCogIcon` | `src/features/auth/components/auth-button.tsx:10`<br>`src/components/layout/dashboard-navbar.tsx:2`<br>`src/components/layout/main/mobile-menu.tsx:5` | 3 | 3 | My Account nav item |
| `UsersRoundIcon` | `src/features/admin/components/stat-cards.tsx:10`<br>`src/features/users/components/user-stat-cards.tsx:1`<br>`src/components/layout/admin/sidebar.tsx:4` | 3 | 3 | Users nav item + users stat cards |
| `XCircleIcon` | `src/features/orders/components/admin-order-detail.tsx:6`<br>`src/features/orders/components/order-detail.tsx:5`<br>`src/components/layout/admin/notifications.tsx:4` | 3 | 3 | Failed / cancelled status - order timeline, notification failed |
| `CalendarIcon` | `src/app/admin/users/[id]/user-detail-client.tsx:5`<br>`src/features/users/components/user-stat-cards.tsx:1` | 2 | 3 | Joined / created-at dates on user detail + user stat |
| `Lock` | `src/features/account/components/account-activity-card.tsx:3`<br>`src/features/account/components/security-settings-card.tsx:4` | 2 | 3 | Password-change activity rows; security settings card header |
| `LogOutIcon` | `src/features/auth/components/logout-button.tsx:6`<br>`src/components/layout/main/mobile-menu.tsx:5` | 2 | 3 | Sign out button and mobile menu row |
| `Activity` | `src/features/account/components/account-activity-card.tsx:3` | 1 | 3 | Account activity card header, empty state, row marker |
| `Eye` | `src/features/account/components/security-settings-card.tsx:4` | 1 | 3 | Reveal password toggle (3 password fields) |
| `EyeOff` | `src/features/account/components/security-settings-card.tsx:4` | 1 | 3 | Hide password toggle (3 password fields) |
| `CircleIcon` | `src/features/orders/components/admin-order-detail.tsx:6`<br>`src/features/orders/components/order-detail.tsx:5` | 2 | 2 | Timeline step not yet reached |
| `CircleOffIcon` | `src/features/transactions/components/transaction-stat-cards.tsx:1`<br>`src/features/orders/components/order-stat-cards.tsx:1` | 2 | 2 | Cancelled orders / failed transactions stat |
| `ClipboardListIcon` | `src/features/orders/components/admin-order-detail.tsx:6`<br>`src/features/orders/components/order-detail.tsx:5` | 2 | 2 | Order notes / special instructions section header |
| `HelpCircleIcon` | `src/features/transactions/components/transaction-channel-badge.tsx:2`<br>`src/features/transactions/components/admin-transactions-table/columns.tsx:5` | 2 | 2 | Unknown payment channel fallback badge |
| `ImageIcon` | `src/features/orders/components/admin-order-detail.tsx:6`<br>`src/features/orders/components/order-detail.tsx:5` | 2 | 2 | Product image placeholder when extraction returned none |
| `Loader2` | `src/features/account/components/edit-profile-card.tsx:9`<br>`src/features/account/components/security-settings-card.tsx:27` | 2 | 2 | Save-in-flight spinner on account cards |
| `LoaderCircleIcon` | `src/app/app/orders/review/[id]/page.tsx:7`<br>`src/components/examples/c-stepper-7.tsx:18` | 2 | 2 | Order submitting spinner; stepper loading state |
| `Mail` | `src/features/auth/components/verify-email.tsx:5`<br>`src/features/account/components/profile-info-card.tsx:3` | 2 | 2 | Verify-email screen; profile email row |
| `MessageCircle` | `src/app/(marketing)/contact/page.tsx:4`<br>`src/app/(marketing)/faq/page.tsx:6` | 2 | 2 | Contact WhatsApp card; FAQ contact CTA |
| `MessageCircleIcon` | `src/features/notifications/components/admin-notifications-table/columns.tsx:4`<br>`src/components/layout/admin/notifications.tsx:4` | 2 | 2 | WhatsApp notification channel icon |
| `PencilIcon` | `src/app/admin/policies/[slug]/policy-editor.tsx:5`<br>`src/features/settings/components/pricing-constants-card.tsx:4` | 2 | 2 | Policy editor 'Editor' view mode; edit pricing constant inline |
| `ReceiptIcon` | `src/features/payments/components/admin-transactions-list.tsx:12`<br>`src/features/payments/components/transactions-list.tsx:4` | 2 | 2 | Empty state for transaction lists (user + admin) |
| `ScanSearchIcon` | `src/app/app/orders/review/[id]/page.tsx:7`<br>`src/features/admin/components/stat-cards.tsx:10` | 2 | 2 | Extraction / needs-review stat; re-extract action on review |
| `SearchIcon` | `src/components/ui/table-global-filter.tsx:3`<br>`src/components/layout/admin/notifications.tsx:4` | 2 | 2 | Table global filter input; notification search |
| `Send` | `src/features/contact/components/contact-form.tsx:7`<br>`src/components/layout/admin/sidebar.tsx:4` | 2 | 2 | Contact form submit button; admin sidebar feedback link |
| `ShoppingBagIcon` | `src/features/orders/components/order-card.tsx:5`<br>`src/features/orders/components/stats-row.tsx:4` | 2 | 2 | Order card thumbnail fallback; total-orders stat |
| `SmartphoneIcon` | `src/features/transactions/components/transaction-channel-badge.tsx:2`<br>`src/features/transactions/components/admin-transactions-table/columns.tsx:5` | 2 | 2 | Mobile Money payment channel badge |
| `XCircle` | `src/features/orders/components/order-status-timeline.tsx:3`<br>`src/lib/sonner/index.tsx:5` | 2 | 2 | Timeline cancelled step; sonner error toast |
| `ZapIcon` | `src/app/(marketing)/about/page.tsx:6`<br>`src/config/ui.ts:1` | 2 | 2 | Marketing 'Speed' value; 'Fast Processing' feature badge |
| `Calendar` | `src/features/account/components/profile-info-card.tsx:3` | 1 | 2 | Profile info card dates (joined / last updated) |
| `Circle` | `src/features/orders/components/order-status-timeline.tsx:3` | 1 | 2 | Order timeline current + upcoming markers |
| `EyeIcon` | `src/app/admin/policies/[slug]/policy-editor.tsx:5` | 1 | 2 | Policy editor 'Preview' view mode |
| `AlertTriangle` | `src/lib/sonner/index.tsx:5` | 1 | 1 | sonner warning toast icon (lib/sonner) |
| `BadgeCheck` | `src/components/layout/admin/user.tsx:4` | 1 | 1 | Admin user menu - 'Account' row |
| `BanknoteIcon` | `src/features/orders/components/stats-row.tsx:4` | 1 | 1 | Total-spent stat on user dashboard |
| `Bell` | `src/components/layout/admin/user.tsx:4` | 1 | 1 | Admin user menu - 'Notifications' row |
| `BlendIcon` | `src/app/(marketing)/about/page.tsx:6` | 1 | 1 | Marketing 'Transparency' value card |
| `BoldIcon` | `src/features/policies/components/rich-text-editor.tsx:13` | 1 | 1 | Policy rich-text editor - bold |
| `BookUserIcon` | `src/components/examples/c-stepper-7.tsx:18` | 1 | 1 | Stepper example component - details step |
| `ChevronRight` | `src/components/layout/admin/nav-main.tsx:3` | 1 | 1 | Admin sidebar collapsible group chevron |
| `ChevronUpIcon` | `src/components/ui/select.tsx:7` | 1 | 1 | Select scroll-up button |
| `ChevronsUpDown` | `src/components/layout/admin/user.tsx:4` | 1 | 1 | Admin sidebar user switcher |
| `CircleCheckIcon` | `src/components/ui/sonner.tsx:3` | 1 | 1 | sonner success icon (components/ui/sonner) |
| `ClipboardCheckIcon` | `src/app/app/orders/review/[id]/page.tsx:7` | 1 | 1 | Review-step marker on order review wizard |
| `Columns2Icon` | `src/app/admin/policies/[slug]/policy-editor.tsx:5` | 1 | 1 | Policy editor 'Split' view mode |
| `Command` | `src/components/layout/admin/sidebar.tsx:4` | 1 | 1 | Admin sidebar brand logo mark |
| `DownloadIcon` | `src/features/pricing/components/import-export-controls.tsx:4` | 1 | 1 | Export pricing config to xlsx |
| `FileSpreadsheetIcon` | `src/features/pricing/components/import-export-controls.tsx:4` | 1 | 1 | Selected xlsx file row in pricing import dialog |
| `GalleryVerticalEnd` | `src/features/app/components/sidebar.tsx:4` | 1 | 1 | App sidebar brand logo mark |
| `GlobeIcon` | `src/config/ui.ts:1` | 1 | 1 | 'Worldwide Shipping' feature badge |
| `HandbagIcon` | `src/features/orders/components/orders-list.tsx:14` | 1 | 1 | Empty state for the user orders list |
| `HandshakeIcon` | `src/features/deliveries/components/stat-cards.tsx:1` | 1 | 1 | Delivered / completed deliveries stat |
| `Heading1Icon` | `src/features/policies/components/rich-text-editor.tsx:13` | 1 | 1 | Policy rich-text editor - H1 |
| `Heading2Icon` | `src/features/policies/components/rich-text-editor.tsx:13` | 1 | 1 | Policy rich-text editor - H2 |
| `Heading3Icon` | `src/features/policies/components/rich-text-editor.tsx:13` | 1 | 1 | Policy rich-text editor - H3 |
| `Info` | `src/lib/sonner/index.tsx:5` | 1 | 1 | sonner info toast icon (lib/sonner) |
| `InfoIcon` | `src/components/ui/sonner.tsx:3` | 1 | 1 | sonner info icon (components/ui/sonner) |
| `ItalicIcon` | `src/features/policies/components/rich-text-editor.tsx:13` | 1 | 1 | Policy rich-text editor - italic |
| `KeyRoundIcon` | `src/app/admin/users/[id]/user-detail-client.tsx:5` | 1 | 1 | Send password reset (admin user detail) |
| `LayoutDashboardIcon` | `src/features/app/components/sidebar.tsx:4` | 1 | 1 | Dashboard nav item (app sidebar) |
| `LifeBuoy` | `src/components/layout/admin/sidebar.tsx:4` | 1 | 1 | Admin sidebar support link |
| `ListIcon` | `src/features/policies/components/rich-text-editor.tsx:13` | 1 | 1 | Policy rich-text editor - bullet list |
| `ListOrderedIcon` | `src/features/policies/components/rich-text-editor.tsx:13` | 1 | 1 | Policy rich-text editor - ordered list |
| `LockIcon` | `src/components/examples/c-stepper-7.tsx:18` | 1 | 1 | Stepper example component - payment step |
| `LogIn` | `src/features/account/components/account-activity-card.tsx:3` | 1 | 1 | 'Logged in' account activity row |
| `LogOut` | `src/components/layout/admin/user.tsx:4` | 1 | 1 | Admin user menu - sign out |
| `MapPinIcon` | `src/app/(marketing)/contact/page.tsx:4` | 1 | 1 | Contact page office address card |
| `MenuIcon` | `src/components/layout/main/mobile-menu.tsx:5` | 1 | 1 | Open mobile menu |
| `MinusIcon` | `src/app/app/orders/review/[id]/page.tsx:7` | 1 | 1 | Quantity decrement on order review |
| `MoreVerticalIcon` | `src/features/orders/components/order-card.tsx:5` | 1 | 1 | Order card actions menu |
| `OctagonXIcon` | `src/components/ui/sonner.tsx:3` | 1 | 1 | sonner error icon (components/ui/sonner) |
| `PackageCheckIcon` | `src/app/app/orders/review/[id]/page.tsx:7` | 1 | 1 | 'Submit Order' primary button |
| `PackageOpenIcon` | `src/features/orders/components/stats-row.tsx:4` | 1 | 1 | Delivered-orders stat on user dashboard |
| `PanelLeftIcon` | `src/components/ui/sidebar.tsx:25` | 1 | 1 | Sidebar collapse trigger |
| `QuoteIcon` | `src/features/policies/components/rich-text-editor.tsx:13` | 1 | 1 | Policy rich-text editor - blockquote |
| `Redo2Icon` | `src/features/policies/components/rich-text-editor.tsx:13` | 1 | 1 | Policy rich-text editor - redo |
| `RemoveFormattingIcon` | `src/features/policies/components/rich-text-editor.tsx:13` | 1 | 1 | Policy rich-text editor - clear formatting |
| `SaveIcon` | `src/features/settings/components/pricing-constants-card.tsx:4` | 1 | 1 | Save pricing constant inline |
| `SearchXIcon` | `src/app/admin/not-found.tsx:2` | 1 | 1 | Admin 404 not-found illustration |
| `SeparatorHorizontalIcon` | `src/features/policies/components/rich-text-editor.tsx:13` | 1 | 1 | Policy rich-text editor - horizontal rule |
| `Settings2Icon` | `src/components/layout/admin/sidebar.tsx:4` | 1 | 1 | Admin settings nav item |
| `Shield` | `src/features/account/components/profile-info-card.tsx:3` | 1 | 1 | Admin badge on profile info card |
| `ShieldAlert` | `src/app/auth/auth-code-error/page.tsx:2` | 1 | 1 | Auth code error screen illustration |
| `ShieldUserIcon` | `src/components/layout/main/mobile-menu.tsx:5` | 1 | 1 | Admin link in mobile menu |
| `SparklesIcon` | `src/features/orders/components/hero-section.tsx:8` | 1 | 1 | Instant-quote accent on the app hero |
| `StrikethroughIcon` | `src/features/policies/components/rich-text-editor.tsx:13` | 1 | 1 | Policy rich-text editor - strikethrough |
| `TableIcon` | `src/features/policies/components/rich-text-editor.tsx:13` | 1 | 1 | Policy rich-text editor - insert table |
| `Trash2Icon` | `src/app/admin/policies/[slug]/policy-editor.tsx:5` | 1 | 1 | Delete policy |
| `TrendingUpIcon` | `src/features/transactions/components/transaction-stat-cards.tsx:1` | 1 | 1 | Payment success-rate stat |
| `TriangleAlertIcon` | `src/components/ui/sonner.tsx:3` | 1 | 1 | sonner warning icon (components/ui/sonner) |
| `UnderlineIcon` | `src/features/policies/components/rich-text-editor.tsx:13` | 1 | 1 | Policy rich-text editor - underline |
| `Undo2Icon` | `src/features/policies/components/rich-text-editor.tsx:13` | 1 | 1 | Policy rich-text editor - undo |
| `UploadIcon` | `src/features/pricing/components/import-export-controls.tsx:4` | 1 | 1 | Import pricing config xlsx |
| `User` | `src/features/account/components/account-activity-card.tsx:3` | 1 | 1 | 'Profile updated' account activity row |
| `UserPlus` | `src/features/account/components/account-activity-card.tsx:3` | 1 | 1 | 'Registered' account activity row |
| `UserRoundIcon` | `src/components/layout/main/mobile-menu.tsx:5` | 1 | 1 | Mobile menu account row |
| `WeightIcon` | `src/features/pricing/components/pricing-groups-table/columns.tsx:4` | 1 | 1 | Weight-based freight expression cell in pricing groups table |
| `X` | `src/components/layout/main/mobile-menu.tsx:5` | 1 | 1 | Close mobile menu |

### Duplicate aliases to collapse during migration

The codebase imports 14 icons under two names (the `*Icon` suffixed and unsuffixed Lucide aliases). Migrating to Phosphor is the moment to collapse them:

| Same glyph, two imports | Files |
|---|---|
| CheckCircle2Icon / CheckCircle2 / CircleCheckIcon | `src/app/app/orders/[id]/checkout/page.tsx:7`, `src/features/contact/components/contact-form.tsx:7`, `src/components/ui/sonner.tsx:9`, `src/lib/sonner/index.tsx` |
| XCircleIcon / XCircle | `src/features/orders/components/order-detail.tsx:16`, `src/features/orders/components/order-status-timeline.tsx:3`, `src/lib/sonner/index.tsx` |
| AlertTriangleIcon / AlertTriangle / TriangleAlertIcon | `src/features/orders/components/order-card.tsx:12`, `src/lib/sonner/index.tsx`, `src/components/ui/sonner.tsx:9` |
| AlertCircleIcon / (Info, InfoIcon) | `src/app/app/orders/new/page.tsx:6`, `src/lib/sonner/index.tsx`, `src/components/ui/sonner.tsx:9` |
| MailIcon / Mail | `src/features/notifications/components/notification-item.tsx:1`, `src/features/auth/components/verify-email.tsx:5`, `src/features/account/components/profile-info-card.tsx:3` |
| Loader2Icon / Loader2 / LoaderCircleIcon | `src/components/ui/spinner.tsx:1`, `src/features/account/components/edit-profile-card.tsx:9`, `src/app/app/orders/review/[id]/page.tsx:24` |
| ArrowRightIcon / ArrowRight | `src/components/marketing/hero.tsx`, `src/app/(marketing)/faq/page.tsx:6`, `src/app/(marketing)/about/page.tsx:11` |
| ChevronRightIcon / ChevronRight | `src/components/ui/breadcrumb.tsx:5`, `src/components/layout/admin/nav-main.tsx` |
| ChevronsUpDownIcon / ChevronsUpDown | `src/features/orders/components/admin-orders-table/columns.tsx:14`, `src/components/layout/admin/user.tsx:4` |
| XIcon / X | `src/components/ui/dialog.tsx:4`, `src/components/layout/main/mobile-menu.tsx` |
| UserIcon / User / UserRoundIcon | `src/features/users/components/user-role-badge.tsx:3`, `src/features/account/components/account-activity-card.tsx:3`, `src/components/layout/main/mobile-menu.tsx` |
| LockIcon / Lock | `src/components/examples/c-stepper-7.tsx:18`, `src/features/account/components/security-settings-card.tsx:4` |
| ShieldIcon / Shield | `src/features/users/components/user-role-badge.tsx:3`, `src/features/account/components/profile-info-card.tsx:3` |
| CalendarIcon / Calendar | `src/features/users/components/user-stat-cards.tsx:6`, `src/features/account/components/profile-info-card.tsx:3` |
| LogOutIcon / LogOut | `src/features/auth/components/logout-button.tsx:6`, `src/components/layout/admin/user.tsx:4` |
| EyeIcon / Eye | `src/app/admin/policies/[slug]/policy-editor.tsx:12`, `src/features/account/components/security-settings-card.tsx:4` |
| LayoutGridIcon / LayoutDashboardIcon | `src/components/layout/admin/sidebar.tsx:4`, `src/features/app/components/sidebar.tsx:4` |

Collapsing these takes the real Phosphor import surface from 138 down to **~108 distinct glyphs**.

### Second icon set already in the tree

`react-icons/hi2` (Heroicons) is used in 8 marketing components - the redesign should fold these into Phosphor too or the marketing pages will mix two families:

| Heroicon | Files (file:line) | Phosphor | Weight |
|---|---|---|---|
| `HiArrowRight` | `src/components/marketing/value.tsx:6`, `src/components/marketing/blog.tsx:5`, `src/components/marketing/cta.tsx:6` | `ph-arrow-right` | bold |
| `HiCheckCircle` | `src/components/marketing/value.tsx:6` | `ph-check-circle` | fill |
| `HiPlus` | `src/components/marketing/faq-accordion.tsx:5` | `ph-plus` | regular |
| `HiOutlineArrowTrendingUp` | `src/components/marketing/value.tsx:6` | `ph-trend-up` | duotone |
| `HiOutlineCheckBadge` | `src/components/marketing/process-steps.tsx:5` | `ph-seal-check` | duotone |
| `HiOutlineCreditCard` | `src/components/marketing/process-steps.tsx:5` | `ph-device-mobile` | duotone |
| `HiOutlineGlobeAlt` | `src/components/marketing/features.tsx:6` | `ph-globe-hemisphere-west` | duotone |
| `HiOutlineLink` | `src/components/marketing/features.tsx:6`, `src/components/marketing/process-steps.tsx:5`, `src/components/marketing/value.tsx:6` | `ph-link-simple` | duotone |
| `HiOutlineReceiptPercent` | `src/components/marketing/features.tsx:6`, `src/components/marketing/process-steps.tsx:5` | `ph-receipt` | duotone |
| `HiOutlineShieldCheck` | `src/components/marketing/features.tsx:6` | `ph-shield-check` | duotone |
| `HiOutlineSignal` | `src/components/marketing/features.tsx:6` | `ph-lightning` | duotone |
| `IconType (type)` | `src/components/marketing/features.tsx:5`, `src/components/marketing/process-steps.tsx:4` | `Icon` from `@phosphor-icons/react` | - |

---

## 2. Lucide -> Phosphor mapping (with weight)

Weight column = the *default* weight for that icon's dominant role. Where an icon appears in two roles (e.g. a table cell and a stat card) the note says so - Phosphor takes `weight` per instance, so one import serves both.

| Lucide | Phosphor | Weight | Notes |
|---|---|---|---|
| `ArrowLeftIcon` | `ph-arrow-left` / `ArrowLeft` *(in mocks)* | `regular` | Mock renders back/breadcrumb arrows at `ph` regular, NOT bold - the handoff's 'bold for arrows' applies to CTA arrows. Use bold only inside a primary button. |
| `ExternalLinkIcon` | `ph-arrow-square-out` / `ArrowSquareOut` *(in mocks)* | `regular` | 1:1. Mock uses `ph ph-arrow-square-out` on the 'View listing' / seller-domain link. |
| `XIcon` | `ph-x` / `X` *(in mocks)* | `regular` | 1:1. Mock uses `ph ph-x` on the 'Remove' item control. |
| `ChevronRightIcon` | `ph-caret-right` / `CaretRight` *(in mocks)* | `regular` | Phosphor calls chevrons 'caret'. Mock uses `ph ph-caret-right`. |
| `RefreshCwIcon` | `ph-arrows-clockwise` / `ArrowsClockwise` | `regular` | Nearest equivalent: two-arrow refresh loop. Not in mocks. |
| `CreditCardIcon` | `ph-credit-card` / `CreditCard` *(in mocks)* | `regular` | 1:1. Mock: `ph ph-credit-card` for the Card option; `ph-fill` for the 'Paid' timeline stop. |
| `PackageIcon` | `ph-package` / `Package` *(in mocks)* | `duotone` | Mock uses `ph-duotone ph-package` for the consolidation feature card. Use regular in table cells. |
| `CheckIcon` | `ph-check` / `Check` *(in mocks)* | `regular` | 1:1. Mock: `ph ph-check` inline benefit ticks; `ph-fill` for the 'Paid' tracking stop. |
| `AlertTriangleIcon` | `ph-warning` / `Warning` | `fill` | Status indicator -> fill. Phosphor `ph-warning` is the filled-triangle-with-bang. |
| `CheckCircle2Icon` | `ph-check-circle` / `CheckCircle` *(in mocks)* | `fill` | 1:1. Mock uses `ph-fill ph-check-circle` for every success/benefit tick. |
| `ArrowDownIcon` | `ph-arrow-down` / `ArrowDown` | `bold` | Sort direction - arrow. Not in mocks. |
| `ArrowUpIcon` | `ph-arrow-up` / `ArrowUp` | `bold` | Sort direction - arrow, and needs weight at 12px. Not in mocks. |
| `ChevronLeftIcon` | `ph-caret-left` / `CaretLeft` | `bold` | Pagination arrow. Not in mocks. |
| `ChevronsLeftIcon` | `ph-caret-double-left` / `CaretDoubleLeft` | `bold` | 1:1 (double caret). Not in mocks. |
| `ChevronsRightIcon` | `ph-caret-double-right` / `CaretDoubleRight` | `bold` | 1:1 (double caret). Not in mocks. |
| `ChevronsUpDownIcon` | `ph-caret-up-down` / `CaretUpDown` | `regular` | 1:1. Rendered at opacity-40 so keep regular. Not in mocks. |
| `MoreHorizontalIcon` | `ph-dots-three` / `DotsThree` | `bold` | 1:1. Phosphor's dots are thin at regular - bold reads better at size-4. Not in mocks. |
| `ShoppingCartIcon` | `ph-tote` / `Tote` *(in mocks)* | `regular` | **Deliberate divergence.** Mocks replace the cart metaphor with `ph-tote` (nav bag + 'Add to bag' CTA at `ph-bold`). `ph-shopping-cart` exists if a literal cart is wanted. |
| `SlidersHorizontalIcon` | `ph-sliders-horizontal` / `SlidersHorizontal` | `regular` | 1:1. Not in mocks. |
| `TruckIcon` | `ph-truck` / `Truck` *(in mocks)* | `duotone` | Mock uses `ph-duotone ph-truck` on the door-delivery fee card / carrier row. Regular in table cells. |
| `ChevronDownIcon` | `ph-caret-down` / `CaretDown` | `regular` | 1:1. Not in mocks. |
| `PlusIcon` | `ph-plus` / `Plus` *(in mocks)* | `regular` | 1:1. Mock: `ph ph-plus` for qty increment and closed FAQ rows. Bold inside a filled primary button. |
| `LayoutGridIcon` | `ph-squares-four` / `SquaresFour` | `regular` | Nearest 2x2 grid glyph. Not in mocks - dashboard nav was not redesigned. |
| `MailIcon` | `ph-envelope-simple` / `EnvelopeSimple` | `regular` | `ph-envelope` has a flap seam; `ph-envelope-simple` matches Lucide's Mail. Not in mocks. |
| `PackageSearchIcon` | `ph-list-magnifying-glass` / `ListMagnifyingGlass` *(in mocks)* | `regular` | No package+magnifier combo in Phosphor. Mock uses `ph ph-list-magnifying-glass` for 'Stores we read'; nearest for an orders-search nav item. Alt: `ph-package` + separate search affordance. |
| `ArrowRightIcon` | `ph-arrow-right` / `ArrowRight` *(in mocks)* | `bold` | 1:1. Mock uses `ph-bold ph-arrow-right` on every primary CTA - this is the canonical 'bold for arrows' case. |
| `Loader2Icon` | `ph-spinner-gap` / `SpinnerGap` | `bold` | Phosphor spinners do not self-animate; keep the existing `animate-spin` class. `ph-circle-notch` is the closer Loader2 silhouette. |
| `UserIcon` | `ph-user` / `User` | `regular` | 1:1. Not in mocks. |
| `AlertCircleIcon` | `ph-warning-circle` / `WarningCircle` | `fill` | Status indicator -> fill. 1:1. |
| `BellIcon` | `ph-bell-simple` / `BellSimple` *(in mocks)* | `regular` | Mock nav uses `ph ph-bell-simple` (with a separate unread dot span). `ph-bell` if the clapper detail is wanted. |
| `CheckCircle2` | `ph-check-circle` / `CheckCircle` *(in mocks)* | `fill` | Same glyph as CheckCircle2Icon - collapse both aliases onto one import. |
| `CopyIcon` | `ph-copy` / `Copy` *(in mocks)* | `regular` | 1:1. Mock uses `ph-copy` (duotone) on the 'Check out with the tag address' step card. |
| `HandCoinsIcon` | `ph-hand-coins` / `HandCoins` | `duotone` | 1:1, stat-card feature icon -> duotone. Mocks use `ph-hand-heart` for the Tomame fee specifically. |
| `BuildingIcon` | `ph-bank` / `Bank` *(in mocks)* | `regular` | **Better than 1:1.** Mocks already use `ph-bank` for tax/bank money rows; a bank column glyph beats a generic office building for a bank-transfer badge. |
| `ArrowRight` | `ph-arrow-right` / `ArrowRight` *(in mocks)* | `bold` | Duplicate of ArrowRightIcon - collapse both aliases. |
| `BellOffIcon` | `ph-bell-simple-slash` / `BellSimpleSlash` | `duotone` | 1:1, and matches the BellSimple choice. Empty-state illustration -> duotone. |
| `ClockIcon` | `ph-clock` / `Clock` *(in mocks)* | `fill` | Mock uses `ph-clock` at `ph-fill` inside the 'Awaiting payment' status chip. Regular for a cache-age label. |
| `FileTextIcon` | `ph-file-text` / `FileText` | `regular` | 1:1. Duotone for the active-orders stat card. Not in mocks. |
| `LinkIcon` | `ph-link-simple` / `LinkSimple` *(in mocks)* | `regular` | Mock uses `ph ph-link-simple` on the URL chip and `ph-duotone` on the 'Paste a link' step card. |
| `ShieldCheckIcon` | `ph-shield-check` / `ShieldCheck` *(in mocks)* | `duotone` | 1:1. Mock uses `ph-duotone ph-shield-check` for 'Money held' / the Trust value card. |
| `ShieldIcon` | `ph-shield` / `Shield` | `fill` | Role badge = status -> fill. `ph-shield-check` if the badge should read as verified. |
| `UserCogIcon` | `ph-user-gear` / `UserGear` | `regular` | 1:1. Not in mocks. |
| `UsersRoundIcon` | `ph-users-three` / `UsersThree` | `duotone` | Nearest multi-user glyph (Phosphor has no rounded 2-user variant). Duotone on stat cards. Not in mocks. |
| `XCircleIcon` | `ph-x-circle` / `XCircle` | `fill` | 1:1. Status indicator -> fill. |
| `CalendarIcon` | `ph-calendar-blank` / `CalendarBlank` | `regular` | `ph-calendar` carries dots; `ph-calendar-blank` matches Lucide's plain calendar. Mock uses `ph-duotone ph-calendar-check` for the ETA card specifically. |
| `Lock` | `ph-lock-simple` / `LockSimple` *(in mocks)* | `regular` | Mock uses `ph ph-lock-simple` for the rate-locked / escrow notes. Collapse with LockIcon. |
| `LogOutIcon` | `ph-sign-out` / `SignOut` | `regular` | 1:1. Not in mocks. |
| `Activity` | `ph-pulse` / `Pulse` | `duotone` | Card header feature icon. `ph-pulse` is Phosphor's activity/heartbeat line. Not in mocks. |
| `Eye` | `ph-eye` / `Eye` *(in mocks)* | `regular` | 1:1. Mock uses `ph-duotone ph-eye` for the 'Transparency' value card; inline toggle stays regular. |
| `EyeOff` | `ph-eye-slash` / `EyeSlash` | `regular` | 1:1. Not in mocks. |
| `CircleIcon` | `ph-circle` / `Circle` | `regular` | 1:1. Timeline 'not reached' marker - keep regular (unfilled) so fill reads as 'done'. |
| `CircleOffIcon` | `ph-prohibit` / `Prohibit` | `fill` | Nearest 'disabled/void' glyph (circle with slash). Status -> fill. Not in mocks. |
| `ClipboardListIcon` | `ph-clipboard-text` / `ClipboardText` | `regular` | 1:1. Not in mocks. |
| `HelpCircleIcon` | `ph-question` / `Question` | `fill` | `ph-question` is the circled question mark (`ph-question-mark` is the bare glyph). Status badge -> fill. |
| `ImageIcon` | `ph-image` / `Image` | `duotone` | 1:1. Placeholder illustration -> duotone. |
| `Loader2` | `ph-spinner-gap` / `SpinnerGap` | `bold` | Duplicate of Loader2Icon - collapse. |
| `LoaderCircleIcon` | `ph-circle-notch` / `CircleNotch` | `bold` | 1:1 for Lucide's LoaderCircle. Keep `animate-spin`. |
| `Mail` | `ph-envelope-simple` / `EnvelopeSimple` | `duotone` | Duplicate of MailIcon; the verify-email screen use is a large feature icon -> duotone. |
| `MessageCircle` | `ph-chats-circle` / `ChatsCircle` *(in mocks)* | `duotone` | Mock uses `ph-duotone ph-chats-circle` for 'A buyer you can talk to' / 'Ask a question'. `ph-chat-circle` for a single bubble. |
| `MessageCircleIcon` | `ph-whatsapp-logo` / `WhatsappLogo` *(in mocks)* | `fill` | **Better than 1:1.** This icon labels the *WhatsApp* channel; mocks use `ph-fill ph-whatsapp-logo`. Stop using a generic bubble for it. |
| `PencilIcon` | `ph-pencil-simple` / `PencilSimple` | `regular` | 1:1. `ph-note-pencil` if an edit-document read is wanted. Not in mocks. |
| `ReceiptIcon` | `ph-receipt` / `Receipt` *(in mocks)* | `duotone` | 1:1. Mock uses `ph-duotone ph-receipt` for the landed-price receipt feature - empty state -> duotone. |
| `ScanSearchIcon` | `ph-file-magnifying-glass` / `FileMagnifyingGlass` | `duotone` | No scan-frame+magnifier in Phosphor. `ph-file-magnifying-glass` reads as 'inspect a record'; alt `ph-scan` if the frame matters more than the lens. |
| `SearchIcon` | `ph-magnifying-glass` / `MagnifyingGlass` *(in mocks)* | `regular` | 1:1. Mock uses `ph ph-magnifying-glass` in the app search field. |
| `Send` | `ph-paper-plane-tilt` / `PaperPlaneTilt` | `regular` | 1:1 for Lucide's Send. Bold inside the filled submit button. Not in mocks. |
| `ShoppingBagIcon` | `ph-tote` / `Tote` *(in mocks)* | `regular` | Same divergence as ShoppingCartIcon - the mocks standardise on `ph-tote` for every bag metaphor. `ph-shopping-bag` exists. |
| `SmartphoneIcon` | `ph-device-mobile` / `DeviceMobile` *(in mocks)* | `regular` | 1:1. Mock uses `ph-duotone ph-device-mobile` for the 'Pay with MoMo or card' step card. |
| `XCircle` | `ph-x-circle` / `XCircle` | `fill` | Duplicate of XCircleIcon - collapse. |
| `ZapIcon` | `ph-lightning` / `Lightning` *(in mocks)* | `duotone` | 1:1. Mock uses `ph-duotone ph-lightning` for the 'Speed' value card - direct match to this exact content. |
| `Calendar` | `ph-calendar-blank` / `CalendarBlank` | `regular` | Duplicate of CalendarIcon - collapse. |
| `Circle` | `ph-circle` / `Circle` | `regular` | Duplicate of CircleIcon - collapse. Note the current code fakes a filled circle with `fill-rose-500`; use `weight="fill"` instead. |
| `EyeIcon` | `ph-eye` / `Eye` *(in mocks)* | `regular` | Duplicate of Eye - collapse. |
| `AlertTriangle` | `ph-warning` / `Warning` | `fill` | Duplicate of AlertTriangleIcon - collapse; also dedupe lib/sonner vs components/ui/sonner. |
| `BadgeCheck` | `ph-seal-check` / `SealCheck` *(in mocks)* | `fill` | 1:1. Mock uses `ph-seal-check` for the verified 'Condition: New' chip. |
| `BanknoteIcon` | `ph-money` / `Money` | `duotone` | Nearest banknote glyph. Stat card -> duotone. `ph-currency-dollar` is wrong for GHS. |
| `Bell` | `ph-bell-simple` / `BellSimple` *(in mocks)* | `regular` | Duplicate of BellIcon - collapse. |
| `BlendIcon` | `ph-eye` / `Eye` *(in mocks)* | `duotone` | **Mock ground truth.** The redesigned 'Transparency' value card uses `ph-duotone ph-eye`, not an overlapping-circles blend mark. |
| `BoldIcon` | `ph-text-b` / `TextB` | `regular` | 1:1 (Phosphor names text tools `text-*`). |
| `BookUserIcon` | `ph-address-book` / `AddressBook` | `regular` | Nearest contact-book glyph. In an examples-only component. |
| `ChevronRight` | `ph-caret-right` / `CaretRight` *(in mocks)* | `regular` | Duplicate of ChevronRightIcon - collapse. |
| `ChevronUpIcon` | `ph-caret-up` / `CaretUp` | `regular` | 1:1. |
| `ChevronsUpDown` | `ph-caret-up-down` / `CaretUpDown` | `regular` | Duplicate of ChevronsUpDownIcon - collapse. |
| `CircleCheckIcon` | `ph-check-circle` / `CheckCircle` *(in mocks)* | `fill` | Duplicate of CheckCircle2Icon - collapse the two sonner icon sets. |
| `ClipboardCheckIcon` | `ph-clipboard-text` / `ClipboardText` | `duotone` | No clipboard+check glyph. `ph-clipboard-text` + a fill check-circle beside it, or `ph-seal-check` if the step marker should read 'confirmed'. |
| `Columns2Icon` | `ph-columns` / `Columns` | `regular` | Nearest split-pane glyph. `ph-square-split-horizontal` is a closer 2-pane read if available in your build - verified present. |
| `Command` | `ph-command` / `Command` | `fill` | Brand logo mark in a filled tile -> fill. 1:1. |
| `DownloadIcon` | `ph-download-simple` / `DownloadSimple` | `regular` | `ph-download` has a tray; `-simple` matches Lucide's arrow-to-line. |
| `FileSpreadsheetIcon` | `ph-file-xls` / `FileXls` | `regular` | 1:1 for an .xlsx file row. `ph-file-csv` for CSV. |
| `GalleryVerticalEnd` | `ph-stack-simple` / `StackSimple` | `fill` | No 1:1. Logo mark only - `ph-stack-simple` reads as stacked layers. Consider replacing with the real Tomame wordmark. |
| `GlobeIcon` | `ph-globe-hemisphere-west` / `GlobeHemisphereWest` *(in mocks)* | `duotone` | **Mock ground truth.** The redesigned shipping feature card uses `ph-duotone ph-globe-hemisphere-west`. Plain `ph-globe` also exists. |
| `HandbagIcon` | `ph-tote` / `Tote` *(in mocks)* | `duotone` | Empty-state illustration. Mocks standardise on `ph-tote`; `ph-handbag` / `ph-handbag-simple` also exist. |
| `HandshakeIcon` | `ph-handshake` / `Handshake` | `duotone` | 1:1. Stat card -> duotone. |
| `Heading1Icon` | `ph-text-h-one` / `TextHOne` | `regular` | 1:1. |
| `Heading2Icon` | `ph-text-h-two` / `TextHTwo` | `regular` | 1:1. |
| `Heading3Icon` | `ph-text-h-three` / `TextHThree` | `regular` | 1:1. |
| `Info` | `ph-info` / `Info` | `fill` | 1:1. Status/toast -> fill. |
| `InfoIcon` | `ph-info` / `Info` | `fill` | Duplicate of Info - collapse the two sonner icon sets. |
| `ItalicIcon` | `ph-text-italic` / `TextItalic` | `regular` | 1:1. |
| `KeyRoundIcon` | `ph-key` / `Key` | `regular` | 1:1 (Phosphor's key is already rounded). |
| `LayoutDashboardIcon` | `ph-squares-four` / `SquaresFour` | `regular` | Nearest dashboard-grid glyph; `ph-gauge` if a metrics read is preferred. Collapse with LayoutGridIcon. |
| `LifeBuoy` | `ph-lifebuoy` / `Lifebuoy` | `regular` | 1:1. |
| `ListIcon` | `ph-list` / `List` | `regular` | 1:1 (bullet list). |
| `ListOrderedIcon` | `ph-list-numbers` / `ListNumbers` | `regular` | 1:1. |
| `LockIcon` | `ph-lock-simple` / `LockSimple` *(in mocks)* | `regular` | Collapse with Lock. Mock uses `ph ph-lock-simple`. |
| `LogIn` | `ph-sign-in` / `SignIn` | `regular` | 1:1. |
| `LogOut` | `ph-sign-out` / `SignOut` | `regular` | Duplicate of LogOutIcon - collapse. |
| `MapPinIcon` | `ph-map-pin` / `MapPin` *(in mocks)* | `duotone` | 1:1. Mock uses `ph-duotone ph-map-pin` on the contact address card. |
| `MenuIcon` | `ph-list` / `List` | `bold` | Phosphor's hamburger is `ph-list`. Bold at 20px for a tap target. Collapse the glyph with ListIcon but keep separate weights. |
| `MinusIcon` | `ph-minus` / `Minus` *(in mocks)* | `regular` | 1:1. Mock uses `ph ph-minus` for qty decrement and the open FAQ row. |
| `MoreVerticalIcon` | `ph-dots-three-vertical` / `DotsThreeVertical` | `bold` | 1:1. |
| `OctagonXIcon` | `ph-x-circle` / `XCircle` | `fill` | **No 1:1** - Phosphor has no octagon-X. `ph-warning-octagon` keeps the octagon but swaps the X for a bang; `ph-x-circle` keeps the X. Pick `ph-x-circle` so error toasts match the XCircle used in the order timeline. |
| `PackageCheckIcon` | `ph-check-circle` / `CheckCircle` *(in mocks)* | `fill` | **No 1:1** - Phosphor has no package+check. On a 'Submit Order' button a fill check-circle is the clearer affordance; `ph-seal-check` if a 'confirmed' read is wanted. |
| `PackageOpenIcon` | `ph-package` / `Package` *(in mocks)* | `duotone` | **No 1:1** - Phosphor has no opened-box glyph. Use `ph-package` duotone for the Delivered stat; `ph-archive-box` or `ph-house-line` (the mock's 'Your door' stop) are alternatives. |
| `PanelLeftIcon` | `ph-sidebar-simple` / `SidebarSimple` | `regular` | 1:1. `ph-sidebar` has rail dots. |
| `QuoteIcon` | `ph-quotes` / `Quotes` | `regular` | 1:1. |
| `Redo2Icon` | `ph-arrow-clockwise` / `ArrowClockwise` | `regular` | Phosphor has no curved redo arrow; `ph-arrow-clockwise` is the conventional redo. Alt `ph-arrow-u-up-right`. |
| `RemoveFormattingIcon` | `ph-text-t-slash` / `TextTSlash` | `regular` | 1:1 (T with slash). `ph-eraser` is the alternative read. |
| `SaveIcon` | `ph-floppy-disk` / `FloppyDisk` | `regular` | 1:1. |
| `SearchXIcon` | `ph-magnifying-glass-minus` / `MagnifyingGlassMinus` | `duotone` | No magnifier-X in Phosphor. `-minus` is the nearest 'nothing found' variant; 404 illustration -> duotone. |
| `SeparatorHorizontalIcon` | `ph-minus` / `Minus` *(in mocks)* | `regular` | **No 1:1** - Phosphor has no separator glyph. `ph-minus` is the standard horizontal-rule button; `ph-rows` or `ph-line-segment` are alternatives. |
| `Settings2Icon` | `ph-gear-six` / `GearSix` | `regular` | 1:1 for Lucide's Settings2. `ph-gear` is the fatter-tooth variant. |
| `Shield` | `ph-shield` / `Shield` | `fill` | Duplicate of ShieldIcon - collapse. |
| `ShieldAlert` | `ph-shield-warning` / `ShieldWarning` | `duotone` | 1:1. Error-screen illustration -> duotone. |
| `ShieldUserIcon` | `ph-user-circle-gear` / `UserCircleGear` | `regular` | No shield+user in Phosphor. `ph-user-circle-gear` reads as 'admin user'; alt `ph-shield-check` if the shield must stay. |
| `SparklesIcon` | `ph-sparkle` / `Sparkle` *(in mocks)* | `duotone` | 1:1. Mock uses `ph-duotone ph-sparkle`. |
| `StrikethroughIcon` | `ph-text-strikethrough` / `TextStrikethrough` | `regular` | 1:1. |
| `TableIcon` | `ph-table` / `Table` | `regular` | 1:1. |
| `Trash2Icon` | `ph-trash` / `Trash` | `regular` | 1:1. |
| `TrendingUpIcon` | `ph-trend-up` / `TrendUp` | `duotone` | 1:1. Stat card -> duotone. |
| `TriangleAlertIcon` | `ph-warning` / `Warning` | `fill` | Duplicate of AlertTriangleIcon - collapse the two sonner icon sets. |
| `UnderlineIcon` | `ph-text-underline` / `TextUnderline` | `regular` | 1:1. |
| `Undo2Icon` | `ph-arrow-counter-clockwise` / `ArrowCounterClockwise` | `regular` | Conventional undo. Mock uses `ph-duotone ph-arrow-u-up-left` for the *refund* card - do not reuse that here. |
| `UploadIcon` | `ph-upload-simple` / `UploadSimple` | `regular` | 1:1 (matches DownloadSimple). |
| `User` | `ph-user` / `User` | `regular` | Duplicate of UserIcon - collapse. |
| `UserPlus` | `ph-user-plus` / `UserPlus` | `regular` | 1:1. |
| `UserRoundIcon` | `ph-user-circle` / `UserCircle` | `regular` | Phosphor has no rounded-bust variant; `ph-user-circle` is the nearest for an account row. Or collapse onto `ph-user`. |
| `WeightIcon` | `ph-scales` / `Scales` *(in mocks)* | `regular` | **Mock ground truth.** The product 'Weight' spec chip uses `ph-scales`. `ph-barbell` is Phosphor's dumbbell (wrong read for freight weight). |
| `X` | `ph-x` / `X` *(in mocks)* | `regular` | Duplicate of XIcon - collapse. |

### The five with no clean 1:1

| Lucide | Nearest Phosphor | Why |
|---|---|---|
| `OctagonXIcon` (`src/components/ui/sonner.tsx:24`) | `ph-x-circle` fill | Phosphor ships no octagon-X. `ph-warning-octagon` keeps the shape but replaces the X with a bang, which reads as 'warning' not 'error'. Circle-X keeps the error semantics and matches the timeline's cancelled marker. |
| `PackageCheckIcon` (`src/app/app/orders/review/[id]/page.tsx:629`) | `ph-check-circle` fill | No package+check composite exists. This is a submit button, where a check-circle is the clearer affordance than a parcel. |
| `PackageOpenIcon` (`src/features/orders/components/stats-row.tsx:144`) | `ph-package` duotone | No opened-box glyph. Distinguish 'Delivered' from 'Total orders' by colour, not by an open lid; the mocks' equivalent tracking stop uses `ph-house-line`. |
| `SeparatorHorizontalIcon` (`src/features/policies/components/rich-text-editor.tsx:256`) | `ph-minus` regular | No separator/divider glyph. A plain minus is the conventional horizontal-rule button; `ph-rows` and `ph-line-segment` are alternatives. |
| `PackageSearchIcon` (5 nav sites) | `ph-list-magnifying-glass` regular | No package+magnifier composite. The mocks' 'Stores we read' control uses `ph-list-magnifying-glass`, which reads as 'browse a list' - correct for a My Orders nav item. |

Also worth flagging as *intentional* divergences rather than substitutions:

- `ShoppingCartIcon` / `ShoppingBagIcon` / `HandbagIcon` -> **`ph-tote`**. The mocks abandon the cart metaphor entirely (`ph ph-tote` in the nav with a count badge, `ph-bold ph-tote` on 'Add to bag'). `ph-shopping-cart`, `ph-shopping-bag`, `ph-handbag` all exist if the decision is reversed.
- `MessageCircleIcon` -> **`ph-whatsapp-logo`** fill. That icon labels the WhatsApp notification channel; the mocks use the real brand glyph.
- `BuildingIcon` -> **`ph-bank`**. Labels a bank-transfer payment channel.
- `BlendIcon` -> **`ph-eye`** duotone and `GlobeIcon` -> **`ph-globe-hemisphere-west`** duotone come straight from the redesigned marketing cards, which carry the same copy as the current components.

---

## 3. Ground truth: every `ph-*` icon in the mocks

Grepped from `design/*.dc.html` (54 distinct icons). This is the authoritative build list. Two sources: static `class="..."` attributes, and `{{ x.icon }}` template bindings whose weight comes from the surrounding `<i class="ph-fill {{ ... }}">` / `ph-duotone` wrapper.

The mock files: `Tomame - New Direction v2.dc.html` (app screens), `Tomame - Marketing v2.dc.html` (marketing site), `TmNavLight.dc.html` (bottom tab bar / top nav), `TmMarketingFooter.dc.html` (footer). `Tomame - Current UI.dc.html` and `Tomame - Handoff Doc.dc.html` carry no `ph-*` classes.

| Phosphor icon | Weight(s) used | Mock file | Screen / element |
|---|---|---|---|
| `ph-airplane` | fill | Marketing v2 | Hero decoration - plane flying along an animated arc path (`offset-rotate`), rotated 90deg. Decorative only |
| `ph-airplane-tilt` | duotone, fill | New Direction v2, Marketing v2 | Freight row in the price breakdown (duotone); 'In the air' order-stage chip, tracking-timeline stop, 'Landed in Accra' badge, marketing freight fee card (fill) |
| `ph-arrow-left` | regular | New Direction v2 | Breadcrumb 'Home' / 'Journeys' back link |
| `ph-arrow-right` | bold | New Direction v2, Marketing v2 | Primary CTA buttons: 'See landed price', 'Create free account' |
| `ph-arrow-square-out` | regular | New Direction v2 | Seller-domain link ('Amazon.com'), 'View listing' |
| `ph-arrow-u-up-left` | duotone | New Direction v2, Marketing v2 | 'Full refund' / "Can't source it?" reassurance card |
| `ph-arrows-left-right` | duotone | New Direction v2, Marketing v2 | 'Rate 1 USD = 14.43' row in the price breakdown; 'Exchange rate' fee card |
| `ph-bank` | duotone | New Direction v2, Marketing v2 | 'US sales tax 8%' row in the breakdown; 'Store sales tax' fee card |
| `ph-barcode` | duotone | New Direction v2 | 'Register the tracking number' step card (tag-address flow) |
| `ph-bell-ringing` | duotone | New Direction v2, Marketing v2 | 'Price watch' feature card header |
| `ph-bell-simple` | regular | TmNavLight | Top-nav notifications button (unread dot is a separate span, not part of the glyph) |
| `ph-bookmark-simple` | regular, duotone | TmNavLight, New Direction v2 | Nav save/watch button (regular); 'Price watch' pill (duotone) |
| `ph-buildings` | duotone | New Direction v2 | 'Office - Airport City' contact card |
| `ph-calendar-check` | duotone | New Direction v2 | Delivery ETA card ('22 - 29 Sep', 'At your door') |
| `ph-caret-right` | regular | New Direction v2 | Row affordance on the consolidation suggestion card |
| `ph-chats-circle` | duotone | New Direction v2, Marketing v2 | 'A buyer you can talk to' / 'Ask a question' support cards |
| `ph-check` | regular, fill | New Direction v2 | Inline reassurance ticks ('Price in GHS before you pay', "Refund if we can't source") at regular; 'Paid' tracking-timeline stop at fill |
| `ph-check-circle` | fill | New Direction v2, Marketing v2 | Inline benefit ticks ('Quote without an account', '2-4 weeks to your door') |
| `ph-clock` | fill | New Direction v2 | 'Awaiting payment' status chip in the orders table |
| `ph-copy` | duotone | New Direction v2 | 'Check out with the tag address' step card |
| `ph-credit-card` | regular, fill | New Direction v2 | 'Card' payment option (regular); 'Paid' tracking stop (fill) |
| `ph-device-mobile` | duotone | Marketing v2 | 'Pay with MoMo or card' how-it-works step |
| `ph-eye` | duotone | Marketing v2 | 'Transparency' value card |
| `ph-globe-hemisphere-west` | duotone | New Direction v2 | 'Shipping' / worldwide feature card |
| `ph-hand-heart` | duotone | New Direction v2, Marketing v2 | 'Tomame fee 5%' row in the breakdown; 'Tomame fee' fee card |
| `ph-hand-waving` | fill | New Direction v2 | Greeting pill: 'Afternoon, Kwame - 2 parcels moving' |
| `ph-house` | regular, fill | TmNavLight, New Direction v2 | Bottom tab bar 'Home' - regular inactive, fill active |
| `ph-house-line` | regular, duotone | New Direction v2, Marketing v2 | 'Your door' tracking-timeline stop; 'Pay freight, we deliver' / 'Track it to your door' step cards |
| `ph-lightbulb` | duotone | New Direction v2 | Consolidation tip: 'Room for ~3.6 lb more' |
| `ph-lightning` | duotone | Marketing v2 | 'Speed' value card |
| `ph-link-simple` | regular, duotone | New Direction v2, Marketing v2 | Product URL chip (regular); 'Paste a link' step card (duotone) |
| `ph-list-magnifying-glass` | regular | Marketing v2 | 'Stores we read' control |
| `ph-lock-simple` | regular, duotone | New Direction v2, Marketing v2 | 'Rate 14.43 locked until tomorrow', 'Paystack holds it until every item is bought' (regular); escrow card (duotone) |
| `ph-magnifying-glass` | regular | New Direction v2 | App search field |
| `ph-map-pin` | duotone | Marketing v2 | Office address card |
| `ph-minus` | regular | New Direction v2, Marketing v2 | Quantity decrement; open FAQ accordion row |
| `ph-package` | duotone | New Direction v2, Marketing v2 | 'One box, less freight' consolidation feature card; 'Freight box fills as items are added' |
| `ph-path` | regular, fill, duotone | TmNavLight, New Direction v2 | Bottom tab bar 'Journeys' - regular inactive, fill active; duotone in the nav variant |
| `ph-plus` | regular | New Direction v2, Marketing v2 | Quantity increment; closed FAQ accordion rows |
| `ph-receipt` | duotone | New Direction v2, Marketing v2 | 'The landed price, upfront' feature card; 'See the landed price' step |
| `ph-scales` | duotone | New Direction v2 | 'Weight - 8.8 oz' product spec chip |
| `ph-seal-check` | duotone | New Direction v2 | 'Condition - New' product spec chip |
| `ph-share-network` | regular | New Direction v2 | Share button on the product detail screen |
| `ph-shield-check` | duotone | New Direction v2, Marketing v2 | 'Money held' escrow card; 'Trust' value card |
| `ph-sparkle` | duotone | New Direction v2 | Spec annotation ('Staggered fade-up on every page load') - **annotation layer, not product UI** |
| `ph-star` | fill | Marketing v2, New Direction v2 | Testimonial rating stars; product rating spec chip |
| `ph-storefront` | regular, duotone, fill | TmNavLight, New Direction v2 | Bottom tab bar 'Buy' (regular/duotone); seller chip; 'Purchased' tracking stop (fill) |
| `ph-tag` | duotone | New Direction v2, Marketing v2 | 'Item $298.00' row in the breakdown; 'Brand - Sony' spec chip |
| `ph-text-aa` | duotone | New Direction v2 | Spec annotation ('Hero placeholder cycles store names') - **annotation layer, not product UI** |
| `ph-tote` | regular, bold | TmNavLight, New Direction v2 | Nav bag button with count badge (regular); 'Add to bag' primary CTA (bold) |
| `ph-truck` | duotone | New Direction v2, Marketing v2 | 'Door delivery - Accra' fee row, 'Carrier' row; 'Door delivery' fee card |
| `ph-warehouse` | fill | New Direction v2 | 'US hub' tracking-timeline stop |
| `ph-whatsapp-logo` | fill | TmMarketingFooter, Marketing v2 | Footer WhatsApp link; marketing contact CTA |
| `ph-x` | regular | New Direction v2 | 'Remove' item control |


### What the mocks confirm about the weight rule

| Rule as written | What the mocks actually do |
|---|---|
| duotone = feature icons | Confirmed. Every marketing/feature card header, every price-breakdown row icon, every how-it-works step card is `ph-duotone`. 32 of the 49 `ph-duotone` occurrences. |
| fill = status | Confirmed. Order-stage chips, tracking-timeline stops, benefit ticks, rating stars, the WhatsApp brand mark, and **active** bottom-nav tabs. |
| bold = arrows | **Only for CTA arrows.** `ph-bold ph-arrow-right` appears exclusively inside filled primary buttons. Breadcrumb `ph-arrow-left`, pagination `ph-caret-right` and `ph-arrow-square-out` are all `ph` regular. Also note `ph-bold ph-tote` - bold is really 'inside a filled button', not 'is an arrow'. |
| regular = in-line | Confirmed, plus one case the rule misses: **inactive** bottom-nav tabs are regular and their active counterparts are fill (`ph-house`, `ph-path`, `ph-storefront`). Treat nav-active as a status. |

---

## 4. Integration approach: `@phosphor-icons/react`, not the webfont

### Recommendation

```
npm i @phosphor-icons/react@2.1.10
```

**Import every icon from the `/ssr` subpath**, per-icon:

```ts
import { Package } from "@phosphor-icons/react/dist/ssr";
// or, to skip the barrel entirely:
import { Package } from "@phosphor-icons/react/dist/ssr/Package";
```

Do **not** add the unpkg `<link>` tags from the mocks to `app/layout.tsx`.

### Why

| | `@phosphor-icons/react` (`/ssr`) | CSS webfont (`@phosphor-icons/web`) |
|---|---|---|
| Transfer cost | ~0.6-1.5 KB gzip **per icon**, all 6 weights included (measured: `ArrowRight` 576 B, `CheckCircle` 682 B, `Package` 1099 B, `Airplane` 1479 B gzip). ~108 glyphs -> **~70-90 KB gzip**, inside the JS you already ship. | The 4 weights the mocks load are **593 KB of woff2** (regular 147 KB, bold 150 KB, fill 132 KB, duotone 164 KB) + **481 KB of raw CSS** - for ~54 glyphs out of 1530. No subsetting story. |
| Tree-shaking | Yes, at icon granularity. `sideEffects: false`, one ES module per icon, `/* @__PURE__ */` annotations throughout. Not per-weight - each icon module carries all 6 weight path sets. | None. All-or-nothing per weight file. |
| Server components | **Yes** with `/ssr`. `dist/lib/SSRBase.es.js` is a bare `forwardRef` + `createElement` - no hooks. | Yes (it's just a class name) but see the FOIT row. |
| Server components, root import | **No.** `dist/lib/IconBase.es.js` calls `React.useContext(IconContext)` and the package ships **no `"use client"` directive**, so a root-barrel import inside an RSC has no client boundary to fall back to. This is exactly why the package ships `/ssr`. | n/a |
| Render behaviour | Inline `<svg>`, `fill="currentColor"`, `viewBox="0 0 256 256"`. Paints with the first HTML paint. | Ligature/PUA glyph in an `<i>`. Icons are invisible or boxed until the font loads (FOIT), from a **third-party origin** on first paint. |
| Styling | `weight` prop per instance; existing Tailwind `size-4` / `text-stone-400` classes keep working (SSRBase sets `width`/`height` attributes, which CSS overrides). | `font-size` for size, `color` for colour. Weight is baked into the class, so a weight change means a class change. |
| Fit with current code | Drop-in. The codebase already does per-icon named imports from `lucide-react` in 106 files, and passes icon *components* as props (`icon: LucideIcon` in `src/features/admin/components/stat-card.tsx:17`, `src/types/index.ts:6`, `src/features/orders/components/stats-row.tsx:24`, `src/components/layout/admin/nav-secondary.tsx:19`). A component-based set preserves that pattern exactly. | Breaks it. `<i className="ph ph-package">` is not a component, so all four `LucideIcon`-typed props and the `icon:` config objects in `src/config/ui.ts` and every sidebar/nav array would need restructuring into class-name strings. |
| Accessibility | Real `<svg>`; supports `alt` (renders `<title>`) and `aria-hidden`. | Font glyph; every `<i>` needs `aria-hidden` added by hand or screen readers announce PUA characters. |
| Offline / CSP | Self-hosted in the bundle. | Third-party `unpkg.com` request; needs a `style-src`/`font-src` CSP allowance and self-hosting before production. |

### Turbopack / Next 16 notes

- The root barrel `dist/index.es.js` re-exports ~1500 icons (192 KB). Turbopack tree-shakes it, but per-icon deep imports (`@phosphor-icons/react/dist/ssr/Package`) keep dev compile and HMR cheapest. If you prefer the tidy barrel import, add `experimental.optimizePackageImports: ["@phosphor-icons/react"]` to `next.config.ts` (the file currently has only an `images` block).
- Type replacement for `LucideIcon`: `import type { Icon } from "@phosphor-icons/react"` (verified: `dist/lib/types.d.ts:10`, `Icon = ForwardRefExoticComponent<IconProps>` where `IconProps` extends `ComponentPropsWithoutRef<"svg">` with `alt` / `color` / `size` / `weight` / `mirrored`).
- **Biggest mechanical gotcha: Phosphor fills, Lucide strokes.** Lucide icons are stroked outlines, so the codebase colours them with `stroke-*` Tailwind classes and one `strokeWidth` prop. Phosphor SVGs use `fill="currentColor"` with no stroke, so **every one of these becomes `text-*` or they render invisible**:
  - `strokeWidth={1.8}` - `src/components/layout/dashboard-navbar.tsx:53` (drop it; use `weight`)
  - 24 `stroke-*` class usages, concentrated in the stat cards: `src/features/admin/components/stat-cards.tsx:36,52,67,83`, `src/features/transactions/components/transaction-stat-cards.tsx:41,51,61,71`, `src/features/users/components/user-stat-cards.tsx:30,40,50,60`, `src/features/orders/components/order-stat-cards.tsx:48,57,66,75`, `src/features/deliveries/components/stat-cards.tsx:34,44,54,64`, plus `src/features/orders/components/user-orders/columns.tsx:199,219` and `src/features/orders/components/admin-orders-table/columns.tsx:300,320`
  - The `iconClassName` prop on `src/features/admin/components/stat-card.tsx:20` is typed `React.ComponentProps<LucideIcon>["className"]` and is the funnel for most of them - retype it to `React.ComponentProps<Icon>["className"]` and sweep the four stat-card files together.
- `IconContext` (available from the non-`/ssr` entry) can set app-wide defaults, but it requires a client boundary. Given the weight varies by role rather than globally, per-instance `weight` props are the better fit - skip the provider.
- Keep the webfont `<link>` tags in `design/*.dc.html`. They are correct for a standalone mock.

---

## 5. In the codebase, absent from the mocks

The mocks cover 54 glyphs; the codebase needs ~108. The gap is almost entirely **admin surface area**, which the redesign did not touch. These need weights chosen by rule rather than copied from a mock.

| Area | Icons with no mock counterpart | Weight decision |
|---|---|---|
| **Data-table chrome** (7 tables: orders x2, transactions, users, deliveries, notifications, pricing x2) | `ChevronLeftIcon`, `ChevronsLeftIcon`, `ChevronsRightIcon`, `ChevronsUpDownIcon`, `ArrowUpIcon`, `ArrowDownIcon`, `MoreHorizontalIcon`, `SlidersHorizontalIcon`, `RefreshCwIcon`, `SearchIcon` | **bold** for the pagination carets and sort arrows (they render at 12-16px where regular disappears); **regular** for `sliders-horizontal`, `arrows-clockwise`, `magnifying-glass`; **regular at opacity-40** for `caret-up-down`. Mock precedent: `ph ph-caret-right` is regular at 15px+, but table controls are smaller. |
| **Rich-text editor toolbar** (`src/features/policies/components/rich-text-editor.tsx`, 16 icons) | `BoldIcon`, `ItalicIcon`, `UnderlineIcon`, `StrikethroughIcon`, `Heading1Icon`, `Heading2Icon`, `Heading3Icon`, `ListIcon`, `ListOrderedIcon`, `TableIcon`, `QuoteIcon`, `SeparatorHorizontalIcon`, `Undo2Icon`, `Redo2Icon`, `RemoveFormattingIcon`, `LinkIcon` | **regular** throughout - these are 14px in-line tool buttons. Use **fill** only for the active/pressed state of a toggle (bold-on, italic-on), which gives the toolbar a free active affordance Lucide never had. |
| **Admin nav + chrome** | `LayoutGridIcon`, `LayoutDashboardIcon`, `Settings2Icon`, `LifeBuoy`, `Command`, `GalleryVerticalEnd`, `PanelLeftIcon`, `ChevronRight`, `ChevronsUpDown`, `BadgeCheck`, `Bell` | **regular** inactive / **fill** active, mirroring the mocks' bottom-tab-bar pattern (`ph-house` regular -> `ph-fill ph-house`). Logo marks (`Command`, `GalleryVerticalEnd`) -> **fill**, they sit in a filled tile. |
| **Admin stat cards** | `HandCoinsIcon`, `UsersRoundIcon`, `ScanSearchIcon`, `TrendingUpIcon`, `CircleOffIcon`, `HandshakeIcon`, `BanknoteIcon`, `PackageOpenIcon`, `CalendarIcon`, `ShieldIcon` | **duotone**. These are the closest admin analogue to the mocks' feature cards - coloured glyph in a tinted rounded tile - and `src/features/admin/components/stat-card.tsx` already renders them that way. |
| **Account / auth screens** | `Eye`, `EyeOff`, `Lock`, `KeyRoundIcon`, `LogIn`, `LogOut`, `LogOutIcon`, `UserPlus`, `User`, `UserRoundIcon`, `UserCogIcon`, `ShieldUserIcon`, `ShieldAlert`, `Activity`, `Calendar`, `Shield`, `Mail` | **regular** in-line; **duotone** for the two full-screen illustrations (`ShieldAlert` on `src/app/auth/auth-code-error/page.tsx:10`, `Mail` on `src/features/auth/components/verify-email.tsx:16`). |
| **Toasts** (two competing icon sets: `src/lib/sonner/index.tsx` and `src/components/ui/sonner.tsx`) | `CircleCheckIcon`, `InfoIcon`, `TriangleAlertIcon`, `OctagonXIcon`, `Info`, `AlertTriangle`, `Loader2Icon` | **fill** for all four states (they are status indicators by definition), **bold** for the spinner. Pick one of the two files and delete the other. |
| **Pricing config screens** | `DownloadIcon`, `UploadIcon`, `FileSpreadsheetIcon`, `WeightIcon`, `SaveIcon`, `PencilIcon`, `XIcon` | **regular**. `WeightIcon` -> `ph-scales`, which the mocks *do* use (product weight chip) - the one confirmed name in this group. |
| **Empty states** | `BellOffIcon`, `ReceiptIcon`, `HandbagIcon`, `SearchXIcon`, `ImageIcon`, `PackageIcon` | **duotone** at 32-40px. Consistent with the mocks' treatment of large decorative glyphs. |
| **Examples file** | `BookUserIcon`, `LockIcon`, `CreditCardIcon`, `CheckIcon`, `LoaderCircleIcon` in `src/components/examples/c-stepper-7.tsx` | Not shipped UI. **Consider deleting this file** rather than migrating it - it is a shadcn example scratch component and accounts for 5 icon references. |

### Reverse gap: mock icons with no current-codebase counterpart

33 of the 54 mock glyphs are already the migration target of an existing Lucide icon. The other **21 are net-new UI** the redesign introduces - no Lucide to replace, just new imports to add:

| Phosphor | Weight | What it is |
|---|---|---|
| `ph-tote` | regular / bold | Nav bag with count badge; 'Add to bag' CTA (also the target for `ShoppingCartIcon`/`ShoppingBagIcon`/`HandbagIcon`) |
| `ph-path` | regular / fill | New 'Journeys' bottom-nav tab |
| `ph-house` | regular / fill | New 'Home' bottom-nav tab |
| `ph-house-line` | regular / duotone | 'Your door' tracking stop; 'Track it to your door' step |
| `ph-storefront` | regular / duotone / fill | New 'Buy' bottom-nav tab; seller chip; 'Purchased' tracking stop |
| `ph-warehouse` | fill | 'US hub' tracking stop |
| `ph-airplane-tilt` | duotone / fill | Freight row; 'In the air' order stage + tracking stop |
| `ph-airplane` | fill | Marketing hero arc animation (decorative) |
| `ph-bank` | duotone | 'US sales tax' breakdown row (also the target for `BuildingIcon`) |
| `ph-tag` | duotone | 'Item' price row; 'Brand' spec chip |
| `ph-hand-heart` | duotone | 'Tomame fee 5%' breakdown row |
| `ph-arrows-left-right` | duotone | 'Rate 1 USD = 14.43' breakdown row |
| `ph-barcode` | duotone | 'Register the tracking number' step |
| `ph-share-network` | regular | Product detail share button |
| `ph-bookmark-simple` | regular / duotone | Save / price-watch control |
| `ph-bell-ringing` | duotone | 'Price watch' feature card |
| `ph-calendar-check` | duotone | Delivery ETA card |
| `ph-lightbulb` | duotone | Consolidation tip card |
| `ph-hand-waving` | fill | Greeting pill |
| `ph-arrow-u-up-left` | duotone | 'Full refund' reassurance card |
| `ph-buildings` | duotone | Office address card |
| `ph-star` | fill | Testimonial + product rating |
| `ph-text-aa` | duotone | **Annotation layer only** - a spec note about hero placeholder behaviour, not product UI. Do not build for it. |

(`ph-sparkle` is likewise annotation-layer in the mocks, but it is already needed by `SparklesIcon` on the app hero, so it stays on the build list.)

### Consistency decisions this section forces

1. **Nav active state.** The mocks give bottom-nav tabs a regular/fill pair. The admin and app sidebars currently have no icon-level active state at all. Adopting the pair costs nothing (same import, different `weight`) and should be applied to `src/components/layout/admin/sidebar.tsx`, `src/features/app/components/sidebar.tsx` and `src/components/layout/dashboard-navbar.tsx`.
2. **Stat cards are the admin's feature cards.** All ~14 stat-card icons go duotone; that is the only place duotone appears in the admin, which keeps the weight meaningful.
3. **Small chrome goes bold, not regular.** Anything rendering under 16px in a data table (sort arrows, pagination carets, kebab menus) needs bold or it reads as noise - this is where Phosphor differs most from Lucide's uniform 2px stroke.
4. **Delete before migrating.** `src/components/examples/c-stepper-7.tsx` (5 icon refs) and one of the two toast icon sets (`src/lib/sonner/index.tsx` vs `src/components/ui/sonner.tsx`, 7 icon refs) are dead weight in the count.
