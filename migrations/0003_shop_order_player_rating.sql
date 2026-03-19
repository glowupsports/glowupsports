ALTER TABLE "shop_orders" ADD COLUMN IF NOT EXISTS "player_rating" integer;
ALTER TABLE "shop_orders" ADD COLUMN IF NOT EXISTS "player_rating_at" timestamp;
