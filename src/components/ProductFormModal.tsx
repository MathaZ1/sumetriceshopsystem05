import React, { useState, useEffect } from 'react';
import { Product } from '../types';
import { X, Save } from 'lucide-react';

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  onSave: (productData: any) => Promise<void>;
}

export default function ProductFormModal({ isOpen, onClose, product, onSave }: ProductFormModalProps) {
  const [id, setId] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [category, setCategory] = useState<string>('เครื่องดื่ม');
  const [price, setPrice] = useState<number>(0);
  const [stock, setStock] = useState<number>(0);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Sync state with product when editing
  useEffect(() => {
    if (product) {
      setId(product.id);
      setName(product.name);
      setCategory(product.category || 'เครื่องดื่ม');
      setPrice(product.price);
      setStock(product.stock);
      setImageUrl(product.imageUrl || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=400');
    } else {
      // Clear for new product
      setId('PRD-' + Math.floor(10000 + Math.random() * 90000));
      setName('');
      setCategory('เครื่องดื่ม');
      setPrice(0);
      setStock(0);
      setImageUrl('https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=400');
    }
    setError(null);
  }, [product, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !name || price < 0 || stock < 0) {
      setError('กรุณากรอกข้อมูลให้ครบถ้วนและถูกต้อง');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      // Clean image URL if empty
      const finalImageUrl = imageUrl.trim() || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=400';
      
      const status = stock === 0 ? 'หมดสต็อก' : stock <= 15 ? 'ใกล้หมด' : 'พร้อมขาย';

      const productData = {
        id: id.trim().toUpperCase(),
        name: name.trim(),
        category,
        price: Number(price),
        stock: Number(stock),
        imageUrl: finalImageUrl,
        status
      };

      await onSave(productData);
      onClose();
    } catch (error) {
      console.error('Error saving product:', error);
      setError('เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="text-base font-bold text-slate-800">
            {product ? 'แก้ไขข้อมูลสินค้า' : 'เพิ่มสินค้าใหม่'}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-bold px-4 py-2.5 rounded-xl animate-shake">
              {error}
            </div>
          )}
          {/* Product Name */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
              ชื่อสินค้า
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none transition-all"
              placeholder="กรอกชื่อสินค้า..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Price */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
                ราคา (฿)
              </label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={price || ''}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none transition-all"
                placeholder="0.00"
              />
            </div>

            {/* Stock Level */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
                จำนวนสต็อก
              </label>
              <input
                type="number"
                required
                min="0"
                value={stock || ''}
                onChange={(e) => setStock(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none transition-all"
                placeholder="0"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4.5 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition-colors cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5.5 py-2.5 bg-slate-950 hover:bg-slate-850 disabled:bg-slate-300 text-white text-sm font-semibold rounded-xl flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            >
              {saving ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>บันทึกสินค้า</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
