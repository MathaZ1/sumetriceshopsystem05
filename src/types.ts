export interface Product {
  id: string; // SKU or Auto-ID
  name: string;
  category: string;
  price: number;
  stock: number;
  imageUrl: string;
  status: 'พร้อมขาย' | 'ใกล้หมด' | 'หมดสต็อก';
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface SaleItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
}

export interface Sale {
  id: string; // INV-00124
  timestamp: string; // ISO format or human-readable
  employee: string;
  total: number;
  status: 'สำเร็จ' | 'ยกเลิก';
  items: SaleItem[];
  discount?: number;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerTaxId?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address?: string;
  taxId?: string;
  notes?: string;
}

