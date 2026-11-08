-- Connexion par identifiant et mot de passe (même système que Resale_Manager)
CREATE TABLE users (
  id            TEXT PRIMARY KEY,            -- identifiant de connexion
  label         TEXT NOT NULL,               -- nom affiché
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,              -- empreinte du jeton (le jeton lui-même reste dans le cookie)
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  INTEGER NOT NULL               -- en millisecondes
);
CREATE INDEX sessions_user ON sessions(user_id);

-- Anti-devinette de mot de passe : blocage après plusieurs échecs
CREATE TABLE login_attempts (
  key       TEXT PRIMARY KEY,
  count     INTEGER NOT NULL,
  first_at  INTEGER NOT NULL
);
