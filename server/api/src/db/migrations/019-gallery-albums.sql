-- ============================================
-- Migration 019 — Gallery with albums (folders)
-- ============================================
-- The institutional site gallery becomes admin-editable and organised in
-- folders. Only creates new tables — nothing existing is altered or removed.
-- Idempotent, mirrored in server/api/src/db/ensure-schema.ts.

BEGIN;

CREATE TABLE IF NOT EXISTS gallery_albums (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(180) NOT NULL UNIQUE,
  description TEXT,
  -- Cover: usually the URL of one of the album's own photos.
  cover_url TEXT,
  -- Event date, when the album is of one. Orders the public listing.
  event_date DATE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gallery_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  album_id UUID NOT NULL REFERENCES gallery_albums(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  caption VARCHAR(300),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gallery_albums_active
  ON gallery_albums(active, sort_order, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_gallery_photos_album
  ON gallery_photos(album_id, sort_order, created_at);

DO $$ BEGIN
  CREATE TRIGGER tr_gallery_albums_updated_at
    BEFORE UPDATE ON gallery_albums
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
