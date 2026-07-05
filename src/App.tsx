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
import { seedInitialData, auth } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { CartItem, Sale } from './types';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
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
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:ml-64 min-h-screen">
        {/* Top Header */}
        <Header
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          activeTab={activeTab}
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

