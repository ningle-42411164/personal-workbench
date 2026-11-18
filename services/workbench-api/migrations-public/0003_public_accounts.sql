-- Public-only account and revocation metadata. Apply only to PUBLIC_DB, never the private database.
CREATE TABLE IF NOT EXISTS public_accounts (
  user_id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS public_revoked_grants (
  user_id TEXT NOT NULL,
  grant_id TEXT NOT NULL,
  revoked_at TEXT NOT NULL,
  PRIMARY KEY(user_id,grant_id)
);
