/*
# Restrict user_roles privileges to read-only for signed-in users

1. Purpose
- The roles table was readable and writable through the public API by the anon and authenticated roles.
- Role assignments must only be changed by the database owner, never by a browser session.

2. Security changes
- Revoke all table privileges on user_roles from anon and authenticated.
- Grant SELECT on user_roles to authenticated only. Row policies still decide which rows are visible.
- No data is modified, dropped, or recreated.

3. Notes
- The has_app_role and current_app_role functions run with the owner's rights and are unaffected.
- The admin role seed row is not touched.
*/

REVOKE ALL ON TABLE public.user_roles FROM anon, authenticated;

GRANT SELECT ON TABLE public.user_roles TO authenticated;
