-- 030 — Backfill `categories.icon`
--
-- The column landed in 018 but 12 of 14 categories were still NULL and there was
-- no UI to fill them, so consumers fell back to a generic icon (the institutional
-- site drew a music note on every row). Guess once from the name; after this the
-- Categories tab in the admin owns the value.
--
-- Only empties are filled: a hand-picked icon is never reverted.

UPDATE categories SET icon = 'star'     WHERE (icon IS NULL OR icon = '') AND (name ~* 'k-?pop' OR slug ~* 'k-?pop');
UPDATE categories SET icon = 'camera'   WHERE (icon IS NULL OR icon = '') AND (name ~* 'photocard|foto' OR slug ~* 'photocard|foto');
UPDATE categories SET icon = 'music'    WHERE (icon IS NULL OR icon = '') AND (name ~* 'music|músic|musica' OR slug ~* 'music|músic|musica');
UPDATE categories SET icon = 'zap'      WHERE (icon IS NULL OR icon = '') AND (name ~* 'pok[eé]mon' OR slug ~* 'pok[eé]mon');
UPDATE categories SET icon = 'cat'      WHERE (icon IS NULL OR icon = '') AND (name ~* 'anime|mang' OR slug ~* 'anime|mang');
UPDATE categories SET icon = 'heart'    WHERE (icon IS NULL OR icon = '') AND (name ~* 'beleza|maquia' OR slug ~* 'beleza|maquia');
UPDATE categories SET icon = 'shirt'    WHERE (icon IS NULL OR icon = '') AND (name ~* 'moda|vestu[aá]rio|roupa|camiseta' OR slug ~* 'moda|vestu[aá]rio|roupa|camiseta');
UPDATE categories SET icon = 'gamepad'  WHERE (icon IS NULL OR icon = '') AND (name ~* 'jogo|game' OR slug ~* 'jogo|game');
UPDATE categories SET icon = 'cookie'   WHERE (icon IS NULL OR icon = '') AND (name ~* 'comida|food|doce' OR slug ~* 'comida|food|doce');
UPDATE categories SET icon = 'baby'     WHERE (icon IS NULL OR icon = '') AND (name ~* 'beb[eê]' OR slug ~* 'beb[eê]');
UPDATE categories SET icon = 'paw'      WHERE (icon IS NULL OR icon = '') AND (name ~* 'pet|animal' OR slug ~* 'pet|animal');
UPDATE categories SET icon = 'palette'  WHERE (icon IS NULL OR icon = '') AND (name ~* 'decora' OR slug ~* 'decora');
UPDATE categories SET icon = 'book'     WHERE (icon IS NULL OR icon = '') AND (name ~* 'papelaria|caderno' OR slug ~* 'papelaria|caderno');
UPDATE categories SET icon = 'sparkles' WHERE (icon IS NULL OR icon = '') AND (name ~* 'acess[oó]rio' OR slug ~* 'acess[oó]rio');
UPDATE categories SET icon = 'gift'     WHERE (icon IS NULL OR icon = '') AND (name ~* 'brinquedo' OR slug ~* 'brinquedo');
UPDATE categories SET icon = 'home'     WHERE (icon IS NULL OR icon = '') AND (name ~* 'casa|eletro' OR slug ~* 'casa|eletro');

-- Anything with no guess gets a generic icon so the storefront is not
-- half-icon, half-empty.
UPDATE categories SET icon = 'sparkles' WHERE icon IS NULL OR icon = '';

-- One-off: the only two categories that already had an icon were both 'star',
-- picked in the old <select> that showed the label ("K-pop / Estrela") and never
-- the drawing. Guarded by slug and current value so a later deliberate choice is
-- not undone.
UPDATE categories SET icon = 'heart' WHERE slug = 'beleza'     AND icon = 'star';
UPDATE categories SET icon = 'gift'  WHERE slug = 'brinquedos' AND icon = 'star';
