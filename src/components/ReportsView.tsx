import { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, query, orderBy, limit, doc, updateDoc, runTransaction } from 'firebase/firestore';
import { Sale } from '../types';
import { TrendingUp, FileText, Calendar, Download, Circle, CheckCircle, XCircle } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import ConfirmModal from './ConfirmModal';

export default function ReportsView() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [timeFilter, setTimeFilter] = useState<'today' | 'week' | 'month'>('week');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`; // e.g. "2026-07"
  });

  // Modal confirmation states
  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);
  const [confirmTitle, setConfirmTitle] = useState<string>('');
  const [confirmMessage, setConfirmMessage] = useState<string>('');
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // Read transactions from Firestore
  useEffect(() => {
    const salesCol = collection(db, 'sales');
    const q = query(salesCol, orderBy('timestamp', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const transactionList: Sale[] = [];
      snapshot.forEach((docSnap) => {
        transactionList.push(docSnap.data() as Sale);
      });
      setSales(transactionList);
      setLoading(false);
    }, (error) => {
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
  const totalSalesToday = salesToday.reduce((sum, s) => sum + s.total, 0);
  const billsTodayCount = salesToday.length;

  // Week stats
  const salesWeek = successfulSales.filter(s => new Date(s.timestamp) >= startOfWeek);
  const totalSalesWeek = salesWeek.reduce((sum, s) => sum + s.total, 0);
  const billsWeekCount = salesWeek.length;

  // Month stats (filtered by selected month)
  const salesMonth = successfulSales.filter(s => {
    const d = new Date(s.timestamp);
    return d >= startOfSelectedMonth && d < endOfSelectedMonth;
  });
  const totalSalesMonth = salesMonth.reduce((sum, s) => sum + s.total, 0);
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
    const headers = ['เวลา', 'เลขที่บิล', 'ยอดรวม', 'สถานะ'];
    const rows = filteredSalesTable.map(s => [
      new Date(s.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
      s.id,
      s.total,
      s.status
    ]);
    
    const csvContent = "data:text/csv;charset=utf-8,\ufeff" 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `sales_report_${timeFilter}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

          const productUpdates: { ref: any; newStock: number; newStatus: string }[] = [];

          for (const item of saleData.items || []) {
            const prodRef = doc(db, 'products', item.productId);
            const prodDoc = await transaction.get(prodRef);
            if (prodDoc.exists()) {
              const currentStock = prodDoc.data().stock || 0;
              let newStock = currentStock;

              if (targetStatus === 'ยกเลิก') {
                // Cancelled: Add back to inventory stock
                newStock = currentStock + item.quantity;
              } else {
                // Restored: Deduct from inventory stock, but check if there's enough stock
                if (currentStock < item.quantity) {
                  throw new Error(`ไม่สามารถกู้คืนบิลได้ เนื่องจากสต็อกสินค้า "${item.name}" มีไม่เพียงพอ (ต้องการ ${item.quantity} ชิ้น แต่ในสต็อกเหลือ ${currentStock} ชิ้น)`);
                }
                newStock = currentStock - item.quantity;
              }

              const newStatus = newStock === 0 ? 'หมดสต็อก' : newStock <= 15 ? 'ใกล้หมด' : 'พร้อมขาย';
              productUpdates.push({ ref: prodRef, newStock, newStatus });
            }
          }

          // Apply updates
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

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-4 md:p-6 xl:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Title and Action Buttons */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 md:text-2xl">รายงานสรุปยอดขาย</h2>
            <p className="text-sm text-slate-500 mt-1 font-medium">ข้อมูลภาพรวมยอดขายและการทำรายการล่าสุด (กรองตาม: {activeStats.label})</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <div className="flex bg-slate-100 rounded-xl p-1 shrink-0 border border-slate-200/50">
              <button
                onClick={() => setTimeFilter('today')}
                className={`font-semibold text-xs px-4 py-2 rounded-lg transition-all cursor-pointer ${
                  timeFilter === 'today'
                    ? 'bg-white shadow-sm text-slate-950 font-black'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                วันนี้
              </button>
              <button
                onClick={() => setTimeFilter('week')}
                className={`font-semibold text-xs px-4 py-2 rounded-lg transition-all cursor-pointer ${
                  timeFilter === 'week'
                    ? 'bg-white shadow-sm text-slate-950 font-black'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                สัปดาห์นี้
              </button>
              <button
                onClick={() => setTimeFilter('month')}
                className={`font-semibold text-xs px-4 py-2 rounded-lg transition-all cursor-pointer ${
                  timeFilter === 'month'
                    ? 'bg-white shadow-sm text-slate-950 font-black'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                เดือนนี้
              </button>
            </div>
            
            {timeFilter === 'month' && (
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-700 focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none shadow-sm transition-all cursor-pointer h-[38px]"
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
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl px-4 py-2.5 font-semibold text-xs cursor-pointer shadow-sm transition-all duration-200"
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
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-2">ยอดขายวันนี้</p>
            <p className="text-2xl font-black text-blue-950 mb-1">฿{totalSalesToday.toLocaleString('th-TH')}</p>
            <div className="flex items-center gap-1 text-blue-600 font-semibold text-[11px]">
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
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-2">ยอดขายสัปดาห์นี้</p>
            <p className="text-2xl font-black text-blue-950 mb-1">฿{totalSalesWeek.toLocaleString('th-TH')}</p>
            <div className="flex items-center gap-1 text-blue-600 font-semibold text-[11px]">
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
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-2">ยอดขายเดือนนี้</p>
            <p className="text-2xl font-black text-blue-950 mb-1">฿{totalSalesMonth.toLocaleString('th-TH')}</p>
            <div className="flex items-center gap-1 text-blue-600 font-semibold text-[11px]">
              <span>คลิกเพื่อกรองรายละเอียดเดือนนี้</span>
            </div>
          </div>

          {/* Card 4: Avg Order Value for Selected Period */}
          <div className="bg-white border border-slate-100 rounded-2xl p-5 flex flex-col justify-between shadow-sm transition-all duration-200 hover:shadow-md">
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">สถิติสำหรับ ({activeStats.label})</p>
              <div className="flex items-end justify-between mt-2">
                <p className="text-xl font-black text-slate-900 leading-none">฿{avgOrderValue.toFixed(2)}</p>
                <span className="text-[10px] font-semibold text-slate-400">เฉลี่ย/บิล</span>
              </div>
            </div>
            <div className="border-t border-slate-100 pt-2 mt-2 flex items-end justify-between">
              <p className="text-xl font-black text-slate-900 leading-none">{activeStats.count}</p>
              <span className="text-[10px] font-semibold text-slate-400">จำนวนบิล</span>
            </div>
          </div>
        </div>

        {/* Sales Trend Chart Area */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-slate-900">แนวโน้มยอดขาย ({activeStats.label})</h3>
            <div className="flex items-center gap-1.5">
              {timeFilter === 'month' && (
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-[10px] font-bold text-slate-700 focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none shadow-sm transition-all cursor-pointer h-[28px]"
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
                  className={`font-semibold text-[10px] px-2.5 py-1.5 rounded-md transition-all cursor-pointer ${
                    timeFilter === 'today' ? 'bg-white shadow-sm text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  วันนี้
                </button>
                <button 
                  onClick={() => setTimeFilter('week')}
                  className={`font-semibold text-[10px] px-2.5 py-1.5 rounded-md transition-all cursor-pointer ${
                    timeFilter === 'week' ? 'bg-white shadow-sm text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  สัปดาห์นี้
                </button>
                <button 
                  onClick={() => setTimeFilter('month')}
                  className={`font-semibold text-[10px] px-2.5 py-1.5 rounded-md transition-all cursor-pointer ${
                    timeFilter === 'month' ? 'bg-white shadow-sm text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  เดือนนี้
                </button>
              </div>
            </div>
          </div>

          {/* Chart Wrapper Container */}
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dynamicChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                  tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }}
                  tickFormatter={(v) => `฿${v}`}
                />
                <Tooltip
                  formatter={(value: any) => [`฿${value.toLocaleString()}`, 'ยอดขาย']}
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderRadius: '12px',
                    border: '1px solid #f1f5f9',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                    fontSize: '11px',
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
            <h3 className="text-sm font-bold text-slate-900">รายการขายล่าสุด ({activeStats.label})</h3>
            <span className="text-xs font-semibold text-slate-500">รวมทั้งหมด: {filteredSalesTable.length} บิล</span>
          </div>
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="p-4">เวลา / วันที่</th>
                  <th className="p-4">เลขที่บิล</th>
                  <th className="p-4">สินค้า</th>
                  <th className="p-4 text-right">ยอดรวม</th>
                  <th className="p-4 text-center">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-slate-900 mx-auto"></div>
                    </td>
                  </tr>
                ) : filteredSalesTable.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-slate-400">
                      ยังไม่มีรายการขายในระบบ ({activeStats.label})
                    </td>
                  </tr>
                ) : (
                  filteredSalesTable.map((s, idx) => {
                    const isSuccess = s.status === 'สำเร็จ';
                    const saleDateObj = new Date(s.timestamp);
                    const displayTime = saleDateObj.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit' }) + ' ' + saleDateObj.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
                    
                    // Summarize item names
                    const itemSummary = s.items.map(item => `${item.name} (x${item.quantity})`).join(', ');

                    return (
                      <tr key={s.id} className={`hover:bg-slate-50/50 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/20' : ''}`}>
                        <td className="p-4 text-slate-500 font-medium whitespace-nowrap">{displayTime}</td>
                        <td className="p-4 font-bold text-slate-900 whitespace-nowrap">{s.id}</td>
                        <td className="p-4 text-slate-500 font-medium truncate max-w-xs" title={itemSummary}>
                          {itemSummary}
                        </td>
                        <td className="p-4 text-right font-extrabold text-slate-900 whitespace-nowrap">฿{s.total.toFixed(2)}</td>
                        <td className="p-4 text-center whitespace-nowrap">
                          <button
                            onClick={() => toggleInvoiceStatus(s)}
                            className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold border transition-all cursor-pointer ${
                              isSuccess
                                ? 'bg-green-50 text-green-600 border-green-100 hover:bg-red-50 hover:text-red-600 hover:border-red-100'
                                : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-green-50 hover:text-green-600 hover:border-green-100'
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
        isDanger={confirmTitle.includes('ยกเลิก')}
      />
    </div>
  );
}
