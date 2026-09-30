-- Customers could insert their own orders row through PostgREST: the policy
-- "users can insert own orders" only checked auth.uid() = user_id, and
-- `authenticated` held INSERT. A crafted row could carry any pricing or status.
-- Orders are created only by the server (service role) from the extraction
-- snapshot, so the customer path is closed at both the grant and the policy.
drop policy if exists "users can insert own orders" on public.orders;
revoke insert on public.orders from authenticated, anon;
