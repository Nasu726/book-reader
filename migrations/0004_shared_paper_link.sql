-- Reader-owned link into Paper Collector's canonical scholarly identity.
--
-- Deliberately no foreign key here: local Reader databases do not contain the
-- Collector schema, and the cross-application deletion contract is instead
-- enforced by Collector-owned paper_retention_refs.
ALTER TABLE documents ADD COLUMN paper_id TEXT;

CREATE INDEX IF NOT EXISTS idx_documents_paper_id
  ON documents(paper_id);
