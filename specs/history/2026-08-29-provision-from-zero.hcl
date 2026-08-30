change "2026-08-29-provision-from-zero" {
  title  = "Declare the provisioning contracts, and close the gaps auditing them exposed"
  reason = <<-EOT
    Tomame had no provisioned infrastructure at all. Vercel had no project and
    its CLI was not authorised; the Supabase URL in .env was still the literal
    template placeholder `https://your-project.supabase.co`; Resend had nothing.
    Everything was going to be created by hand, once, by one person, and then be
    undocumented.

    This ledger is written alongside the Terraform that provisions it, and states
    the contracts that matter about that provisioning. Most are not about whether
    a resource exists - an apply either creates it or fails loudly - but about
    the ways infrastructure goes wrong quietly, where the apply succeeds and the
    system is still broken.

    Three requirements exist because writing them exposed a real defect:

    R1 came first as an obvious-sounding contract and immediately failed. The app
    reads TAX_PERCENTAGE, BROWSERLESS_API_URL and SCRAPINGBEE_API_KEY through
    process.env, and provisioning set none of them. Each has a silent fallback in
    code, so nothing would have errored - but TAX_PERCENTAGE defaults to 0.10 and
    feeds the price a customer is charged, which means an environment where
    nobody set it and one where somebody did quote different totals for the same
    basket, with the checkout page rendering whichever it received as "Tax (X%)"
    with equal confidence. TAX_PERCENTAGE and BROWSERLESS_API_URL are now set
    explicitly; ScrapingBee is a declared optional tier, because its client
    deliberately returns null when unconfigured. The requirement is stated over
    "every variable the code reads" rather than "every variable env.ts requires"
    precisely because the dangerous ones were the second kind.

    R9 exists because migration 026 schedules the exchange-rate refresh with
    pg_cron, and refresh_exchange_rates() reads app.settings.app_url and
    app.settings.cron_secret via current_setting(..., true). When those are
    unset it raises a warning and returns. The job then fires every four hours
    and does nothing - no failed request, no error, nothing that could alert.
    Exchange rates go stale and pricing_config.exchange_rate is what converts
    every order into GHS, so the observable failure is silent mispricing, at a
    remove of days from its cause. The migration left this as a comment telling
    a human to run two statements in the SQL editor. Provisioning knows both
    values, so it now emits them as a first-class output.

    R10 exists because the same route could plausibly have been given a Vercel
    cron as well - the code was ready for it, and vercel.json was empty, which
    reads like an omission rather than a decision. It is a decision: pg_cron
    already owns that schedule, and a second scheduler would double every
    refresh. Recording it stops the next person from "fixing" the empty file.

    R2 and R11 are guardrails around the two ways this stack could leak. Next.js
    inlines any NEXT_PUBLIC_ name into the client bundle at build time, so a
    server credential behind that prefix is published to every visitor while
    still looking protected in a dashboard. And Terraform state necessarily holds
    the database password, the Supabase service-role key and the Resend key in
    cleartext, because they are values providers return - there is no way to
    avoid it, only to keep the state encrypted and remote.

    R12 was added when the question "do we save the database info to Vercel?"
    was asked directly. The answer is no, and it is worth recording as a contract
    rather than leaving as an accident of how the variables happened to be
    grouped. The application has no Postgres driver in its dependencies and never
    reads a connection string - it reaches Supabase over HTTPS through
    supabase-js. Deploying the database password there would place superuser
    access into every preview build and into the hands of everyone with project
    access, in exchange for nothing, since no code path there could use it. The
    requirement is written generally, over "a credential the application has no
    code path to use", because the next such credential will not be this one.

    R5 and R7 draw the line at data. Supabase cannot move a project between
    regions, so Terraform's only way to honour a region change is
    destroy-then-create, which discards every row. The schema is deliberately
    left to supabase/migrations/*.sql: destroying a whole project is loud and
    obvious, whereas a table quietly disappearing because a resource block moved
    is not.
  EOT
  created_at     = "2026-08-29"
  generated_from = "HEAD"

  spec "spec_infra" {
    added_requirements = {
      R1  = { name = "every_required_variable_is_provisioned" }
      R2  = { name = "no_server_secret_behind_a_public_name" }
      R3  = { name = "credentials_are_derived_not_transcribed" }
      R4  = { name = "app_origin_is_always_real" }
      R5  = { name = "no_silent_destruction_of_stored_data" }
      R6  = { name = "application_mail_key_can_only_send" }
      R7  = { name = "schema_is_not_owned_by_provisioning" }
      R8  = { name = "missing_vendor_credential_fails_before_apply" }
      R9  = { name = "scheduled_work_is_configured_end_to_end" }
      R10 = { name = "one_scheduler_per_scheduled_job" }
      R11 = { name = "state_is_never_kept_unprotected" }
      R12 = { name = "deployment_holds_only_what_the_app_reads" }
    }
  }
}
