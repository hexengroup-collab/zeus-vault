import type { Db } from './sqlite'

export interface Migration {
  version: number
  name: string
  up: (db: Db, ctx: { fts: boolean }) => void
}

const BASE_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  username_lower TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  email_lower TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','standard','readonly')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','locked')),
  avatar_blob TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login TEXT,
  last_activity TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  preferences TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

CREATE TABLE IF NOT EXISTS password_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  changed_by TEXT,
  session_ref TEXT
);
CREATE INDEX IF NOT EXISTS idx_pwh_user ON password_history(user_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  session_ref TEXT NOT NULL UNIQUE,
  device_name TEXT NOT NULL,
  device_secret TEXT NOT NULL,
  ip TEXT NOT NULL DEFAULT 'local',
  auth_method TEXT NOT NULL DEFAULT 'password',
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_activity_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at TEXT,
  revoked_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id, revoked_at);

CREATE TABLE IF NOT EXISTS trusted_devices (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  last_used_at TEXT,
  UNIQUE(device_id, user_id)
);

CREATE TABLE IF NOT EXISTS recovery_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS profile_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#858991',
  icon TEXT NOT NULL DEFAULT 'archive',
  is_default INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by_username TEXT,
  created_at TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_username TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS counters (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
INSERT OR IGNORE INTO counters(name, value) VALUES ('profile_code', 0);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  profile_code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  dob TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT '',
  nationality TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  country_iso2 TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  preferred_language TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT '',
  profile_status TEXT NOT NULL DEFAULT 'Active',
  category_id TEXT REFERENCES profile_categories(id) ON DELETE SET NULL,
  tags_text TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  avatar_blob TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual',
  view_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL,
  archived_by TEXT,
  archived_at TEXT,
  deleted_by TEXT,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status, deleted_at);
CREATE INDEX IF NOT EXISTS idx_profiles_country ON profiles(country_iso2);
CREATE INDEX IF NOT EXISTS idx_profiles_category ON profiles(category_id);
CREATE INDEX IF NOT EXISTS idx_profiles_created_by ON profiles(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON profiles(created_at);
CREATE INDEX IF NOT EXISTS idx_profiles_updated_at ON profiles(updated_at);

CREATE TABLE IF NOT EXISTS profile_contacts (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  primary_phone TEXT NOT NULL DEFAULT '',
  secondary_phone TEXT NOT NULL DEFAULT '',
  phone_country_code TEXT NOT NULL DEFAULT '',
  primary_email TEXT NOT NULL DEFAULT '',
  secondary_email TEXT NOT NULL DEFAULT '',
  alt_email TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  contact_preference TEXT NOT NULL DEFAULT '',
  social_links TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profile_addresses (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  street TEXT NOT NULL DEFAULT '',
  apartment TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  postal_code TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  country_code TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profile_accounts (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  login_username TEXT NOT NULL DEFAULT '',
  login_email TEXT NOT NULL DEFAULT '',
  password_enc TEXT NOT NULL DEFAULT '',
  password_format TEXT NOT NULL DEFAULT '',
  password_updated_at TEXT,
  account_provider TEXT NOT NULL DEFAULT '',
  account_created_at TEXT NOT NULL DEFAULT '',
  last_login TEXT NOT NULL DEFAULT '',
  account_status TEXT NOT NULL DEFAULT '',
  recovery_enc TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profile_professional (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  occupation TEXT NOT NULL DEFAULT '',
  job_title TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  industry TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  work_email TEXT NOT NULL DEFAULT '',
  work_phone TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profile_custom_fields (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  value_enc INTEGER NOT NULL DEFAULT 0,
  field_type TEXT NOT NULL DEFAULT 'text',
  updated_by TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pcf_profile ON profile_custom_fields(profile_id);

CREATE TABLE IF NOT EXISTS profile_notes (
  profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  personal_notes TEXT NOT NULL DEFAULT '',
  internal_notes TEXT NOT NULL DEFAULT '',
  personal_tags TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profile_tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  color TEXT NOT NULL DEFAULT '#858991',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profile_tag_assignments (
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES profile_tags(id) ON DELETE CASCADE,
  assigned_at TEXT NOT NULL,
  assigned_by TEXT,
  PRIMARY KEY (profile_id, tag_id)
);

CREATE TABLE IF NOT EXISTS profile_images (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('avatar','gallery')),
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  blob TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pimg_profile ON profile_images(profile_id, kind);

CREATE TABLE IF NOT EXISTS profile_fields (
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  field TEXT NOT NULL,
  updated_by TEXT,
  updated_by_user_id TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, section, field)
);

CREATE TABLE IF NOT EXISTS profile_field_history (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  field TEXT NOT NULL,
  field_label TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  action TEXT NOT NULL,
  actor_id TEXT,
  actor_username TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pfh_profile ON profile_field_history(profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'documents',
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  blob TEXT NOT NULL,
  uploaded_by TEXT,
  uploaded_by_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_att_profile ON attachments(profile_id);

CREATE TABLE IF NOT EXISTS favorites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_fav_profile ON favorites(profile_id);

CREATE TABLE IF NOT EXISTS profile_views (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_id TEXT,
  viewed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_views_profile ON profile_views(profile_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_views_user ON profile_views(user_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  actor_id TEXT,
  actor_username TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  target_label TEXT,
  field TEXT,
  old_value TEXT,
  new_value TEXT,
  detail TEXT,
  session_ref TEXT,
  device_name TEXT,
  created_at TEXT NOT NULL,
  previous_hash TEXT NOT NULL DEFAULT '',
  entry_hash TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_logs(target_id);
CREATE INDEX IF NOT EXISTS idx_audit_type ON audit_logs(event_type);

CREATE TABLE IF NOT EXISTS saved_searches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'search',
  query TEXT NOT NULL,
  filters TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_saved_user ON saved_searches(user_id);

CREATE TABLE IF NOT EXISTS application_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS database_backups (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('plain','encrypted')),
  path TEXT NOT NULL,
  size INTEGER NOT NULL,
  fingerprint TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'complete'
);

CREATE TABLE IF NOT EXISTS nlp_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  command TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nlp_user ON nlp_history(user_id, created_at DESC);
`

const FTS_SCHEMA = `
CREATE VIRTUAL TABLE IF NOT EXISTS profiles_fts USING fts5(
  profile_id UNINDEXED,
  full_name,
  username,
  emails,
  phones,
  city,
  state,
  country,
  category,
  tags,
  notes,
  tokenize = 'unicode61 remove_diacritics 2'
);
`

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'base-schema',
    up: (db, ctx) => {
      db.exec(BASE_SCHEMA)
      if (ctx.fts) db.exec(FTS_SCHEMA)
    },
  },
  {
    version: 2,
    name: 'audit-append-only-guard',
    up: (db) => {
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS audit_logs_no_update
        BEFORE UPDATE ON audit_logs
        BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only'); END;
        CREATE TRIGGER IF NOT EXISTS audit_logs_no_delete
        BEFORE DELETE ON audit_logs
        BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only'); END;
        CREATE TRIGGER IF NOT EXISTS profile_field_history_no_update
        BEFORE UPDATE ON profile_field_history
        BEGIN SELECT RAISE(ABORT, 'profile_field_history is append-only'); END;
        CREATE TRIGGER IF NOT EXISTS profile_field_history_no_delete
        BEFORE DELETE ON profile_field_history
        BEGIN SELECT RAISE(ABORT, 'profile_field_history is append-only'); END;
      `)
    },
  },
  {
    version: 3,
    name: 'b2b-contacts',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS b2b_contacts (
          id TEXT PRIMARY KEY,
          b2b_code TEXT NOT NULL UNIQUE,
          company_name TEXT NOT NULL,
          industry TEXT NOT NULL DEFAULT '',
          website TEXT NOT NULL DEFAULT '',
          work_type TEXT NOT NULL DEFAULT '',
          contact_person TEXT NOT NULL DEFAULT '',
          contact_role TEXT NOT NULL DEFAULT '',
          phone TEXT NOT NULL DEFAULT '',
          email TEXT NOT NULL DEFAULT '',
          street TEXT NOT NULL DEFAULT '',
          city TEXT NOT NULL DEFAULT '',
          state TEXT NOT NULL DEFAULT '',
          postal_code TEXT NOT NULL DEFAULT '',
          country TEXT NOT NULL DEFAULT '',
          country_iso2 TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'Lead' CHECK (status IN ('Lead','Active','Dormant')),
          notes TEXT NOT NULL DEFAULT '',
          tags_text TEXT NOT NULL DEFAULT '',
          is_favorite INTEGER NOT NULL DEFAULT 0,
          is_demo INTEGER NOT NULL DEFAULT 0,
          created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
          created_by_username TEXT,
          created_at TEXT NOT NULL,
          updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
          updated_by_username TEXT,
          updated_at TEXT NOT NULL,
          deleted_by TEXT,
          deleted_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_b2b_status ON b2b_contacts(status, deleted_at);
        CREATE INDEX IF NOT EXISTS idx_b2b_industry ON b2b_contacts(industry);
        CREATE INDEX IF NOT EXISTS idx_b2b_country ON b2b_contacts(country_iso2);
        CREATE TABLE IF NOT EXISTS b2b_counters (
          name TEXT PRIMARY KEY,
          value INTEGER NOT NULL
        );
        INSERT OR IGNORE INTO b2b_counters(name, value) VALUES ('b2b_code', 0);
      `)
    },
  },
  {
    version: 4,
    name: 'secrets-out-of-db',
    up: (db) => {
      // Session tokens and trusted-device secrets no longer live in the database.
      db.run(`DELETE FROM application_settings WHERE key IN ('vault.session_token', 'vault.trusted_device')`)
    },
  },
  {
    version: 5,
    name: 'api-keys',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS api_keys (
          id TEXT PRIMARY KEY,
          key_hash TEXT NOT NULL UNIQUE,
          hint TEXT NOT NULL DEFAULT '',
          label TEXT NOT NULL DEFAULT '',
          owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          owner_username TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          last_used_at TEXT,
          revoked_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_apikeys_owner ON api_keys(owner_user_id, revoked_at);
      `)
    },
  },
  {
    version: 6,
    name: 'photo-tokens-nlp-embeddings',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS photo_tokens (
          id TEXT PRIMARY KEY,
          profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
          image_id TEXT,
          kind TEXT NOT NULL CHECK (kind IN ('avatar','gallery')),
          phash TEXT,
          ahash TEXT,
          face_detected INTEGER NOT NULL DEFAULT 0,
          face_phash TEXT,
          face_box TEXT,
          histogram TEXT,
          status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','done','failed')),
          error TEXT,
          attempts INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_photo_tokens_profile ON photo_tokens(profile_id);
        CREATE INDEX IF NOT EXISTS idx_photo_tokens_status ON photo_tokens(status);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_photo_tokens_unique ON photo_tokens(profile_id, image_id, kind);
        CREATE TABLE IF NOT EXISTS nlp_aliases (
          alias_lower TEXT PRIMARY KEY,
          canonical TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          updated_by TEXT
        );
        CREATE TABLE IF NOT EXISTS text_embeddings (
          profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
          vector TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `)
    },
  },
]

export function migrate(db: Db): { version: number; applied: number[] } {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`)
  const current = Number(db.value<number>('SELECT MAX(version) FROM schema_migrations') ?? 0)
  const fts = db.ftsAvailable()
  const applied: number[] = []
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue
    db.transaction(() => {
      m.up(db, { fts })
      db.run('INSERT INTO schema_migrations(version, name, applied_at) VALUES (?,?,?)', [
        m.version,
        m.name,
        new Date().toISOString(),
      ])
    })
    applied.push(m.version)
  }
  return { version: MIGRATIONS[MIGRATIONS.length - 1].version, applied }
}
