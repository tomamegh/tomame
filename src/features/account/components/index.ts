/*
  This barrel is the PRE-v2 account cards, and only those.

  `/app/account` no longer uses them — Phase 6 replaced it with the tabbed
  screen — but `/admin/account` still does, and that screen has not been
  redesigned. Deleting them would break the admin's own account page to tidy up
  a customer one, so they stay until the admin shell is reworked.

  The v2 panels are deliberately NOT re-exported here. `/admin/account` is a
  client component that imports this file, and a barrel mixing the two would
  drag every server panel (and the watches and payments modules behind them)
  into that client bundle for no reason. The account screen imports each panel
  by its own path instead — see `src/app/app/account/page.tsx`.
*/

export { ProfileInfoCard } from "./profile-info-card";
export { EditProfileCard } from "./edit-profile-card";
export { SecuritySettingsCard } from "./security-settings-card";
export { AccountActivityCard } from "./account-activity-card";
