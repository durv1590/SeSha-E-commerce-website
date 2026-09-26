/** Admin contracts. Amounts in paise. */

export interface MediaUploadDto {
  id: string;
  url: string;
  width: number;
  height: number;
  sizeBytes: number;
}

export interface KpiDto {
  /** Gross sales of confirmed orders (paise), cancellations excluded. */
  revenue: number;
  orders: number;
  averageOrderValue: number;
  /** Same measures for the previous period of equal length (for trends). */
  previous: { revenue: number; orders: number; averageOrderValue: number };
}

export interface DashboardDto {
  generatedAt: string;
  today: KpiDto;
  last7Days: KpiDto;
  last30Days: KpiDto;
  /** One point per India-time day, oldest first (30 days). */
  daily: { date: string; revenue: number; orders: number }[];
  /** Work waiting for the team. */
  queues: {
    toShip: number;
    paymentPending: number;
    openReturns: number;
    lowStock: number;
    outOfStock: number;
    pendingReviews: number;
    pendingManualRefunds: number;
  };
  recentOrders: {
    orderNumber: string;
    customer: string;
    total: number;
    status: import('./enums').OrderStatus;
    statusLabel: string;
    placedAt: string;
  }[];
  topProducts: { productId: string | null; name: string; units: number; revenue: number }[];
}

// ------------------------------------------------------------- catalogue admin

export type ProductStatusDto = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export interface AdminProductListItemDto {
  id: string;
  name: string;
  slug: string;
  sku: string;
  status: ProductStatusDto;
  isFeatured: boolean;
  imageUrl: string | null;
  category: { id: string; name: string };
  brand: { id: string; name: string } | null;
  /** Lowest active variant price (paise). */
  minPrice: number;
  variantCount: number;
  /** Sellable units across active variants. */
  availableStock: number;
  /** True when any active variant is at or below its low-stock threshold. */
  lowStock: boolean;
  soldCount: number;
  updatedAt: string;
}

export interface AdminVariantDto {
  id: string;
  sku: string;
  name: string;
  options: Record<string, string>;
  mrp: number;
  price: number;
  weightGrams: number | null;
  isDefault: boolean;
  isActive: boolean;
  stock: number;
  reserved: number;
  lowStockThreshold: number;
  /** Ordered at least once: can be deactivated but not deleted. */
  hasOrders: boolean;
}

export interface AdminProductImageDto {
  id: string;
  url: string;
  alt: string;
  width: number;
  height: number;
  variantSku: string | null;
}

export interface AdminProductDto {
  id: string;
  name: string;
  slug: string;
  sku: string;
  status: ProductStatusDto;
  shortDescription: string;
  description: string;
  categoryId: string;
  brandId: string | null;
  isFeatured: boolean;
  taxRate: number;
  hsnCode: string | null;
  highlights: string[];
  tags: string[];
  specifications: { label: string; value: string }[];
  weightGrams: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  videoUrl: string | null;
  shippingInfo: string | null;
  returnInfo: string | null;
  warrantyInfo: string | null;
  isReturnable: boolean;
  returnWindowDays: number;
  isCodAvailable: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  variants: AdminVariantDto[];
  images: AdminProductImageDto[];
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Ordered at least once: can be archived but not deleted. */
  hasOrders: boolean;
  ratingAvg: number;
  ratingCount: number;
  soldCount: number;
}

export interface AdminCategoryDto {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  depth: number;
  description: string | null;
  seoContent: string | null;
  imageUrl: string | null;
  bannerUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  isFeatured: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  /** Products directly in this category. */
  productCount: number;
  childCount: number;
}

export interface AdminBrandDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  isActive: boolean;
  isFeatured: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  productCount: number;
}

export interface InventoryRowDto {
  variantId: string;
  productId: string;
  productName: string;
  productStatus: ProductStatusDto;
  variantName: string;
  sku: string;
  imageUrl: string | null;
  isActive: boolean;
  stock: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  state: 'in_stock' | 'low_stock' | 'out_of_stock';
  updatedAt: string;
}

export type InventoryTxTypeDto = 'ADJUSTMENT' | 'RESTOCK' | 'RESERVE' | 'RELEASE' | 'SALE' | 'RETURN';

export interface InventoryLedgerEntryDto {
  id: string;
  type: InventoryTxTypeDto;
  quantity: number;
  stockAfter: number;
  reservedAfter: number;
  reason: string | null;
  orderNumber: string | null;
  actor: string | null;
  createdAt: string;
}

export interface ImportRowIssue {
  /** 1-based line number in the file (the header is line 1). */
  line: number;
  column?: string;
  message: string;
}

export interface ProductImportResultDto {
  dryRun: boolean;
  rows: number;
  products: { create: number; update: number; unchanged: number };
  variants: { create: number; update: number; unchanged: number };
  errors: ImportRowIssue[];
  /** Applied only when there are no errors and dryRun is false. */
  applied: boolean;
}
