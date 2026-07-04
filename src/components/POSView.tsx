import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType, auth } from '../firebase';
import { collection, onSnapshot, addDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { Product, CartItem, Sale, SaleItem, Customer } from '../types';
import { ShoppingCart, Plus, Minus, Check } from 'lucide-react';

interface POSViewProps {
  searchQuery: string;
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  onCheckoutSuccess: (sale: Sale, cartItems: CartItem[]) => void;
  setReceiptItems: React.Dispatch<React.SetStateAction<CartItem[]>>;
  setActiveTab: React.Dispatch<React.SetStateAction<string>>;
  discount: number;
  setDiscount: React.Dispatch<React.SetStateAction<number>>;
  onExportToReceipt?: (items: CartItem[], discount: number) => void;
}

export default function POSView({
  searchQuery,
  cart,
  setCart,
  onCheckoutSuccess,
  setReceiptItems,
  setActiveTab,
  discount,
  setDiscount,
  onExportToReceipt
}: POSViewProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ทั้งหมด');
  const [loading, setLoading] = useState<boolean>(true);
  const [checkoutLoading, setCheckoutLoading] = useState<boolean>(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustId, setSelectedCustId] = useState<string>('');

  // Load customer lists from Firestore for POS dropdown
  useEffect(() => {
    const customersCol = collection(db, 'customers');
    const unsubscribe = onSnapshot(customersCol, (snapshot) => {
      const list: Customer[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Customer);
      });
      setCustomers(list);
    }, (error) => {
      console.error('Error loading customers in POSView:', error);
    });
    return () => unsubscribe();
  }, []);

  // Reset discount and customer if cart is empty
  useEffect(() => {
    if (cart.length === 0) {
      setDiscount(0);
      setSelectedCustId('');
    }
  }, [cart.length, setDiscount]);

  // Categories listed in the design
  const categories = ['ทั้งหมด'];

  // Listen to Firestore products
  useEffect(() => {
    const productsCol = collection(db, 'products');
    const unsubscribe = onSnapshot(productsCol, (snapshot) => {
      const prods: Product[] = [];
      snapshot.forEach((docSnap) => {
        prods.push({ id: docSnap.id, ...docSnap.data() } as Product);
      });
      setProducts(prods);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'products');
    });

    return () => unsubscribe();
  }, []);

  // Filter products by category and search query
  const filteredProducts = products.filter((p) => {
    const matchesCategory = selectedCategory === 'ทั้งหมด' || p.category === selectedCategory;
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const addToCart = (product: Product) => {
    if (product.stock <= 0) return;

    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        // If stock limit is reached
        if (existing.quantity >= product.stock) {
          alert(`ไม่สามารถเพิ่มสินค้าได้มากกว่าจำนวนสินค้าที่มีในคลัง (${product.stock} ชิ้น)`);
          return prev;
        }
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      } else {
        return [...prev, { product, quantity: 1 }];
      }
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) => {
      return prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            
            // Check stock limit for increase
            if (delta > 0 && newQty > item.product.stock) {
              alert(`ไม่สามารถเพิ่มสินค้าได้มากกว่าจำนวนสินค้าที่มีในคลัง (${item.product.stock} ชิ้น)`);
              return item;
            }

            return { ...item, quantity: newQty };
          }
          return item;
        })
        .filter((item) => item.quantity > 0);
    });
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const cartItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleCheckout = async () => {
    if (cart.length === 0) return;

    setCheckoutLoading(true);
    try {
      const batch = writeBatch(db);
      
      // Retrieve the current sequence from localStorage
      const savedSeq = localStorage.getItem('receipt_invoice_seq');
      const invoiceSeq = savedSeq ? parseInt(savedSeq, 10) : 1;
      const invoiceNumber = String(invoiceSeq).padStart(6, '0');
      
      // Increment and save sequence
      localStorage.setItem('receipt_invoice_seq', String(invoiceSeq + 1));
      
      const saleItems: SaleItem[] = cart.map((item) => ({
        productId: item.product.id,
        name: item.product.name,
        price: item.product.price,
        quantity: item.quantity,
        subtotal: item.product.price * item.quantity,
      }));

      const selectedCust = customers.find(c => c.id === selectedCustId);

      // Create new Sale object
      const newSale: Sale = {
        id: invoiceNumber,
        timestamp: new Date().toISOString(),
        employee: auth.currentUser?.displayName || 'พนักงานหน้าร้าน', // Dynamic employee name from Gmail login
        total: Math.max(0, cartTotal - discount),
        status: 'สำเร็จ',
        items: saleItems,
        discount: discount,
        customerName: selectedCust ? selectedCust.name : 'ลูกค้าทั่วไป',
        customerPhone: selectedCust ? selectedCust.phone : '',
      };

      // Add to 'sales' collection
      const salesCol = collection(db, 'sales');
      const saleDocRef = doc(salesCol, invoiceNumber);
      batch.set(saleDocRef, newSale);

      // Decrement inventory stock
      for (const item of cart) {
        const prodRef = doc(db, 'products', item.product.id);
        const newStock = Math.max(0, item.product.stock - item.quantity);
        const newStatus = newStock === 0 ? 'หมดสต็อก' : newStock <= 15 ? 'ใกล้หมด' : 'พร้อมขาย';
        batch.update(prodRef, {
          stock: newStock,
          status: newStatus
        });
      }

      await batch.commit();

      const itemsInCart = [...cart];
      // Reset cart and callback
      setCart([]);
      onCheckoutSuccess(newSale, itemsInCart);
    } catch (error) {
      console.error('Checkout failed:', error);
      handleFirestoreError(error, OperationType.WRITE, 'sales');
      alert('การทำรายการล้มเหลว กรุณาลองใหม่อีกครั้ง');
    } finally {
      setCheckoutLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden h-full relative">
      {/* Product Catalog Column */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-6 pb-24 md:pb-6 flex flex-col gap-4 bg-slate-50">
        {/* Categories Pills */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-5 py-2 rounded-full font-semibold text-xs whitespace-nowrap transition-all duration-200 cursor-pointer border ${
                selectedCategory === cat
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Loading Spinner */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 py-20">
            <ShoppingCart className="w-12 h-12 mb-3 stroke-[1.5]" />
            <p className="text-sm">ไม่พบสินค้าในระบบ</p>
          </div>
        ) : (
          /* Products Grid */
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredProducts.map((p) => {
              const isOutOfStock = p.stock <= 0;
              const isLowStock = p.stock > 0 && p.stock <= 15;

              return (
                <div
                  key={p.id}
                  onClick={() => addToCart(p)}
                  className={`bg-white rounded-2xl border border-slate-100 p-4 hover:border-slate-450 hover:shadow-md cursor-pointer transition-all duration-200 flex flex-col justify-between min-h-[120px] shadow-sm relative group ${
                    isOutOfStock ? 'opacity-60 cursor-not-allowed' : ''
                  }`}
                >
                  {/* Category and Stock Badge */}
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">
                      {p.category}
                    </span>
                    {isOutOfStock ? (
                      <span className="bg-red-50 text-red-600 border border-red-100 text-[9px] font-black px-1.5 py-0.5 rounded-md">
                        หมดสต็อก
                      </span>
                    ) : isLowStock ? (
                      <span className="bg-amber-50 text-amber-700 border border-amber-100 text-[9px] font-black px-1.5 py-0.5 rounded-md">
                        ใกล้หมด ({p.stock})
                      </span>
                    ) : null}
                  </div>

                  {/* Product Name */}
                  <div className="flex-1 flex items-center min-h-[40px] my-1">
                    <p className="text-sm font-extrabold text-slate-900 group-hover:text-slate-700 transition-colors line-clamp-2 leading-snug">
                      {p.name}
                    </p>
                  </div>

                  {/* Price and Stock Footer */}
                  <div className="flex justify-between items-end mt-3 pt-2.5 border-t border-slate-100">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold">ราคา</span>
                      <p className="text-base font-black text-slate-950">
                        ฿{p.price.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block font-bold">ในคลัง</span>
                      <p className="text-xs font-extrabold text-slate-700">
                        {p.stock} ชิ้น
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Checkout/Cart Sidebar Column */}
      <div className="hidden md:flex flex-col w-80 lg:w-96 bg-white border-l border-slate-200 h-full shadow-sm shrink-0">
        {/* Cart Header */}
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-slate-700" />
            <span>ตะกร้าสินค้า</span>
          </h2>
          <span className="text-xs font-semibold text-slate-900 bg-slate-200 px-2.5 py-1 rounded-full">
            {cartItemsCount} รายการ
          </span>
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {cart.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 py-10">
              <ShoppingCart className="w-10 h-10 mb-2 stroke-[1.5]" />
              <p className="text-xs">ยังไม่มีสินค้าในตะกร้า</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.product.id} className="flex justify-between items-start border-b border-slate-100 pb-3">
                <div className="flex-1 min-w-0 pr-2">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {item.product.name}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    ฿{item.product.price.toFixed(2)} / ชิ้น
                  </p>
                  
                  {/* Quantity controls */}
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => updateQuantity(item.product.id, -1)}
                      className="w-6 h-6 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 transition-colors cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-sm font-semibold w-6 text-center text-slate-800">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.product.id, 1)}
                      className="w-6 h-6 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Subtotal price */}
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-900">
                    ฿{(item.product.price * item.quantity).toFixed(2)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Summary & Checkout Button */}
        <div className="p-4 bg-slate-50 border-t border-slate-100">
          <div className="flex flex-col gap-2 mb-4">
            {/* Customer Select Dropdown */}
            <div className="flex flex-col gap-1 pb-2 border-b border-slate-200/50 mb-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">เลือกสมาชิก / Customer</span>
              <select
                value={selectedCustId}
                onChange={(e) => setSelectedCustId(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:border-slate-400 outline-none bg-white transition-all cursor-pointer shadow-sm"
              >
                <option value="">-- ลูกค้าทั่วไป (Cash Customer) --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phone ? `(${c.phone})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-between items-center text-xs font-semibold text-slate-500">
              <span>ยอดรวมสินค้า</span>
              <span>฿{cartTotal.toFixed(2)}</span>
            </div>

            {/* Discount input field */}
            <div className="flex justify-between items-center py-1.5 border-t border-b border-slate-200/50">
              <span className="text-xs font-bold text-slate-600">ส่วนลด (฿)</span>
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-0.5 w-28 shadow-sm focus-within:border-slate-450 transition-colors">
                <span className="text-slate-400 font-bold text-xs">฿</span>
                <input
                  type="number"
                  min="0"
                  max={cartTotal}
                  value={discount === 0 ? '' : discount}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (isNaN(val) || val < 0) {
                      setDiscount(0);
                    } else {
                      setDiscount(Math.min(cartTotal, val));
                    }
                  }}
                  placeholder="0"
                  className="w-full text-right border-none outline-none p-0 text-xs font-extrabold text-slate-800 focus:ring-0 bg-transparent"
                />
              </div>
            </div>

            <div className="flex justify-between items-center mt-1">
              <span className="text-sm font-bold text-slate-700">ยอดชำระสุทธิ</span>
              <span className="text-xl font-black text-slate-950">
                ฿{Math.max(0, cartTotal - discount).toFixed(2)}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={handleCheckout}
              disabled={cart.length === 0 || checkoutLoading}
              className={`w-full text-white font-bold py-3.5 px-4 rounded-xl shadow-sm transition-all duration-200 flex justify-center items-center gap-2 cursor-pointer ${
                cart.length === 0
                  ? 'bg-slate-300 cursor-not-allowed shadow-none'
                  : checkoutLoading
                  ? 'bg-slate-800 cursor-wait'
                  : 'bg-slate-950 hover:bg-slate-850 active:scale-[0.98]'
              }`}
            >
              {checkoutLoading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  <span>ยืนยันการสั่งซื้อ</span>
                </>
              )}
            </button>

            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (onExportToReceipt) {
                    onExportToReceipt([...cart], discount);
                  } else {
                    setReceiptItems([...cart]);
                    setActiveTab('receipt');
                  }
                }}
                className="w-full py-2.5 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>ออกใบเสร็จรับเงิน</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Floating Cart Summary Drawer Button */}
      <div className="md:hidden fixed bottom-18 right-4 left-4 z-40">
        <button
          onClick={() => {
            // In a mobile environment, click directly processes the sale if items are present, or shows alert.
            // Or we could let it slide up/toggle. Let's make it easy: clicking triggers checkout.
            if (cart.length > 0) {
              handleCheckout();
            } else {
              alert('กรุณาเลือกสินค้าใส่ตะกร้าก่อนทำการสั่งซื้อ');
            }
          }}
          className="w-full bg-slate-900 text-white font-bold py-3 px-4 rounded-xl shadow-lg flex justify-between items-center hover:bg-slate-850 transition-all duration-200 active:scale-[0.98]"
        >
          <span className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" />
            <span>ตะกร้า ({cartItemsCount})</span>
          </span>
          <span className="font-extrabold text-base">฿{Math.max(0, cartTotal - discount).toFixed(2)}</span>
        </button>
      </div>
    </div>
  );
}
