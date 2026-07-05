import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import POSView from './components/POSView';
import ProductsView from './components/ProductsView';
import ReportsView from './components/ReportsView';
import ReceiptView from './components/ReceiptView';
import CustomersView from './components/CustomersView';
import LoginView from './components/LoginView';
import ConfirmModal from './components/ConfirmModal';
import { seedInitialData, auth, db } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { CartItem, Sale } from './types';

// รายชื่ออีเมลที่มีสิทธิ์เข้าถึงในฐานะแอดมิน (Admin)
// คุณสามารถแก้ไข คัดแยก หรือเพิ่มอีเมลอื่นๆ ของผู้ใช้งานที่ต้องการให้เป็นแอดมินในอาเรย์นี้ได้เลย
const ADMIN_EMAILS = [
  'mathaza8@gmail.com', // อีเมลแอดมินหลักของคุณ
  // 'anotheradmin@gmail.com', // สามารถเพิ่มเมลแอดมินร่วมได้ที่นี่
];

// รายชื่ออีเมลที่มีสิทธิ์เข้าถึงในฐานะพนักงาน (Employee)
// 💡 คำแนะนำ:
// 1. หากต้องการให้ใครก็ได้ที่ล็อกอินด้วย Gmail เข้าเป็นพนักงานได้เลย -> ปล่อยเป็นค่าว่าง []
// 2. หากต้องการจำกัดสิทธิ์เฉพาะพนักงานบางคนเท่านั้น -> ใส่รายชื่ออีเมลที่อนุญาตในอาเรย์นี้ เช่น ['staff1@gmail.com', 'staff2@gmail.com']
const EMPLOYEE_EMAILS = [
  // 'namwhandmt2543@gmail.com', // ใส่เมลพนักงานคนที่ 1 ที่นี่
  // 'employee2@gmail.com', // ใส่เมลพนักงานคนที่ 2 ที่นี่
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [role, setRole] = useState<'admin' | 'employee'>('employee');
  const [roleLoading, setRoleLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>('pos');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [receiptItems, setReceiptItems] = useState<CartItem[]>([]);
  const [posDiscount, setPosDiscount] = useState<number>(0);
  const [receiptDiscount, setReceiptDiscount] = useState<number>(0);
  const [receiptInvoiceNumber, setReceiptInvoiceNumber] = useState<string>('');

  // Confirmation Modal states
  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);
  const [confirmTitle, setConfirmTitle] = useState<string>('');
  const [confirmMessage, setConfirmMessage] = useState<string>('');
  const [confirmText, setConfirmText] = useState<string>('ยืนยัน');
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // Alert Modal states
  const [alertOpen, setAlertOpen] = useState<boolean>(false);
  const [alertTitle, setAlertTitle] = useState<string>('');
  const [alertMessage, setAlertMessage] = useState<string>('');

  // Track Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Seed initial inventory and sales records on initial app load (if user is authenticated)
  useEffect(() => {
    if (user) {
      seedInitialData();
    }
  }, [user]);

  // Load or initialize user profile and role in Firestore
  useEffect(() => {
    if (!user) {
      setRole('employee');
      return;
    }

    const fetchUserRole = async () => {
      setRoleLoading(true);
      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        
        const isAdminEmail = ADMIN_EMAILS.includes(user.email || '');
        const isEmployeeEmail = EMPLOYEE_EMAILS.includes(user.email || '');

        // 🛡️ ระบบรักษาความปลอดภัยแบบ Whitelist:
        // หากผู้ดูแลระบบทำการเพิ่มรายชื่อพนักงานใน EMPLOYEE_EMAILS (ไม่เป็นอาเรย์ว่าง)
        // และอีเมลของผู้ใช้งานไม่อยู่ในรายชื่อแอดมินหรือพนักงานที่กำหนดไว้ ระบบจะปฏิเสธการเข้าถึงและล็อกเอาต์ออกทันที
        if (EMPLOYEE_EMAILS.length > 0 && !isAdminEmail && !isEmployeeEmail) {
          setAlertTitle('ปฏิเสธการเข้าใช้งาน');
          setAlertMessage(`ขออภัย อีเมล (${user.email}) ไม่มีสิทธิ์เข้าใช้งานระบบ กรุณาติดต่อแอดมินเพื่อเพิ่มสิทธิ์ให้คุณ`);
          setAlertOpen(true);
          await auth.signOut();
          return;
        }

        if (userDoc.exists()) {
          const fetchedRole = userDoc.data().role as 'admin' | 'employee';
          
          // ระบบความปลอดภัย: ป้องกันไม่ให้อีเมลธรรมดาแอบอ้างสิทธิ์เป็น Admin
          if (!isAdminEmail && fetchedRole === 'admin') {
            await setDoc(userDocRef, { role: 'employee' }, { merge: true });
            setRole('employee');
          } else {
            setRole(fetchedRole || 'employee');
          }
        } else {
          // หากเป็นผู้ใช้งานใหม่ กำหนดบทบาทเริ่มต้น: เป็น Admin เฉพาะผู้ที่มีเมลใน ADMIN_EMAILS เท่านั้น คนอื่นเป็น Employee
          const defaultRole = isAdminEmail ? 'admin' : 'employee';
          await setDoc(userDocRef, {
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || 'ผู้ใช้งาน Gmail',
            role: defaultRole
          });
          setRole(defaultRole);
        }
      } catch (err) {
        console.error('Error fetching user role:', err);
        const isAdminEmail = ADMIN_EMAILS.includes(user.email || '');
        setRole(isAdminEmail ? 'admin' : 'employee');
      } finally {
        setRoleLoading(false);
      }
    };

    fetchUserRole();
  }, [user]);

  // Restrict navigation for employees: they can only see pos and receipt
  useEffect(() => {
    if (role === 'employee' && activeTab !== 'pos' && activeTab !== 'receipt') {
      setActiveTab('pos');
    }
  }, [role, activeTab]);

  const handleRoleChange = async (newRole: 'admin' | 'employee') => {
    if (!user) return;

    // ระบบความปลอดภัย: หากผู้ใช้พยายามเปลี่ยนเป็น admin แต่อีเมลไม่อยู่ในรายชื่อที่อนุญาต จะไม่อนุมัติ
    const isAdminEmail = ADMIN_EMAILS.includes(user.email || '');
    if (newRole === 'admin' && !isAdminEmail) {
      setAlertTitle('ปฏิเสธการเข้าถึง');
      setAlertMessage('อีเมลของคุณไม่อยู่ในรายชื่อผู้มีสิทธิ์ใช้งานสิทธิ์แอดมิน (Admin) กรุณาติดต่อผู้ดูแลระบบ');
      setAlertOpen(true);
      return;
    }

    setRoleLoading(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(userDocRef, {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || 'ผู้ใช้งาน Gmail',
        role: newRole
      }, { merge: true });
      setRole(newRole);
    } catch (err: any) {
      console.error('Failed to update role in Firestore:', err);
      setAlertTitle('สลับบทบาทล้มเหลว');
      setAlertMessage(`ไม่สามารถบันทึกบทบาทใหม่ลงในระบบรักษาความปลอดภัยได้: ${err.message || err}`);
      setAlertOpen(true);
    } finally {
      setRoleLoading(false);
    }
  };

  // Reset search query when active tab changes
  useEffect(() => {
    setSearchQuery('');
    if (activeTab !== 'receipt') {
      // Clear invoice number when navigating away to keep direct receipts fresh
      setReceiptInvoiceNumber('');
    }
  }, [activeTab]);

  const handleCheckoutSuccess = (sale: Sale, cartItems: CartItem[]) => {
    // Populate the receipt items
    setReceiptItems(cartItems);
    setReceiptDiscount(posDiscount);
    setReceiptInvoiceNumber(sale.id);
    // When checkout succeeds, automatically direct to receipt page!
    setActiveTab('receipt');
    setAlertTitle('สั่งซื้อเสร็จสมบูรณ์');
    setAlertMessage(`การสั่งซื้อรหัส ${sale.id} เสร็จสมบูรณ์แล้ว! กำลังเปิดหน้าพิมพ์ใบเสร็จรับเงิน...`);
    setAlertOpen(true);
  };

  const handleResetPOS = () => {
    if (cart.length > 0) {
      setConfirmTitle('ยกเลิกรายการปัจจุบัน');
      setConfirmMessage('คุณต้องการยกเลิกการขายปัจจุบันและล้างตะกร้าสินค้าใช่หรือไม่?');
      setConfirmText('ล้างตะกร้า');
      setPendingAction(() => () => {
        setCart([]);
        setPosDiscount(0);
        setActiveTab('pos');
      });
      setConfirmOpen(true);
    } else {
      setActiveTab('pos');
    }
  };

  const handleExportToReceipt = (items: CartItem[], discount: number) => {
    setReceiptItems(items);
    setReceiptDiscount(discount);
    setActiveTab('receipt');
  };

  const renderActiveView = () => {
    switch (activeTab) {
      case 'pos':
        return (
          <POSView
            searchQuery={searchQuery}
            cart={cart}
            setCart={setCart}
            onCheckoutSuccess={handleCheckoutSuccess}
            setReceiptItems={setReceiptItems}
            setActiveTab={setActiveTab}
            discount={posDiscount}
            setDiscount={setPosDiscount}
            onExportToReceipt={handleExportToReceipt}
          />
        );
      case 'products':
        return <ProductsView searchQuery={searchQuery} />;
      case 'reports':
        return <ReportsView />;
      case 'receipt':
        return (
          <ReceiptView
            items={receiptItems}
            setItems={setReceiptItems}
            discount={receiptDiscount}
            setDiscount={setReceiptDiscount}
            invoiceId={receiptInvoiceNumber}
            setInvoiceId={setReceiptInvoiceNumber}
            role={role}
          />
        );
      case 'customers':
        return <CustomersView />;
      default:
        return (
          <POSView
            searchQuery={searchQuery}
            cart={cart}
            setCart={setCart}
            onCheckoutSuccess={handleCheckoutSuccess}
            setReceiptItems={setReceiptItems}
            setActiveTab={setActiveTab}
            discount={posDiscount}
            setDiscount={setPosDiscount}
            onExportToReceipt={handleExportToReceipt}
          />
        );
    }
  };

  if (authLoading) {
    return (
      <div className="bg-slate-50 min-h-screen flex flex-col justify-center items-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-900 mb-4"></div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">สุเมธค้าข้าว</p>
        <p className="text-sm font-semibold text-slate-600 mt-2">กำลังโหลดข้อมูลระบบรักษาความปลอดภัย...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  return (
    <div className="bg-[#F1F5F9] min-h-screen flex text-slate-800 antialiased selection:bg-slate-900 selection:text-white">
      {/* Sidebar navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onResetPOS={handleResetPOS}
        role={role}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:ml-64 min-h-screen">
        {/* Top Header */}
        <Header
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          activeTab={activeTab}
          role={role}
          onRoleChange={handleRoleChange}
          roleLoading={roleLoading}
          isAdminEmail={ADMIN_EMAILS.includes(user?.email || '')}
        />

        {/* Dynamic Inner Viewport */}
        <main className="flex-1 overflow-hidden">
          {renderActiveView()}
        </main>
      </div>

      <ConfirmModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          if (pendingAction) pendingAction();
          setConfirmOpen(false);
        }}
        title={confirmTitle}
        message={confirmMessage}
        confirmText={confirmText}
        cancelText="ยกเลิก"
        isDanger={true}
      />

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

