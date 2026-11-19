import { useState } from 'react';
import { LogOut } from 'lucide-react';
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

export default function Header({ activeTab, role, onRoleChange, roleLoading, isAdminEmail = false }: HeaderProps) {
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
        return 'รายการสินค้าหน้าร้าน (POS)';
      case 'products':
        return 'จัดการสต็อคสินค้า';
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
    <header className="flex justify-between items-center w-full px-4 sm:px-6 h-[72px] sticky top-0 z-40 bg-white border-b border-slate-200">
      {/* Mobile Header Brand + Current View Title */}
      <div className="flex items-center gap-2.5 lg:hidden min-w-0">
        <h1 className="text-lg font-extrabold text-slate-900 tracking-tight whitespace-nowrap">สุเมธค้าข้าว</h1>
        <span className="text-slate-300 font-bold" aria-hidden="true">/</span>
        <span className="text-base font-bold text-slate-700 truncate">{getTitle()}</span>
      </div>

      {/* Desktop Prominent Page Title */}
      <div className="hidden lg:flex items-center min-w-0">
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight whitespace-nowrap truncate">
          {getTitle()}
        </h2>
      </div>

      {/* Trailing Actions */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Role Selector / Indicator */}
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 transition-all">
          <span className="text-xs font-bold text-slate-500 hidden md:inline whitespace-nowrap">บทบาท:</span>
          {roleLoading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b border-slate-900 mx-1"></div>
          ) : isAdminEmail ? (
            <select
              value={role}
              onChange={(e) => onRoleChange(e.target.value as 'admin' | 'employee')}
              className="bg-transparent border-none outline-none text-sm font-bold text-slate-900 pr-1 cursor-pointer focus:ring-0 select-none py-0 font-sans"
            >
              <option value="admin">แอดมิน (Admin)</option>
              <option value="employee">พนักงาน (Employee)</option>
            </select>
          ) : (
            <span className="text-sm font-bold text-slate-700 font-sans whitespace-nowrap">
              พนักงาน (Employee)
            </span>
          )}
        </div>

        {/* Dynamic Authenticated User Section */}
        <div className="flex items-center gap-3 border-l border-slate-200 pl-3 ml-1 shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-extrabold text-slate-950 leading-tight">
              {currentUser?.displayName || 'ผู้ใช้งาน Gmail'}
            </p>
            <p className="text-xs text-slate-500 mt-0.5 font-medium leading-none">
              {currentUser?.email || ''}
            </p>
          </div>
          
          <div className="w-10 h-10 rounded-full overflow-hidden border border-slate-200 shadow-inner shrink-0 bg-slate-100">
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
            className="text-slate-500 hover:text-red-600 hover:bg-red-50 p-2.5 rounded-xl transition-all duration-200 cursor-pointer"
          >
            <LogOut className="w-5 h-5" />
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
