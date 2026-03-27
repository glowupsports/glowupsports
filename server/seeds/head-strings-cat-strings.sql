-- Seed: HEAD Tennis Strings & Reels catalog for Glow Market
-- Category: cat-strings (Strings & Grips), Academy: default-academy
-- 21 products total: 13 individual sets + 8 reels (200m)
-- Prices in AED. stock_quantity=0 means SOLD OUT.
-- Images sourced from elpanonline.com (595x595 product images).
-- Idempotent: safe to re-run (ON CONFLICT DO NOTHING).

INSERT INTO shop_products (
  academy_id, category_id, name, slug, description, short_description,
  price, currency, stock_quantity, track_inventory, allow_backorder,
  image_url, images, is_featured, is_active, "order", tags
) VALUES

-- ============================================================
-- INDIVIDUAL SETS
-- ============================================================
(
  'default-academy', 'cat-strings',
  'HEAD Synthetic Gut Tennis String',
  'head-synthetic-gut-tennis-string',
  'Individual set. Synthetic gut multifilament string — great all-round playability and value.',
  'Individual set.',
  29.40, 'AED', 10, true, false,
  'https://www.elpanonline.com/wp-content/uploads/2024/06/281111_BK-595x595.jpg',
  '["https://www.elpanonline.com/wp-content/uploads/2024/06/281111_BK-595x595.jpg"]',
  false, true, 0,
  '["head","strings","set"]'
),
(
  'default-academy', 'cat-strings',
  'HEAD Master Tennis String',
  'head-master-tennis-string',
  'Individual set. Classic multifilament string offering reliable control and power at an excellent price.',
  'Individual set.',
  15.75, 'AED', 10, true, false,
  'https://www.elpanonline.com/wp-content/uploads/2024/06/281023_WH-595x595.jpg',
  '["https://www.elpanonline.com/wp-content/uploads/2024/06/281023_WH-595x595.jpg"]',
  false, true, 0,
  '["head","strings","set"]'
),
(
  'default-academy', 'cat-strings',
  'HEAD Velocity MLT Tennis String',
  'head-velocity-mlt-tennis-string',
  'Individual set. Premium multifilament string built for comfort and power on every stroke.',
  'Individual set.',
  57.75, 'AED', 10, true, false,
  'https://www.elpanonline.com/wp-content/uploads/2024/06/281404_BK-595x595.jpg',
  '["https://www.elpanonline.com/wp-content/uploads/2024/06/281404_BK-595x595.jpg"]',
  false, true, 0,
  '["head","strings","set"]'
),
(
  'default-academy', 'cat-strings',
  'HEAD Sonic Pro Tennis String',
  'head-sonic-pro-tennis-string',
  'Individual set. Monofilament string delivering exceptional control and durability for competitive players.',
  'Individual set.',
  57.75, 'AED', 10, true, false,
  'https://www.elpanonline.com/wp-content/uploads/2024/06/281028_BK-595x595.jpg',
  '["https://www.elpanonline.com/wp-content/uploads/2024/06/281028_BK-595x595.jpg"]',
  false, true, 0,
  '["head","strings","set"]'
),
(
  'default-academy', 'cat-strings',
  'HEAD Lynx Touch Tennis String',
  'head-lynx-touch-tennis-string',
  'Individual set. Monofilament string combining touch sensitivity with excellent power transfer.',
  'Individual set.',
  48.30, 'AED', 10, true, false,
  'https://www.elpanonline.com/wp-content/uploads/2024/08/281042-595x595.jpg',
  '["https://www.elpanonline.com/wp-content/uploads/2024/08/281042-595x595.jpg"]',
  false, true, 0,
  '["head","strings","set"]'
),
(
  'default-academy', 'cat-strings',
  'HEAD Lynx Tennis String',
  'head-lynx-tennis-string',
  'Individual set. Monofilament string with a superb balance of control and spin.',
  'Individual set.',
  68.25, 'AED', 10, true, false,
  'https://www.elpanonline.com/wp-content/uploads/2024/06/281784_AN-595x595.jpg',
  '["https://www.elpanonline.com/wp-content/uploads/2024/06/281784_AN-595x595.jpg"]',
  false, true, 0,
  '["head","strings","set"]'
),
(
  'default-academy', 'cat-strings',
  'HEAD Lynx Tour Tennis String',
  'head-lynx-tour-tennis-string',
  'Individual set. Monofilament string optimised for tour-level spin and control.',
  'Individual set.',
  68.25, 'AED', 10, true, false,
  'https://www.elpanonline.com/wp-content/uploads/2024/06/281790_CP-595x595.jpg',
  '["https://www.elpanonline.com/wp-content/uploads/2024/06/281790_CP-595x595.jpg"]',
  false, true, 0,
  '["head","strings","set"]'
),
(
  'default-academy', 'cat-strings',
  'HEAD RIP Control Tennis String',
  'head-rip-control-tennis-string',
  'Individual set. Multifilament string engineered for superior power and comfort.',
  'Individual set.',
  78.75, 'AED', 10, true, false,
  'https://www.elpanonline.com/wp-content/uploads/2024/06/281099_BK-595x595.jpg',
  '["https://www.elpanonline.com/wp-content/uploads/2024/06/281099_BK-595x595.jpg"]',
  false, true, 0,
  '["head","strings","set"]'
),
(
  'default-academy', 'cat-strings',
  'HEAD Hawk Rough Tennis String',
  'head-hawk-rough-tennis-string',
  'Individual set. Textured monofilament string for extreme spin potential and control.',
  'Individual set.',
  84.00, 'AED', 0, true, false,
  'https://www.elpanonline.com/wp-content/uploads/2024/06/281126-595x595.jpg',
  '["https://www.elpanonline.com/wp-content/uploads/2024/06/281126-595x595.jpg"]',
  false, true, 0,
  '["head","strings","set"]'
),
(
  'default-academy', 'cat-strings',
  'HEAD FXP Tennis String',
  'head-fxp-tennis-string',
  'Individual set. Multifilament string delivering unmatched power and durability.',
  'Individual set.',
  89.25, 'AED', 10, true, false,
  'https://www.elpanonline.com/wp-content/uploads/2024/06/281006_1-595x595.jpg',
  '["https://www.elpanonline.com/wp-content/uploads/2024/06/281006_1-595x595.jpg"]',
  false, true, 0,
  '["head","strings","set"]'
),
(
  'default-academy', 'cat-strings',
  'HEAD Intellitour Tennis String',
  'head-intellitour-tennis-string',
  'Individual set. Hybrid string combining monofilament and multifilament for tour-level performance.',
  'Individual set.',
  89.25, 'AED', 10, true, false,
  'https://www.elpanonline.com/wp-content/uploads/2024/06/281002_GR-595x595.jpg',
  '["https://www.elpanonline.com/wp-content/uploads/2024/06/281002_GR-595x595.jpg"]',
  false, true, 0,
  '["head","strings","set"]'
),
(
  'default-academy', 'cat-strings',
  'HEAD Hawk Tennis String',
  'head-hawk-tennis-string',
  'Individual set. Premium monofilament string offering outstanding control and power.',
  'Individual set.',
  105.00, 'AED', 10, true, false,
  'https://www.elpanonline.com/wp-content/uploads/2024/06/281103_BK-595x595.jpg',
  '["https://www.elpanonline.com/wp-content/uploads/2024/06/281103_BK-595x595.jpg"]',
  false, true, 0,
  '["head","strings","set"]'
),
(
  'default-academy', 'cat-strings',
  'HEAD Hawk Touch Tennis String',
  'head-hawk-touch-tennis-string',
  'Individual set. Premium monofilament string blending touch and control for advanced players.',
  'Individual set.',
  105.00, 'AED', 10, true, false,
  'https://www.elpanonline.com/wp-content/uploads/2024/07/281204_AN-595x595.jpg',
  '["https://www.elpanonline.com/wp-content/uploads/2024/07/281204_AN-595x595.jpg"]',
  false, true, 0,
  '["head","strings","set"]'
),

-- ============================================================
-- REELS (200m)
-- ============================================================
(
  'default-academy', 'cat-strings',
  'HEAD Master Tennis String Reel',
  'head-master-tennis-string-reel',
  '200m reel. Classic multifilament string — ideal for frequent stringers seeking great value.',
  '200m reel.',
  231.00, 'AED', 0, true, false,
  'https://www.elpanonline.com/wp-content/uploads/2024/06/281033_NT-595x595.jpg',
  '["https://www.elpanonline.com/wp-content/uploads/2024/06/281033_NT-595x595.jpg"]',
  false, true, 0,
  '["head","strings","reel"]'
),
(
  'default-academy', 'cat-strings',
  'HEAD Sonic Pro Tennis String Reel',
  'head-sonic-pro-tennis-string-reel',
  '200m reel. Monofilament string delivering exceptional control and durability for competitive players.',
  '200m reel.',
  640.50, 'AED', 10, true, false,
  'https://www.elpanonline.com/wp-content/uploads/2024/06/281128_BK-595x595.jpg',
  '["https://www.elpanonline.com/wp-content/uploads/2024/06/281128_BK-595x595.jpg"]',
  false, true, 0,
  '["head","strings","reel"]'
),
(
  'default-academy', 'cat-strings',
  'HEAD Lynx Tennis String Reel',
  'head-lynx-tennis-string-reel',
  '200m reel. Monofilament string with a superb balance of control and spin.',
  '200m reel.',
  729.75, 'AED', 10, true, false,
  'https://www.elpanonline.com/wp-content/uploads/2024/06/281794_AN-595x595.jpg',
  '["https://www.elpanonline.com/wp-content/uploads/2024/06/281794_AN-595x595.jpg"]',
  false, true, 0,
  '["head","strings","reel"]'
),
(
  'default-academy', 'cat-strings',
  'HEAD Hawk Tennis String Reel',
  'head-hawk-tennis-string-reel',
  '200m reel. Premium monofilament string offering outstanding control and power.',
  '200m reel.',
  735.00, 'AED', 0, true, false,
  'https://www.elpanonline.com/wp-content/uploads/2024/06/281113_BK-595x595.jpg',
  '["https://www.elpanonline.com/wp-content/uploads/2024/06/281113_BK-595x595.jpg"]',
  false, true, 0,
  '["head","strings","reel"]'
),
(
  'default-academy', 'cat-strings',
  'HEAD Lynx Touch Tennis String Reel',
  'head-lynx-touch-tennis-string-reel',
  '200m reel. Monofilament string combining touch sensitivity with excellent power transfer.',
  '200m reel.',
  840.00, 'AED', 0, true, false,
  'https://www.elpanonline.com/wp-content/uploads/2024/06/281052_1-595x595.jpg',
  '["https://www.elpanonline.com/wp-content/uploads/2024/06/281052_1-595x595.jpg"]',
  false, true, 0,
  '["head","strings","reel"]'
),
(
  'default-academy', 'cat-strings',
  'HEAD Lynx Tour Tennis String Reel',
  'head-lynx-tour-tennis-string-reel',
  '200m reel. Monofilament string optimised for tour-level spin and control.',
  '200m reel.',
  840.00, 'AED', 10, true, false,
  'https://www.elpanonline.com/wp-content/uploads/2024/06/281799_CP-595x595.jpg',
  '["https://www.elpanonline.com/wp-content/uploads/2024/06/281799_CP-595x595.jpg"]',
  false, true, 0,
  '["head","strings","reel"]'
),
(
  'default-academy', 'cat-strings',
  'HEAD Hawk Touch Tennis String Reel',
  'head-hawk-touch-tennis-string-reel',
  '200m reel. Premium monofilament string blending touch and control for advanced players.',
  '200m reel.',
  918.75, 'AED', 0, true, false,
  'https://www.elpanonline.com/wp-content/uploads/2024/06/281234-595x595.jpg',
  '["https://www.elpanonline.com/wp-content/uploads/2024/06/281234-595x595.jpg"]',
  false, true, 0,
  '["head","strings","reel"]'
),
(
  'default-academy', 'cat-strings',
  'HEAD Intellitour Tennis String Reel',
  'head-intellitour-tennis-string-reel',
  '200m reel. Hybrid string combining monofilament and multifilament for tour-level performance.',
  '200m reel.',
  966.00, 'AED', 10, true, false,
  'https://www.elpanonline.com/wp-content/uploads/2024/12/281012_NT-595x595.jpg',
  '["https://www.elpanonline.com/wp-content/uploads/2024/12/281012_NT-595x595.jpg"]',
  false, true, 0,
  '["head","strings","reel"]'
)

ON CONFLICT (academy_id, slug) DO NOTHING;

-- Verification query (expected: 21 HEAD rows, 5 sold_out, 21 with images)
-- SELECT COUNT(*) as total, COUNT(image_url) as with_images,
--        COUNT(CASE WHEN stock_quantity = 0 THEN 1 END) as sold_out
-- FROM shop_products
-- WHERE academy_id='default-academy' AND category_id='cat-strings' AND name LIKE 'HEAD%';
