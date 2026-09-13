"use client";

import { useState } from "react";

import { AdminBadge } from "@/components/layout/admin";
import type { AdminSiteSettingRow } from "@/db/queries/admin-content";

import {
  parseSettingInput,
  settingShape,
  settingToEditorValue,
  settingVisibility,
  settingWarning,
} from "./admin-content-format";
import {
  CONTENT_INPUT_CLASS,
  CONTENT_TEXTAREA_CLASS,
  ContentSaveButton,
  useContentPatch,
} from "./admin-content-fields";

/**
 * `site_settings` — the WhatsApp number, the support hours, the company
 * address, the payment channels and the worked example.
 *
 * Every one of these has been edited by hand in SQL until now. The editor is
 * deliberately shape-aware rather than a row of text boxes: a plain string is a
 * text field, and anything structured is edited as JSON and validated by the
 * route before it is written. `payment_channels` in particular carries the
 * `paystack_channel` the bag sends to Paystack, and flattening it back to the
 * labels 037 seeded would leave the footer looking correct while checkout lost
 * every channel.
 *
 * One form per setting, each with its own dirty state, so a mistake in one
 * cannot block saving another.
 */
export function AdminSettingsPanel({ settings }: { settings: readonly AdminSiteSettingRow[] }) {
  return (
    <div className="flex flex-col divide-y divide-tm-hairline">
      {settings.map((setting) => (
        <SettingRow key={setting.key} setting={setting} />
      ))}
    </div>
  );
}

function SettingRow({ setting }: { setting: AdminSiteSettingRow }) {
  const shape = settingShape(setting.value);
  const stored = settingToEditorValue(setting.value);

  const [draft, setDraft] = useState(stored);
  const [error, setError] = useState<string | null>(null);
  const { patch, isSaving } = useContentPatch();

  const isDirty = draft !== stored;
  const visibility = settingVisibility(setting.is_public);
  const warning = settingWarning(setting.key);
  const fieldId = `setting-${setting.key}`;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = parseSettingInput(shape, draft);
    if (!parsed.ok) {
      setError(parsed.error ?? "That value could not be read.");
      return;
    }
    setError(null);

    await patch(
      { target: "setting", key: setting.key, value: parsed.value },
      {
        successTitle: `${setting.label || setting.key} updated`,
        successDescription: setting.is_public
          ? "Live for visitors on the next page load."
          : "Saved. This setting is not shown to visitors.",
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 py-5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] leading-none font-semibold text-tm-ink">
              {setting.label || setting.key}
            </span>
            <AdminBadge tone={visibility.tone}>{visibility.label}</AdminBadge>
          </div>
          <code className="tm-nums text-[12px] leading-none font-medium text-tm-text-3">
            {setting.key}
          </code>
        </div>
        <ContentSaveButton isDirty={isDirty} isSaving={isSaving} />
      </div>

      {setting.description ? (
        <p className="max-w-[72ch] text-[12px] leading-[1.5] font-medium text-tm-text-2">
          {setting.description}
        </p>
      ) : null}

      {warning ? (
        <p className="max-w-[72ch] rounded-[12px] bg-tm-amber-bg px-3.5 py-2.5 text-[12px] leading-[1.5] font-medium text-[#7a4a06]">
          {warning}
        </p>
      ) : null}

      {shape === "text" ? (
        <input
          id={fieldId}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className={CONTENT_INPUT_CLASS}
        />
      ) : (
        <textarea
          id={fieldId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={Math.min(16, Math.max(4, draft.split("\n").length + 1))}
          spellCheck={false}
          className={`${CONTENT_TEXTAREA_CLASS} font-mono`}
        />
      )}

      {error ? (
        <p className="text-[12px] leading-[1.45] font-semibold text-tm-coral-strong">{error}</p>
      ) : null}
    </form>
  );
}
