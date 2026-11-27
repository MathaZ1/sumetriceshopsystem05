import { CartItem, Product } from '../types';

export function roundSatang(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100) / 100;
}

export function sumCartSatang(items: CartItem[]): number {
  return items.reduce((sum, item) => {
    const priceSatang = Math.round((Number(item.product.price) || 0) * 100);
    const qty = Number(item.quantity) || 0;
    return sum + priceSatang * qty;
  }, 0);
}

export function getStockStatus(stock: number): Product['status'] {
  if (stock <= 0) return 'หมดสต็อก';
  if (stock <= 15) return 'ใกล้หมด';
  return 'พร้อมขาย';
}

export function isValidFirestoreId(id: string): boolean {
  return typeof id === 'string' && id.length >= 1 && id.length <= 128 && /^[a-zA-Z0-9_\-]+$/.test(id);
}
