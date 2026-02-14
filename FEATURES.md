# Feature List - International Shopping Platform

> **For Linear/GitHub Issue Tracking**
> Features are organized by MVP (Phase 1) and Future Enhancements

---

## 🚀 MVP - Phase 1 (Contract Required)

### 1. Authentication & User Management (MVP)
- [ ] User registration and login (Supabase Auth)
- [ ] Email verification
- [ ] Password reset flow (1-hour expiry)
- [ ] Change password (authenticated users)
- [ ] Role-based access control (user/admin)
- [ ] Admin user promotion
- [ ] Admin user creation
- [ ] Admin-initiated password reset

### 2. Product Quote Submission (MVP)
- [ ] Manual product link submission form
- [ ] Product details input (name, image URL, estimated price)
- [ ] Origin country selection (USA/UK/CHINA)
- [ ] Quantity selection
- [ ] Special instructions field
- [ ] URL validation and domain checking

### 3. Dynamic Pricing System (MVP)
- [ ] Server-side pricing calculation
- [ ] Admin-configurable shipping rates by region
- [ ] Admin-configurable exchange rates (USD/GHS, GBP/GHS, CNY/GHS)
- [ ] Admin-configurable service fee percentage
- [ ] Real-time price breakdown display

### 4. Payment Integration - Paystack (MVP)
- [ ] Full pre-payment requirement
- [ ] Mobile Money (MoMo) support
- [ ] Card payment support
- [ ] Server-side payment verification
- [ ] Payment status tracking (pending/success/failed)
- [ ] Payment record creation
- [ ] Secure payment flow (no card data storage)

### 5. Order Management (MVP)
- [ ] Order creation on quote submission
- [ ] Order lifecycle state machine (pending_payment → paid → processing → in_transit → delivered)
- [ ] Order cancellation (payment failed only)
- [ ] Order status updates (admin-driven)
- [ ] Order history view (user)
- [ ] All orders view (admin)
- [ ] Order details with pricing breakdown

### 6. Order Tracking (MVP)
- [ ] Real-time order status display
- [ ] Order reference tracking
- [ ] Status timeline view

### 7. Admin Dashboard (MVP)
- [ ] Order management panel
- [ ] User management panel
- [ ] Pricing configuration interface
- [ ] Shipping rate management
- [ ] Exchange rate management
- [ ] Service fee configuration
- [ ] Order status update controls

### 8. Notification System (MVP)
- [ ] Email notifications (default channel)
- [ ] Payment event notifications (initialized/successful/failed)
- [ ] Order event notifications (created/paid/processing/completed/cancelled)
- [ ] Admin notifications for new orders
- [ ] Notification outbox pattern implementation
- [ ] Asynchronous notification delivery
- [ ] Notification status tracking (pending/sent/failed)

### 9. Database Schema (MVP)
- [ ] Users table with RLS
- [ ] Orders table with RLS
- [ ] Payments table with RLS
- [ ] Pricing_config table (admin-only)
- [ ] Notifications table with RLS
- [ ] Database migrations system
- [ ] RLS policies implementation

### 10. Core API Endpoints (MVP)
- [ ] POST /api/auth/forgot-password
- [ ] POST /api/auth/reset-password
- [ ] POST /api/auth/change-password
- [ ] POST /api/admin/users/reset-password
- [ ] POST /api/admin/users/promote
- [ ] POST /api/admin/users/create-admin
- [ ] POST /api/orders (create order)
- [ ] GET /api/orders (list user orders)
- [ ] GET /api/orders/:id (order details)
- [ ] PATCH /api/admin/orders/:id/status (update status)
- [ ] POST /api/payments/initialize
- [ ] POST /api/payments/verify
- [ ] GET /api/admin/pricing-config
- [ ] PUT /api/admin/pricing-config

### 11. Core Security (MVP)
- [ ] Row Level Security (RLS) on all tables
- [ ] Server-only sensitive operations
- [ ] Environment variable validation
- [ ] Input validation and sanitization
- [ ] No client-side money calculations
- [ ] Secure token generation
- [ ] SSL/TLS enforcement

### 12. UI/UX Essentials (MVP)
- [ ] Mobile responsive design
- [ ] Page load time < 3 seconds
- [ ] Intuitive quote submission form
- [ ] Clear pricing breakdown display
- [ ] Order tracking interface
- [ ] Admin dashboard interface
- [ ] Settings page (password change)
- [ ] Error handling and user feedback

### 13. Technical Foundation (MVP)
- [ ] Next.js App Router implementation
- [ ] Supabase integration
- [ ] TypeScript strict mode
- [ ] Separation of concerns (API/Services/DB layers)
- [ ] Idempotent operations
- [ ] Asynchronous side effects
- [ ] Structured logging
- [ ] Error handling discipline

---

## 🔮 Future Enhancements (Post-MVP)

### Advanced Notifications
- [ ] WhatsApp notifications (optional)
- [ ] SMS notifications
- [ ] Push notifications
- [ ] Notification preferences per user

### Enhanced Order Tracking
- [ ] Estimated delivery date display
- [ ] Tracking information display
- [ ] Real-time shipping updates
- [ ] Delivery photo proof

### Background Jobs & Processing
- [ ] Cron-based job worker
- [ ] Job queue system (queued → running → completed/failed)
- [ ] Notification delivery jobs
- [ ] Job status tracking
- [ ] Job retry logic (bounded)
- [ ] One active job per order enforcement

### Audit & Compliance
- [ ] Audit log system (append-only)
- [ ] Authentication event logging
- [ ] Payment event logging
- [ ] Order state transition logging
- [ ] Admin action logging
- [ ] Role change logging
- [ ] Pricing change logging
- [ ] Admin-only audit log access
- [ ] Audit_logs table (admin read-only)

### Advanced Security
- [ ] Rate limiting
- [ ] Domain allowlist for product URLs
- [ ] CAPTCHA on submission
- [ ] Advanced fraud detection
- [ ] IP-based restrictions

### Enhanced Pricing
- [ ] Pricing audit trail
- [ ] Quote expiration enforcement
- [ ] Dynamic pricing rules
- [ ] Bulk order discounts

### Analytics & Reporting
- [ ] Order analytics dashboard
- [ ] Revenue reports
- [ ] Customer insights
- [ ] Popular products tracking
- [ ] Conversion rate tracking

### Customer Experience
- [ ] Order reviews and ratings
- [ ] Saved addresses
- [ ] Favorite products
- [ ] Order templates
- [ ] Referral system

---

## ❌ Explicitly Excluded (Not in Scope)

- ❌ Automated product price scraping
- ❌ Volumetric weight calculations
- ❌ Customer wallet functionality
- ❌ Mobile applications (iOS/Android)
- ❌ Advanced analytics dashboards
- ❌ AI/recommendation systems
- ❌ Multi-language support

---

## 📋 Contract Compliance Checklist

- [ ] Full pre-payment before processing
- [ ] Admin-configurable pricing (no code changes)
- [ ] Order lifecycle tracking
- [ ] Automated notifications (Email + WhatsApp)
- [ ] Paystack integration (MoMo + Card)
- [ ] Admin dashboard
- [ ] SSL enabled
- [ ] No card data storage
- [ ] Role-based admin access
- [ ] Mobile responsive
- [ ] Password reset functionality
- [ ] Admin user management

---

## 🏷️ Linear/GitHub Labels

### Priority
- **P0 - Critical**: Auth, payments, order creation, pricing
- **P1 - High**: Admin dashboard, notifications, order tracking
- **P2 - Medium**: Audit logs, enhanced security, UI polish
- **P3 - Low**: Nice-to-have features, optimizations

### Phase
- **MVP**: Required for Phase 1 launch
- **Future**: Post-MVP enhancements
- **Excluded**: Out of scope

### Type
- **Feature**: New functionality
- **Bug**: Issues and fixes
- **Security**: Security-related tasks
- **Tech Debt**: Refactoring and improvements

