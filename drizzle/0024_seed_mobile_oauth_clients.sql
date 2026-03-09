-- Seed mobile OAuth clients for native apps
INSERT INTO oauth_clients (client_id, client_secret_hash, client_name, allowed_redirect_uris, token_endpoint_auth_method)
VALUES
  ('bissbilanz-android', NULL, 'Bissbilanz Android', ARRAY['bissbilanz://oauth/callback'], 'none'),
  ('bissbilanz-ios', NULL, 'Bissbilanz iOS', ARRAY['bissbilanz://oauth/callback'], 'none')
ON CONFLICT (client_id) DO NOTHING;
