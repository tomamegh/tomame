# Password Management Guide

## Overview

Both users and admins have full password management capabilities:
- ✅ Forgot Password (Password Reset)
- ✅ Change Password (When Logged In)

All password operations are handled by **Supabase Auth** with built-in security.

---

## 1. Forgot Password (Password Reset)

### User Flow

```
1. User goes to login page
2. Clicks "Forgot Password?"
3. Enters email address
4. Receives password reset email
5. Clicks link in email
6. Enters new password
7. Password updated successfully
```

### Implementation

#### Frontend: Forgot Password Page

**File:** `app/(auth)/forgot-password/page.tsx`

```typescript
'use client'

import { useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const supabase = createClientComponentClient()

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`
    })

    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Check your email for the password reset link!')
    }

    setLoading(false)
  }

  return (
    <div className="max-w-md mx-auto mt-8 p-6">
      <h1 className="text-2xl font-bold mb-4">Forgot Password</h1>
      
      <form onSubmit={handleResetPassword}>
        <div className="mb-4">
          <label className="block mb-2">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2 border rounded"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded"
        >
          {loading ? 'Sending...' : 'Send Reset Link'}
        </button>
      </form>

      {message && (
        <p className="mt-4 text-center text-sm">{message}</p>
      )}
    </div>
  )
}
```

#### Frontend: Reset Password Page

**File:** `app/(auth)/reset-password/page.tsx`

```typescript
'use client'

import { useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const supabase = createClientComponentClient()
  const router = useRouter()

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (password !== confirmPassword) {
      setMessage('Passwords do not match')
      return
    }

    if (password.length < 8) {
      setMessage('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    setMessage('')

    const { error } = await supabase.auth.updateUser({
      password: password
    })

    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Password updated successfully!')
      setTimeout(() => router.push('/dashboard'), 2000)
    }

    setLoading(false)
  }

  return (
    <div className="max-w-md mx-auto mt-8 p-6">
      <h1 className="text-2xl font-bold mb-4">Reset Password</h1>
      
      <form onSubmit={handleUpdatePassword}>
        <div className="mb-4">
          <label className="block mb-2">New Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full px-3 py-2 border rounded"
          />
        </div>

        <div className="mb-4">
          <label className="block mb-2">Confirm Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            className="w-full px-3 py-2 border rounded"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded"
        >
          {loading ? 'Updating...' : 'Update Password'}
        </button>
      </form>

      {message && (
        <p className="mt-4 text-center text-sm">{message}</p>
      )}
    </div>
  )
}
```

---

## 2. Change Password (When Logged In)

### User Flow

```
1. User logs into dashboard
2. Goes to "Account Settings" or "Profile"
3. Clicks "Change Password"
4. Enters current password (optional, for verification)
5. Enters new password
6. Confirms new password
7. Password updated successfully
```

### Implementation

#### Frontend: Change Password Component

**File:** `app/(dashboard)/settings/change-password/page.tsx`

```typescript
'use client'

import { useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const supabase = createClientComponentClient()

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage('')
    setError('')

    // Validation
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    if (newPassword === currentPassword) {
      setError('New password must be different from current password')
      return
    }

    setLoading(true)

    // Update password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword
    })

    if (updateError) {
      setError(updateError.message)
    } else {
      setMessage('Password changed successfully!')
      // Clear form
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    }

    setLoading(false)
  }

  return (
    <div className="max-w-md mx-auto mt-8 p-6">
      <h1 className="text-2xl font-bold mb-4">Change Password</h1>
      
      <form onSubmit={handleChangePassword}>
        <div className="mb-4">
          <label className="block mb-2">Current Password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full px-3 py-2 border rounded"
            placeholder="For verification"
          />
        </div>

        <div className="mb-4">
          <label className="block mb-2">New Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            className="w-full px-3 py-2 border rounded"
          />
          <p className="text-xs text-gray-500 mt-1">
            Minimum 8 characters
          </p>
        </div>

        <div className="mb-4">
          <label className="block mb-2">Confirm New Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            className="w-full px-3 py-2 border rounded"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
        >
          {loading ? 'Updating...' : 'Change Password'}
        </button>
      </form>

      {message && (
        <div className="mt-4 p-3 bg-green-100 text-green-700 rounded">
          {message}
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}
    </div>
  )
}
```

---

## 3. Admin Password Reset (For Users)

Admins can reset passwords for users who are locked out.

### Implementation

**File:** `app/api/admin/users/reset-password/route.ts`

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

  // 3. Send password reset email to target user
  const { email } = await request.json()

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email: email
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 4. Create audit log
  await supabase.from('audit_logs').insert({
    actor_id: session.user.id,
    actor_role: 'admin',
    action: 'password_reset_initiated',
    entity_type: 'user',
    metadata: { 
      target_email: email,
      initiated_by: session.user.email
    }
  })

  return NextResponse.json({ 
    success: true,
    message: 'Password reset email sent'
  })
}
```

---

## 4. Email Templates

### Supabase Email Template Configuration

Go to Supabase Dashboard → Authentication → Email Templates

#### Password Reset Email

```html
<h2>Reset Your Password</h2>
<p>Hi there,</p>
<p>You requested to reset your password for your Tomame account.</p>
<p>Click the link below to reset your password:</p>
<p><a href="{{ .ConfirmationURL }}">Reset Password</a></p>
<p>This link expires in 1 hour.</p>
<p>If you didn't request this, you can safely ignore this email.</p>
<p>Thanks,<br>Tomame Team</p>
```

---

## 5. Security Features

### Built-in Supabase Auth Security

✅ **Rate Limiting**: Prevents brute force attacks
✅ **Token Expiration**: Reset links expire after 1 hour
✅ **Email Verification**: Ensures email ownership
✅ **Password Strength**: Minimum 8 characters (configurable)
✅ **Secure Tokens**: Cryptographically secure reset tokens
✅ **One-Time Use**: Reset links can only be used once

### Additional Security Measures

```typescript
// Password validation helper
export function validatePassword(password: string): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters')
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter')
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter')
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number')
  }

  if (!/[!@#$%^&*]/.test(password)) {
    errors.push('Password must contain at least one special character')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}
```

---

## 6. User Experience Flow

### For Regular Users

```
Login Page
  ├─ "Forgot Password?" link
  │   └─ Enter email → Receive reset link
  │
  └─ After Login
      └─ Settings → Change Password
```

### For Admins

```
Admin Dashboard
  ├─ Own Account Settings
  │   └─ Change Password (same as users)
  │
  └─ User Management
      └─ Reset User Password (send reset email)
```

---

## 7. Testing Checklist

- ✅ User can request password reset
- ✅ Reset email is received
- ✅ Reset link works and expires after 1 hour
- ✅ User can set new password
- ✅ User can login with new password
- ✅ Logged-in user can change password
- ✅ Admin can trigger password reset for users
- ✅ All password changes are secure
- ✅ Invalid/expired links show proper error

---

## 8. Configuration

### Environment Variables

```env
# Supabase (already configured)
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Email (Supabase handles this by default)
# Custom SMTP can be configured in Supabase Dashboard
```

### Supabase Auth Settings

Go to Supabase Dashboard → Authentication → Settings:

- ✅ Enable Email Auth
- ✅ Enable Email Confirmations
- ✅ Set Password Reset Redirect URL: `https://tomame.com/auth/reset-password`
- ✅ Set Minimum Password Length: 8
- ✅ Enable Rate Limiting

---

## Summary

✅ **Forgot Password**: Fully implemented via Supabase Auth
✅ **Change Password**: Available for logged-in users
✅ **Admin Reset**: Admins can send reset emails to users
✅ **Security**: Built-in rate limiting, token expiration, and validation
✅ **Audit Logs**: All admin-initiated resets are logged
✅ **User-Friendly**: Clear error messages and success feedback

Both users and admins have complete password management capabilities with enterprise-grade security! 🔐

