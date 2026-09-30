# Supabase auth email templates

Supabase Auth sends these itself (sign-up, password reset, sign-in link, email
change, invite, verification code) through the Resend SMTP connection, from
`noreply@send.tomame.ca`. They use the same shell as the app's own emails in
`src/lib/email/templates/layout.ts`: the `tomame` wordmark, coral button, tinted
summary panel, support footer, and dark-mode colours.

**Hosted Supabase does not read this folder.** Production uses whatever is
pasted into the dashboard. `supabase/config.toml` points local Supabase at
these files, so local and production match once they have been pasted.

## Where to paste them

Supabase dashboard → project `zvrjdwvjtzjmtnrawrta` → **Authentication →
Emails → Templates**. For each tab below, set the **Subject**, switch the body
to the HTML/source editor, replace everything with the whole file, and **Save**.

| Dashboard tab        | File                    | Subject                                          |
| -------------------- | ----------------------- | ------------------------------------------------ |
| Confirm signup       | `confirmation.html`     | `Confirm your email to start shopping on Tomame` |
| Invite user          | `invite.html`           | `You're invited to Tomame`                       |
| Magic Link           | `magic_link.html`       | `Your Tomame sign-in link`                       |
| Change Email Address | `email_change.html`     | `Confirm your new email address for Tomame`      |
| Reset Password       | `recovery.html`         | `Reset your Tomame password`                     |
| Reauthentication     | `reauthentication.html` | `{{ .Token }} is your Tomame verification code`  |

Afterwards, send yourself a password reset from `/auth/forgot-password` and
check it in Gmail and on a phone.

## Template variables

Supabase fills these in with Go templates:

- `{{ .ConfirmationURL }}`: the link the button and the "Button not working?"
  line point to (every template except reauthentication).
- `{{ .Token }}`: the one-time code (reauthentication; 8 digits in production,
  6 locally).
- `{{ .Email }}`: the account's address, in the footer's "why you got this" line.
- `{{ .NewEmail }}`: the address being changed to (email_change).

The copy says links and codes last **1 hour**, which matches the production
`mailer_otp_exp` of 3600 s and local `otp_expiry`. If that setting changes,
change the copy too.

## Not included

The security notification templates (password changed, email changed, sign-in
method linked, and so on) are switched off in production, so they are not
restyled here. If you turn them on, build them on the same shell.

## Editing

These files are static HTML generated from `layout.ts`. Keep them in step with
the app emails: change the shell there, regenerate, and paste again. Notes for
anyone editing by hand:

- Supabase renders these as Go templates, and Go's HTML templating strips HTML
  comments, which is where Outlook's VML button lives. So these files leave the
  VML button out on purpose (the app emails keep it). Outlook desktop shows a
  square-cornered coral button instead.
- Keep every style inline. The `<style>` block holds only the dark-mode and
  phone-width rules, and the email still reads correctly in clients that drop it.
- No images. The wordmark is text, so nothing breaks when images are blocked.
