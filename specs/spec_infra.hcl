spec "spec_infra" {
  spec_version = 1
  title  = "Provisioning (Vercel, Supabase, Resend)"
  intent = "Everything Tomame runs on, declared rather than clicked: the Vercel project that serves the app, the Supabase project that stores it, and the Resend domain it mails from. There is no separate secret store; the deployment platform holds what the running app reads, and every other credential is read out of provisioning state one at a time. The contracts here are mostly about the seam between provisioning and the running application - a name that provisioning does not set is not a missing feature, it is an outage at boot - and about the ways infrastructure fails quietly, where an apply reports success and something is nevertheless wrong."

  requirements = {
    R1 = {
      name    = "every_required_variable_is_provisioned"
      require = "Every environment variable the application refuses to start without, and every variable it reads at runtime, is either set by provisioning or declared as a recognised optional tier; no variable the code reads is simply unaccounted for."
    }

    R2 = {
      name    = "no_server_secret_behind_a_public_name"
      forbid  = "A credential that grants server-side authority is provisioned under a name that the build inlines into the browser bundle."
    }

    R3 = {
      name    = "credentials_are_derived_not_transcribed"
      require = "Credentials that can be generated - the database password and the cron secret - are generated during provisioning, and every value the application receives is derived from the resource that issued it rather than copied in by hand."
    }

    R4 = {
      name    = "app_origin_is_always_real"
      outcome = "The origin handed to the application is a hostname that actually resolves to this deployment, in every configuration including one with no custom domain; it is never a placeholder, because payment return URLs and emailed auth links are both built from it."
    }

    R5 = {
      name    = "no_silent_destruction_of_stored_data"
      forbid  = "A routine apply destroys and recreates the database, or drops the secret store, as a side effect of changing an attribute that cannot be updated in place."
    }

    R6 = {
      name    = "application_mail_key_can_only_send"
      require = "The mail credential the application holds is scoped to sending alone; the privileged credential able to alter the sending domain or mint further keys is used only by provisioning and is never given to the app."
    }

    R7 = {
      name    = "schema_is_not_owned_by_provisioning"
      forbid  = "Provisioning is able to create, alter or drop a database table, so that no infrastructure change can alter or destroy application data."
    }

    R8 = {
      name    = "missing_vendor_credential_fails_before_apply"
      outcome = "A vendor credential that is absent or blank is reported as an error before anything is created, naming the variable, rather than surfacing later as a failure on a live request."
    }

    R9 = {
      name    = "scheduled_work_is_configured_end_to_end"
      require = "The scheduled exchange-rate refresh has everything it needs to actually run, including the values the database-side scheduler reads; provisioning either supplies them or states, as a first-class output, exactly what remains and why its absence is silent."
    }

    R10 = {
      name    = "one_scheduler_per_scheduled_job"
      forbid  = "The same scheduled job is registered with two schedulers, so that it cannot run twice per interval."
    }

    R11 = {
      name    = "state_is_never_kept_unprotected"
      forbid  = "Provisioning state, which holds the database password and every issued key in cleartext, is written anywhere unencrypted or committed to the repository."
    }

    R12 = {
      name    = "deployment_holds_only_what_the_app_reads"
      forbid  = "A credential the application has no code path to use is deployed to the hosting platform, where every preview build and everyone with project access would hold it for no purpose."
    }
  }
}
