export interface DashboardStats {
  totalOrders: number;
  ordersNeedingReview: number;
  totalRevenueGhs: number;
  activeUsers: number;
}

export interface ChartDataPoint {
  date: string; // "YYYY-MM-DD"
  orders: number;
  revenueGhs: number;
  users: number;
}

export interface DashboardLatestOrder {
  id: string;
  productName: string;
  status: string;
  originCountry: string;
  totalGhs: number | null;
  quantity: number;
  needsReview: boolean;
  createdAt: string;
}

export interface DashboardLatestDelivery {
  id: string;
  productName: string;
  status: string;
  carrier: string | null;
  trackingNumber: string | null;
  estimatedDeliveryDate: string | null;
  createdAt: string;
}

export interface DashboardLatestTransaction {
  id: string;
  reference: string;
  amountGhs: number;
  status: string;
  createdAt: string;
}

export interface DashboardData {
  stats: DashboardStats;
  chartData: ChartDataPoint[];
  latestOrders: DashboardLatestOrder[];
  latestDeliveries: DashboardLatestDelivery[];
  latestTransactions: DashboardLatestTransaction[];
}

export type ChartMetric = "orders" | "revenue" | "users";
