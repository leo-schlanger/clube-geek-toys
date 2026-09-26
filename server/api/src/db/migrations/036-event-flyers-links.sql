-- 036 — extra flyers and link buttons per event
--
-- One event can carry more than one piece of art (the event poster and the
-- dance-competition poster, say) and more than one call to action (reserve a
-- ticket, sign up for the competition on an external form). The admin could
-- upload a single banner and had nowhere to put a link at all.
--
-- `flyers`: [{ "url": "https://..." }] — shown after the banner.
-- `links`:  [{ "label": "Inscrição da competição", "url": "https://..." }]
ALTER TABLE events ADD COLUMN IF NOT EXISTS flyers JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE events ADD COLUMN IF NOT EXISTS links JSONB NOT NULL DEFAULT '[]'::jsonb;
