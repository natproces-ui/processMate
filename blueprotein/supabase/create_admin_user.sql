-- Create the Supabase Auth admin user directly via SQL, instead of the
-- Authentication > Add user dashboard flow.
--
-- Not officially guaranteed stable by Supabase (auth.users / auth.identities
-- are internal GoTrue tables) but this is the standard community pattern and
-- works on current Supabase projects. If login fails afterward, delete the
-- user from Authentication > Users and use "Add user" in the dashboard instead.
--
-- IMPORTANT: replace target_email / target_password below before running.
-- The Supabase SQL Editor keeps a query history, so this plaintext password
-- will sit in that history — change it via the dashboard afterward if that's
-- a concern.

do $$
declare
  new_user_id uuid := gen_random_uuid();
  target_email text := 'contact@blueprotein.ma';
  target_password text := 'CHANGE_ME';
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, confirmation_token, recovery_token,
    email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000',
    new_user_id,
    'authenticated',
    'authenticated',
    target_email,
    crypt(target_password, gen_salt('bf')),
    now(), '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(), now()
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(),
    new_user_id,
    new_user_id::text,
    jsonb_build_object('sub', new_user_id::text, 'email', target_email),
    'email',
    now(), now(), now()
  );

  -- also grant this email admin rights on the site (idempotent)
  insert into public.admins (email) values (target_email)
    on conflict (email) do nothing;
end $$;
