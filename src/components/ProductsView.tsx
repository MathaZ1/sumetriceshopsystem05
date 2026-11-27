import React, { useState, useEffect } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { Product } from '../types';
import { Plus, Download, Edit2, Trash2, Search } from 'lucide-react';
import ProductFormModal from './ProductFormModal';
import ConfirmModal from './ConfirmModal';
import { downloadCsv } from '../utils/csv';

interface ProductsViewProps {
  searchQuery: string;
}

export default function ProductsView({ searchQuery }: ProductsViewProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [localSearchQuery, setLocalSearchQuery] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Modal states
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Delete confirm states
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState<boolean>(false);
  const [confirmBulkDeleteOpen, setConfirmBulkDeleteOpen] = useState<boolean>(false);
  const [confirmClearAllOpen, setConfirmClearAllOpen] = useState<boolean>(false);

  // Alert modal states
  const [alertOpen, setAlertOpen] = useState<boolean>(false);
  const [alertTitle, setAlertTitle] = useState<string>('');
  const [alertMessage, setAlertMessage] = useState<string>('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 8;

  // Listen to Firestore products
  useEffect(() => {
    if (!auth.currentUser) {
      setLoading(false);
      return;
    }
    const productsCol = collection(db, 'products');
    const unsubscribe = onSnapshot(productsCol, (snapshot) => {
      const prods: Product[] = [];
      snapshot.forEach((docSnap) => {
        prods.push({ id: docSnap.id, ...docSnap.data() } as Product);
      });
      setProducts(prods);
      setLoading(false);
    }, (error) => {
      setLoading(false);
      handleFirestoreError(error, OperationType.GET, 'products');
    });

    return () => unsubscribe();
  }, []);

  // Keep selectedIds pruned to existing products
  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => products.some((p) => p.id === id)));
  }, [products]);

  // Reset to page 1 when search queries change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, localSearchQuery]);

  // Filter products (null-safe)
  const filteredProducts = products.filter((p) => {
    const searchVal = (localSearchQuery || searchQuery || '').trim().toLowerCase();
    if (!searchVal) return true;
    const nameMatch = (p.name || '').toLowerCase().includes(searchVal);
    const idMatch = (p.id || '').toLowerCase().includes(searchVal);
    return nameMatch || idMatch;
  });

  // Pagination logic
  const totalItems = filteredProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const indexOfLastItem = safeCurrentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredProducts.slice(indexOfFirstItem, indexOfLastItem);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const allCurrentPageSelected =
    currentItems.length > 0 && currentItems.every((p) => selectedIds.includes(p.id));

  const toggleSelectAllCurrentPage = () => {
    const currentPageIds = currentItems.map((p) => p.id);
    if (allCurrentPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !currentPageIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...currentPageIds])));
    }
  };

  const toggleSelectOne = (productId: string) => {
    setSelectedIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

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
      setSelectedIds((prev) => prev.filter((id) => id !== deleteId));
    } catch (error) {
      console.error('Error deleting product:', error);
      setAlertTitle('เกิดข้อผิดพลาด');
      setAlertMessage('เกิดข้อผิดพลาดในการลบสินค้า');
      setAlertOpen(true);
    } finally {
      setDeleteId(null);
    }
  };

  const handleConfirmBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    try {
      await Promise.all(selectedIds.map((id) => deleteDoc(doc(db, 'products', id))));
      const deletedCount = selectedIds.length;
      setSelectedIds([]);
      setAlertTitle('สำเร็จ');
      setAlertMessage(`ลบสินค้าที่เลือกจำนวน ${deletedCount} รายการเรียบร้อยแล้ว`);
      setAlertOpen(true);
    } catch (error) {
      console.error('Error bulk deleting products:', error);
      setAlertTitle('เกิดข้อผิดพลาด');
      setAlertMessage('ไม่สามารถลบรายการสินค้าที่เลือกได้ครบถ้วน');
      setAlertOpen(true);
    } finally {
      setConfirmBulkDeleteOpen(false);
    }
  };

  const handleClearAllProducts = async () => {
    try {
      await Promise.all(products.map((p) => deleteDoc(doc(db, 'products', p.id))));
      await setDoc(doc(db, 'system', 'initialized'), { initialized: true });
      setSelectedIds([]);
      setAlertTitle('สำเร็จ');
      setAlertMessage('ล้างข้อมูลสินค้าทั้งหมดเรียบร้อยแล้ว');
      setAlertOpen(true);
    } catch (error) {
      console.error('Error clearing all products:', error);
      setAlertTitle('เกิดข้อผิดพลาด');
      setAlertMessage('เกิดข้อผิดพลาดในการล้างสินค้าทั้งหมด');
      setAlertOpen(true);
    } finally {
      setConfirmClearAllOpen(false);
    }
  };

  const handleExportCSV = () => {
    const targetList =
      selectedIds.length > 0
        ? products.filter((p) => selectedIds.includes(p.id))
        : filteredProducts;

    if (targetList.length === 0) {
      setAlertTitle('ไม่มีข้อมูลสำหรับส่งออก');
      setAlertMessage('ไม่พบรายการสินค้าที่จะส่งออกเป็นไฟล์ CSV');
      setAlertOpen(true);
      return;
    }

    const headers = ['รหัสสินค้า', 'ชื่อสินค้า', 'หมวดหมู่', 'สต็อก', 'ราคา (บาท)', 'สถานะ'];
    const rows = targetList.map((p) => [
      p.id || '',
      p.name || '',
      p.category || 'ทั่วไป',
      p.stock ?? 0,
      Number(p.price ?? 0).toFixed(2),
      p.status || 'พร้อมขาย',
    ]);

    downloadCsv(`shop_inventory_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
  };

  return (
    <div className="flex-1 p-4 lg:p-6 lg:px-8 w-full max-w-7xl mx-auto overflow-x-hidden bg-slate-50 min-h-screen">
      {/* Header and Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900">รายการสินค้า</h2>
          <p className="text-base text-slate-600 mt-1 font-medium">จัดการรายการสินค้าและราคาทั้งหมดในระบบ</p>
        </div>
        <div className="flex flex-wrap gap-2.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={filteredProducts.length === 0 && selectedIds.length === 0}
            className="flex-1 sm:flex-none border border-slate-200 hover:border-slate-300 text-slate-800 bg-white hover:bg-slate-50 px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-all disabled:opacity-40"
          >
            <Download className="w-4 h-4" />
            <span>
              {selectedIds.length > 0 ? `ส่งออก CSV (${selectedIds.length})` : 'ส่งออก CSV'}
            </span>
          </button>
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmBulkDeleteOpen(true)}
              className="flex-1 sm:flex-none border border-red-200 hover:border-red-300 text-red-700 bg-red-50 hover:bg-red-100 px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-all"
            >
              <Trash2 className="w-4 h-4" />
              <span>ลบที่เลือก ({selectedIds.length})</span>
            </button>
          )}
          {products.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmClearAllOpen(true)}
              className="flex-1 sm:flex-none border border-red-200 hover:border-red-300 text-red-600 bg-red-50 hover:bg-red-100/50 px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-all"
            >
              <Trash2 className="w-4 h-4" />
              <span>ล้างสินค้าทั้งหมด ({products.length})</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="flex-1 sm:flex-none bg-slate-900 hover:bg-slate-850 text-white px-4.5 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>เพิ่มสินค้า</span>
          </button>
        </div>
      </div>

      {/* Filters & Selection Info Bar */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 mb-6 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="relative w-full md:w-80 shrink-0">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
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
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm sm:text-base font-semibold text-slate-800 bg-white placeholder-slate-400 focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none transition-all shadow-sm"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end text-sm font-semibold text-slate-600">
          {selectedIds.length > 0 ? (
            <div className="flex items-center gap-2.5 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
              <span className="text-slate-900 font-bold tabular-nums">เลือกอยู่ {selectedIds.length} รายการ</span>
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="text-xs font-bold text-slate-600 hover:text-slate-950 underline cursor-pointer"
              >
                ล้างการเลือก
              </button>
            </div>
          ) : (
            <span className="tabular-nums">ทั้งหมด {filteredProducts.length} รายการ</span>
          )}
        </div>
      </div>

      {/* Main Table Section (Desktop View) */}
      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm hidden md:block">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse table-fixed">
            <thead>
              <tr className="bg-slate-50 text-slate-600 text-sm font-bold tracking-wide border-b border-slate-200">
                <th className="p-4 w-12 text-center">
                  <input
                    type="checkbox"
                    checked={allCurrentPageSelected}
                    onChange={toggleSelectAllCurrentPage}
                    disabled={currentItems.length === 0}
                    aria-label="เลือกสินค้าทั้งหมดในหน้านี้"
                    className="rounded text-slate-900 border-slate-300 focus:ring-slate-950 bg-white cursor-pointer"
                  />
                </th>
                <th className="p-4 w-3/5">ชื่อสินค้า</th>
                <th className="p-4 w-36 text-right">ราคา (฿)</th>
                <th className="p-4 w-28 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[15px]">
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-20 text-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-900 mx-auto"></div>
                  </td>
                </tr>
              ) : currentItems.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-16 text-center text-slate-400 text-base">
                    ไม่พบสินค้าตรงตามเงื่อนไขที่ค้นหา
                  </td>
                </tr>
              ) : (
                currentItems.map((p) => {
                  const isChecked = selectedIds.includes(p.id);
                  return (
                    <tr
                      key={p.id}
                      className={`transition-colors ${isChecked ? 'bg-slate-100/70' : 'hover:bg-slate-50/70'}`}
                    >
                      <td className="p-4 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectOne(p.id)}
                          aria-label={`เลือกสินค้า ${p.name || p.id}`}
                          className="rounded text-slate-900 border-slate-300 focus:ring-slate-950 bg-white cursor-pointer"
                        />
                      </td>
                      <td className="p-4 font-bold text-slate-900 truncate">
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(p)}
                          className="hover:underline text-left text-slate-900 hover:text-slate-700 transition-colors cursor-pointer font-bold focus:outline-none text-[15px]"
                        >
                          {p.name || '-'}
                        </button>
                      </td>
                      <td className="p-4 text-right text-base font-extrabold text-slate-950 font-mono tabular-nums">
                        {Number(p.price ?? 0).toFixed(2)}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(p)}
                            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                            title="แก้ไขสินค้า"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteClick(p.id)}
                            className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
                            title="ลบสินค้า"
                          >
                            <Trash2 className="w-4 h-4" />
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
          <span className="text-sm font-semibold text-slate-600 tabular-nums">
            แสดง {totalItems > 0 ? indexOfFirstItem + 1 : 0} ถึง {Math.min(indexOfLastItem, totalItems)} จาก {totalItems} รายการ
          </span>

          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={safeCurrentPage === 1}
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white cursor-pointer transition-colors"
            >
              ย้อนกลับ
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                type="button"
                onClick={() => setCurrentPage(page)}
                className={`w-9 h-9 rounded-lg text-sm font-bold transition-colors cursor-pointer tabular-nums ${
                  safeCurrentPage === page
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {page}
              </button>
            ))}
            <button
              type="button"
              disabled={safeCurrentPage === totalPages}
              onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white cursor-pointer transition-colors"
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
        ) : currentItems.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-base">
            ไม่พบสินค้าในระบบ
          </div>
        ) : (
          <>
            {currentItems.map((p) => {
              const isChecked = selectedIds.includes(p.id);
              return (
                <div
                  key={p.id}
                  className={`border rounded-2xl p-4 shadow-sm flex flex-col relative transition-colors ${
                    isChecked ? 'bg-slate-100/80 border-slate-300' : 'bg-white border-slate-100'
                  }`}
                >
                  {/* Selection & Actions Trigger */}
                  <div className="absolute top-4 right-4 flex gap-1.5 items-center">
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(p)}
                      className="p-1.5 text-slate-400 hover:text-slate-900 rounded-lg cursor-pointer"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteClick(p.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Info block */}
                  <div className="mb-3 flex items-start gap-2.5 pr-16">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleSelectOne(p.id)}
                      aria-label={`เลือกสินค้า ${p.name || p.id}`}
                      className="mt-1 rounded text-slate-900 border-slate-300 focus:ring-slate-950 bg-white cursor-pointer shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-bold text-slate-900 leading-snug truncate">
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(p)}
                          className="hover:underline text-left font-bold text-slate-900 hover:text-slate-700 transition-colors cursor-pointer focus:outline-none"
                        >
                          {p.name || '-'}
                        </button>
                      </h3>
                    </div>
                  </div>

                  {/* Sub row */}
                  <div className="flex justify-end items-end pt-3 border-t border-slate-100">
                    <div className="text-right">
                      <p className="text-xl font-black text-slate-950 font-mono tabular-nums">
                        ฿{Number(p.price ?? 0).toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}

            {totalPages > 1 && (
              <div className="flex items-center justify-between bg-white border border-slate-200 rounded-2xl p-3">
                <button
                  type="button"
                  disabled={safeCurrentPage === 1}
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 disabled:opacity-40 cursor-pointer"
                >
                  ย้อนกลับ
                </button>
                <span className="text-sm font-bold text-slate-700 tabular-nums">
                  หน้า {safeCurrentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={safeCurrentPage === totalPages}
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 disabled:opacity-40 cursor-pointer"
                >
                  ถัดไป
                </button>
              </div>
            )}
          </>
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

      {/* Confirm Bulk Delete Modal */}
      <ConfirmModal
        isOpen={confirmBulkDeleteOpen}
        onClose={() => setConfirmBulkDeleteOpen(false)}
        onConfirm={handleConfirmBulkDelete}
        title="ลบสินค้าที่เลือก"
        message={`คุณแน่ใจหรือไม่ว่าต้องการลบสินค้าที่เลือกทั้งหมด ${selectedIds.length} รายการ? การดำเนินการนี้ไม่สามารถย้อนกลับได้`}
        confirmText={`ลบ ${selectedIds.length} รายการ`}
        cancelText="ยกเลิก"
        isDanger={true}
      />

      {/* Confirm Clear All Modal */}
      <ConfirmModal
        isOpen={confirmClearAllOpen}
        onClose={() => setConfirmClearAllOpen(false)}
        onConfirm={handleClearAllProducts}
        title="ล้างข้อมูลสินค้าทั้งหมด"
        message="คุณแน่ใจหรือไม่ว่าต้องการลบรายการสินค้าทั้งหมดออกจากระบบ? การดำเนินการนี้ไม่สามารถย้อนกลับได้และข้อมูลจะสูญหายอย่างถาวร"
        confirmText="ล้างข้อมูลทั้งหมด"
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
