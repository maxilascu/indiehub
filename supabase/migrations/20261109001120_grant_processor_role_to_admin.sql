/*
# Grant processor role to the existing admin user

1. Purpose
- The PDF processor edge function calls the existing processor_* RPCs, which
  require has_app_role('processor'). The admin user currently only has the
  'admin' role, so those RPCs would reject the call.
- Adding the 'processor' role to the same user lets the edge function
  authenticate with the admin's session token and call the existing
  processor_claim_import_job, processor_update_import_progress,
  processor_submit_import_results, and processor_finish_import_job RPCs
  without modifying any existing function.

2. Changes
- Insert a row into user_roles (user_id, role) for the admin user
  with role 'processor'. Idempotent via ON CONFLICT.
- No other changes to tables, policies, grants, or functions.

3. Security
- The admin user already has full admin access. Adding the processor
  role does not expand their privileges beyond what they can already do.
- No new tables, no RLS changes, no grant changes.
*/

INSERT INTO public.user_roles (user_id, role)
VALUES ('4deeda3d-d95e-4a98-89f4-0f78584ef158', 'processor')
ON CONFLICT (user_id, role) DO NOTHING;
