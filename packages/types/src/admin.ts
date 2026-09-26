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
