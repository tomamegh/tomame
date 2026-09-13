/*
  Two generations sit side by side here, deliberately.

  The four `*Card` components below are the ORIGINAL account cards. `/app/account`
  no longer uses them — Phase 6 replaced it with the tabbed screen — but
  `/admin/account` still does, and that screen has not been redesigned. Deleting
  them would break the admin's own account page to tidy up a customer one, so
  they stay until the admin shell is reworked.

  The `Account*Panel` components are the v2 screen.
*/

// ── Pre-v2, still used by /admin/account ──────────────────────────────────────
export { ProfileInfoCard } from "./profile-info-card";
export { EditProfileCard } from "./edit-profile-card";
export { SecuritySettingsCard } from "./security-settings-card";
export { AccountActivityCard } from "./account-activity-card";

// ── v2 account screen (/app/account) ──────────────────────────────────────────
export { AccountRail } from "./account-rail";
export { AccountPanel, AccountEmpty } from "./account-panel";
export { AccountField } from "./account-field";
export { AccountToggle } from "./account-toggle";
export { AccountProfilePanel } from "./account-profile-panel";
export { AccountAddressesPanel } from "./account-addresses-panel";
export { AccountPaymentPanel } from "./account-payment-panel";
export { AccountWatchPanel } from "./account-watch-panel";
export {
  AccountNotificationsPanel,
  type AccountNotificationsPanelProps,
} from "./account-notifications-panel";
export {
  AccountSecurityPanel,
  type AccountSecurityPanelProps,
} from "./account-security-panel";
