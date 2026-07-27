-- Seed the policies table with the initial legal content.
-- Safe to re-run: ON CONFLICT (slug) DO NOTHING preserves any admin edits.
-- Privacy, Terms, Returns are published; Shipping and Payment remain drafts
-- until reviewed.

insert into policies (slug, label, content, effective_date, is_published)
values
  (
    'privacy',
    'Privacy Policy',
    $md$Tomame ("we", "us", "our") operates as a concierge shopping service. This Privacy Policy explains how we collect, use, and protect your personal information when you use our platform at tomame.ca.

### Information We Collect

- **Account data** — name, email address, and phone number provided at sign-up.
- **Order data** — product URLs, delivery addresses, and payment transaction references.
- **Usage data** — pages visited, features used, and timestamps (via anonymous analytics).
- **Device data** — browser type, operating system, and IP address for security purposes.

### How We Use Your Information

- To process and fulfil your orders end-to-end.
- To send order status notifications via email or WhatsApp.
- To improve the platform and detect fraudulent activity.
- To comply with applicable Ghanaian laws and regulations.

### Data Sharing

We do not sell your personal data. We share information only with:

- **Payment processors** (Hubtel) solely to complete transactions.
- **Logistics partners** as needed to deliver your package.
- **Legal authorities** when required by Ghanaian law.

### Data Retention

Order and payment records are retained for seven (7) years for tax and legal compliance. You may request deletion of your account and associated non-transactional data at any time by contacting [support@tomame.ca](mailto:support@tomame.ca).

### Security

All data is stored on Supabase infrastructure with row-level security. Passwords are never stored in plain text. Payment details are handled exclusively by Hubtel and never stored on our servers.

### Contact

For privacy-related requests, email [support@tomame.ca](mailto:support@tomame.ca).$md$,
    'May 2025',
    true
  ),
  (
    'terms',
    'Terms of Service',
    $md$By using Tomame you agree to these Terms of Service. Please read them carefully. If you do not agree, do not use the platform.

### Service Description

Tomame is a concierge shopping service. We purchase products from international retailers on your behalf, ship them to Ghana, and arrange local delivery. We are not the retailer — we act as your purchasing agent.

### Pre-Payment Requirement

**Full payment is required before any order is processed.** We do not offer credit or buy-now-pay-later arrangements. Payment confirms your order and authorises us to proceed with the purchase.

### Pricing & Fees

- All prices are quoted in Ghana Cedis (GH₵) at the prevailing exchange rate plus our service fee.
- Quoted prices are valid for 30 minutes from the time of extraction.
- Final amounts are confirmed before you pay — no hidden charges.
- Customs duties, if applicable, will be communicated separately and are the responsibility of the customer.

### Order Acceptance

We reserve the right to decline any order at our discretion, including orders for restricted, prohibited, or high-risk items. A full refund will be issued for declined orders within 24 hours.

### Prohibited Items

- Weapons, ammunition, or explosives.
- Controlled substances or prescription medication without documentation.
- Counterfeit goods or items that infringe on intellectual property.
- Perishable items or live animals.
- Items prohibited by Ghanaian import regulations.

### Limitation of Liability

Our liability is limited to the amount you paid for the relevant order. We are not liable for indirect or consequential losses, delays caused by third-party carriers, or retailer stock issues outside our control.

### Governing Law

These terms are governed by the laws of the Republic of Ghana. Disputes will be resolved in the courts of Accra, Ghana.$md$,
    'May 2025',
    true
  ),
  (
    'shipping',
    'Shipping Policy',
    $md$Once payment is confirmed, we purchase your item from the retailer and ship it to Ghana. Here is what to expect at each stage.

### Sourcing Regions

- **USA** — Amazon, eBay, Walmart, Target, Best Buy, and others.
- **UK** — ASOS, Marks & Spencer, Argos, and others.
- **China** — SHEIN, AliExpress, and selected wholesalers.

### Delivery Timeline

- **Standard (Sea freight)** — 3 to 6 weeks from purchase date.
- **Express (Air freight)** — 7 to 14 days from purchase date. Available on request; additional fee applies.
- Timelines are estimates and may vary due to customs clearance, public holidays, or carrier delays.

### Shipping Fees

Shipping fees are calculated based on the item's weight, dimensions, and source region. The full fee is shown in your quote before payment — there are no surprise charges.

### Order Tracking

You will receive status updates at each milestone:

- Order confirmed and paid
- Item purchased from retailer
- Package received at our consolidation warehouse
- Shipped to Ghana
- Cleared customs and in local transit
- Out for delivery
- Delivered

### Customs & Import Duties

Ghana Revenue Authority may levy import duties on certain goods. Where duties apply, we will notify you and either invoice separately or include the duty in a revised quote. We do not mark packages as "gifts" or misrepresent values to avoid duties.

### Lost or Damaged Packages

All shipments are tracked. If a package is lost or arrives damaged, notify us within 48 hours of the expected delivery date. We will investigate and resolve within 5–7 business days. See our Returns & Refunds policy for outcomes.$md$,
    'May 2025',
    false
  ),
  (
    'returns',
    'Returns & Refunds',
    $md$At Tomame, we are committed to customer satisfaction. This Refund Policy outlines the conditions under which refunds may be issued for products purchased through our concierge shopping platform.

### Understanding Our Service Model

Tomame operates as a **concierge shopping and logistics service**. We source products from international retailers on your behalf and arrange shipment to Ghana. Because products are purchased specifically for you after you place your order, our refund policy differs from traditional retail stores.

### Refund Eligibility

#### 1. Order Cancellation Before Purchase

- **Full refund available** if you cancel your order before we have purchased the product from the retailer.
- Refunds processed within 3–5 business days.
- Service fees are non-refundable once product sourcing has begun.

#### 2. Order Cancellation After Purchase

Once we have purchased your product from the retailer:

- **Refunds are subject to the original retailer's return policy.**
- We will attempt to return the item on your behalf where possible.
- Refund amount will be the product cost minus:
  - Non-refundable retailer restocking fees (if any)
  - Return shipping costs incurred
  - 15% administrative processing fee
- Processing time: 10–15 business days after item is returned to retailer.

#### 3. Damaged or Defective Products

We will issue a **full refund or replacement** if:

- Product arrives damaged due to shipping
- Product is defective or materially different from description
- Wrong item was shipped

**Requirements:**

- Report damage/defect within 48 hours of delivery
- Provide photographic evidence
- Product must be unused (except to verify defect)
- Original packaging must be retained

#### 4. Lost or Missing Shipments

- If your shipment is lost in transit and cannot be located within 30 days, we will issue a full refund.
- Tracking information will be used to verify loss.
- Refund includes product cost and shipping fees.

### Non-Refundable Items

The following are **not eligible for refunds**:

- Products damaged due to misuse or improper handling after delivery
- Products with tampered or broken seals (cosmetics, electronics, food items)
- Perishable goods
- Custom-made or personalized items
- Products purchased during clearance or final sale events (unless defective)
- Change of mind after product has been shipped internationally

### Service Fees

- **Tomame service fees** (sourcing, handling, and logistics coordination) are non-refundable once product procurement has begun.
- **Shipping fees** are refundable only if the shipment was not dispatched or is lost in transit.
- **Payment processing fees** (Mobile Money, credit card fees) are non-refundable.

### How to Request a Refund

1. **Contact our customer support team:**
   - Email: [support@tomame.ca](mailto:support@tomame.ca)
   - WhatsApp: +233 XX XXX XXXX
   - Website: [tomame.ca/contact](/contact)
2. **Provide the following information:**
   - Order number
   - Reason for refund request
   - Photographic evidence (if applicable for damaged/defective items)
3. **Await review:**
   - Our team will review your request within 2 business days.
   - You will receive email confirmation of approval or denial.
   - If additional information is needed, we will contact you.
4. **Receive your refund:**
   - Approved refunds are processed within 5–10 business days.
   - Refunds are issued to your original payment method (Mobile Money account or card).
   - You will receive confirmation once the refund has been processed.

### Refund Timeline

| Scenario | Processing Time |
| --- | --- |
| Cancellation before purchase | 3–5 business days |
| Damaged/defective item | 5–10 business days after verification |
| Cancellation after purchase (return to retailer) | 10–15 business days after return |
| Lost shipment | 7–10 business days after loss confirmed |

### Exchanges

We do not offer direct exchanges. If you wish to exchange an item:

1. Request a refund for the original item (subject to this policy).
2. Place a new order for the desired item.

### Disputes

If you believe your refund request was unfairly denied:

1. Contact our customer service manager at [support@tomame.ca](mailto:support@tomame.ca).
2. Provide your case number and detailed explanation.
3. We will conduct a secondary review within 3–5 business days.

### Changes to This Policy

Tomame reserves the right to update this Refund Policy at any time. Changes will be posted on this page with an updated "Last Updated" date. Continued use of our services after changes constitutes acceptance of the revised policy.

### Contact

**Tomame Concierge Ltd.**
Email: [support@tomame.ca](mailto:support@tomame.ca)
Website: [tomame.ca](https://tomame.ca)
Address: 4 Nii Attram Mensah, Accra, Ghana (GS-0211-5741)

_This policy applies to all orders placed through tomame.ca and our customer service channels._$md$,
    'May 18, 2026',
    true
  ),
  (
    'payment',
    'Payment Policy',
    $md$All payments on Tomame are processed securely through **Hubtel**, a licensed Ghanaian payment service provider.

### Accepted Payment Methods

- **MTN Mobile Money**
- **Telecel Cash**
- **AirtelTigo Money**

You pay by approving a PIN prompt sent directly to your mobile money wallet — you are never asked to enter your PIN on our website.

### Currency

All transactions are in **Ghana Cedis (GH₵)**. Exchange rates are sourced from live market data and include a small buffer to account for rate fluctuations during order processing. The rate applied to your order is locked at the time of payment.

### Payment Security

- Your mobile money PIN is never entered on, seen by, or stored on Tomame servers — you enter it only on your own handset.
- All payment pages are served over HTTPS.
- We verify every transaction server-side against Hubtel before confirming an order — a payment is never confirmed from a notification alone.

### Failed Payments

If a payment attempt fails, no charge is made. You may retry immediately using the same or a different mobile money wallet. If you believe you were charged for a failed transaction, contact us at [support@tomame.ca](mailto:support@tomame.ca) with the date and approximate amount — we will investigate within 24 hours.

### Receipts

A payment confirmation email is sent automatically after every successful transaction. If you did not receive it, check your spam folder or contact us and we will resend it.

### Disputes

For any payment dispute, contact us first — we resolve most issues directly and quickly. If a chargeback is initiated through your bank without contacting us, we reserve the right to suspend the account pending investigation.$md$,
    'May 2025',
    false
  )
on conflict (slug) do nothing;
