spec "spec_payments" {
  spec_version = 1
  title  = "Payments (Paystack)"
  intent = "Tomame requires full pre-payment before an order is processed. This area covers the whole money path: initializing a Paystack transaction for an order, receiving the customer back from Paystack's hosted checkout, receiving Paystack's asynchronous webhook, verifying the charge against Paystack's API, and promoting the order to paid exactly once. Two independent channels (the browser callback and the server webhook) report the same charge, so every contract here has to hold under concurrent and repeated delivery. Money is held in pesewas (GHS x 100) and every amount is derived server-side; nothing the client sends is ever trusted."

  requirements = {
    R1 = {
      name    = "initialization_requires_owner_and_unpaid_order"
      require = "A payment may only be initialized by the authenticated user who owns the order, and only while that order is still awaiting payment; a request for another user's order is indistinguishable from a request for an order that does not exist."
    }

    R2 = {
      name    = "no_second_payment_for_an_order"
      forbid  = "A new Paystack transaction is initialized for an order that already has a payment in a pending or successful state."
    }

    R3 = {
      name    = "amount_is_server_derived"
      require = "The amount sent to Paystack is computed server-side as the order's admin-set total when one exists, otherwise its calculated total, converted to whole pesewas; a request carrying its own amount has no effect on what is charged."
    }

    R4 = {
      name    = "no_success_on_amount_or_currency_mismatch"
      forbid  = "A payment is marked successful when the amount or currency reported by Paystack's verification differs from the amount and currency recorded on that payment, even if Paystack reports the charge as successful."
    }

    R5 = {
      name    = "post_payment_effects_run_at_most_once"
      forbid  = "The effects that follow a successful payment - promoting the order to paid, creating the customer notification, and sending the confirmation email - run more than once for a single payment, however many times the callback and the webhook deliver the same charge, concurrently or in sequence."
    }

    R6 = {
      name    = "successful_charge_promotes_the_order"
      outcome = "When verification confirms a charge for the recorded amount and currency, the payment reads successful with the channel Paystack reported, the order reads paid and references that payment, and the customer has one notification and one confirmation email for it."
    }

    R7 = {
      name    = "customer_always_lands_on_a_real_page"
      outcome = "Every return from Paystack - success, failure, an unrecognized reference, or an internal error - redirects the customer to a page that exists in the application and that states the outcome of their payment; no return path produces a 404."
    }

    R8 = {
      name    = "webhook_rejects_unsigned_requests"
      forbid  = "A webhook request whose HMAC-SHA512 signature is absent or does not match the raw request body has any effect on a payment or an order."
    }

    R9 = {
      name    = "webhook_retry_contract"
      require = "The webhook answers with a success status for any event it has deliberately declined to action - an event type it does not handle, a reference it does not recognize, or a charge it has already processed - and with a failure status only when processing was prevented by a transient fault, so that Paystack retries exactly the deliveries that can still succeed."
    }

    R10 = {
      name    = "no_transaction_without_a_customer_email"
      forbid  = "A Paystack transaction is initialized for a user who has no email address on their account."
    }

    R11 = {
      name    = "failed_verification_leaves_the_order_unpaid"
      require = "When verification reports anything other than a successful charge for the recorded amount and currency, the payment is recorded as failed together with the verification response, and the order remains unpaid and unlinked so the customer can attempt payment again."
    }

    R12 = {
      name    = "every_money_transition_is_audited"
      require = "Initializing a payment, and each terminal transition of a payment to successful or failed, writes an audit event identifying the payment, the order, and the reference."
    }
  }
}
