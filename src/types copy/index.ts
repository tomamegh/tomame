import { LucideIcon } from "lucide-react";

export interface User {
  id: string;
  email: string;
  role: "user" | "admin";
  created_at: string;
}

export interface Profile {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  shipping_address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  avatar_url?: string;
  updated_at: string;
}

export interface Product {
  id: string;
  user_id: string;
  url: string;
  title: string;
  price: number;
  description?: string;
  image_url?: string;
  platform: string;
  weight?: number;
  color?: string;
  availability: boolean;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface Order {
  id: string;
  user_id: string;
  product_id: string;
  quantity: number;
  product_price: number;
  shipping_cost: number;
  tax: number;
  service_fee: number;
  total_cost: number;
  status: "pending" | "processing" | "purchased" | "shipped" | "delivered";
  destination_country: string;
  created_at: string;
  updated_at: string;
  product?: Product;
}

export interface OrderStatusHistory {
  id: string;
  order_id: string;
  status: string;
  changed_at: string;
  changed_by: string;
}

export interface Notification {
  id: string;
  user_id: string;
  order_id?: string;
  type: "order_update" | "shipping" | "system";
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

export interface ShippingCalculation {
  base_shipping: number;
  freight: number;
  tax: number;
  service_fee: number;
  total: number;
  breakdown: {
    product_price: number;
    weight: number;
    destination: string;
  };
}

export type SidebarMenuItemType = {
  title: string;
  url: string;
  icon?: LucideIcon;
  isActive?: boolean;
  items?: SidebarMenuItemType[];
}
