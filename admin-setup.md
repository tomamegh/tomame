# Admin User Setup Guide

## Creating the First Admin User

Since the system requires an admin to manage orders and pricing, you need to create the first admin user manually.

---

## Option 1: Database Direct Insert (Recommended for First Admin)

### Step 1: Create User via Supabase Auth Dashboard

1. Go to Supabase Dashboard → Authentication → Users
2. Click "Add User"
3. Enter:
   - Email: `admin@tomame.com`
   - Password: (generate secure password)
   - Auto Confirm User: ✅ Yes
4. Copy the generated `user_id` (UUID)

### Step 2: Insert Admin Record in Database

Run this SQL in Supabase SQL Editor:

```sql
-- Insert admin user record
INSERT INTO users (id, email, role, created_at)
VALUES (
  'paste-user-id-here',  -- Replace with UUID from Step 1
  'admin@tomame.com',
  'admin',
  NOW()
);

-- Create audit log
INSERT INTO audit_logs (actor_id, actor_role, action, entity_type, entity_id, created_at)
VALUES (
  'paste-user-id-here',  -- Same UUID
  'system',
  'admin_user_created',
  'user',
  'paste-user-id-here',  -- Same UUID
  NOW()
);
```

### Step 3: Verify Admin Access

1. Login with admin credentials
2. System should recognize role = 'admin'
3. Admin dashboard should be accessible

---

## Option 2: Seed Script (For Development)

Create a seed script: `db/seeds/create-admin.ts`

```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY! // Service role key

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function createFirstAdmin() {
  try {
    // 1. Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: 'admin@tomame.com',
      password: 'SecurePassword123!', // Change this
      email_confirm: true
    })

    if (authError) throw authError
    
    const userId = authData.user.id
    console.log('✅ Auth user created:', userId)

    // 2. Insert user record with admin role
    const { error: userError } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        email: 'admin@tomame.com',
        role: 'admin'
      })

    if (userError) throw userError
    console.log('✅ Admin user record created')

    // 3. Create audit log
    const { error: auditError } = await supabase
      .from('audit_logs')
      .insert({
        actor_id: userId,
        actor_role: 'system',
        action: 'admin_user_created',
        entity_type: 'user',
        entity_id: userId
      })

    if (auditError) throw auditError
    console.log('✅ Audit log created')

    console.log('\n🎉 First admin user created successfully!')
    console.log('Email: admin@tomame.com')
    console.log('Password: SecurePassword123!')
    console.log('\n⚠️  IMPORTANT: Change the password after first login!')

  } catch (error) {
    console.error('❌ Error creating admin:', error)
  }
}

createFirstAdmin()
```

Run with:
```bash
npx tsx db/seeds/create-admin.ts
```

---

## Option 3: API Endpoint (One-Time Setup)

Create a protected setup endpoint: `app/api/setup/admin/route.ts`

```typescript
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  // CRITICAL: Only allow this in development or with secret token
  const setupToken = request.headers.get('x-setup-token')
  
  if (setupToken !== process.env.SETUP_SECRET_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check if admin already exists
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: existingAdmin } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .single()

  if (existingAdmin) {
    return NextResponse.json({ error: 'Admin already exists' }, { status: 400 })
  }

  const { email, password } = await request.json()

  // Create admin user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 })
  }

  const userId = authData.user.id

  // Insert user record
  await supabase.from('profiles').insert({
    id: userId,
    email,
    role: 'admin'
  })

  // Create audit log
  await supabase.from('audit_logs').insert({
    actor_id: userId,
    actor_role: 'system',
    action: 'admin_user_created',
    entity_type: 'user',
    entity_id: userId
  })

  return NextResponse.json({ 
    success: true, 
    message: 'Admin user created',
    userId 
  })
}
```

Call with:
```bash
curl -X POST https://tomame.com/api/setup/admin \
  -H "Content-Type: application/json" \
  -H "x-setup-token: your-secret-token" \
  -d '{"email":"admin@tomame.com","password":"SecurePassword123!"}'
```

**⚠️ IMPORTANT: Delete or disable this endpoint after creating the first admin!**

---

## Option 4: Supabase SQL Function (Most Secure)

Create a SQL function that can only be called once:

```sql
-- Create function to add first admin
CREATE OR REPLACE FUNCTION create_first_admin(
  admin_email TEXT,
  admin_user_id UUID
)
RETURNS VOID AS $$
BEGIN
  -- Check if any admin exists
  IF EXISTS (SELECT 1 FROM users WHERE role = 'admin') THEN
    RAISE EXCEPTION 'Admin user already exists';
  END IF;

  -- Insert admin user
  INSERT INTO users (id, email, role, created_at)
  VALUES (admin_user_id, admin_email, 'admin', NOW());

  -- Create audit log
  INSERT INTO audit_logs (actor_id, actor_role, action, entity_type, entity_id, created_at)
  VALUES (admin_user_id, 'system', 'admin_user_created', 'user', admin_user_id, NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

Usage:
1. Create user in Supabase Auth Dashboard
2. Run: `SELECT create_first_admin('admin@tomame.com', 'user-uuid-here');`

---

## Adding More Admins (After First Admin Exists)

Once you have the first admin, they can promote existing users to admin through the admin panel.

**Two Ways to Add More Admins:**

### Method 1: Promote Existing User (Recommended)

If a user already has an account (registered as a regular user), an admin can promote them:

1. Admin logs into admin panel
2. Navigates to "User Management"
3. Searches for user by email
4. Clicks "Promote to Admin"
5. User role changes from 'user' to 'admin'
6. Action is audited

### Method 2: Create New Admin User

Admin can create a brand new admin user directly:

1. Admin logs into admin panel
2. Navigates to "User Management" → "Create Admin"
3. Enters email and temporary password
4. New user is created with role = 'admin'
5. New admin receives email with login credentials

---

## Admin Panel API Endpoints

### Promote Existing User to Admin

**Endpoint:** `app/api/admin/users/promote/route.ts`

```typescript
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = createRouteHandlerClient({ cookies })

  // 1. Authenticate current user
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Verify current user is admin
  const { data: currentUser } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()

  if (currentUser?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 3. Promote target user to admin
  const { userId } = await request.json()

  const { error } = await supabase
    .from('profiles')
    .update({ role: 'admin' })
    .eq('id', userId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 4. Create audit log
  await supabase.from('audit_logs').insert({
    actor_id: session.user.id,
    actor_role: 'admin',
    action: 'user_promoted_to_admin',
    entity_type: 'user',
    entity_id: userId,
    metadata: { promoted_by: session.user.email }
  })

  return NextResponse.json({ success: true })
}
```

---

### Create New Admin User

**Endpoint:** `app/api/admin/users/create-admin/route.ts`

```typescript
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = createRouteHandlerClient({ cookies })

  // 1. Authenticate current user
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Verify current user is admin
  const { data: currentUser } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()

  if (currentUser?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 3. Create new admin user (requires service role)
  const { email, password } = await request.json()

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 })
  }

  const newUserId = authData.user.id

  // 4. Insert user record with admin role
  const { error: userError } = await supabase
    .from('profiles')
    .insert({
      id: newUserId,
      email,
      role: 'admin'
    })

  if (userError) {
    return NextResponse.json({ error: userError.message }, { status: 500 })
  }

  // 5. Create audit log
  await supabase.from('audit_logs').insert({
    actor_id: session.user.id,
    actor_role: 'admin',
    action: 'admin_user_created',
    entity_type: 'user',
    entity_id: newUserId,
    metadata: { 
      created_by: session.user.email,
      new_admin_email: email
    }
  })

  return NextResponse.json({ 
    success: true,
    userId: newUserId,
    email
  })
}
```

---

## Security Checklist

- ✅ First admin created via secure method (Option 1 or 2)
- ✅ Setup endpoints disabled/deleted after first admin
- ✅ Admin promotion requires existing admin authentication
- ✅ All admin role changes are audited
- ✅ Service role key never exposed to client
- ✅ RLS policies prevent unauthorized role changes

---

## Recommended Approach

**For Production:**
1. Use **Option 1** (Database Direct Insert) for the first admin
2. Implement **Admin Panel User Management** for subsequent admins
3. Never expose setup endpoints in production

**For Development:**
1. Use **Option 2** (Seed Script) for quick setup
2. Add to `.env.local`: `SUPABASE_SERVICE_ROLE_KEY=your-key`
3. Run seed script once

---

## Initial Pricing Configuration

After creating the first admin, they should immediately configure pricing:

```sql
-- Insert default pricing for all regions
INSERT INTO pricing_config (region, base_shipping_fee_usd, exchange_rate, service_fee_percentage, updated_by)
VALUES 
  ('USA', 25.00, 15.50, 0.10, 'admin-user-id-here'),
  ('UK', 20.00, 19.20, 0.10, 'admin-user-id-here'),
  ('CHINA', 15.00, 2.20, 0.10, 'admin-user-id-here');
```

Or via Admin Dashboard after login.

---

**This ensures secure, auditable admin user creation from day one.** 🔐

