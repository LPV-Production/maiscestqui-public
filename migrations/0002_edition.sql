-- Édition précise du livre (choisie dans le catalogue de la BnF ou Open Library)
ALTER TABLE books ADD COLUMN isbn TEXT NOT NULL DEFAULT '';
ALTER TABLE books ADD COLUMN publisher TEXT NOT NULL DEFAULT '';
ALTER TABLE books ADD COLUMN year TEXT NOT NULL DEFAULT '';
