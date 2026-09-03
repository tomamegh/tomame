change "2026-08-29-payments-verification-and-redirects" {
  title  = "Payment returns land on real pages, verified charges must match the recorded amount, and post-payment effects run once"
  reason = <<-EOT
    First requirement ledger for the Paystack money path. It is being written in response to an audit of
    the existing implementation, which found four defects that this ledger states as contracts the code
    must now meet. Three of the four are violated by the build as it stands, which is deliberate: the
    checks derived from these requirements are expected to go red before they go green.

    1. Every failure path from Paystack redirected the customer to `/orders`, a route that does not exist
       in this application - the customer's orders live under `/app/orders`. Only the success path used
       the correct prefix. A customer whose card was declined, or whose reference could not be resolved,
       was handed a 404 with no indication of what happened to their money. R7 states the contract as an
       outcome the customer can observe, rather than as a list of URLs, so it survives any future
       reshuffling of the routes.

    2. Verification branched on Paystack's reported status alone and never compared the verified amount or
       currency against the payment record. The reference is server-generated and the amount is fixed at
       initialization, so this is not trivially exploitable today, but it is the one check that catches an
       underpaid, wrong-currency, or replayed charge, and its absence means a mismatch would silently
       promote an order to paid. R4 forbids the promotion outright; R11 fixes what must happen instead, so
       that a mismatch is a recorded failure the customer can retry rather than a silent write.

    3. The browser callback and the Paystack webhook both funnel into the same handler, and idempotency
       rested on a read of the payment status followed later by an unconditional write. Two deliveries
       arriving close together - which is the normal case, since Paystack fires the webhook while the
       customer's browser is still being redirected - could both observe a pending payment, both verify,
       and both run the follow-on effects, sending the customer two confirmation emails and writing two
       notifications for one charge. R5 forbids the duplicate effects as a behavioural contract; it is
       stated over the effects rather than over the write so that it stays true regardless of how the
       claim is implemented.

    4. `user.email` was dereferenced with a non-null assertion behind a TODO, although the type it comes
       from allows it to be absent. R10 makes the absent-email case an explicit refusal instead of a
       runtime failure inside the Paystack call.

    R9 records a decision that was previously left half-made in a commented-out block in the webhook
    route: deliveries the handler has deliberately declined are answered as successes so Paystack stops
    retrying them, and only transient faults are answered with a failure so that Paystack retries exactly
    the deliveries that can still succeed.

    The remaining requirements - R1, R2, R3, R6, R8, R12 - describe behaviour the current implementation
    already provides. They are recorded because they are the guarantees the money path exists to make,
    and because nothing in the repository tested them: there was no test anywhere touching payments or
    Paystack before this change.
  EOT
  created_at     = "2026-08-29"
  generated_from = "HEAD"

  spec "spec_payments" {
    added_requirements = {
      R1  = { name = "initialization_requires_owner_and_unpaid_order" }
      R2  = { name = "no_second_payment_for_an_order" }
      R3  = { name = "amount_is_server_derived" }
      R4  = { name = "no_success_on_amount_or_currency_mismatch" }
      R5  = { name = "post_payment_effects_run_at_most_once" }
      R6  = { name = "successful_charge_promotes_the_order" }
      R7  = { name = "customer_always_lands_on_a_real_page" }
      R8  = { name = "webhook_rejects_unsigned_requests" }
      R9  = { name = "webhook_retry_contract" }
      R10 = { name = "no_transaction_without_a_customer_email" }
      R11 = { name = "failed_verification_leaves_the_order_unpaid" }
      R12 = { name = "every_money_transition_is_audited" }
    }
  }
}
