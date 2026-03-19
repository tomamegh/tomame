import { UserResponse } from "@supabase/supabase-js";

export interface UserSession {
  user: AuthenticatedUser;
  profile: UserProfile;
}

export interface UserProfile {
  id: string;
  first_name?: string;
  last_name?: string;
  role: string;
  bio?: string;
  created_at: Date;
  updated_at: Date;
}
export type AuthenticatedUser = UserResponse['data']['user'] & {
  profile: UserProfile;
}

export interface AppMetadata {
  provider: string;
  providers: string[];
}

export interface Identity {
  identity_id: string;
  id: string;
  user_id: string;
  identity_data: UserMetadataClass;
  provider: string;
  last_sign_in_at: Date;
  created_at: Date;
  updated_at: Date;
  email: string;
}

export interface UserMetadataClass {
  avatar_url: string;
  email: string;
  email_verified: boolean;
  full_name: string;
  iss: string;
  name: string;
  phone_verified: boolean;
  picture: string;
  provider_id: string;
  sub: string;
}

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
