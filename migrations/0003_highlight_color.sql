-- The colour of a highlight, so a marked passage is visible in the text itself.
--
-- Mirrors src/server/db/migrate-function.ts. Highlights that predate this
-- column become yellow, which is what a highlighter is when nobody chose.

ALTER TABLE highlights ADD COLUMN color TEXT NOT NULL DEFAULT 'yellow';
