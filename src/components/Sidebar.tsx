import { ShoppingCart, Package, BarChart3, Plus, Receipt, Users } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onResetPOS: () => void;
}

export default function Sidebar({ activeTab, setActiveTab, onResetPOS }: SidebarProps) {
  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col h-screen fixed left-0 top-0 border-r border-slate-200 bg-white w-64 z-50">
        <div className="p-6 border-b border-slate-100">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">สุเมธค้าข้าว</h1>
        </div>

        <nav className="flex-1 py-6 flex flex-col gap-1 px-3">
          <button
            onClick={() => setActiveTab('pos')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-200 cursor-pointer ${
              activeTab === 'pos'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <ShoppingCart className="w-5 h-5" />
            <span className="text-sm">รายการสินค้า</span>
          </button>

          <button
            onClick={() => setActiveTab('products')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-200 cursor-pointer ${
              activeTab === 'products'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Package className="w-5 h-5" />
            <span className="text-sm">สต็อค</span>
          </button>

          <button
            onClick={() => setActiveTab('reports')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-200 cursor-pointer ${
              activeTab === 'reports'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="w-5 h-5" />
            <span className="text-sm">รายงาน</span>
          </button>

          <button
            onClick={() => setActiveTab('receipt')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-200 cursor-pointer ${
              activeTab === 'receipt'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Receipt className="w-5 h-5" />
            <span className="text-sm">ออกใบเสร็จรับเงิน</span>
          </button>

          <button
            onClick={() => setActiveTab('customers')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-200 cursor-pointer ${
              activeTab === 'customers'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Users className="w-5 h-5" />
            <span className="text-sm">สมาชิกลูกค้า</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-100">
          <button
            onClick={onResetPOS}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium text-sm py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>เริ่มการขายใหม่</span>
          </button>
        </div>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center h-16 bg-white border-t border-slate-200 shadow-lg pb-safe rounded-t-2xl">
        <button
          onClick={() => setActiveTab('pos')}
          className={`flex flex-col items-center justify-center flex-1 h-full py-1 ${
            activeTab === 'pos' ? 'text-slate-900 font-semibold' : 'text-slate-400'
          }`}
        >
          <ShoppingCart className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">รายการสินค้า</span>
        </button>

        <button
          onClick={() => setActiveTab('products')}
          className={`flex flex-col items-center justify-center flex-1 h-full py-1 ${
            activeTab === 'products' ? 'text-slate-900 font-semibold' : 'text-slate-400'
          }`}
        >
          <Package className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">สต็อค</span>
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={`flex flex-col items-center justify-center flex-1 h-full py-1 ${
            activeTab === 'reports' ? 'text-slate-900 font-semibold' : 'text-slate-400'
          }`}
        >
          <BarChart3 className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">รายงาน</span>
        </button>

        <button
          onClick={() => setActiveTab('receipt')}
          className={`flex flex-col items-center justify-center flex-1 h-full py-1 ${
            activeTab === 'receipt' ? 'text-slate-900 font-semibold' : 'text-slate-400'
          }`}
        >
          <Receipt className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">ใบเสร็จ</span>
        </button>

        <button
          onClick={() => setActiveTab('customers')}
          className={`flex flex-col items-center justify-center flex-1 h-full py-1 ${
            activeTab === 'customers' ? 'text-slate-900 font-semibold' : 'text-slate-400'
          }`}
        >
          <Users className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">สมาชิก</span>
        </button>
      </nav>
    </>
  );
}
