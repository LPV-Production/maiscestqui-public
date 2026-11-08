-- Maiscestqui : schéma initial

CREATE TABLE books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  total_pages INTEGER,
  current_page INTEGER NOT NULL DEFAULT 0,
  -- dernière page jusqu'à laquelle les nouveautés ont été cherchées
  scanned_page INTEGER NOT NULL DEFAULT 0,
  finished INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Couvertures à part : la liste des livres ne charge pas les images
CREATE TABLE covers (
  book_id TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
  data_url TEXT NOT NULL
);

CREATE TABLE entities (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('character', 'place', 'org', 'event')),
  name TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  first_page INTEGER,
  to_clarify INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX entities_book ON entities(book_id);

-- Une relation se lit dans les deux sens :
--   from_role = ce que « from » est pour « to » (ex. père)
--   to_role   = ce que « to » est pour « from » (ex. fille)
--   label     = précision libre, affichée des deux côtés
--   kin       = lien de parenté structuré pour l'arbre : parent (from est parent de to), spouse, sibling
CREATE TABLE relations (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  from_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'Autre',
  from_role TEXT NOT NULL DEFAULT '',
  to_role TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL DEFAULT '',
  kin TEXT CHECK (kin IS NULL OR kin IN ('parent', 'spouse', 'sibling')),
  first_page INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX relations_book ON relations(book_id);
