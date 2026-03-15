// ── Response types ───────────────────────────────────────────────────────────

export interface AuthUserResponse {
  id: string;
  email: string;
  role: string;
}

// ── Request types ────────────────────────────────────────────────────────────

export interface SignupRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  password: string;
}

export interface ChangePasswordRequest {
  newPassword: string;
}

export interface PromoteUserRequest {
  userId: string;
}

export interface CreateAdminRequest {
  email: string;
  password: string;
}

export interface AdminResetPasswordRequest {
  email: string;
}
