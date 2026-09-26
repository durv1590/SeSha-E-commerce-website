-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'INVENTORY_MANAGER', 'CUSTOMER_SUPPORT', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "OtpChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('LOGIN', 'VERIFY_EMAIL', 'VERIFY_PHONE', 'RESET_PASSWORD');

-- CreateEnum
CREATE TYPE "AddressLabel" AS ENUM ('HOME', 'WORK', 'OTHER');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "InventoryTxType" AS ENUM ('ADJUSTMENT', 'RESTOCK', 'RESERVE', 'RELEASE', 'SALE', 'RETURN');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAYMENT_PENDING', 'CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURN_REQUESTED', 'RETURNED', 'REFUND_INITIATED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PREPAID', 'COD');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('STANDARD', 'EXPRESS');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('CREATED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RETURNED');

-- CreateEnum
CREATE TYPE "ReturnType" AS ENUM ('RETURN', 'REPLACEMENT');

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'RECEIVED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "CouponType" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('PENDING', 'PUBLISHED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BannerPlacement" AS ENUM ('HOME_HERO', 'HOME_PROMO', 'CATEGORY_TOP');

-- CreateEnum
CREATE TYPE "BannerTheme" AS ENUM ('PRIMARY', 'NAVY', 'ACCENT', 'LIGHT');

-- CreateEnum
CREATE TYPE "HomeSectionSource" AS ENUM ('BEST_SELLERS', 'NEW_ARRIVALS', 'FEATURED', 'DEALS', 'CATEGORY');

-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'RESOLVED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "name" TEXT NOT NULL,
    "password_hash" TEXT,
    "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "email_verified_at" TIMESTAMP(3),
    "phone_verified_at" TIMESTAMP(3),
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "marketing_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_codes" (
    "id" TEXT NOT NULL,
    "channel" "OtpChannel" NOT NULL,
    "target" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "label" "AddressLabel" NOT NULL DEFAULT 'HOME',
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "landmark" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pincode" CHAR(6) NOT NULL,
    "country" CHAR(2) NOT NULL DEFAULT 'IN',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "parent_id" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "seo_content" TEXT,
    "image_url" TEXT,
    "banner_url" TEXT,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "meta_title" TEXT,
    "meta_description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "logo_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "meta_title" TEXT,
    "meta_description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "short_description" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "category_id" TEXT NOT NULL,
    "brand_id" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "tax_rate" INTEGER NOT NULL DEFAULT 18,
    "hsn_code" TEXT,
    "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "specifications" JSONB NOT NULL DEFAULT '[]',
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "weight_grams" INTEGER,
    "length_mm" INTEGER,
    "width_mm" INTEGER,
    "height_mm" INTEGER,
    "video_url" TEXT,
    "shipping_info" TEXT,
    "return_info" TEXT,
    "warranty_info" TEXT,
    "is_returnable" BOOLEAN NOT NULL DEFAULT true,
    "return_window_days" INTEGER NOT NULL DEFAULT 7,
    "is_cod_available" BOOLEAN NOT NULL DEFAULT true,
    "meta_title" TEXT,
    "meta_description" TEXT,
    "min_price" INTEGER NOT NULL DEFAULT 0,
    "max_discount_pct" INTEGER NOT NULL DEFAULT 0,
    "rating_avg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "sold_count" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '{}',
    "mrp" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "weight_grams" INTEGER,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "url" TEXT NOT NULL,
    "alt" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory" (
    "id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "low_stock_threshold" INTEGER NOT NULL DEFAULT 5,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_transactions" (
    "id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "type" "InventoryTxType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "stock_after" INTEGER NOT NULL,
    "reserved_after" INTEGER NOT NULL,
    "reason" TEXT,
    "order_id" TEXT,
    "actor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "guest_token_hash" TEXT,
    "coupon_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" TEXT NOT NULL,
    "cart_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "saved_for_later" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlists" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wishlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlist_items" (
    "id" TEXT NOT NULL,
    "wishlist_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "user_id" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "payment_method" "PaymentMethod" NOT NULL,
    "delivery_method" "DeliveryMethod" NOT NULL DEFAULT 'STANDARD',
    "shipping_address" JSONB NOT NULL,
    "billing_address" JSONB NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "mrp_total" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "coupon_discount" INTEGER NOT NULL DEFAULT 0,
    "shipping_fee" INTEGER NOT NULL DEFAULT 0,
    "cod_fee" INTEGER NOT NULL DEFAULT 0,
    "tax_total" INTEGER NOT NULL DEFAULT 0,
    "grand_total" INTEGER NOT NULL,
    "coupon_id" TEXT,
    "coupon_code" TEXT,
    "notes" TEXT,
    "guest_access_token_hash" TEXT,
    "reservation_expires_at" TIMESTAMP(3),
    "placed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT,
    "variant_id" TEXT,
    "product_name" TEXT NOT NULL,
    "product_slug" TEXT,
    "variant_name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "image_url" TEXT,
    "hsn_code" TEXT,
    "mrp" INTEGER NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "tax_rate" INTEGER NOT NULL,
    "tax_amount" INTEGER NOT NULL,
    "discount_amount" INTEGER NOT NULL DEFAULT 0,
    "line_total" INTEGER NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "from_status" "OrderStatus",
    "to_status" "OrderStatus" NOT NULL,
    "note" TEXT,
    "actor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_order_id" TEXT,
    "provider_payment_id" TEXT,
    "method" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "error_code" TEXT,
    "error_description" TEXT,
    "captured_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "provider_refund_id" TEXT,
    "reason" TEXT,
    "actor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMP(3),
    "error" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "provider_shipment_id" TEXT,
    "tracking_number" TEXT,
    "tracking_url" TEXT,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'CREATED',
    "is_return" BOOLEAN NOT NULL DEFAULT false,
    "estimated_delivery" TIMESTAMP(3),
    "shipped_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "events" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_requests" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "user_id" TEXT,
    "type" "ReturnType" NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT NOT NULL,
    "comments" TEXT,
    "items" JSONB NOT NULL,
    "resolution_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "return_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "type" "CouponType" NOT NULL,
    "value" INTEGER NOT NULL,
    "max_discount" INTEGER,
    "min_cart_value" INTEGER NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "usage_limit" INTEGER,
    "usage_per_user" INTEGER NOT NULL DEFAULT 1,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "first_order_only" BOOLEAN NOT NULL DEFAULT false,
    "product_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "customer_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_usages" (
    "id" TEXT NOT NULL,
    "coupon_id" TEXT NOT NULL,
    "user_id" TEXT,
    "order_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "discount" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "order_item_id" TEXT,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_verified_purchase" BOOLEAN NOT NULL DEFAULT false,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "moderated_by_id" TEXT,
    "moderated_at" TIMESTAMP(3),
    "moderation_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_questions" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "answered_by_id" TEXT,
    "answered_at" TIMESTAMP(3),
    "status" "QuestionStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_subscribers" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "unsubscribed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_messages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "order_number" TEXT,
    "status" "ContactStatus" NOT NULL DEFAULT 'NEW',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_queries" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "last_result_count" INTEGER NOT NULL DEFAULT 0,
    "last_searched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_queries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banners" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "cta_label" TEXT,
    "link" TEXT,
    "placement" "BannerPlacement" NOT NULL,
    "theme" "BannerTheme" NOT NULL DEFAULT 'PRIMARY',
    "image_desktop" TEXT,
    "image_tablet" TEXT,
    "image_mobile" TEXT,
    "image_alt" TEXT,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "home_sections" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "source" "HomeSectionSource" NOT NULL,
    "category_id" TEXT,
    "limit" INTEGER NOT NULL DEFAULT 12,
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "home_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pages" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "meta_title" TEXT,
    "meta_description" TEXT,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seo_overrides" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "og_image" TEXT,
    "noindex" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seo_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "otp_codes_target_purpose_created_at_idx" ON "otp_codes"("target", "purpose", "created_at");

-- CreateIndex
CREATE INDEX "addresses_user_id_idx" ON "addresses"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_parent_id_sort_order_idx" ON "categories"("parent_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "brands_name_key" ON "brands"("name");

-- CreateIndex
CREATE UNIQUE INDEX "brands_slug_key" ON "brands"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_status_category_id_idx" ON "products"("status", "category_id");

-- CreateIndex
CREATE INDEX "products_status_brand_id_idx" ON "products"("status", "brand_id");

-- CreateIndex
CREATE INDEX "products_status_min_price_idx" ON "products"("status", "min_price");

-- CreateIndex
CREATE INDEX "products_status_published_at_idx" ON "products"("status", "published_at" DESC);

-- CreateIndex
CREATE INDEX "products_status_sold_count_idx" ON "products"("status", "sold_count" DESC);

-- CreateIndex
CREATE INDEX "products_status_is_featured_idx" ON "products"("status", "is_featured");

-- CreateIndex
CREATE INDEX "products_name_trgm_idx" ON "products" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");

-- CreateIndex
CREATE INDEX "product_variants_product_id_position_idx" ON "product_variants"("product_id", "position");

-- CreateIndex
CREATE INDEX "product_images_product_id_position_idx" ON "product_images"("product_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_variant_id_key" ON "inventory"("variant_id");

-- CreateIndex
CREATE INDEX "inventory_transactions_variant_id_created_at_idx" ON "inventory_transactions"("variant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "inventory_transactions_order_id_idx" ON "inventory_transactions"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "carts_user_id_key" ON "carts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "carts_guest_token_hash_key" ON "carts"("guest_token_hash");

-- CreateIndex
CREATE INDEX "carts_updated_at_idx" ON "carts"("updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "cart_items_cart_id_variant_id_key" ON "cart_items"("cart_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "wishlists_user_id_key" ON "wishlists"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "wishlist_items_wishlist_id_product_id_key" ON "wishlist_items"("wishlist_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");

-- CreateIndex
CREATE UNIQUE INDEX "orders_guest_access_token_hash_key" ON "orders"("guest_access_token_hash");

-- CreateIndex
CREATE INDEX "orders_user_id_placed_at_idx" ON "orders"("user_id", "placed_at" DESC);

-- CreateIndex
CREATE INDEX "orders_status_placed_at_idx" ON "orders"("status", "placed_at" DESC);

-- CreateIndex
CREATE INDEX "orders_email_idx" ON "orders"("email");

-- CreateIndex
CREATE INDEX "orders_phone_idx" ON "orders"("phone");

-- CreateIndex
CREATE INDEX "orders_reservation_expires_at_idx" ON "orders"("reservation_expires_at");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_product_id_idx" ON "order_items"("product_id");

-- CreateIndex
CREATE INDEX "order_status_history_order_id_created_at_idx" ON "order_status_history"("order_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_order_id_key" ON "payments"("provider_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_payment_id_key" ON "payments"("provider_payment_id");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "payments_status_created_at_idx" ON "payments"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_provider_refund_id_key" ON "refunds"("provider_refund_id");

-- CreateIndex
CREATE INDEX "refunds_order_id_idx" ON "refunds"("order_id");

-- CreateIndex
CREATE INDEX "webhook_events_received_at_idx" ON "webhook_events"("received_at");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_event_id_key" ON "webhook_events"("provider", "event_id");

-- CreateIndex
CREATE INDEX "shipments_order_id_idx" ON "shipments"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_carrier_tracking_number_key" ON "shipments"("carrier", "tracking_number");

-- CreateIndex
CREATE INDEX "return_requests_order_id_idx" ON "return_requests"("order_id");

-- CreateIndex
CREATE INDEX "return_requests_status_created_at_idx" ON "return_requests"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "coupons_is_active_ends_at_idx" ON "coupons"("is_active", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_usages_order_id_key" ON "coupon_usages"("order_id");

-- CreateIndex
CREATE INDEX "coupon_usages_coupon_id_user_id_idx" ON "coupon_usages"("coupon_id", "user_id");

-- CreateIndex
CREATE INDEX "coupon_usages_coupon_id_email_idx" ON "coupon_usages"("coupon_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_order_item_id_key" ON "reviews"("order_item_id");

-- CreateIndex
CREATE INDEX "reviews_product_id_status_created_at_idx" ON "reviews"("product_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "reviews_status_created_at_idx" ON "reviews"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_product_id_user_id_key" ON "reviews"("product_id", "user_id");

-- CreateIndex
CREATE INDEX "product_questions_product_id_status_created_at_idx" ON "product_questions"("product_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscribers_email_key" ON "newsletter_subscribers"("email");

-- CreateIndex
CREATE INDEX "contact_messages_status_created_at_idx" ON "contact_messages"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "search_queries_query_key" ON "search_queries"("query");

-- CreateIndex
CREATE INDEX "search_queries_count_idx" ON "search_queries"("count" DESC);

-- CreateIndex
CREATE INDEX "banners_placement_is_active_priority_idx" ON "banners"("placement", "is_active", "priority" DESC);

-- CreateIndex
CREATE INDEX "home_sections_is_active_position_idx" ON "home_sections"("is_active", "position");

-- CreateIndex
CREATE UNIQUE INDEX "pages_slug_key" ON "pages"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "seo_overrides_path_key" ON "seo_overrides"("path");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_storage_key_key" ON "media_assets"("storage_key");

-- CreateIndex
CREATE INDEX "media_assets_created_at_idx" ON "media_assets"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_wishlist_id_fkey" FOREIGN KEY ("wishlist_id") REFERENCES "wishlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_usages" ADD CONSTRAINT "coupon_usages_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_usages" ADD CONSTRAINT "coupon_usages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_usages" ADD CONSTRAINT "coupon_usages_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_questions" ADD CONSTRAINT "product_questions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_questions" ADD CONSTRAINT "product_questions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_sections" ADD CONSTRAINT "home_sections_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =====================================================================
-- Hand-written constraints and objects that Prisma's schema language
-- cannot express. Prisma Migrate does not manage CHECK constraints,
-- sequences or functions, so they persist across future migrations.
-- (Verified in CI: `prisma migrate diff` must report no drift.)
-- =====================================================================

-- ---- identity --------------------------------------------------------
ALTER TABLE "users" ADD CONSTRAINT "users_email_or_phone_chk"
  CHECK ("email" IS NOT NULL OR "phone" IS NOT NULL);
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase_chk"
  CHECK ("email" IS NULL OR "email" = lower("email"));
ALTER TABLE "users" ADD CONSTRAINT "users_phone_format_chk"
  CHECK ("phone" IS NULL OR "phone" ~ '^[6-9][0-9]{9}$');
ALTER TABLE "users" ADD CONSTRAINT "users_failed_logins_chk" CHECK ("failed_login_attempts" >= 0);
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_attempts_chk" CHECK ("attempts" >= 0);
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_pincode_chk" CHECK ("pincode" ~ '^[1-9][0-9]{5}$');
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_phone_chk" CHECK ("phone" ~ '^[6-9][0-9]{9}$');

-- ---- catalogue -------------------------------------------------------
ALTER TABLE "categories" ADD CONSTRAINT "categories_depth_chk" CHECK ("depth" BETWEEN 0 AND 2);
ALTER TABLE "categories" ADD CONSTRAINT "categories_not_own_parent_chk"
  CHECK ("parent_id" IS NULL OR "parent_id" <> "id");

ALTER TABLE "products" ADD CONSTRAINT "products_tax_rate_chk" CHECK ("tax_rate" IN (0, 3, 5, 12, 18, 28));
ALTER TABLE "products" ADD CONSTRAINT "products_return_window_chk" CHECK ("return_window_days" BETWEEN 0 AND 90);
ALTER TABLE "products" ADD CONSTRAINT "products_rating_chk"
  CHECK ("rating_avg" BETWEEN 0 AND 5 AND "rating_count" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_nonnegative_chk"
  CHECK ("min_price" >= 0 AND "sold_count" >= 0 AND "max_discount_pct" BETWEEN 0 AND 100);

ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_price_chk"
  CHECK ("price" > 0 AND "mrp" >= "price");

-- The database itself refuses any write that would oversell.
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_stock_chk"
  CHECK ("stock" >= 0 AND "reserved" >= 0 AND "reserved" <= "stock" AND "low_stock_threshold" >= 0);

-- Full-text search document over name, tags, short description and highlights.
-- Wrapped in an IMMUTABLE function so it can back an expression index.
CREATE FUNCTION sk_product_search_document(name text, short_description text, tags text[], highlights text[])
  RETURNS tsvector LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT setweight(to_tsvector('simple', coalesce(name, '')), 'A')
        || setweight(to_tsvector('simple', coalesce(array_to_string(tags, ' '), '')), 'B')
        || setweight(to_tsvector('simple', coalesce(short_description, '')), 'C')
        || setweight(to_tsvector('simple', coalesce(array_to_string(highlights, ' '), '')), 'D')
  $$;

-- ---- cart & orders ---------------------------------------------------
ALTER TABLE "carts" ADD CONSTRAINT "carts_owner_chk"
  CHECK ("user_id" IS NOT NULL OR "guest_token_hash" IS NOT NULL);
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_quantity_chk" CHECK ("quantity" BETWEEN 1 AND 99);

ALTER TABLE "orders" ADD CONSTRAINT "orders_amounts_chk" CHECK (
  "mrp_total" >= 0 AND "subtotal" >= 0 AND "coupon_discount" >= 0 AND "shipping_fee" >= 0
  AND "cod_fee" >= 0 AND "tax_total" >= 0 AND "grand_total" >= 0
  AND "grand_total" = "subtotal" - "coupon_discount" + "shipping_fee" + "cod_fee"
);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_amounts_chk" CHECK (
  "quantity" > 0 AND "unit_price" >= 0 AND "mrp" >= 0 AND "tax_amount" >= 0
  AND "discount_amount" >= 0 AND "line_total" >= 0
);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_chk" CHECK ("amount" > 0);
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_chk" CHECK ("amount" > 0);

-- Human-friendly order numbers: SK + YYMMDD + sequence (see OrderNumberService).
CREATE SEQUENCE "order_number_seq" START 1000 INCREMENT 1;

-- ---- promotions & engagement -----------------------------------------
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_value_chk" CHECK (
  "value" > 0 AND ("type" <> 'PERCENTAGE' OR "value" <= 100)
  AND "min_cart_value" >= 0 AND ("max_discount" IS NULL OR "max_discount" > 0)
  AND ("usage_limit" IS NULL OR "usage_limit" > 0) AND "usage_per_user" > 0 AND "used_count" >= 0
  AND ("starts_at" IS NULL OR "ends_at" IS NULL OR "starts_at" < "ends_at")
);
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_code_upper_chk" CHECK ("code" = upper("code"));
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_chk" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "banners" ADD CONSTRAINT "banners_dates_chk"
  CHECK ("starts_at" IS NULL OR "ends_at" IS NULL OR "starts_at" < "ends_at");
ALTER TABLE "home_sections" ADD CONSTRAINT "home_sections_limit_chk" CHECK ("limit" BETWEEN 1 AND 48);
ALTER TABLE "home_sections" ADD CONSTRAINT "home_sections_category_chk"
  CHECK ("source" <> 'CATEGORY' OR "category_id" IS NOT NULL);
