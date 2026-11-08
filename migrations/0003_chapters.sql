-- Progression par chapitre (indépendante de l'édition) et texte de l'EPUB pour nourrir les fiches
ALTER TABLE books ADD COLUMN unit TEXT NOT NULL DEFAULT 'page' CHECK (unit IN ('page', 'chapter'));
ALTER TABLE books ADD COLUMN total_chapters INTEGER;
ALTER TABLE books ADD COLUMN current_chapter INTEGER NOT NULL DEFAULT 0;
ALTER TABLE books ADD COLUMN scanned_chapter INTEGER NOT NULL DEFAULT 0;

ALTER TABLE entities ADD COLUMN first_chapter INTEGER;
ALTER TABLE relations ADD COLUMN first_chapter INTEGER;

-- Chapitres de l'EPUB (idx commence à 1, dans l'ordre de lecture)
CREATE TABLE chapters (
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  words INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (book_id, idx)
);
