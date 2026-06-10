CREATE TABLE IF NOT EXISTS user_states (
  login TEXT NOT NULL,
  paper_slug TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  rating INTEGER NOT NULL DEFAULT 0,
  tags_json TEXT NOT NULL DEFAULT '[]',
  note TEXT NOT NULL DEFAULT '',
  scroll_top INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (login, paper_slug)
);

CREATE INDEX IF NOT EXISTS idx_user_states_login ON user_states (login);
