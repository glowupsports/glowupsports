-- HEAD Grips & Overgrips seed for Glow Market
-- Academy: default-academy, Category: cat-strings (Strings & Grips)
-- Task #164
-- Already executed: products exist in database as of task completion.
-- This file serves as an auditable record of what was inserted.

INSERT INTO shop_products (
  academy_id, category_id, name, slug, price, currency,
  stock_quantity, track_inventory, allow_backorder,
  is_active, is_featured, image_url, "order"
)
SELECT * FROM (VALUES
  ('default-academy', 'cat-strings', 'HEAD Xtreme Track Overwrap – Pack of 3pcs',        'head-xtreme-track-overwrap-pack-of-3',     29.40::numeric,  'AED', 10, true, false, true, false, 'https://www.elpanonline.com/wp-content/uploads/2024/08/285124_BK-595x595.jpg', 100),
  ('default-academy', 'cat-strings', 'HEAD Xtremesoft Overgrip – pack of 3 pcs',          'head-xtremesoft-overgrip-pack-of-3',       29.40::numeric,  'AED', 10, true, false, true, false, 'https://www.elpanonline.com/wp-content/uploads/2024/06/285104_BK-595x595.jpg', 101),
  ('default-academy', 'cat-strings', 'HEAD Prime Tour Overgrip – pack of 3 pcs',          'head-prime-tour-overgrip-pack-of-3',       31.50::numeric,  'AED', 10, true, false, true, false, 'https://www.elpanonline.com/wp-content/uploads/2024/07/285621_BK-595x595.jpg', 102),
  ('default-academy', 'cat-strings', 'HEAD Super Comp Overgrip – pack of 3 pcs',          'head-super-comp-overgrip-pack-of-3',       31.50::numeric,  'AED', 10, true, false, true, false, 'https://www.elpanonline.com/wp-content/uploads/2024/07/285088_BK-595x595.jpg', 103),
  ('default-academy', 'cat-strings', 'HEAD Prestige Pro Overgrip – pack of 3 pcs',        'head-prestige-pro-overgrip-pack-of-3',     33.60::numeric,  'AED', 10, true, false, true, false, 'https://www.elpanonline.com/wp-content/uploads/2024/06/282009_BK-595x595.jpg', 104),
  ('default-academy', 'cat-strings', 'HEAD Padel Pro Overgrips – pack of 3 pcs',          'head-padel-pro-overgrips-pack-of-3',       37.80::numeric,  'AED',  0, true, false, true, false, 'https://www.elpanonline.com/wp-content/uploads/2024/06/285111_BK-595x595.jpg', 105),
  ('default-academy', 'cat-strings', 'HEAD Pro Grip – Pack of 3 pcs',                    'head-pro-grip-pack-of-3',                  50.40::numeric,  'AED', 10, true, false, true, false, 'https://www.elpanonline.com/wp-content/uploads/2024/08/285702-595x595.jpg',    106),
  ('default-academy', 'cat-strings', 'HEAD Dual Absorbing replacement grip',              'head-dual-absorbing-replacement-grip',     36.75::numeric,  'AED',  0, true, false, true, false, 'https://www.elpanonline.com/wp-content/uploads/2024/07/285034_BK-595x595.jpg', 107),
  ('default-academy', 'cat-strings', 'HEAD Hydrosorb Pro replacement grip',               'head-hydrosorb-pro-replacement-grip',      36.75::numeric,  'AED', 10, true, false, true, false, 'https://www.elpanonline.com/wp-content/uploads/2024/06/285303_BK-595x595.jpg', 108),
  ('default-academy', 'cat-strings', 'HEAD Hydrosorb replacement grip',                   'head-hydrosorb-replacement-grip',          36.75::numeric,  'AED', 10, true, false, true, false, 'https://www.elpanonline.com/wp-content/uploads/2024/06/285014_BKRD-595x595.jpg',109),
  ('default-academy', 'cat-strings', 'HEAD Hydrosorb Comfort replacement grip',           'head-hydrosorb-comfort-replacement-grip',  36.75::numeric,  'AED', 10, true, false, true, false, 'https://www.elpanonline.com/wp-content/uploads/2024/06/285313_BK-595x595.jpg', 110),
  ('default-academy', 'cat-strings', 'HEAD Padel Pro Overgrips – box of 60 pcs',          'head-padel-pro-overgrips-box-of-60',      582.75::numeric,  'AED', 10, true, false, true, false, 'https://www.elpanonline.com/wp-content/uploads/2024/06/285121_BK-595x595.jpg', 111),
  ('default-academy', 'cat-strings', 'HEAD Prime Tour Overgrips – box of 60 pcs',         'head-prime-tour-overgrips-box-of-60',     582.75::numeric,  'AED',  0, true, false, true, false, 'https://www.elpanonline.com/wp-content/uploads/2024/06/285661_BK-595x595.jpg', 112)
) AS v(academy_id, category_id, name, slug, price, currency, stock_quantity, track_inventory, allow_backorder, is_active, is_featured, image_url, "order")
WHERE NOT EXISTS (
  SELECT 1 FROM shop_products WHERE shop_products.slug = v.slug
);

-- Verification (assert presence of the 13 specific slugs, not a fixed total count):
-- SELECT slug FROM shop_products WHERE category_id = 'cat-strings' AND slug LIKE 'head-%' ORDER BY slug;
-- Expected 13 slugs:
--   head-dual-absorbing-replacement-grip
--   head-hydrosorb-comfort-replacement-grip
--   head-hydrosorb-pro-replacement-grip
--   head-hydrosorb-replacement-grip
--   head-padel-pro-overgrips-box-of-60
--   head-padel-pro-overgrips-pack-of-3
--   head-prestige-pro-overgrip-pack-of-3
--   head-prime-tour-overgrip-pack-of-3
--   head-prime-tour-overgrips-box-of-60
--   head-pro-grip-pack-of-3
--   head-super-comp-overgrip-pack-of-3
--   head-xtreme-track-overwrap-pack-of-3
--   head-xtremesoft-overgrip-pack-of-3
--
-- SOLD OUT (stock_quantity = 0):
--   head-padel-pro-overgrips-pack-of-3
--   head-dual-absorbing-replacement-grip
--   head-prime-tour-overgrips-box-of-60
--
-- Images: all fetched from https://www.elpanonline.com/product/[slug]/ (first 595x595.jpg match)
-- Note: this file is historical/auditable. Pre-existing products in other environments may differ.
