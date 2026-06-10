ALTER TABLE user_states ADD COLUMN categories_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE user_states ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS personal_papers (
  slug TEXT PRIMARY KEY,
  owner_login TEXT NOT NULL,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  journal TEXT NOT NULL DEFAULT '',
  pdf_path TEXT NOT NULL,
  markdown_path TEXT NOT NULL,
  related_reading_path TEXT NOT NULL DEFAULT '',
  original_type TEXT NOT NULL DEFAULT 'pdf',
  translation_type TEXT NOT NULL DEFAULT 'markdown',
  related_reading_type TEXT NOT NULL DEFAULT 'markdown',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_personal_papers_owner ON personal_papers (owner_login);

CREATE TABLE IF NOT EXISTS friends (
  login TEXT NOT NULL,
  friend_login TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (login, friend_login)
);

CREATE INDEX IF NOT EXISTS idx_friends_login ON friends (login);
