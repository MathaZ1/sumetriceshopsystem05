import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { Product } from '../types';
import { Plus, Download, Edit2, Trash2, Filter, AlertTriangle, Eye, ArrowLeft, Search } from 'lucide-react';
import ProductFormModal from './ProductFormModal';
import ConfirmModal from './ConfirmModal';

interface ProductsViewProps {
  searchQuery: string;
}

export default function ProductsView({ searchQuery }: ProductsViewProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<string>('ทั้งหมด');
  const [localSearchQuery, setLocalSearchQuery] = useState<string>('');
  
  // Modal states
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Delete confirm states
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState<boolean>(false);

  // Alert modal states
  const [alertOpen, setAlertOpen] = useState<boolean>(false);
  const [alertTitle, setAlertTitle] = useState<string>('');
  const [alertMessage, setAlertMessage] = useState<string>('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 8;

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

  // Filter products
  const filteredProducts = products.filter((p) => {
    // Filter by search query
    const searchVal = localSearchQuery.trim().toLowerCase();
    const matchesSearch = p.name.toLowerCase().includes(searchVal) || p.id.toLowerCase().includes(searchVal);
    
    return matchesSearch;
  });

  // Pagination logic
  const totalItems = filteredProducts.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredProducts.slice(indexOfFirstItem, indexOfLastItem);

  const handleOpenAddModal = () => {
    setEditingProduct(null);
    setModalOpen(true);
  };

  const handleOpenEditModal = (product: Product) => {
    setEditingProduct(product);
    setModalOpen(true);
  };

  const handleSaveProduct = async (productData: Product) => {
    try {
      const prodRef = doc(db, 'products', productData.id);
      await setDoc(prodRef, productData, { merge: true });
    } catch (error) {
      console.error('Error writing product doc:', error);
      handleFirestoreError(error, OperationType.WRITE, `products/${productData.id}`);
      throw error;
    }
  };

  const handleDeleteClick = (productId: string) => {
    setDeleteId(productId);
    setConfirmDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteDoc(doc(db, 'products', deleteId));
    } catch (error) {
      console.error('Error deleting product:', error);
      handleFirestoreError(error, OperationType.DELETE, `products/${deleteId}`);
      setAlertTitle('เกิดข้อผิดพลาด');
      setAlertMessage('เกิดข้อผิดพลาดในการลบสินค้า');
      setAlertOpen(true);
    } finally {
      setDeleteId(null);
    }
  };

  const handleExportCSV = () => {
    // Generates static CSV from products list
    const headers = ['รหัสสินค้า', 'ชื่อสินค้า', 'สต็อก', 'ราคา (บาท)', 'สถานะ'];
    const rows = products.map(p => [p.id, p.name, p.stock, p.price, p.status]);
    
    const csvContent = "data:text/csv;charset=utf-8,\ufeff" 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `shop_inventory_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 p-4 lg:p-6 lg:px-8 w-full max-w-7xl mx-auto overflow-x-hidden bg-slate-50 min-h-screen">
      {/* Header and Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">รายการสินค้า</h2>
          <p className="text-sm text-slate-500 mt-1 font-medium">จัดการรายการสินค้าและราคาทั้งหมดในระบบ</p>
        </div>
        <div className="flex flex-wrap gap-2.5 w-full sm:w-auto">
          <button
            onClick={handleOpenAddModal}
            className="flex-1 sm:flex-none bg-slate-900 hover:bg-slate-850 text-white px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>เพิ่มสินค้า</span>
          </button>
        </div>
      </div>

      {/* Filters & Tabs Section */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 mb-6 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
        {/* Local Search Input Field */}
        <div className="relative w-full md:w-72 shrink-0">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            placeholder="ค้นหาชื่อหรือรหัสสินค้า..."
            value={localSearchQuery}
            onChange={(e) => {
              setLocalSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 bg-white placeholder-slate-400 focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none transition-all shadow-sm"
          />
        </div>
      </div>

      {/* Main Table Section (Desktop View) */}
      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm hidden md:block">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse table-fixed">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs font-semibold tracking-wider border-b border-slate-100 uppercase">
                <th className="p-4 w-12 text-center">
                  <input
                    type="checkbox"
                    className="rounded text-slate-900 border-slate-200 focus:ring-slate-950 bg-white"
                  />
                </th>
                <th className="p-4 w-3/5">ชื่อสินค้า</th>
                <th className="p-4 w-32 text-right">ราคา (฿)</th>
                <th className="p-4 w-28 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-20 text-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-900 mx-auto"></div>
                  </td>
                </tr>
              ) : currentItems.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-16 text-center text-slate-400">
                    ไม่พบสินค้าตรงตามเงื่อนไขที่ค้นหา
                  </td>
                </tr>
              ) : (
                currentItems.map((p) => {
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 text-center">
                        <input
                          type="checkbox"
                          className="rounded text-slate-900 border-slate-200 focus:ring-slate-950 bg-white"
                        />
                      </td>
                      <td className="p-4 font-bold text-slate-900 truncate">
                        <button
                          onClick={() => handleOpenEditModal(p)}
                          className="hover:underline text-left text-slate-900 hover:text-slate-700 transition-colors cursor-pointer font-bold focus:outline-none"
                        >
                          {p.name}
                        </button>
                      </td>
                      <td className="p-4 text-right font-extrabold text-slate-900">
                        {p.price.toFixed(2)}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenEditModal(p)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteClick(p.id)}
                            className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-white">
          <span className="text-xs font-semibold text-slate-500">
            แสดง {totalItems > 0 ? indexOfFirstItem + 1 : 0} ถึง {Math.min(indexOfLastItem, totalItems)} จาก {totalItems} รายการ
          </span>
          
          <div className="flex gap-1.5">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white cursor-pointer transition-colors"
            >
              ย้อนกลับ
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  currentPage === page
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {page}
              </button>
            ))}
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white cursor-pointer transition-colors"
            >
              ถัดไป
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Card List View (Visible on screens < 768px) */}
      <div className="md:hidden flex flex-col gap-4 pb-24">
        {loading ? (
          <div className="py-20 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            ไม่พบสินค้าในระบบ
          </div>
        ) : (
              filteredProducts.map((p) => {
            return (
              <div
                key={p.id}
                className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col relative"
              >
                {/* Actions Trigger */}
                <div className="absolute top-4 right-4 flex gap-1">
                  <button
                    onClick={() => handleOpenEditModal(p)}
                    className="p-1 text-slate-400 hover:text-slate-900 rounded-lg"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteClick(p.id)}
                    className="p-1 text-slate-400 hover:text-red-600 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Info block */}
                <div className="mb-3">
                  <div className="min-w-0 flex-1 pr-12">
                    <h3 className="font-bold text-slate-900 leading-snug truncate">
                      <button
                        onClick={() => handleOpenEditModal(p)}
                        className="hover:underline text-left font-bold text-slate-900 hover:text-slate-700 transition-colors cursor-pointer focus:outline-none"
                      >
                        {p.name}
                      </button>
                    </h3>
                  </div>
                </div>

                {/* Sub row */}
                <div className="flex justify-end items-end pt-3 border-t border-slate-100">
                  <div className="text-right">
                    <p className="text-lg font-black text-slate-900">฿{p.price.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Product Form Modal */}
      <ProductFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        product={editingProduct}
        onSave={handleSaveProduct}
      />

      {/* Confirm Delete Modal */}
      <ConfirmModal
        isOpen={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={handleConfirmDelete}
        title="ลบสินค้าออกจากคลัง"
        message="คุณแน่ใจหรือไม่ว่าต้องการลบสินค้านี้ออกจากคลัง? การดำเนินการนี้ไม่สามารถย้อนกลับได้"
        confirmText="ลบสินค้า"
        cancelText="ยกเลิก"
        isDanger={true}
      />

      {/* Alert Modal */}
      <ConfirmModal
        isOpen={alertOpen}
        onClose={() => setAlertOpen(false)}
        onConfirm={() => setAlertOpen(false)}
        title={alertTitle}
        message={alertMessage}
        confirmText="ตกลง"
        showCancel={false}
      />
    </div>
  );
}
