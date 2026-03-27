-- Cleanup: Remove Wilson and Nike demo brand products from shop_products
-- These hardcoded demo products should not appear in production.
-- Safe to run multiple times (idempotent).

DELETE FROM shop_products
WHERE id IN ('prod-nike-court', 'prod-wilson-pro', 'prod-wilson-bag');

-- Also catch any stragglers by name pattern, scoped to default-academy only
DELETE FROM shop_products
WHERE academy_id = 'default-academy'
  AND (
    LOWER(name) LIKE '%wilson%'
    OR LOWER(name) LIKE '%nike%'
  );
