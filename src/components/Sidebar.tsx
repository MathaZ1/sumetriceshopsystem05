import { ShoppingCart, Package, BarChart3, Plus, Receipt, Users } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onResetPOS: () => void;
  role: 'admin' | 'employee';
}

export default function Sidebar({ activeTab, setActiveTab, onResetPOS, role }: SidebarProps) {
  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col h-screen fixed left-0 top-0 border-r border-slate-200 bg-white w-[272px] z-50">
        <div className="px-6 py-5 border-b border-slate-100 h-[72px] flex items-center">
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight whitespace-nowrap">สุเมธค้าข้าว</h1>
        </div>

        <nav className="flex-1 py-6 flex flex-col gap-1.5 px-3.5">
          <button
            onClick={() => setActiveTab('pos')}
            className={`flex items-center gap-3.5 px-4 py-3.5 rounded-xl font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap ${
              activeTab === 'pos'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-950'
            }`}
          >
            <ShoppingCart className="w-5 h-5 shrink-0" />
            <span className="text-base">รายการสินค้า</span>
          </button>

          {role === 'admin' && (
            <button
              onClick={() => setActiveTab('products')}
              className={`flex items-center gap-3.5 px-4 py-3.5 rounded-xl font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap ${
                activeTab === 'products'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-950'
              }`}
            >
              <Package className="w-5 h-5 shrink-0" />
              <span className="text-base">สต็อค</span>
            </button>
          )}

          {role === 'admin' && (
            <button
              onClick={() => setActiveTab('reports')}
              className={`flex items-center gap-3.5 px-4 py-3.5 rounded-xl font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap ${
                activeTab === 'reports'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-950'
              }`}
            >
              <BarChart3 className="w-5 h-5 shrink-0" />
              <span className="text-base">รายงาน</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('receipt')}
            className={`flex items-center gap-3.5 px-4 py-3.5 rounded-xl font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap ${
              activeTab === 'receipt'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-950'
            }`}
          >
            <Receipt className="w-5 h-5 shrink-0" />
            <span className="text-base">ออกใบเสร็จรับเงิน</span>
          </button>

          {role === 'admin' && (
            <button
              onClick={() => setActiveTab('customers')}
              className={`flex items-center gap-3.5 px-4 py-3.5 rounded-xl font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap ${
                activeTab === 'customers'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-950'
              }`}
            >
              <Users className="w-5 h-5 shrink-0" />
              <span className="text-base">สมาชิกลูกค้า</span>
            </button>
          )}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <button
            onClick={onResetPOS}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-base py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer shadow-sm whitespace-nowrap"
          >
            <Plus className="w-5 h-5 shrink-0" />
            <span>เริ่มการขายใหม่</span>
          </button>
        </div>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center h-16 bg-white border-t border-slate-200 shadow-lg pb-safe rounded-t-2xl">
        <button
          onClick={() => setActiveTab('pos')}
          className={`flex flex-col items-center justify-center flex-1 h-full py-1 cursor-pointer ${
            activeTab === 'pos' ? 'text-slate-950 font-bold' : 'text-slate-500 font-medium'
          }`}
        >
          <ShoppingCart className="w-5 h-5" />
          <span className="text-xs mt-0.5 whitespace-nowrap">สินค้า</span>
        </button>

        {role === 'admin' && (
          <button
            onClick={() => setActiveTab('products')}
            className={`flex flex-col items-center justify-center flex-1 h-full py-1 cursor-pointer ${
              activeTab === 'products' ? 'text-slate-950 font-bold' : 'text-slate-500 font-medium'
            }`}
          >
            <Package className="w-5 h-5" />
            <span className="text-xs mt-0.5 whitespace-nowrap">สต็อค</span>
          </button>
        )}

        {role === 'admin' && (
          <button
            onClick={() => setActiveTab('reports')}
            className={`flex flex-col items-center justify-center flex-1 h-full py-1 cursor-pointer ${
              activeTab === 'reports' ? 'text-slate-950 font-bold' : 'text-slate-500 font-medium'
            }`}
          >
            <BarChart3 className="w-5 h-5" />
            <span className="text-xs mt-0.5 whitespace-nowrap">รายงาน</span>
          </button>
        )}

        <button
          onClick={() => setActiveTab('receipt')}
          className={`flex flex-col items-center justify-center flex-1 h-full py-1 cursor-pointer ${
            activeTab === 'receipt' ? 'text-slate-950 font-bold' : 'text-slate-500 font-medium'
          }`}
        >
          <Receipt className="w-5 h-5" />
          <span className="text-xs mt-0.5 whitespace-nowrap">ใบเสร็จ</span>
        </button>

        {role === 'admin' && (
          <button
            onClick={() => setActiveTab('customers')}
            className={`flex flex-col items-center justify-center flex-1 h-full py-1 cursor-pointer ${
              activeTab === 'customers' ? 'text-slate-950 font-bold' : 'text-slate-500 font-medium'
            }`}
          >
            <Users className="w-5 h-5" />
            <span className="text-xs mt-0.5 whitespace-nowrap">สมาชิก</span>
          </button>
        )}
      </nav>
    </>
  );
}
