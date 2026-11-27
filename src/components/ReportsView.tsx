import { useState, useEffect } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, query, orderBy, doc, runTransaction, getDocs, deleteDoc } from 'firebase/firestore';
import { Product, Sale } from '../types';
import { TrendingUp, FileText, Download, Trash2, RefreshCw, Database, AlertTriangle } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import ConfirmModal from './ConfirmModal';
import { downloadCsv } from '../utils/csv';
import { getStockStatus, roundSatang } from '../utils/calculations';

export default function ReportsView() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [timeFilter, setTimeFilter] = useState<'today' | 'week' | 'month'>('week');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  });

  // Modal confirmation states
  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);
  const [confirmTitle, setConfirmTitle] = useState<string>('');
  const [confirmMessage, setConfirmMessage] = useState<string>('');
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [resetting, setResetting] = useState<boolean>(false);

  // Read transactions from Firestore
  useEffect(() => {
    if (!auth.currentUser) {
      setLoading(false);
      return;
    }
    const salesCol = collection(db, 'sales');
    const q = query(salesCol, orderBy('timestamp', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const transactionList: Sale[] = [];
      snapshot.forEach((docSnap) => {
        transactionList.push({ id: docSnap.id, ...docSnap.data() } as Sale);
      });
      setSales(transactionList);
      setLoading(false);
    }, (error) => {
      setLoading(false);
      handleFirestoreError(error, OperationType.GET, 'sales');
    });

    return () => unsubscribe();
  }, []);

  // Filter out cancelled transactions for calculation totals
  const successfulSales = sales.filter((s) => s.status === 'สำเร็จ');

  // Month formatting helpers
  const getAvailableMonths = () => {
    const monthsSet = new Set<string>();
    
    // Always include current month
    const d = new Date();
    const currYear = d.getFullYear();
    const currMonth = String(d.getMonth() + 1).padStart(2, '0');
    monthsSet.add(`${currYear}-${currMonth}`);
    
    // Add months from sales timestamps
    sales.forEach(s => {
      const date = new Date(s.timestamp);
      if (!isNaN(date.getTime())) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        monthsSet.add(`${y}-${m}`);
      }
    });
    
    // Sort descending
    return Array.from(monthsSet).sort().reverse();
  };

  const formatThaiMonth = (yearMonth: string) => {
    const [y, m] = yearMonth.split('-');
    const monthNamesThai = [
      'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];
    const monthIdx = parseInt(m) - 1;
    const thaiYear = parseInt(y) + 543;
    return `${monthNamesThai[monthIdx]} ${thaiYear}`;
  };

  // Get current date time objects
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  // Start of week (Monday in Thailand)
  const currentDay = now.getDay();
  const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1;
  const startOfWeek = new Date(startOfToday.getTime() - distanceToMonday * 24 * 60 * 60 * 1000);
  
  // Start and End of selectedMonth
  const [selYearStr, selMonthStr] = selectedMonth.split('-');
  const selYear = parseInt(selYearStr);
  const selMonth = parseInt(selMonthStr) - 1; // 0-indexed
  const startOfSelectedMonth = new Date(selYear, selMonth, 1);
  const endOfSelectedMonth = new Date(selYear, selMonth + 1, 1); // Start of next month

  // Today stats
  const salesToday = successfulSales.filter(s => new Date(s.timestamp) >= startOfToday);
  const totalSalesToday = roundSatang(salesToday.reduce((sum, s) => sum + (Number(s.total) || 0), 0));
  const billsTodayCount = salesToday.length;

  // Week stats
  const salesWeek = successfulSales.filter(s => new Date(s.timestamp) >= startOfWeek);
  const totalSalesWeek = roundSatang(salesWeek.reduce((sum, s) => sum + (Number(s.total) || 0), 0));
  const billsWeekCount = salesWeek.length;

  // Month stats (filtered by selected month)
  const salesMonth = successfulSales.filter(s => {
    const d = new Date(s.timestamp);
    return d >= startOfSelectedMonth && d < endOfSelectedMonth;
  });
  const totalSalesMonth = roundSatang(salesMonth.reduce((sum, s) => sum + (Number(s.total) || 0), 0));
  const billsMonthCount = salesMonth.length;

  // Get selected filter calculations
  const getFilteredData = () => {
    switch (timeFilter) {
      case 'today':
        return {
          sales: salesToday,
          total: totalSalesToday,
          count: billsTodayCount,
          label: 'วันนี้'
        };
      case 'week':
        return {
          sales: salesWeek,
          total: totalSalesWeek,
          count: billsWeekCount,
          label: 'สัปดาห์นี้'
        };
      case 'month':
        return {
          sales: salesMonth,
          total: totalSalesMonth,
          count: billsMonthCount,
          label: formatThaiMonth(selectedMonth)
        };
    }
  };

  const activeStats = getFilteredData();
  const avgOrderValue = activeStats.count > 0 ? activeStats.total / activeStats.count : 0;

  // Generate chart data dynamically
  const getChartData = () => {
    if (timeFilter === 'today') {
      const hours = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'];
      const data = hours.map(h => ({ day: h, value: 0 }));
      
      salesToday.forEach(sale => {
        const d = new Date(sale.timestamp);
        const hour = d.getHours();
        let idx = 0;
        if (hour < 9) idx = 0;
        else if (hour < 11) idx = 1;
        else if (hour < 13) idx = 2;
        else if (hour < 15) idx = 3;
        else if (hour < 17) idx = 4;
        else if (hour < 19) idx = 5;
        else if (hour < 21) idx = 6;
        else idx = 7;
        
        data[idx].value += sale.total;
      });
      return data;
    }
    
    if (timeFilter === 'week') {
      const days = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
      const thaiDaysOrder = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];
      const thaiData = thaiDaysOrder.map(d => ({ day: d, value: 0 }));
      
      salesWeek.forEach(sale => {
        const d = new Date(sale.timestamp);
        const dayIdx = d.getDay();
        const dayName = days[dayIdx];
        const targetIdx = thaiDaysOrder.indexOf(dayName);
        if (targetIdx !== -1) {
          thaiData[targetIdx].value += sale.total;
        }
      });
      return thaiData;
    }
    
    if (timeFilter === 'month') {
      const blocks = ['1-5', '6-10', '11-15', '16-20', '21-25', '26-31'];
      const data = blocks.map(b => ({ day: b, value: 0 }));
      
      salesMonth.forEach(sale => {
        const d = new Date(sale.timestamp);
        const date = d.getDate();
        let idx = 0;
        if (date <= 5) idx = 0;
        else if (date <= 10) idx = 1;
        else if (date <= 15) idx = 2;
        else if (date <= 20) idx = 3;
        else if (date <= 25) idx = 4;
        else idx = 5;
        
        data[idx].value += sale.total;
      });
      return data;
    }
    
    return [];
  };

  const dynamicChartData = getChartData();

  // Filter transaction log table to the selected time filter
  const filteredSalesTable = sales.filter(s => {
    const saleDate = new Date(s.timestamp);
    if (timeFilter === 'today') return saleDate >= startOfToday;
    if (timeFilter === 'week') return saleDate >= startOfWeek;
    if (timeFilter === 'month') return saleDate >= startOfSelectedMonth && saleDate < endOfSelectedMonth;
    return true;
  });

  const handleExportCSV = () => {
    const headers = ['วันที่/เวลา', 'เลขที่บิล', 'ลูกค้า', 'รายการสินค้า', 'ยอดรวม (บาท)', 'สถานะ'];
    const rows = filteredSalesTable.map((s) => {
      const d = new Date(s.timestamp);
      const timeLabel = !isNaN(d.getTime())
        ? `${d.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`
        : '-';
      const itemsSummary = (s.items || []).map((item) => `${item.name || ''} (x${item.quantity || 0})`).join(', ');
      return [
        timeLabel,
        s.id || '',
        s.customerName || 'ลูกค้าทั่วไป',
        itemsSummary,
        Number(s.total ?? 0).toFixed(2),
        s.status || 'สำเร็จ',
      ];
    });

    downloadCsv(`sales_report_${timeFilter}_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
  };

  const toggleInvoiceStatus = (invoice: Sale) => {
    const newStatus = invoice.status === 'สำเร็จ' ? 'ยกเลิก' : 'สำเร็จ';
    setConfirmTitle(newStatus === 'ยกเลิก' ? 'ยกเลิกบิลใบเสร็จ' : 'กู้คืนบิลใบเสร็จ');
    setConfirmMessage(`คุณต้องการเปลี่ยนสถานะของบิล ${invoice.id} เป็น "${newStatus}" ใช่หรือไม่?`);
    setPendingAction(() => async () => {
      try {
        await runTransaction(db, async (transaction) => {
          const saleRef = doc(db, 'sales', invoice.id);
          const saleDoc = await transaction.get(saleRef);
          if (!saleDoc.exists()) {
            throw new Error('ไม่พบข้อมูลรายการขายนี้');
          }
          const saleData = saleDoc.data() as Sale;
          const currentStatus = saleData.status;
          const targetStatus = currentStatus === 'สำเร็จ' ? 'ยกเลิก' : 'สำเร็จ';

          const productUpdates: { ref: ReturnType<typeof doc>; newStock: number; newStatus: Product['status'] }[] = [];

          for (const item of saleData.items || []) {
            if (!item.productId || item.productId.startsWith('custom-') || item.productId.startsWith('sample-')) {
              continue;
            }
            const prodRef = doc(db, 'products', item.productId);
            const prodDoc = await transaction.get(prodRef);
            if (prodDoc.exists()) {
              const currentStock = Number(prodDoc.data().stock) || 0;
              let newStock = currentStock;

              if (targetStatus === 'ยกเลิก') {
                newStock = currentStock + (Number(item.quantity) || 0);
              } else {
                if (currentStock < (Number(item.quantity) || 0)) {
                  throw new Error(
                    `ไม่สามารถกู้คืนบิลได้ เนื่องจากสต็อกสินค้า "${item.name}" มีไม่เพียงพอ (ต้องการ ${item.quantity} ชิ้น แต่เหลือ ${currentStock} ชิ้น)`
                  );
                }
                newStock = currentStock - (Number(item.quantity) || 0);
              }

              const computedStatus = getStockStatus(newStock);
              productUpdates.push({ ref: prodRef, newStock, newStatus: computedStatus });
            }
          }

          for (const update of productUpdates) {
            transaction.update(update.ref, {
              stock: update.newStock,
              status: update.newStatus
            });
          }

          transaction.update(saleRef, { status: targetStatus });
        });
      } catch (error: any) {
        console.error('Error updating status:', error);
        setConfirmTitle('เกิดข้อผิดพลาด');
        setConfirmMessage(error.message || 'เกิดข้อผิดพลาดในการเปลี่ยนสถานะบิล');
        setPendingAction(null);
        setConfirmOpen(true);
      }
    });
    setConfirmOpen(true);
  };

  // Deletion logic for sales, products, and customers
  const triggerClearSales = () => {
    setConfirmTitle('ยืนยันล้างประวัติรายการขาย');
    setConfirmMessage('คำเตือน: ยอดขาย สถิติ และประวัติการทำรายการทั้งหมดจะถูกลบอย่างถาวรและไม่สามารถเรียกคืนได้ คุณต้องการล้างข้อมูลนี้ใช่หรือไม่?');
    setPendingAction(() => async () => {
      try {
        setResetting(true);
        const colRef = collection(db, 'sales');
        const snap = await getDocs(colRef);
        const promises = snap.docs.map(docSnap => deleteDoc(doc(db, 'sales', docSnap.id)));
        await Promise.all(promises);
        
        setPendingAction(null);
        setConfirmTitle('เคลียร์ประวัติสำเร็จ');
        setConfirmMessage('ระบบได้ล้างข้อมูลและประวัติการทำรายการขายเรียบร้อยแล้ว');
        setConfirmOpen(true);
      } catch (err: any) {
        console.error(err);
        setPendingAction(null);
        setConfirmTitle('เกิดข้อผิดพลาด');
        setConfirmMessage(err.message || 'ไม่สามารถล้างประวัติรายการขายได้');
        setConfirmOpen(true);
      } finally {
        setResetting(false);
      }
    });
    setConfirmOpen(true);
  };

  const triggerClearProducts = () => {
    setConfirmTitle('ยืนยันลบรายการสินค้าและสต็อก');
    setConfirmMessage('คำเตือน: ข้อมูลสินค้า หมวดหมู่ และจำนวนสต็อกทั้งหมดจะถูกลบออกจากระบบอย่างถาวร คุณต้องการลบข้อมูลนี้ใช่หรือไม่?');
    setPendingAction(() => async () => {
      try {
        setResetting(true);
        const colRef = collection(db, 'products');
        const snap = await getDocs(colRef);
        const promises = snap.docs.map(docSnap => deleteDoc(doc(db, 'products', docSnap.id)));
        await Promise.all(promises);
        
        setPendingAction(null);
        setConfirmTitle('เคลียร์สต็อกสำเร็จ');
        setConfirmMessage('ระบบได้ลบข้อมูลสินค้าและสต็อกสินค้าทั้งหมดเรียบร้อยแล้ว');
        setConfirmOpen(true);
      } catch (err: any) {
        console.error(err);
        setPendingAction(null);
        setConfirmTitle('เกิดข้อผิดพลาด');
        setConfirmMessage(err.message || 'ไม่สามารถลบรายการสินค้าได้');
        setConfirmOpen(true);
      } finally {
        setResetting(false);
      }
    });
    setConfirmOpen(true);
  };

  const triggerClearCustomers = () => {
    setConfirmTitle('ยืนยันลบรายชื่อสมาชิก');
    setConfirmMessage('คำเตือน: รายชื่อและประวัติสมาชิกสมาชิกลูกค้าทั้งหมดจะถูกลบออกจากระบบอย่างถาวร คุณต้องการลบข้อมูลนี้ใช่หรือไม่?');
    setPendingAction(() => async () => {
      try {
        setResetting(true);
        const colRef = collection(db, 'customers');
        const snap = await getDocs(colRef);
        const promises = snap.docs.map(docSnap => deleteDoc(doc(db, 'customers', docSnap.id)));
        await Promise.all(promises);
        
        setPendingAction(null);
        setConfirmTitle('เคลียร์รายชื่อสมาชิกสำเร็จ');
        setConfirmMessage('ระบบได้ลบข้อมูลและรายชื่อสมาชิกทั้งหมดเรียบร้อยแล้ว');
        setConfirmOpen(true);
      } catch (err: any) {
        console.error(err);
        setPendingAction(null);
        setConfirmTitle('เกิดข้อผิดพลาด');
        setConfirmMessage(err.message || 'ไม่สามารถลบรายชื่อสมาชิกได้');
        setConfirmOpen(true);
      } finally {
        setResetting(false);
      }
    });
    setConfirmOpen(true);
  };

  const triggerClearEverything = () => {
    setConfirmTitle('ยืนยันรีเซ็ตระบบทั้งหมด');
    setConfirmMessage('คำเตือนขั้นสูง: ข้อมูลระบบทั้งหมดประกอบด้วย ประวัติการขาย รายการสินค้าในสต็อก และรายชื่อสมาชิกลูกค้า จะถูกลบอย่างถาวรและไม่สามารถกู้คืนได้ คุณแน่ใจอย่างยิ่งที่จะทำรายการล้างข้อมูลทั้งหมดใช่หรือไม่?');
    setPendingAction(() => async () => {
      try {
        setResetting(true);
        
        // 1. Clear sales
        const salesCol = collection(db, 'sales');
        const salesSnap = await getDocs(salesCol);
        const salesPromises = salesSnap.docs.map(d => deleteDoc(doc(db, 'sales', d.id)));
        
        // 2. Clear products
        const productsCol = collection(db, 'products');
        const productsSnap = await getDocs(productsCol);
        const productsPromises = productsSnap.docs.map(d => deleteDoc(doc(db, 'products', d.id)));
        
        // 3. Clear customers
        const customersCol = collection(db, 'customers');
        const customersSnap = await getDocs(customersCol);
        const customersPromises = customersSnap.docs.map(d => deleteDoc(doc(db, 'customers', d.id)));
        
        await Promise.all([...salesPromises, ...productsPromises, ...customersPromises]);
        
        setPendingAction(null);
        setConfirmTitle('รีเซ็ตระบบทั้งหมดสำเร็จ');
        setConfirmMessage('ระบบสุเมธค้าข้าวได้รับการเคลียร์ฐานข้อมูลใหม่ทั้งหมดแล้ว พร้อมเริ่มใช้งานใหม่ทันที');
        setConfirmOpen(true);
      } catch (err: any) {
        console.error(err);
        setPendingAction(null);
        setConfirmTitle('เกิดข้อผิดพลาด');
        setConfirmMessage(err.message || 'ไม่สามารถรีเซ็ตระบบได้');
        setConfirmOpen(true);
      } finally {
        setResetting(false);
      }
    });
    setConfirmOpen(true);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-4 md:p-6 xl:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Title and Action Buttons */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-4">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900">รายงานสรุปยอดขาย</h2>
            <p className="text-base text-slate-600 mt-1 font-medium">ข้อมูลภาพรวมยอดขายและการทำรายการล่าสุด (กรองตาม: {activeStats.label})</p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            <div className="flex bg-slate-100 rounded-xl p-1 shrink-0 border border-slate-200/70">
              <button
                onClick={() => setTimeFilter('today')}
                className={`font-semibold text-sm px-4 py-2 rounded-lg transition-all cursor-pointer ${
                  timeFilter === 'today'
                    ? 'bg-white shadow-sm text-slate-950 font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                วันนี้
              </button>
              <button
                onClick={() => setTimeFilter('week')}
                className={`font-semibold text-sm px-4 py-2 rounded-lg transition-all cursor-pointer ${
                  timeFilter === 'week'
                    ? 'bg-white shadow-sm text-slate-950 font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                สัปดาห์นี้
              </button>
              <button
                onClick={() => setTimeFilter('month')}
                className={`font-semibold text-sm px-4 py-2 rounded-lg transition-all cursor-pointer ${
                  timeFilter === 'month'
                    ? 'bg-white shadow-sm text-slate-950 font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                เดือนนี้
              </button>
            </div>
            
            {timeFilter === 'month' && (
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-bold text-slate-800 focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none shadow-sm transition-all cursor-pointer h-[42px]"
              >
                {getAvailableMonths().map((m) => (
                  <option key={m} value={m}>
                    {formatThaiMonth(m)}
                  </option>
                ))}
              </select>
            )}
            
            <button
              onClick={handleExportCSV}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl px-4.5 py-2.5 font-bold text-sm cursor-pointer shadow-sm transition-all duration-200"
            >
              <Download className="w-4 h-4" />
              <span>ส่งออกรายงาน</span>
            </button>
          </div>
        </div>

        {/* Summary Bento Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Today's Sales */}
          <div 
            onClick={() => setTimeFilter('today')}
            className={`border rounded-2xl p-5 relative overflow-hidden group shadow-sm transition-all duration-200 hover:shadow-md cursor-pointer ${
              timeFilter === 'today' 
                ? 'bg-[#EFF6FF] border-blue-200 ring-2 ring-blue-100' 
                : 'bg-white border-slate-100 hover:border-slate-200'
            }`}
          >
            <div className="absolute top-0 right-0 p-4 opacity-15 text-blue-900">
              <TrendingUp className="w-14 h-14" />
            </div>
            <p className="text-xs sm:text-sm font-bold text-blue-700 mb-2">ยอดขายวันนี้</p>
            <p className="text-2xl sm:text-3xl font-black text-blue-950 mb-1.5 tabular-nums">฿{totalSalesToday.toLocaleString('th-TH')}</p>
            <div className="flex items-center gap-1 text-blue-700 font-semibold text-xs">
              <span>คลิกเพื่อกรองรายละเอียดวันนี้</span>
            </div>
          </div>

          {/* Card 2: This Week's Sales */}
          <div 
            onClick={() => setTimeFilter('week')}
            className={`border rounded-2xl p-5 relative overflow-hidden group shadow-sm transition-all duration-200 hover:shadow-md cursor-pointer ${
              timeFilter === 'week' 
                ? 'bg-[#EFF6FF] border-blue-200 ring-2 ring-blue-100' 
                : 'bg-white border-slate-100 hover:border-slate-200'
            }`}
          >
            <div className="absolute top-0 right-0 p-4 opacity-15 text-blue-900">
              <TrendingUp className="w-14 h-14" />
            </div>
            <p className="text-xs sm:text-sm font-bold text-blue-700 mb-2">ยอดขายสัปดาห์นี้</p>
            <p className="text-2xl sm:text-3xl font-black text-blue-950 mb-1.5 tabular-nums">฿{totalSalesWeek.toLocaleString('th-TH')}</p>
            <div className="flex items-center gap-1 text-blue-700 font-semibold text-xs">
              <span>คลิกเพื่อกรองรายละเอียดสัปดาห์นี้</span>
            </div>
          </div>

          {/* Card 3: This Month's Sales */}
          <div 
            onClick={() => setTimeFilter('month')}
            className={`border rounded-2xl p-5 relative overflow-hidden group shadow-sm transition-all duration-200 hover:shadow-md cursor-pointer ${
              timeFilter === 'month' 
                ? 'bg-[#EFF6FF] border-blue-200 ring-2 ring-blue-100' 
                : 'bg-white border-slate-100 hover:border-slate-200'
            }`}
          >
            <div className="absolute top-0 right-0 p-4 opacity-15 text-blue-900">
              <FileText className="w-14 h-14" />
            </div>
            <p className="text-xs sm:text-sm font-bold text-blue-700 mb-2">ยอดขายเดือนนี้</p>
            <p className="text-2xl sm:text-3xl font-black text-blue-950 mb-1.5 tabular-nums">฿{totalSalesMonth.toLocaleString('th-TH')}</p>
            <div className="flex items-center gap-1 text-blue-700 font-semibold text-xs">
              <span>คลิกเพื่อกรองรายละเอียดเดือนนี้</span>
            </div>
          </div>

          {/* Card 4: Avg Order Value for Selected Period */}
          <div className="bg-white border border-slate-100 rounded-2xl p-5 flex flex-col justify-between shadow-sm transition-all duration-200 hover:shadow-md">
            <div>
              <p className="text-xs sm:text-sm font-bold text-slate-600 mb-1">สถิติสำหรับ ({activeStats.label})</p>
              <div className="flex items-end justify-between mt-2">
                <p className="text-2xl font-black text-slate-950 leading-none tabular-nums">฿{avgOrderValue.toFixed(2)}</p>
                <span className="text-xs font-semibold text-slate-500">เฉลี่ย/บิล</span>
              </div>
            </div>
            <div className="border-t border-slate-100 pt-2.5 mt-2.5 flex items-end justify-between">
              <p className="text-2xl font-black text-slate-950 leading-none tabular-nums">{activeStats.count}</p>
              <span className="text-xs font-semibold text-slate-500">จำนวนบิล</span>
            </div>
          </div>
        </div>

        {/* Sales Trend Chart Area */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
            <h3 className="text-base font-bold text-slate-900">แนวโน้มยอดขาย ({activeStats.label})</h3>
            <div className="flex items-center gap-2">
              {timeFilter === 'month' && (
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none shadow-sm transition-all cursor-pointer h-[32px]"
                >
                  {getAvailableMonths().map((m) => (
                    <option key={m} value={m}>
                      {formatThaiMonth(m)}
                    </option>
                  ))}
                </select>
              )}
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1 shrink-0">
                <button 
                  onClick={() => setTimeFilter('today')}
                  className={`font-semibold text-xs px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                    timeFilter === 'today' ? 'bg-white shadow-sm text-slate-900 font-bold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  วันนี้
                </button>
                <button 
                  onClick={() => setTimeFilter('week')}
                  className={`font-semibold text-xs px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                    timeFilter === 'week' ? 'bg-white shadow-sm text-slate-900 font-bold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  สัปดาห์นี้
                </button>
                <button 
                  onClick={() => setTimeFilter('month')}
                  className={`font-semibold text-xs px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                    timeFilter === 'month' ? 'bg-white shadow-sm text-slate-900 font-bold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  เดือนนี้
                </button>
              </div>
            </div>
          </div>

          {/* Chart Wrapper Container */}
          <div className="h-64 min-h-[256px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart data={dynamicChartData} margin={{ top: 10, right: 10, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1e293b" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#1e293b" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: '#475569', fontWeight: 600 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: '#475569', fontWeight: 600 }}
                  tickFormatter={(v) => `฿${v}`}
                />
                <Tooltip
                  formatter={(value: any) => [`฿${value.toLocaleString()}`, 'ยอดขาย']}
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderRadius: '12px',
                    border: '1px solid #f1f5f9',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    color: '#0f172a'
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#1e293b"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorSales)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Latest Transactions Table Log */}
        <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <h3 className="text-base font-bold text-slate-900">รายการขายล่าสุด ({activeStats.label})</h3>
            <span className="text-sm font-semibold text-slate-600 tabular-nums">รวมทั้งหมด: {filteredSalesTable.length} บิล</span>
          </div>
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs sm:text-sm font-bold text-slate-600">
                  <th className="p-4">เวลา / วันที่</th>
                  <th className="p-4">เลขที่บิล</th>
                  <th className="p-4">สินค้า</th>
                  <th className="p-4 text-right">ยอดรวม</th>
                  <th className="p-4 text-center">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-slate-900 mx-auto"></div>
                    </td>
                  </tr>
                ) : filteredSalesTable.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-slate-400 text-base">
                      ยังไม่มีรายการขายในระบบ ({activeStats.label})
                    </td>
                  </tr>
                ) : (
                  filteredSalesTable.map((s, idx) => {
                    const isSuccess = s.status === 'สำเร็จ';
                    const saleDateObj = new Date(s.timestamp);
                    const displayTime = !isNaN(saleDateObj.getTime())
                      ? saleDateObj.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit' }) + ' ' + saleDateObj.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
                      : '-';

                    // Summarize item names (null-safe)
                    const itemSummary = (s.items || []).map(item => `${item.name || ''} (x${item.quantity || 0})`).join(', ') || '-';

                    return (
                      <tr key={s.id} className={`hover:bg-slate-50/70 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/30' : ''}`}>
                        <td className="p-4 text-slate-600 font-medium whitespace-nowrap tabular-nums">{displayTime}</td>
                        <td className="p-4 font-bold text-slate-900 whitespace-nowrap font-mono tabular-nums">{s.id}</td>
                        <td className="p-4 text-slate-600 font-medium truncate max-w-xs" title={itemSummary}>
                          {itemSummary}
                        </td>
                        <td className="p-4 text-right font-extrabold text-slate-950 whitespace-nowrap font-mono tabular-nums">฿{Number(s.total ?? 0).toFixed(2)}</td>
                        <td className="p-4 text-center whitespace-nowrap">
                          <button
                            onClick={() => toggleInvoiceStatus(s)}
                            className={`inline-flex items-center px-3 py-1 rounded-md text-xs font-bold border transition-all cursor-pointer ${
                              isSuccess
                                ? 'bg-green-50 text-green-700 border-green-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-green-50 hover:text-green-700 hover:border-green-200'
                            }`}
                            title="คลิกเพื่อสลับสถานะบิล"
                          >
                            {s.status}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* System Administration & Data Reset Section */}
        <div className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm p-6 space-y-6">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Database className="w-5 h-5 text-slate-700" />
              การจัดการฐานข้อมูลและรีเซ็ตระบบ
            </h3>
            <p className="text-sm text-slate-600 mt-1 font-medium">เคลียร์ประวัติและรีเซ็ตข้อมูลในระบบแยกตามส่วน หรือรีเซ็ตทั้งหมดเพื่อให้พร้อมเริ่มต้นใช้งานใหม่</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Clear Sales History Card */}
            <div className="border border-slate-200/80 rounded-xl p-4 bg-slate-50/50 flex flex-col justify-between space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                  <RefreshCw className="w-4 h-4 text-amber-500 shrink-0" />
                  ล้างประวัติรายการขาย
                </div>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-medium">
                  เคลียร์ประวัติรายการขาย บิลใบเสร็จทั้งหมด ยอดขายรวม และรายงานสรุปสถิติเพื่อเริ่มต้นระบบใหม่ โดยยังคงรายชื่อสินค้าในคลังและสมาชิกไว้
                </p>
              </div>
              <button
                disabled={resetting}
                onClick={triggerClearSales}
                className="w-full bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-sm py-2.5 px-3 rounded-lg border border-amber-200/70 transition-colors cursor-pointer disabled:opacity-50"
              >
                ล้างประวัติรายการขาย
              </button>
            </div>

            {/* Clear Stock Card */}
            <div className="border border-slate-200/80 rounded-xl p-4 bg-slate-50/50 flex flex-col justify-between space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                  <Trash2 className="w-4 h-4 text-red-500 shrink-0" />
                  ลบสินค้าและสต็อกทั้งหมด
                </div>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-medium">
                  ลบรายการสินค้าและสต็อกสินค้าทั้งหมดออกจากระบบอย่างถาวร เพื่อให้คุณเพิ่มข้อมูลสินค้าแบรนด์และหมวดหมู่ของคุณเองทั้งหมดตั้งแต่เริ่มต้น
                </p>
              </div>
              <button
                disabled={resetting}
                onClick={triggerClearProducts}
                className="w-full bg-red-50 hover:bg-red-100 text-red-700 font-bold text-sm py-2.5 px-3 rounded-lg border border-red-200/70 transition-colors cursor-pointer disabled:opacity-50"
              >
                ลบสินค้าและสต็อกทั้งหมด
              </button>
            </div>

            {/* Clear Customers Card */}
            <div className="border border-slate-200/80 rounded-xl p-4 bg-slate-50/50 flex flex-col justify-between space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                  <Trash2 className="w-4 h-4 text-rose-500 shrink-0" />
                  ลบรายชื่อสมาชิกทั้งหมด
                </div>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-medium">
                  ลบรายชื่อสมาชิกของร้านค้า ข้อมูลส่วนตัว เบอร์โทรศัพท์ และรายละเอียดที่อยู่สมาชิกทั้งหมดเพื่อเริ่มเก็บบันทึกประวัติสมาชิกกลุ่มใหม่
                </p>
              </div>
              <button
                disabled={resetting}
                onClick={triggerClearCustomers}
                className="w-full bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-sm py-2.5 px-3 rounded-lg border border-rose-200/70 transition-colors cursor-pointer disabled:opacity-50"
              >
                ลบรายชื่อสมาชิกทั้งหมด
              </button>
            </div>
          </div>

          {/* Master Reset Card */}
          <div className="border border-red-200 bg-red-50/30 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mt-2">
            <div className="flex gap-3 items-start">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm sm:text-base font-bold text-red-900">รีเซ็ตข้อมูลทั้งหมดและเริ่มต้นใหม่ (Master System Reset)</h4>
                <p className="text-xs sm:text-sm text-red-700 mt-1 leading-relaxed font-medium">
                  ลบประวัติรายการขาย สินค้าและคลังสต็อก และสมาชิกลูกค้าทั้งหมดอย่างถาวรพร้อมๆ กัน เพื่อล้างระบบสุเมธค้าข้าวให้พร้อมเริ่มต้นใหม่เอี่ยม
                </p>
              </div>
            </div>
            <button
              disabled={resetting}
              onClick={triggerClearEverything}
              className="sm:shrink-0 bg-red-600 hover:bg-red-700 text-white font-bold text-sm py-2.5 px-5 rounded-lg transition-all cursor-pointer disabled:opacity-50 shadow-sm"
            >
              {resetting ? 'กำลังดำเนินการรีเซ็ต...' : 'ล้างข้อมูลทั้งหมดและรีเซ็ตระบบ'}
            </button>
          </div>
        </div>

        {/* Spacer for mobile menu */}
        <div className="h-16 lg:hidden"></div>
      </div>

      <ConfirmModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          if (pendingAction) pendingAction();
        }}
        title={confirmTitle}
        message={confirmMessage}
        confirmText="ยืนยัน"
        cancelText="ยกเลิก"
        isDanger={confirmTitle.includes('ยกเลิก') || confirmTitle.includes('ลบ') || confirmTitle.includes('ล้าง') || confirmTitle.includes('รีเซ็ต')}
        showCancel={pendingAction !== null}
      />
    </div>
  );
}
