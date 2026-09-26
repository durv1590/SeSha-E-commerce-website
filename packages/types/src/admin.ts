import type { OrderDetailDto } from './orders';

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

// ------------------------------------------------------------------ operations

export interface AdminOrderListItemDto {
  orderNumber: string;
  placedAt: string;
  customerName: string;
  email: string;
  phone: string;
  /** Registered customer, if the order wasn't placed as a guest. */
  userId: string | null;
  itemCount: number;
  total: number;
  status: import('./enums').OrderStatus;
  statusLabel: string;
  paymentMethod: import('./enums').PaymentMethod;
  paymentStatus: import('./enums').PaymentStatus | null;
  city: string;
}

export interface AdminOrderDto extends OrderDetailDto {
  userId: string | null;
  customer: { id: string; name: string; orderCount: number; status: 'ACTIVE' | 'SUSPENDED' } | null;
  notes: string | null;
  payments: {
    provider: string;
    method: string | null;
    status: import('./enums').PaymentStatus;
    amount: number;
    reference: string | null;
    error: string | null;
    createdAt: string;
    capturedAt: string | null;
  }[];
  /** Refunds with their ids, for completing manual (cash-on-delivery) refunds. */
  staffRefunds: {
    id: string;
    amount: number;
    status: import('./enums').RefundStatus;
    manual: boolean;
    reason: string | null;
    reference: string | null;
    actor: string | null;
    createdAt: string;
    processedAt: string | null;
  }[];
  history: {
    from: import('./enums').OrderStatus | null;
    to: import('./enums').OrderStatus;
    toLabel: string;
    note: string | null;
    actor: string | null;
    at: string;
  }[];
  actions: {
    /** Manual status moves (the rest happen through shipments and payments). */
    statuses: ('PROCESSING' | 'PACKED')[];
    canShip: boolean;
    canAddTrackingEvent: boolean;
    canCancel: boolean;
    /** Amount still refundable (paise); 0 when nothing can be refunded. */
    refundable: number;
    refundIsManual: boolean;
  };
}

export interface AdminReturnListItemDto {
  id: string;
  orderNumber: string;
  type: 'RETURN' | 'REPLACEMENT';
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'RECEIVED' | 'COMPLETED';
  statusLabel: string;
  reason: string;
  units: number;
  customerName: string;
  createdAt: string;
}

export interface CustomerListItemDto {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: 'ACTIVE' | 'SUSPENDED';
  orderCount: number;
  /** Confirmed, not cancelled orders (paise). */
  totalSpent: number;
  lastOrderAt: string | null;
  createdAt: string;
}

export interface CustomerDetailDto extends CustomerListItemDto {
  emailVerified: boolean;
  phoneVerified: boolean;
  marketingOptIn: boolean;
  lastLoginAt: string | null;
  addresses: {
    id: string;
    name: string;
    phone: string;
    line: string;
    city: string;
    state: string;
    pincode: string;
    isDefault: boolean;
  }[];
  recentOrders: AdminOrderListItemDto[];
  activeSessions: number;
}

export interface AdminCouponDto {
  id: string;
  code: string;
  description: string | null;
  type: 'PERCENTAGE' | 'FIXED';
  value: number;
  maxDiscount: number | null;
  minCartValue: number;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  usagePerUser: number;
  usedCount: number;
  firstOrderOnly: boolean;
  productIds: string[];
  categoryIds: string[];
  isActive: boolean;
  /** Derived: live, scheduled, expired, exhausted or inactive. */
  state: 'live' | 'scheduled' | 'expired' | 'exhausted' | 'inactive';
  /** Total discount given (paise). */
  discountGiven: number;
  createdAt: string;
}

// -------------------------------------------------------------------- content

export interface AdminBannerDto {
  id: string;
  title: string;
  subtitle: string | null;
  ctaLabel: string | null;
  link: string | null;
  placement: 'HOME_HERO' | 'HOME_PROMO' | 'CATEGORY_TOP';
  theme: 'PRIMARY' | 'NAVY' | 'ACCENT' | 'LIGHT';
  imageDesktop: string | null;
  imageTablet: string | null;
  imageMobile: string | null;
  imageAlt: string | null;
  startsAt: string | null;
  endsAt: string | null;
  priority: number;
  isActive: boolean;
  /** Derived: showing now, scheduled, ended or off. */
  state: 'live' | 'scheduled' | 'ended' | 'off';
  updatedAt: string;
}

export interface AdminHomeSectionDto {
  id: string;
  title: string;
  subtitle: string | null;
  source: 'BEST_SELLERS' | 'NEW_ARRIVALS' | 'FEATURED' | 'DEALS' | 'CATEGORY';
  categoryId: string | null;
  categoryName: string | null;
  limit: number;
  position: number;
  isActive: boolean;
}

export interface AdminPageDto {
  id: string;
  slug: string;
  title: string;
  content: string;
  metaTitle: string | null;
  metaDescription: string | null;
  isPublished: boolean;
  updatedBy: string | null;
  updatedAt: string;
}

export interface AdminSeoOverrideDto {
  id: string;
  path: string;
  title: string | null;
  description: string | null;
  ogImage: string | null;
  noindex: boolean;
  updatedAt: string;
}

// ---------------------------------------------------------------- engagement

export interface AdminReviewDto {
  id: string;
  product: { id: string; name: string; slug: string };
  customer: { id: string; name: string; email: string | null };
  rating: number;
  title: string | null;
  body: string;
  isVerifiedPurchase: boolean;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  moderationNote: string | null;
  moderatedBy: string | null;
  moderatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A "needs attention" item in the admin notification bell. */
export interface AdminAlertDto {
  key: 'to_ship' | 'payment_pending' | 'returns' | 'manual_refunds' | 'reviews' | 'low_stock' | 'out_of_stock';
  label: string;
  count: number;
  href: string;
  tone: 'info' | 'warning';
}

export interface AuditEntryDto {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actor: { id: string; name: string; role: string } | null;
  metadata: unknown;
  ip: string | null;
  createdAt: string;
}

export interface StaffMemberDto {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: import('./enums').Role;
  status: 'ACTIVE' | 'SUSPENDED';
  lastLoginAt: string | null;
  createdAt: string;
  hasPassword: boolean;
  isSelf: boolean;
}

export interface SalesReportRowDto {
  /** YYYY-MM-DD (day) or YYYY-MM (month), India time. */
  period: string;
  orders: number;
  units: number;
  /** Item value before coupon discounts (paise). */
  grossSales: number;
  discounts: number;
  shipping: number;
  /** GST included in sales (paise). */
  tax: number;
  /** Refunds processed in the period (paise). */
  refunds: number;
  /** Order totals minus refunds (paise). */
  netSales: number;
}

export interface SalesReportDto {
  from: string;
  to: string;
  groupBy: 'day' | 'month';
  rows: SalesReportRowDto[];
  totals: Omit<SalesReportRowDto, 'period'>;
  byPayment: { method: 'PREPAID' | 'COD'; orders: number; netSales: number }[];
  byCategory: { category: string; units: number; sales: number }[];
}
