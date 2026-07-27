# Tomame System Flow - Complete End-to-End Documentation

## 🎯 System Overview

**Tomame** is a concierge shopping platform enabling Ghanaian customers to purchase products from international e-commerce sites (USA, UK, China) with local payment (Mobile Money/Card) and managed delivery.

**Key Principle**: Full pre-payment required before order processing begins.

---

## 📊 Visual System Architecture

```
┌─────────────┐
│   Customer  │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────┐
│         Next.js Frontend                │
│  (Product Submission + Order Tracking)  │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│      Next.js API Routes (Server)        │
│  - Authentication (Supabase Auth)       │
│  - Order Management                     │
│  - Payment Processing                   │
│  - Admin Operations                     │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│      Supabase PostgreSQL + RLS          │
│  - users, orders, payments              │
│  - pricing_config, notifications        │
│  - audit_logs                           │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴───────┐
       ▼               ▼
┌─────────────┐  ┌─────────────┐
│   Hubtel    │  │Email/WhatsApp│
│   Payment   │  │   Services   │
└─────────────┘  └─────────────┘
```

---

## 🔄 Complete User Journey Flow

### **PHASE 1: Customer Registration & Login**

```
┌─ Customer Action ─────────────────────────────────────────┐
│ 1. Visit tomame.com                                       │
│ 2. Click "Sign Up" or "Login"                            │
└───────────────────────────────────────────────────────────┘
                           ↓
┌─ System Action ───────────────────────────────────────────┐
│ 3. Supabase Auth handles authentication                   │
│    - Email + Password                                     │
│    - Email verification sent                              │
│ 4. User record created in database:                       │
│    {                                                      │
│      id: uuid,                                            │
│      email: "customer@example.com",                       │
│      role: "user",                                        │
│      created_at: timestamp                                │
│    }                                                      │
│ 5. Audit log: "user_account_created"                      │
│ 6. Redirect to dashboard                                  │
└───────────────────────────────────────────────────────────┘
```

**Database Changes:**
- ✅ New record in `users` table
- ✅ New record in `audit_logs` table

---

### **PHASE 2: Product Request Submission (with Auto-Extraction)**

```
┌─ Customer Action ─────────────────────────────────────────┐
│ 1. Navigate to "Request Product" page                     │
│ 2. Paste product URL: https://amazon.com/product/xyz      │
│ 3. System validates URL format + supported store domain    │
└───────────────────────────────────────────────────────────┘
                           ↓
┌─ API: POST /api/products/extract ─────────────────────────┐
│ 1. Authenticate user (rate limit: 15 req / 15 min)        │
│ 2. Validate URL against supported_stores table             │
│ 3. Fetch product page (10s timeout, browser-like UA)       │
│ 4. Extract data using priority sources:                    │
│    a. JSON-LD structured data (highest confidence)         │
│    b. Open Graph meta tags (medium confidence)             │
│    c. <title> / meta tags (low confidence)                 │
│    d. Domain → country mapping (e.g. amazon.com → USA)     │
│ 5. Return per-field results with source + confidence:      │
│    {                                                       │
│      fields: {                                             │
│        name:    { value, source, confidence },             │
│        price:   { value, source, confidence, currency },   │
│        image:   { value, source, confidence },             │
│        country: { value, source, confidence }              │
│      },                                                    │
│      extractionSuccess: true/false,                        │
│      errors: [...]                                         │
│    }                                                       │
└────────────────────────────────────────────────────────────┘
                           ↓
┌─ Frontend: Auto-Fill or Manual Entry ─────────────────────┐
│                                                           │
│ IF extraction succeeds (all key fields retrieved):         │
│   → Form auto-fills with extracted data                   │
│   → User confirms details, sets quantity, instructions    │
│   → Order created with needs_review = false               │
│                                                           │
│ IF extraction partially fails (some fields missing):      │
│   → Form auto-fills available fields                      │
│   → Missing fields highlighted for manual entry           │
│   → Order created with needs_review = true                │
│   → review_reasons = ["price_manual_entry", ...]          │
│                                                           │
│ IF extraction completely fails:                           │
│   → Full manual entry form shown                          │
│   → Order created with needs_review = true                │
│   → review_reasons = ["extraction_failed"]                │
│                                                           │
│ NOTE: Extraction never blocks submission — always falls    │
│       back to manual entry on failure.                    │
└───────────────────────────────────────────────────────────┘
                           ↓
┌─ Frontend Validation ─────────────────────────────────────┐
│ - URL format check (valid HTTP/HTTPS)                     │
│ - Domain whitelist (amazon.com, ebay.com, etc.)           │
│ - Required fields present (name, price, country)          │
│ - Origin country must be one of: USA, UK, CHINA           │
└───────────────────────────────────────────────────────────┘
                           ↓
┌─ API: POST /api/orders ───────────────────────────────────┐
│ 1. Extract Supabase session token                         │
│ 2. Verify authentication                                  │
│ 3. Load user record from database                         │
│ 4. Rate limit check (max 5 requests/hour)                 │
│ 5. Validate input data                                    │
│ 6. Calculate pricing server-side                          │
│ 7. Create order record:                                   │
│    {                                                      │
│      id: uuid,                                            │
│      user_id: authenticated_user_id,                      │
│      product_url: "https://amazon.com/product/xyz",       │
│      product_name: "Wireless Headphones",                 │
│      estimated_price_usd: 50,                             │
│      quantity: 1,                                         │
│      origin_country: "USA",                               │
│      status: "pending",                                   │
│      needs_review: true/false,                            │
│      review_reasons: ["price_manual_entry", ...] or [],   │
│      extraction_metadata: { ... },                        │
│      created_at: timestamp                                │
│    }                                                      │
│ 8. Create audit log: "order_created"                      │
│ 9. Return order_id and redirect to pricing page           │
└───────────────────────────────────────────────────────────┘
```

**Database Changes:**
- ✅ New record in `orders` table (status: `pending`, with `needs_review` flag)
- ✅ New record in `audit_logs` table

**Needs Review Triggers:**
- Price was manually entered by customer
- Product name was manually entered
- Extraction completely failed
- Any required field could not be auto-detected

---

### **PHASE 3: Dynamic Pricing Calculation**

```
┌─ System Action ───────────────────────────────────────────┐
│ 1. Retrieve pricing_config for origin country (USA):      │
│    {                                                      │
│      region: "USA",                                       │
│      base_shipping_fee_usd: 25,  (admin-configured)       │
│      exchange_rate: 15.5,  // 1 USD = 15.5 GHS (admin)   │
│      service_fee_percentage: 0.10  // 10% (admin)        │
│    }                                                      │
│                                                           │
│ 2. Calculate pricing (SERVER-SIDE ONLY):                  │
│    estimated_item_price_usd = 50 (user-provided)          │
│    shipping_fee_usd = 25 (from pricing_config)            │
│    service_fee_usd = 50 × 0.10 = 5 (from pricing_config)  │
│    subtotal_usd = 50 + 25 + 5 = 80                        │
│    total_cost_ghs = 80 × 15.5 = 1,240 GHS                │
│                                                           │
│ 3. Return pricing breakdown to frontend                   │
│                                                           │
│ NOTE: The estimated price is what the user saw on the     │
│       product page. Actual price may vary slightly when    │
│       admin purchases. This is an ESTIMATE for payment.    │
│                                                           │
│ ALL PRICING COMPONENTS ARE ADMIN-CONTROLLED:              │
│ ✅ Shipping fee per region (admin sets)                   │
│ ✅ Exchange rate (admin updates regularly)                │
│ ✅ Service fee percentage (admin configures)              │
│ ❌ Item price (user provides estimate)                    │
└───────────────────────────────────────────────────────────┘
                           ↓
┌─ Customer View ───────────────────────────────────────────┐
│ Price Breakdown:                                          │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ Item Estimate:        GHS 775.00  ($50 × 15.5)           │
│ Shipping Fee:         GHS 387.50  ($25 × 15.5)           │
│ Service Fee (10%):    GHS 77.50   ($5 × 15.5)            │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ TOTAL:                GHS 1,240.00                        │
│                                                           │
│ Exchange Rate: 1 USD = 15.5 GHS                          │
│                                                           │
│ [Proceed to Payment]                                      │
└───────────────────────────────────────────────────────────┘
```

**Database Changes:**
- ✅ Order record updated with pricing details

---

### **PHASE 4: Payment Processing**

```
┌─ Customer Action ─────────────────────────────────────────┐
│ 1. Review pricing breakdown                               │
│ 2. Click "Proceed to Payment"                            │
└───────────────────────────────────────────────────────────┘
                           ↓
┌─ API: POST /api/payments/initialize ──────────────────────┐
│ Body: { orderId, msisdn, channel }                        │
│ 1. Authenticate user                                      │
│ 2. Normalise msisdn (+233…/233…/0… → 0XXXXXXXXX)          │
│ 3. Verify order exists, is owned by user, status='pending'│
│ 4. Resolve any active attempt (see "Retries" below)       │
│ 5. Recalculate total (server-side verification)           │
│ 6. Create payment record:                                 │
│    {                                                      │
│      id: uuid,                                            │
│      user_id: user_id,                                    │
│      amount: 124000,      // pesewas (GHS × 100)          │
│      currency: "GHS",                                     │
│      status: "pending",                                   │
│      reference: "TOM_" + timestamp + "_" + random,        │
│      channel: "mtn-gh",                                   │
│      customer_msisdn: "0244000000",                       │
│      metadata: { order_id },                              │
│      created_at: timestamp                                │
│    }                                                      │
│ 7. Send the Hubtel Receive Money Prompt:                  │
│    POST https://rmp.hubtel.com/merchantaccount/           │
│         merchants/:merchantAccountNumber/receive/mobilemoney │
│    Authorization: Basic base64(API_ID:API_KEY)            │
│    Idempotency-Key: TOM_1234567890_ABC                    │
│    {                                                      │
│      Amount: 1240.00,   // GHS decimal, NOT pesewas       │
│      Channel: "mtn-gh",                                   │
│      CustomerMsisdn: "0244000000",                        │
│      CustomerName: "Ama Mensah",                          │
│      CustomerEmail: "customer@example.com",               │
│      Description: "Tomame order …",                       │
│      ClientReference: "TOM_1234567890_ABC",               │
│      PrimaryCallbackUrl:                                  │
│        "https://tomame.com/api/payments/webhook/hubtel/<SECRET>" │
│    }                                                      │
│ 8. Hubtel responds:                                       │
│    { ResponseCode: "0001",  // ACCEPTED — not yet paid    │
│      Data: { TransactionId: "…" } }                       │
│    ResponseCode 0001/0005 → pending, 0000 → settled,      │
│    anything else → failed (payment marked failed, 502)    │
│ 9. Return { payment, status: "pending", message }         │
│    NOTE: there is no redirect and no authorization_url.   │
└───────────────────────────────────────────────────────────┘
                           ↓
┌─ Customer Action ─────────────────────────────────────────┐
│ 1. A PIN prompt appears on the customer's handset         │
│ 2. Customer enters their mobile money PIN to approve      │
│    (MTN MoMo, Telecel Cash, or AirtelTigo Money)          │
│ 3. Meanwhile the checkout screen polls                    │
│    GET /api/payments/status?reference=TOM_XXX every 4s    │
│ 4. Prompt expires on the handset after ~5 minutes         │
└───────────────────────────────────────────────────────────┘
                           ↓
┌─ Settlement: verifyAndSettlePayment(reference) ───────────┐
│ THE ONLY place a payment status may be written.           │
│ Reached from three callers — the Hubtel callback, the     │
│ customer's status poll, and the admin "Sync with Hubtel"  │
│ button — all of which go through this same function.      │
│                                                           │
│ 1. Load payment by reference                              │
│ 2. If already success/failed → return unchanged (final)   │
│ 3. Ask Hubtel where the money actually is:                │
│    GET https://api-txnstatus.hubtel.com/transactions/     │
│        :merchantAccountNumber/status?clientReference=:ref │
│    Authorization: Basic base64(API_ID:API_KEY)            │
│                                                           │
│ 4. Hubtel response:                                       │
│    {                                                      │
│      responseCode: "0000",                                │
│      data: {                                              │
│        status: "Paid",       // ONLY "Paid" is success    │
│        transactionId: "…",                                │
│        amount: 1240.00,                                   │
│        date: "2024-01-15T10:30:00Z"                       │
│      }                                                    │
│    }                                                      │
│    "Pending"/code 0001/0005 → stay pending, no write      │
│    "Unpaid"/"Refunded"/unknown → failed                   │
│                                                           │
│ 5. IF Paid:                                               │
│    a. Reject underpayment (reported < order total → fail) │
│    b. COMPARE-AND-SWAP the status:                        │
│         UPDATE payments SET status='success'              │
│          WHERE id=:id AND status='pending'                │
│       Zero rows matched → another caller already won;     │
│       return without side effects. This is what keeps a   │
│       racing callback + poll from double-emailing.        │
│    c. Link order → status = "paid"                        │
│    d. Create audit log: "payment_successful" +            │
│       "order_status_changed"                              │
│    e. Queue notifications + order status email            │
│                                                           │
│ 6. IF failed:                                             │
│    a. Same compare-and-swap to status = "failed"          │
│    b. Keep order status: "pending"                        │
│    c. Create audit log: "payment_failed"                  │
└───────────────────────────────────────────────────────────┘
```

**Retries:** a customer who declines or ignores the prompt is not locked out.
`initializePayment` re-verifies any active attempt first: a still-live prompt
(< 5 min) returns 409, an expired or failed one is closed out so a fresh
attempt can start, and an already-paid order returns 409.

**Database Changes:**
- ✅ New record in `payments` table (status: `success` or `failed`)
- ✅ Order record updated (status: `paid` if successful)
- ✅ New records in `audit_logs` table
- ✅ New records in `notifications` table (status: `pending`)

---

### **PHASE 5: Webhook Verification (Backup)**

```
┌─ Hubtel Callback: POST /api/payments/webhook/hubtel/<SECRET> ─┐
│ 1. Receive the callback Hubtel sends to PrimaryCallbackUrl    │
│                                                               │
│ 2. Authenticate it. Hubtel does NOT sign its callbacks —      │
│    there is no HMAC to verify. Authenticity rests on:         │
│    a. The unguessable HUBTEL_CALLBACK_SECRET in the URL path, │
│       compared in constant time; a mismatch returns 404 so a  │
│       prober cannot confirm the route exists.                 │
│    b. Never trusting the body for the status.                 │
│                                                               │
│ 3. Payload (used ONLY to learn which transaction changed):    │
│    {                                                          │
│      ResponseCode: "0000",                                    │
│      Data: {                                                  │
│        ClientReference: "TOM_1234567890_ABC",                 │
│        TransactionId: "…",                                    │
│        Amount: 1240.00                                        │
│      }                                                        │
│    }                                                          │
│                                                               │
│ 4. Look up the payment by ClientReference                     │
│ 5. Already settled → return "Already processed" (idempotent)  │
│ 6. Otherwise call verifyAndSettlePayment(), which re-fetches  │
│    the real status from Hubtel. A forged callback claiming    │
│    success therefore settles nothing.                         │
│ 7. Return 200 OK to Hubtel                                    │
└───────────────────────────────────────────────────────────────┘
```

**Purpose**: Backup verification in case callback fails or user closes browser.

---

### **PHASE 6: Admin Order Review (Flagged Orders)**

```
┌─ Admin Action ────────────────────────────────────────────┐
│ 1. Login to admin dashboard                               │
│    - Supabase Auth with role check                        │
│    - Only role = 'admin' can access                       │
│ 2. Navigate to "Orders Needing Review" section            │
│    GET /api/admin/orders?needsReview=true                 │
└───────────────────────────────────────────────────────────┘
                           ↓
┌─ Admin View: Flagged Orders ─────────────────────────────┐
│ Orders Needing Review                                     │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ #042  amazon.com   GHS 1,240   REVIEW                    │
│  → Price was manually entered by customer                 │
│  → Product name was manually entered                      │
│                                                           │
│ #045  ebay.co.uk   GHS 890     REVIEW                    │
│  → Automatic extraction failed entirely                   │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
└───────────────────────────────────────────────────────────┘
                           ↓
┌─ Admin Reviews Flagged Order ────────────────────────────┐
│ Order #042 — Needs Review                                 │
│                                                           │
│ Product URL: https://amazon.com/dp/B09XS7JWHH            │
│ [Open Product Page →]                                     │
│                                                           │
│ FIELD            VALUE                SOURCE              │
│ ─────────────────────────────────────────────────         │
│ Product Name     Wireless Headphones  User-provided       │
│ Price (USD)      $50.00               User-provided       │
│ Image            (none provided)      —                   │
│ Origin Country   USA                  Auto-detected       │
│                                                           │
│ Review Reasons:                                           │
│  - Price was manually entered by customer                 │
│  - Product name was manually entered                      │
│                                                           │
│ Extraction Metadata: { ... } (raw extraction results)     │
│                                                           │
│ Admin Actions:                                            │
│ [Approve]  [Edit & Approve]  [Reject]                    │
└───────────────────────────────────────────────────────────┘
                           ↓
┌─ API: POST /api/admin/orders/:id/review ─────────────────┐
│                                                           │
│ APPROVE:                                                  │
│ 1. Optionally apply admin corrections (name, price, etc.) │
│ 2. Set needs_review = false                               │
│ 3. Set reviewed_by = admin_id, reviewed_at = now()        │
│ 4. Audit log: "order_review_approved"                     │
│ 5. Order proceeds normally through payment/processing     │
│                                                           │
│ REJECT:                                                   │
│ 1. Set status = "cancelled", needs_review = false         │
│ 2. Set reviewed_by = admin_id, reviewed_at = now()        │
│ 3. Audit log: "order_review_rejected" with reason         │
│ 4. Customer is notified and can resubmit                  │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

**Database Changes:**
- ✅ Order record updated (`needs_review`, `reviewed_by`, `reviewed_at`, optionally corrected fields)
- ✅ New record in `audit_logs` table

**Key Principle:** Orders where extraction succeeded fully (needs_review = false) skip this phase entirely and proceed directly to payment → admin purchase.

---

### **PHASE 7: Admin Order Processing (Paid Orders)**

```
┌─ Admin Action ────────────────────────────────────────────┐
│ 1. Navigate to "Paid Orders" page                         │
│    GET /api/admin/orders?status=paid                      │
└───────────────────────────────────────────────────────────┘
                           ↓
┌─ Admin View ──────────────────────────────────────────────┐
│ Paid Orders (Status: paid)                                │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ Order ID    Customer         Product           Amount     │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ #001        john@email.com   Headphones        GHS 1,240  │
│ #002        jane@email.com   Laptop            GHS 8,500  │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
└───────────────────────────────────────────────────────────┘
                           ↓
┌─ Admin Action ────────────────────────────────────────────┐
│ 1. Click on Order #001 to view details                    │
│ 2. Review order information:                              │
│    - Customer: john@email.com                             │
│    - Product Name: Wireless Headphones                    │
│    - Product Image: [Display image from URL]              │
│    - Product URL: https://amazon.com/product/xyz          │
│    - Estimated Price: $50                                 │
│    - Quantity: 1                                          │
│    - Origin: USA                                          │
│    - Special Instructions: "Black color preferred"        │
│    - Amount Paid: GHS 1,240                               │
│    - Payment Date: 2024-01-15 10:30 AM                   │
│    - Review Status: Approved / Not flagged                │
│                                                           │
│ 3. Admin clicks product URL to open in new tab            │
│    → Views actual product on Amazon                       │
│    → Verifies product details match customer request      │
│                                                           │
│ 4. Admin manually purchases product from Amazon           │
│    → Uses company credit card                             │
│    → Arranges shipping to Ghana warehouse                 │
│                                                           │
│ 5. Admin clicks "Mark as Processing"                      │
└───────────────────────────────────────────────────────────┘
                           ↓
┌─ API: PATCH /api/admin/orders/:id ───────────────────────┐
│ 1. Authenticate admin                                     │
│ 2. Verify role = 'admin'                                  │
│ 3. Validate status transition (paid → processing)         │
│ 4. Update order record:                                   │
│    - status = "processing"                                │
│ 5. Create audit log:                                      │
│    {                                                      │
│      action: "order_status_changed",                      │
│      actor_id: admin_id,                                  │
│      actor_role: "admin",                                 │
│      entity_type: "order",                                │
│      entity_id: order_id,                                 │
│      metadata: {                                          │
│        from: "paid",                                      │
│        to: "processing"                                   │
│      }                                                    │
│    }                                                      │
│ 6. Queue notifications:                                   │
│    - Email to customer: "Order is being processed"        │
│    - WhatsApp to customer (optional)                      │
└───────────────────────────────────────────────────────────┘
```

**Database Changes:**
- ✅ Order record updated (status: `processing`)
- ✅ New record in `audit_logs` table
- ✅ New record in `notifications` table

**Admin Workflow Summary:**
1. Admin reviews flagged orders first (Phase 6) — approves, edits, or rejects
2. Admin sees paid orders in dashboard
3. Admin clicks order to view full details
4. Admin sees product URL as clickable link
5. Admin clicks URL → Opens product page in new tab
6. Admin verifies product details
7. Admin purchases product manually
8. Admin marks order as "Processing"
9. Customer receives notification

---

### **PHASE 8: Order Status Updates**

```
┌─ Admin Updates Order Through Lifecycle ───────────────────┐
│                                                           │
│ 1. Item arrives at Ghana warehouse:                       │
│    Admin clicks "Mark as In Transit"                      │
│    → Order status: "in_transit"                           │
│    → Notification sent to customer                        │
│    → Can add tracking number                              │
│                                                           │
│ 2. Item delivered to customer:                            │
│    Admin clicks "Mark as Delivered"                       │
│    → Order status: "delivered"                            │
│    → Final notification sent                              │
│    → Order lifecycle complete                             │
│                                                           │
│ Each status change:                                       │
│ - Creates audit log                                       │
│ - Queues customer notification                            │
│ - Updates order timestamp                                 │
└───────────────────────────────────────────────────────────┘
```

---

### **PHASE 9: Customer Order Tracking**

```
┌─ Customer Action ─────────────────────────────────────────┐
│ 1. Login to dashboard                                     │
│ 2. Navigate to "My Orders"                                │
└───────────────────────────────────────────────────────────┘
                           ↓
┌─ Customer View ───────────────────────────────────────────┐
│ My Orders                                                 │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ Order #001                                                │
│ Wireless Headphones                                       │
│ Status: 🔄 In Transit                                     │
│ Amount: GHS 1,240                                         │
│ Date: Jan 15, 2024                                        │
│ [View Details]                                            │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
└───────────────────────────────────────────────────────────┘
                           ↓
┌─ Order Details View ──────────────────────────────────────┐
│ Order #001 - Wireless Headphones                          │
│                                                           │
│ Order Timeline:                                           │
│ ✅ Paid              Jan 15, 10:30 AM                     │
│ ✅ Processing        Jan 15, 2:00 PM                      │
│ 🔄 In Transit        Jan 18, 9:00 AM (Current)           │
│ ⏳ Delivered         Estimated: Jan 25                    │
│                                                           │
│ Product Details:                                          │
│ - Name: Wireless Headphones                               │
│ - URL: amazon.com/product/xyz                             │
│ - Quantity: 1                                             │
│                                                           │
│ Payment Details:                                          │
│ - Amount: GHS 1,240.00                                    │
│ - Method: Mobile Money                                    │
│ - Reference: TOM_1234567890_ABC                           │
│                                                           │
│ Tracking: TRK123456789 (if available)                     │
└───────────────────────────────────────────────────────────┘
```

---

### **PHASE 10: Notification Delivery (Background)**

```
┌─ Cron Job: Every 30 seconds ──────────────────────────────┐
│ 1. Query notifications table:                             │
│    SELECT * FROM notifications                            │
│    WHERE status = 'pending'                               │
│    ORDER BY created_at ASC                                │
│    LIMIT 10                                               │
│                                                           │
│ 2. For each notification:                                 │
│    a. Update status to 'processing'                       │
│    b. Determine channel (email or whatsapp)               │
│                                                           │
│    IF channel = 'email':                                  │
│      - Format email template with payload data            │
│      - Send via email service (Resend/SendGrid)           │
│      - IF success:                                        │
│          status = 'sent'                                  │
│          sent_at = now()                                  │
│      - IF failed:                                         │
│          status = 'failed'                                │
│          retry_count++                                    │
│                                                           │
│    IF channel = 'whatsapp':                               │
│      - Format WhatsApp message                            │
│      - Send via WhatsApp Business API or Twilio           │
│      - IF success:                                        │
│          status = 'sent'                                  │
│          sent_at = now()                                  │
│      - IF failed:                                         │
│          status = 'failed'                                │
│          retry_count++                                    │
│                                                           │
│ 3. Failed notifications:                                  │
│    - Retry up to 3 times                                  │
│    - Exponential backoff: 1min, 5min, 15min              │
│    - After 3 failures: mark as 'failed' permanently       │
└───────────────────────────────────────────────────────────┘
```

---

### **PHASE 11: Admin Pricing Configuration**

```
┌─ Admin Action ────────────────────────────────────────────┐
│ 1. Navigate to "Pricing Configuration"                    │
│ 2. View current rates for all regions                     │
└───────────────────────────────────────────────────────────┘
                           ↓
┌─ Admin View ──────────────────────────────────────────────┐
│ Pricing Configuration                                     │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ USA                                                       │
│ - Shipping Fee: $25                                       │
│ - Exchange Rate: 1 USD = 15.5 GHS                        │
│ - Service Fee: 10%                                        │
│ [Edit]                                                    │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ UK                                                        │
│ - Shipping Fee: £20                                       │
│ - Exchange Rate: 1 GBP = 19.2 GHS                        │
│ - Service Fee: 10%                                        │
│ [Edit]                                                    │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ CHINA                                                     │
│ - Shipping Fee: ¥15                                       │
│ - Exchange Rate: 1 CNY = 2.2 GHS                         │
│ - Service Fee: 10%                                        │
│ [Edit]                                                    │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                           │
│ NOTE: Service fee is a percentage of the item price       │
│       Admin can set different percentages per region       │
│       or use a global percentage for all regions           │
└───────────────────────────────────────────────────────────┘
                           ↓
┌─ Admin Action ────────────────────────────────────────────┐
│ 1. Click "Edit" for USA                                   │
│ 2. Update values:                                         │
│    - Exchange Rate: 15.5 → 16.0                          │
│ 3. Click "Save Changes"                                   │
└───────────────────────────────────────────────────────────┘
                           ↓
┌─ API: PATCH /api/admin/pricing/USA ───────────────────────┐
│ 1. Authenticate admin                                     │
│ 2. Verify role = 'admin'                                  │
│ 3. Validate input (positive numbers)                      │
│ 4. Update pricing_config record:                          │
│    {                                                      │
│      region: "USA",                                       │
│      base_shipping_fee_usd: 25,                           │
│      exchange_rate: 16.0,  // UPDATED                    │
│      service_fee_percentage: 0.10,                        │
│      last_updated: now(),                                 │
│      updated_by: admin_id                                 │
│    }                                                      │
│ 5. Create audit log:                                      │
│    {                                                      │
│      action: "pricing_updated",                           │
│      actor_role: "admin",                                 │
│      metadata: {                                          │
│        region: "USA",                                     │
│        old_exchange_rate: 15.5,                           │
│        new_exchange_rate: 16.0                            │
│      }                                                    │
│    }                                                      │
└───────────────────────────────────────────────────────────┘
```

**Database Changes:**
- ✅ `pricing_config` record updated
- ✅ New record in `audit_logs` table

**Impact**: All new orders will use the updated exchange rate.

---

## 🔐 Security Flow (Every API Request)

```
┌─ API Request Received ────────────────────────────────────┐
│ 1. Extract Supabase session token from headers            │
│ 2. Verify token with Supabase Auth                        │
│ 3. IF invalid: return 401 Unauthorized                     │
│ 4. Load user record from database                         │
│ 5. Check user role (user/admin)                           │
│ 6. Enforce RLS policies:                                  │
│    - Users: can only access their own data                │
│    - Admins: can access all data                          │
│ 7. Validate request permissions                           │
│ 8. Execute business logic                                 │
│ 9. IF critical action: create audit log                   │
│ 10. Return response                                       │
└───────────────────────────────────────────────────────────┘
```

---

## 📊 State Machine Summary

```
ORDER STATES:
pending_payment → paid → processing → in_transit → delivered
                   ↓
               cancelled (only if payment fails)

PAYMENT STATES:
pending → success
pending → failed

NOTIFICATION STATES:
pending → sent
pending → failed (after 3 retries)
```

---

## 🚨 Error Handling & Edge Cases

| Scenario | System Behavior |
|----------|----------------|
| Payment timeout | Order remains `pending_payment`, customer can retry |
| Duplicate callback | Idempotent handling, no duplicate updates |
| Invalid product URL | Rejected at submission, domain whitelist enforced |
| Rate limit exceeded | 429 error, customer must wait |
| Notification failure | Retry 3 times with exponential backoff |
| Admin wrong status update | Audit log tracks all changes, can be corrected |
| Product page blocks extraction (403) | Fall back to manual entry, order flagged `needs_review` |
| Extraction timeout (>10s) | Fall back to manual entry, order flagged `needs_review` |
| Partial extraction (some fields missing) | Auto-fill available fields, user completes rest, order flagged |
| Price in non-USD currency | Logged in extraction metadata, user confirms USD estimate |
| Admin rejects flagged order | Order cancelled, customer notified to resubmit |

---

## ✅ Success Metrics

- ✅ Customer can submit product request in < 2 minutes
- ✅ Payment processing completes in < 30 seconds
- ✅ Order status updates in real-time
- ✅ Notifications delivered within 1 minute
- ✅ Admin can process orders without technical knowledge
- ✅ All financial transactions are audited
- ✅ System handles 100+ concurrent users

---

**This flow is production-ready, secure, auditable, and contract-compliant.** 🚀

