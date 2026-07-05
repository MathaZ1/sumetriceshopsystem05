import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { Customer } from '../types';
import { Users, Plus, Search, Edit2, Trash2, Phone, MapPin, FileText, Check, X } from 'lucide-react';
import ConfirmModal from './ConfirmModal';

export default function CustomersView() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  // Form states
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [taxId, setTaxId] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Delete confirm states
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteName, setDeleteName] = useState<string>('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState<boolean>(false);

  // Alert modal states
  const [alertOpen, setAlertOpen] = useState<boolean>(false);
  const [alertTitle, setAlertTitle] = useState<string>('');
  const [alertMessage, setAlertMessage] = useState<string>('');

  // Read customers from Firestore
  useEffect(() => {
    const customersCol = collection(db, 'customers');
    const q = query(customersCol, orderBy('name', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Customer[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Customer);
      });
      setCustomers(list);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'customers');
    });

    return () => unsubscribe();
  }, []);

  const handleOpenAdd = () => {
    setEditingCustomer(null);
    setName('');
    setPhone('');
    setAddress('');
    setTaxId('');
    setError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (c: Customer) => {
    setEditingCustomer(c);
    setName(c.name);
    setPhone(c.phone);
    setAddress(c.address || '');
    setTaxId(c.taxId || '');
    setError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('กรุณากรอกชื่อลูกค้า');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const id = editingCustomer ? editingCustomer.id : 'CUST-' + Math.floor(10000 + Math.random() * 90000);
      const customerData: Customer = {
        id,
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        taxId: taxId.trim()
      };

      await setDoc(doc(db, 'customers', id), customerData);
      setIsModalOpen(false);
    } catch (error) {
      console.error('Failed to save customer:', error);
      setError('เกิดข้อผิดพลาดในการบันทึกข้อมูลลูกค้า');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (id: string, customerName: string) => {
    setDeleteId(id);
    setDeleteName(customerName);
    setConfirmDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteDoc(doc(db, 'customers', deleteId));
    } catch (error) {
      console.error('Failed to delete customer:', error);
      setAlertTitle('เกิดข้อผิดพลาด');
      setAlertMessage('เกิดข้อผิดพลาดในการลบข้อมูลลูกค้า');
      setAlertOpen(true);
    } finally {
      setDeleteId(null);
      setDeleteName('');
    }
  };

  // Filter list
  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone.includes(searchQuery) ||
    (c.address && c.address.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (c.taxId && c.taxId.includes(searchQuery))
  );

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-4 md:p-6 xl:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header Block */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 md:text-2xl">ข้อมูลสมาชิกลูกค้า</h2>
            <p className="text-sm text-slate-500 mt-1 font-medium">บันทึกและจัดการรายชื่อ ข้อมูลการติดต่อ และเลขผู้เสียภาษีของลูกค้า</p>
          </div>
          <button
            onClick={handleOpenAdd}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 bg-slate-950 text-white rounded-xl px-4 py-2.5 hover:bg-slate-850 font-semibold text-xs cursor-pointer shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>เพิ่มรายชื่อลูกค้า</span>
          </button>
        </div>

        {/* Filter / Search Bar */}
        <div className="relative bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none transition-all duration-200"
              placeholder="ค้นหาลูกค้าด้วย ชื่อ, เบอร์โทรศัพท์, ที่อยู่ หรือเลขประจำตัวผู้เสียภาษี..."
            />
          </div>
        </div>

        {/* Members Grid / List */}
        {loading ? (
          <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center shadow-sm">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-950 mx-auto"></div>
            <p className="text-xs text-slate-400 mt-4 font-semibold">กำลังโหลดข้อมูลลูกค้า...</p>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="bg-white border border-slate-100 rounded-2xl p-16 text-center shadow-sm flex flex-col items-center">
            <Users className="w-12 h-12 text-slate-300 stroke-[1.5] mb-3" />
            <p className="text-sm font-bold text-slate-700">ไม่พบข้อมูลลูกค้า</p>
            <p className="text-xs text-slate-400 mt-1">คุณสามารถเพิ่มรายชื่อลูกค้าสมาชิกใหม่ได้โดยคลิกปุ่ม "เพิ่มรายชื่อลูกค้า"</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredCustomers.map((c) => (
              <div key={c.id} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start gap-2 border-b border-slate-50 pb-3 mb-3">
                    <div>
                      <h4 className="font-bold text-slate-900 text-base">{c.name}</h4>
                      <span className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider">{c.id}</span>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => handleOpenEdit(c)}
                        className="p-1.5 hover:bg-slate-50 text-slate-500 hover:text-slate-900 rounded-lg transition-colors cursor-pointer"
                        title="แก้ไขข้อมูล"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(c.id, c.name)}
                        className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-colors cursor-pointer"
                        title="ลบข้อมูล"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs font-semibold text-slate-600">
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{c.phone || '-'}</span>
                    </div>

                    {c.taxId && (
                      <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>เลขผู้เสียภาษี: <span className="font-mono text-slate-900">{c.taxId}</span></span>
                      </div>
                    )}

                    {c.address && (
                      <div className="flex items-start gap-2">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                        <span className="line-clamp-2 text-slate-500">{c.address}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal Editor Form */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 className="text-base font-bold text-slate-800">
                  {editingCustomer ? 'แก้ไขข้อมูลลูกค้า' : 'เพิ่มรายชื่อลูกค้าสมาชิก'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="p-1 hover:bg-slate-200 text-slate-500 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-bold px-4 py-2.5 rounded-xl">
                    {error}
                  </div>
                )}
                {/* Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
                    ชื่อลูกค้า *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none transition-all"
                    placeholder="กรอกชื่อ-นามสกุล หรือชื่อร้านค้า..."
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
                    เบอร์โทรศัพท์
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none transition-all"
                    placeholder="เช่น 089-XXXXXXX"
                  />
                </div>

                {/* Tax ID */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
                    เลขประจำตัวผู้เสียภาษี
                  </label>
                  <input
                    type="text"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-850 focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none transition-all"
                    placeholder="13 หลัก เช่น 084351001529"
                  />
                </div>

                {/* Address */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
                    ที่อยู่สำหรับออกบิล
                  </label>
                  <textarea
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none transition-all resize-none h-20"
                    placeholder="กรอกที่อยู่ของลูกค้า..."
                  />
                </div>

                {/* Buttons */}
                <div className="flex gap-3 justify-end pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
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
                        <Check className="w-4 h-4" />
                        <span>บันทึกข้อมูล</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Spacer for mobile menu */}
        <div className="h-16 lg:hidden"></div>
      </div>

      {/* Confirm Delete Customer Modal */}
      <ConfirmModal
        isOpen={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={handleConfirmDelete}
        title="ลบรายชื่อลูกค้าสมาชิก"
        message={`คุณแน่ใจหรือไม่ว่าต้องการลบรายชื่อลูกค้า "${deleteName}"? การดำเนินการนี้ไม่สามารถย้อนกลับได้`}
        confirmText="ลบข้อมูล"
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
