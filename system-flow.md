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
│   Paystack  │  │Email/WhatsApp│
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
│ 1. Authenticate user                                      │
│ 2. Verify order exists and status = 'pending_payment'     │
│ 3. Recalculate total (server-side verification)           │
│ 4. Create payment record:                                 │
│    {                                                      │
│      id: uuid,                                            │
│      order_id: order_id,                                  │
│      user_id: user_id,                                    │
│      amount_ghs: 1240.00,                                 │
│      currency: "GHS",                                     │
│      status: "pending",                                   │
│      reference: "TOM_" + timestamp + "_" + random,        │
│      provider: "paystack",                                │
│      created_at: timestamp                                │
│    }                                                      │
│ 5. Initialize Paystack transaction:                       │
│    POST https://api.paystack.co/transaction/initialize    │
│    {                                                      │
│      amount: 124000,  // in pesewas (GHS × 100)          │
│      email: "customer@example.com",                       │
│      reference: "TOM_1234567890_ABC",                     │
│      callback_url: "https://tomame.com/api/payments/callback", │
│      channels: ["mobile_money", "card"]                   │
│    }                                                      │
│ 6. Receive Paystack response:                             │
│    {                                                      │
│      status: true,                                        │
│      data: {                                              │
│        authorization_url: "https://checkout.paystack.com/xyz", │
│        access_code: "xyz123",                             │
│        reference: "TOM_1234567890_ABC"                    │
│      }                                                    │
│    }                                                      │
│ 7. Return authorization_url to frontend                   │
└───────────────────────────────────────────────────────────┘
                           ↓
┌─ Customer Action ─────────────────────────────────────────┐
│ 1. Redirected to Paystack checkout page                   │
│ 2. Select payment method:                                 │
│    - Mobile Money (MTN, Vodafone, AirtelTigo)            │
│    - Card (Visa, Mastercard)                             │
│ 3. Enter payment details                                  │
│ 4. Authorize payment                                      │
└───────────────────────────────────────────────────────────┘
                           ↓
┌─ Paystack Processing ─────────────────────────────────────┐
│ 1. Process payment with selected method                   │
│ 2. Verify transaction                                     │
│ 3. Redirect to callback_url with reference                │
└───────────────────────────────────────────────────────────┘
                           ↓
┌─ API: GET /api/payments/callback?reference=TOM_XXX ───────┐
│ 1. Extract reference from query params                    │
│ 2. Verify transaction with Paystack:                      │
│    GET https://api.paystack.co/transaction/verify/:ref    │
│    Headers: { Authorization: "Bearer SECRET_KEY" }        │
│                                                           │
│ 3. Paystack response:                                     │
│    {                                                      │
│      status: true,                                        │
│      data: {                                              │
│        status: "success",                                 │
│        reference: "TOM_1234567890_ABC",                   │
│        amount: 124000,                                    │
│        paid_at: "2024-01-15T10:30:00Z"                   │
│      }                                                    │
│    }                                                      │
│                                                           │
│ 4. IF status = "success":                                 │
│    a. Update payment record:                              │
│       - status = "success"                                │
│       - paid_at = timestamp                               │
│    b. Update order record:                                │
│       - status = "paid"                                   │
│       - paid_at = timestamp                               │
│    c. Create audit log: "payment_successful"              │
│    d. Queue notifications:                                │
│       - Email to customer (payment confirmation)          │
│       - WhatsApp to customer (optional)                   │
│       - Email to admin (new paid order alert)             │
│    e. Redirect to success page                            │
│                                                           │
│ 5. IF status = "failed":                                  │
│    a. Update payment record: status = "failed"            │
│    b. Keep order status: "pending_payment"                │
│    c. Create audit log: "payment_failed"                  │
│    d. Queue notification: Email to customer               │
│    e. Redirect to failure page                            │
└───────────────────────────────────────────────────────────┘
```

**Database Changes:**
- ✅ New record in `payments` table (status: `success` or `failed`)
- ✅ Order record updated (status: `paid` if successful)
- ✅ New records in `audit_logs` table
- ✅ New records in `notifications` table (status: `pending`)

---

### **PHASE 5: Webhook Verification (Backup)**

```
┌─ Paystack Webhook: POST /api/webhooks/paystack ───────────┐
│ 1. Receive webhook event from Paystack                    │
│ 2. Verify webhook signature:                              │
│    hash = crypto                                          │
│      .createHmac('sha512', PAYSTACK_SECRET_KEY)           │
│      .update(JSON.stringify(req.body))                    │
│      .digest('hex')                                       │
│    if (hash !== req.headers['x-paystack-signature']) {    │
│      return 401 Unauthorized                              │
│    }                                                      │
│                                                           │
│ 3. Extract event data:                                    │
│    {                                                      │
│      event: "charge.success",                             │
│      data: {                                              │
│        reference: "TOM_1234567890_ABC",                   │
│        status: "success",                                 │
│        amount: 124000                                     │
│      }                                                    │
│    }                                                      │
│                                                           │
│ 4. Check if payment already processed (idempotency)       │
│ 5. If not processed, update records (same as callback)    │
│ 6. Return 200 OK to Paystack                              │
└───────────────────────────────────────────────────────────┘
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

