import { useState } from 'react';
import { Bell, Settings, Menu, LogOut } from 'lucide-react';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import ConfirmModal from './ConfirmModal';

interface HeaderProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  activeTab: string;
  role: 'admin' | 'employee';
  onRoleChange: (role: 'admin' | 'employee') => void;
  roleLoading: boolean;
  isAdminEmail?: boolean;
}

export default function Header({ searchQuery, setSearchQuery, activeTab, role, onRoleChange, roleLoading, isAdminEmail = false }: HeaderProps) {
  const currentUser = auth.currentUser;
  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);

  const handleSignOutClick = () => {
    setConfirmOpen(true);
  };

  const handleConfirmSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };
  // Get heading title based on active tab
  const getTitle = () => {
    switch (activeTab) {
      case 'pos':
        return 'รายการสินค้า';
      case 'products':
        return 'สต็อค';
      case 'reports':
        return 'รายงานสรุปยอดขาย';
      case 'receipt':
        return 'ออกใบเสร็จรับเงิน';
      case 'customers':
        return 'ระบบจัดการสมาชิกลูกค้า';
      default:
        return 'ระบบจัดการร้านค้า';
    }
  };

  return (
    <header className="flex justify-between items-center w-full px-6 h-16 sticky top-0 z-40 bg-white border-b border-slate-100">
      {/* Mobile Menu Button / Header Brand */}
      <div className="flex items-center gap-3 lg:hidden">
        <Menu className="w-6 h-6 text-slate-600" />
        <h1 className="text-lg font-bold text-slate-900 tracking-tight">สุเมธค้าข้าว</h1>
      </div>

      {/* Spacer where search bar was */}
      <div className="hidden md:block flex-1 max-w-md mx-6"></div>

      {/* Trailing Actions */}
      <div className="flex items-center gap-3">
        
        <button className="text-slate-500 hover:text-slate-900 hover:bg-slate-50 p-2 rounded-full transition-all duration-200 relative cursor-pointer">
          <Bell className="w-5 h-5" />
          <span className="absolute w-2 h-2 bg-red-500 rounded-full top-1.5 right-1.5"></span>
        </button>

        <button className="text-slate-500 hover:text-slate-900 hover:bg-slate-50 p-2 rounded-full transition-all duration-200 cursor-pointer">
          <Settings className="w-5 h-5" />
        </button>

        {/* Role Selector / Indicator */}
        <div className="flex items-center gap-1.5 mr-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm transition-all">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider hidden md:inline">บทบาท:</span>
          {roleLoading ? (
            <div className="animate-spin rounded-full h-3.5 w-3.5 border-b border-slate-900 mx-1"></div>
          ) : isAdminEmail ? (
            <select
              value={role}
              onChange={(e) => onRoleChange(e.target.value as 'admin' | 'employee')}
              className="bg-transparent border-none outline-none text-xs font-bold text-slate-800 pr-1 cursor-pointer focus:ring-0 select-none py-0 font-sans"
            >
              <option value="admin">แอดมิน (Admin)</option>
              <option value="employee">พนักงาน (Employee)</option>
            </select>
          ) : (
            <span className="text-xs font-bold text-slate-600 font-sans">
              พนักงาน (Employee)
            </span>
          )}
        </div>

        {/* Dynamic Authenticated User Section */}
        <div className="flex items-center gap-3 border-l border-slate-100 pl-3 ml-1 shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-black text-slate-950 leading-tight">
              {currentUser?.displayName || 'ผู้ใช้งาน Gmail'}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5 font-bold leading-none">
              {currentUser?.email || ''}
            </p>
          </div>
          
          <div className="w-9 h-9 rounded-full overflow-hidden border border-slate-200 shadow-inner shrink-0 bg-slate-100">
            <img
              alt="User Profile"
              className="w-full h-full object-cover"
              src={currentUser?.photoURL || "https://lh3.googleusercontent.com/aida-public/AB6AXuA62gaORdbsmd9L05riXuELDhrm-F5vUV_IzOfOPNioiJA9wnVsNbvpYCzL_w0kS-vv2ImG0aWy-otY3WcScKKNAVnTFbczr-ulvS9rLiRoauF7YdhPxZwc7T6G-gB2biOjIeA5C7DFgk5c_wKLtsbmkP1pdEOhEAXSVTCh_Pk-QrQGWw6TL0r0z4Gn8a8p6mj8vSXWV5LWymgbqCrrtK-KuYjkPPhwK0JW6Yna-Hq0B9yft2UmB2nEc_PWMTzDOa_YQAhrbRW5o5Q"}
              referrerPolicy="no-referrer"
            />
          </div>

          <button
            onClick={handleSignOutClick}
            title="ออกจากระบบ"
            className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-xl transition-all duration-200 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Logout Confirmation */}
      <ConfirmModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirmSignOut}
        title="ออกจากระบบ"
        message="คุณต้องการออกจากระบบใช่หรือไม่?"
        confirmText="ออกจากระบบ"
        cancelText="ยกเลิก"
        isDanger={true}
      />
    </header>
  );
}
