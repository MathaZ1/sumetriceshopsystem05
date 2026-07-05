import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, doc, setDoc, query, orderBy, updateDoc } from 'firebase/firestore';
import { Product, CartItem, Customer, Sale, SaleItem } from '../types';
import { Search, Plus, Minus, Trash2, Printer, CheckCircle2, User, MapPin, FileText, Users, Ban, RefreshCw, Eye, Tag, Receipt } from 'lucide-react';
import ConfirmModal from './ConfirmModal';

function thaiBaht(num: number): string {
  if (isNaN(num) || num === 0) return 'ศูนย์บาทถ้วน';
  
  const THAI_NUMBER = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  const THAI_UNIT = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];
  
  let [integerPart, decimalPart] = num.toFixed(2).split('.');
  
  const convertSegment = (textNum: string): string => {
    let result = '';
    const len = textNum.length;
    for (let i = 0; i < len; i++) {
      const digit = parseInt(textNum[i]);
      const position = len - 1 - i;
      
      if (digit !== 0) {
        if (position === 0 && digit === 1 && len > 1) {
          result += 'เอ็ด';
        } else if (position === 1 && digit === 1) {
          result += 'สิบ';
        } else if (position === 1 && digit === 2) {
          result += 'ยี่สิบ';
        } else {
          result += THAI_NUMBER[digit] + THAI_UNIT[position];
        }
      }
    }
    return result;
  };

  let intVal = parseInt(integerPart);
  let intResult = '';
  if (intVal > 0) {
    let segments: string[] = [];
    let temp = integerPart;
    while (temp.length > 6) {
      segments.unshift(temp.slice(-6));
      temp = temp.slice(0, -6);
    }
    segments.unshift(temp);
    
    for (let i = 0; i < segments.length; i++) {
      const segmentStr = segments[i];
      let segmentConvert = convertSegment(segmentStr);
      if (segmentConvert !== '') {
        intResult += segmentConvert;
        if (i < segments.length - 1) {
          intResult += 'ล้าน';
        }
      }
    }
    intResult += 'บาท';
  }
  
  let decResult = '';
  if (decimalPart && decimalPart !== '00') {
    decResult = convertSegment(decimalPart) + 'สตางค์';
  } else {
    decResult = 'ถ้วน';
  }
  
  return intResult + decResult;
}

interface ReceiptViewProps {
  items?: CartItem[];
  setItems?: React.Dispatch<React.SetStateAction<CartItem[]>>;
  discount?: number;
  setDiscount?: React.Dispatch<React.SetStateAction<number>>;
  invoiceId?: string;
  setInvoiceId?: React.Dispatch<React.SetStateAction<string>>;
}

export default function ReceiptView({
  items: propItems,
  setItems: propSetItems,
  discount: propDiscount,
  setDiscount: propSetDiscount,
  invoiceId,
  setInvoiceId
}: ReceiptViewProps = {}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [showDropdown, setShowDropdown] = useState<boolean>(false);
  const [localItems, setLocalItems] = useState<CartItem[]>([]);
  const [localDiscount, setLocalDiscount] = useState<number>(0);
  
  // Inner Sub-tab navigation
  const [subTab, setSubTab] = useState<'create' | 'manage'>('create');
  const [printPinhole, setPrintPinhole] = useState<boolean>(true);
  
  // Outer container ref and scale state to automatically fit the receipt preview to the width
  const previewContainerRef = React.useRef<HTMLDivElement>(null);
  const receiptCardRef = React.useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState<number>(1);

  useEffect(() => {
    if (!previewContainerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const containerWidth = entry.contentRect.width;
        // The default width of our printable card is 864px (9 inches at 96 dpi)
        const targetWidth = 864;
        if (containerWidth < targetWidth) {
          setPreviewScale(containerWidth / targetWidth);
        } else {
          setPreviewScale(1);
        }
      }
    });
    resizeObserver.observe(previewContainerRef.current);
    return () => resizeObserver.disconnect();
  }, []);
  
  // Sales list states
  const [allSales, setAllSales] = useState<Sale[]>([]);
  const [salesLoading, setSalesLoading] = useState<boolean>(true);
  const [manageSearch, setManageSearch] = useState<string>('');

  // Customer/Buyer Info States
  const [custName, setCustName] = useState<string>('');
  const [custAddress, setCustAddress] = useState<string>('');
  const [custTaxId, setCustTaxId] = useState<string>('');
  const [custPhone, setCustPhone] = useState<string>('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustId, setSelectedCustId] = useState<string>('');

  const items = propItems !== undefined ? propItems : localItems;
  const setItems = propSetItems !== undefined ? propSetItems : setLocalItems;
  const discount = propDiscount !== undefined ? propDiscount : localDiscount;
  const setDiscount = propSetDiscount !== undefined ? propSetDiscount : setLocalDiscount;

  const [isPrinted, setIsPrinted] = useState<boolean>(false);

  // Load current invoice sequence from localStorage
  const [invoiceSeq, setInvoiceSeq] = useState<number>(() => {
    const saved = localStorage.getItem('receipt_invoice_seq');
    return saved ? parseInt(saved, 10) : 1;
  });

  // Modal confirmation states
  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);
  const [confirmTitle, setConfirmTitle] = useState<string>('');
  const [confirmMessage, setConfirmMessage] = useState<string>('');
  const [confirmIsDanger, setConfirmIsDanger] = useState<boolean>(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // Alert Modal states
  const [alertOpen, setAlertOpen] = useState<boolean>(false);
  const [alertTitle, setAlertTitle] = useState<string>('');
  const [alertMessage, setAlertMessage] = useState<string>('');

  // Load sales history for cancellation/management
  useEffect(() => {
    const salesCol = collection(db, 'sales');
    const q = query(salesCol, orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Sale[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Sale);
      });
      setAllSales(list);
      setSalesLoading(false);
    }, (error) => {
      console.error('Error loading sales history in receipt view:', error);
    });
    return () => unsubscribe();
  }, []);

  // Load customer lists from Firestore
  useEffect(() => {
    const customersCol = collection(db, 'customers');
    const unsubscribe = onSnapshot(customersCol, (snapshot) => {
      const list: Customer[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Customer);
      });
      setCustomers(list);
    }, (error) => {
      console.error('Error loading customers in receipt view:', error);
    });
    return () => unsubscribe();
  }, []);

  const handleSelectCustomer = (id: string) => {
    setSelectedCustId(id);
    if (id === '') {
      setCustName('');
      setCustAddress('');
      setCustTaxId('');
      setCustPhone('');
    } else {
      const found = customers.find(c => c.id === id);
      if (found) {
        setCustName(found.name || '');
        setCustAddress(found.address || '');
        setCustTaxId(found.taxId || '');
        setCustPhone(found.phone || '');
      }
    }
  };

  // Load products catalog for search
  useEffect(() => {
    const productsCol = collection(db, 'products');
    const unsubscribe = onSnapshot(productsCol, (snapshot) => {
      const prods: Product[] = [];
      snapshot.forEach((docSnap) => {
        prods.push({ id: docSnap.id, ...docSnap.data() } as Product);
      });
      setProducts(prods);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'products');
    });

    return () => unsubscribe();
  }, []);

  // Filter products by query
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const filtered = products.filter(
      (p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.id.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setSearchResults(filtered);
    setShowDropdown(true);
  }, [searchQuery, products]);

  // Load sale details if invoiceId is provided (e.g., from POS checkout or history selection)
  useEffect(() => {
    if (!invoiceId) return;

    const matchedSale = allSales.find(s => s.id === invoiceId);
    if (matchedSale) {
      // Set customer name and phone
      setCustName(matchedSale.customerName || 'ลูกค้าทั่วไป');
      setCustPhone(matchedSale.customerPhone || '');
      
      // Look up customer details in our loaded customer list
      if (matchedSale.customerName && matchedSale.customerName !== 'ลูกค้าทั่วไป') {
        const matchedCust = customers.find(c => c.name === matchedSale.customerName);
        if (matchedCust) {
          setCustAddress(matchedCust.address || '');
          setCustTaxId(matchedCust.taxId || '');
          setSelectedCustId(matchedCust.id);
        } else {
          setCustAddress('');
          setCustTaxId('');
          setSelectedCustId('');
        }
      } else {
        setCustAddress('');
        setCustTaxId('');
        setSelectedCustId('');
      }

      // Populate items
      if (matchedSale.items && matchedSale.items.length > 0) {
        const cartItems: CartItem[] = matchedSale.items.map((item) => ({
          product: {
            id: item.productId,
            name: item.name,
            price: item.price,
            stock: 9999,
            category: 'ทั่วไป',
            imageUrl: '',
            status: 'พร้อมขาย',
          },
          quantity: item.quantity,
        }));
        setItems(cartItems);
      }
      setDiscount(matchedSale.discount || 0);
    }
  }, [invoiceId, allSales, customers, setItems, setDiscount]);

  const handleSelectItem = (product: Product) => {
    if (product.stock <= 0) {
      setAlertTitle('หมดสต็อก');
      setAlertMessage('สินค้านี้หมดสต็อกในคลังสินค้า');
      setAlertOpen(true);
      return;
    }

    setItems((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) {
          setAlertTitle('เกินสต็อก');
          setAlertMessage(`ไม่สามารถเพิ่มสินค้าเกินคลังที่มีอยู่ (${product.stock} ชิ้น)`);
          setAlertOpen(true);
          return prev;
        }
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      } else {
        return [...prev, { product, quantity: 1 }];
      }
    });

    setSearchQuery('');
    setShowDropdown(false);
  };

  const handleCancelReceipt = (sale: Sale) => {
    const isSuccess = sale.status === 'สำเร็จ';
    const newStatus = isSuccess ? 'ยกเลิก' : 'สำเร็จ';
    setConfirmTitle(isSuccess ? 'ยกเลิกบิลใบเสร็จ' : 'กู้คืนบิลใบเสร็จ');
    setConfirmMessage(
      isSuccess
        ? `คุณต้องการยกเลิกบิลใบเสร็จเลขที่ ${sale.id} ใช่หรือไม่? (ระบบจะปรับปรุงข้อมูลและรายงานการขายทันที)`
        : `คุณต้องการกู้คืนบิลใบเสร็จเลขที่ ${sale.id} ให้กลับมาใช้งานใช่หรือไม่?`
    );
    setConfirmIsDanger(isSuccess);
    setPendingAction(() => async () => {
      try {
        const docRef = doc(db, 'sales', sale.id);
        await updateDoc(docRef, { status: newStatus });
        setAlertTitle('สำเร็จ');
        setAlertMessage(`เปลี่ยนสถานะบิลเลขที่ ${sale.id} เป็น "${newStatus}" สำเร็จ!`);
        setAlertOpen(true);
      } catch (error) {
        console.error('Error toggling receipt status:', error);
        setAlertTitle('เกิดข้อผิดพลาด');
        setAlertMessage('เกิดข้อผิดพลาดในการเปลี่ยนสถานะใบเสร็จ');
        setAlertOpen(true);
      }
    });
    setConfirmOpen(true);
  };

  const handleLoadSaleToPrint = (sale: Sale) => {
    // Convert SaleItems to CartItems
    const cartItems: CartItem[] = (sale.items || []).map((item) => ({
      product: {
        id: item.productId,
        name: item.name,
        price: item.price,
        stock: 9999, // default dummy high stock so it is editable
        category: 'ข้าวสาร',
        imageUrl: '',
        status: 'พร้อมขาย',
      },
      quantity: item.quantity,
    }));

    // Set invoiceId and items
    if (setInvoiceId) {
      setInvoiceId(sale.id);
    }
    setItems(cartItems);
    setDiscount(sale.discount || 0);
    
    // Set customer states
    setCustName(sale.customerName || 'ลูกค้าทั่วไป');
    setCustPhone(sale.customerPhone || '');
    
    // Query/lookup customer full address and tax id from current customers list
    if (sale.customerName && sale.customerName !== 'ลูกค้าทั่วไป') {
      const matchedCust = customers.find(c => c.name === sale.customerName);
      if (matchedCust) {
        setCustAddress(matchedCust.address || '');
        setCustTaxId(matchedCust.taxId || '');
        setSelectedCustId(matchedCust.id);
      } else {
        setCustAddress('');
        setCustTaxId('');
        setSelectedCustId('');
      }
    } else {
      setCustAddress('');
      setCustTaxId('');
      setSelectedCustId('');
    }

    // Switch to create view tab
    setSubTab('create');
  };

  const updateQuantity = (productId: string, quantityStr: string) => {
    const quantity = parseInt(quantityStr);
    if (isNaN(quantity) || quantity <= 0) return;

    const item = items.find((i) => i.product.id === productId);
    if (!item) return;

    if (quantity > item.product.stock) {
      setAlertTitle('เกินสต็อก');
      setAlertMessage(`ไม่สามารถเพิ่มสินค้าเกินคลังที่มีอยู่ (${item.product.stock} ชิ้น)`);
      setAlertOpen(true);
      return;
    }

    setItems((prev) =>
      prev.map((i) => (i.product.id === productId ? { ...i, quantity } : i))
    );
  };

  const incrementQuantity = (productId: string, delta: number) => {
    setItems((prev) =>
      prev
        .map((i) => {
          if (i.product.id === productId) {
            const nextQty = i.quantity + delta;
            if (nextQty > i.product.stock) {
              setAlertTitle('เกินสต็อก');
              setAlertMessage(`ไม่สามารถเพิ่มสินค้าเกินคลังที่มีอยู่ (${i.product.stock} ชิ้น)`);
              setAlertOpen(true);
              return i;
            }
            return { ...i, quantity: nextQty };
          }
          return i;
        })
        .filter((i) => i.quantity > 0)
    );
  };

  const removeItem = (productId: string) => {
    setItems((prev) => prev.filter((i) => i.product.id !== productId));
  };

  // Calculations
  const total = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const netTotal = Math.max(0, total - discount);

  const invoiceNumber = invoiceId || String(invoiceSeq).padStart(6, '0');
  const todayStr = new Date().toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const handlePrint = async () => {
    if (items.length === 0) {
      setAlertTitle('คำเตือน');
      setAlertMessage('กรุณาเพิ่มรายการสินค้าก่อนพิมพ์ใบเสร็จ');
      setAlertOpen(true);
      return;
    }

    setIsPrinted(true);

    const finalInvoiceNumber = invoiceNumber;

    // Create a sales log record in Firestore
    const saleItems: SaleItem[] = items.map((item) => ({
      productId: item.product.id,
      name: item.product.name,
      price: item.product.price,
      quantity: item.quantity,
      subtotal: item.product.price * item.quantity,
    }));

    const newSale: Sale = {
      id: finalInvoiceNumber,
      timestamp: new Date().toISOString(),
      employee: 'สมชาย ร.', // Default employee
      total: netTotal,
      status: 'สำเร็จ',
      items: saleItems,
      discount: discount,
      customerName: custName || 'ลูกค้าทั่วไป',
      customerPhone: custPhone || '',
    };

    try {
      // Save sale document
      await setDoc(doc(db, 'sales', finalInvoiceNumber), newSale);

      // Decrement inventory stock
      for (const item of items) {
        const prodRef = doc(db, 'products', item.product.id);
        const newStock = Math.max(0, item.product.stock - item.quantity);
        await updateDoc(prodRef, { stock: newStock });
      }

      // Increment and save sequential invoice number only if we generated it locally
      if (!invoiceId) {
        const nextSeq = invoiceSeq + 1;
        setInvoiceSeq(nextSeq);
        localStorage.setItem('receipt_invoice_seq', String(nextSeq));
      } else {
        if (setInvoiceId) {
          setInvoiceId('');
        }
      }
    } catch (error) {
      console.error('Error saving printed receipt:', error);
    }

    // Open the browser print dialog directly
    window.print();

    setIsPrinted(false);
  };

  const handleSaveReceipt = async () => {
    if (items.length === 0) {
      setAlertTitle('คำเตือน');
      setAlertMessage('กรุณาเพิ่มรายการสินค้าก่อนบันทึก');
      setAlertOpen(true);
      return;
    }

    const finalInvoiceNumber = invoiceNumber;

    const saleItems: SaleItem[] = items.map((item) => ({
      productId: item.product.id,
      name: item.product.name,
      price: item.product.price,
      quantity: item.quantity,
      subtotal: item.product.price * item.quantity,
    }));

    const newSale: Sale = {
      id: finalInvoiceNumber,
      timestamp: new Date().toISOString(),
      employee: 'สมชาย ร.',
      total: netTotal,
      status: 'สำเร็จ',
      items: saleItems,
      discount: discount,
      customerName: custName || 'ลูกค้าทั่วไป',
      customerPhone: custPhone || '',
    };

    try {
      // Save sale document
      await setDoc(doc(db, 'sales', finalInvoiceNumber), newSale);

      // Decrement inventory stock
      for (const item of items) {
        const prodRef = doc(db, 'products', item.product.id);
        const newStock = Math.max(0, item.product.stock - item.quantity);
        await updateDoc(prodRef, { stock: newStock });
      }

      setAlertTitle('บันทึกสำเร็จ');
      setAlertMessage(`บันทึกข้อมูลใบเสร็จรับเงินเลขที่ ${finalInvoiceNumber} สำเร็จและเชื่อมโยงกับหน้ารายงานแล้ว!`);
      setAlertOpen(true);

      // Increment and save sequential invoice number only if we generated it locally
      if (!invoiceId) {
        const nextSeq = invoiceSeq + 1;
        setInvoiceSeq(nextSeq);
        localStorage.setItem('receipt_invoice_seq', String(nextSeq));
      } else {
        if (setInvoiceId) {
          setInvoiceId('');
        }
      }
      
      // Clear items
      setItems([]);
    } catch (error) {
      console.error('Error saving receipt:', error);
      setAlertTitle('เกิดข้อผิดพลาด');
      setAlertMessage('เกิดข้อผิดพลาดในการบันทึกข้อมูลใบเสร็จ');
      setAlertOpen(true);
    }
  };

  const handleClear = () => {
    setConfirmTitle('เคลียร์รายการทั้งหมด');
    setConfirmMessage('คุณต้องการเคลียร์รายการทั้งหมดใช่หรือไม่?');
    setConfirmIsDanger(true);
    setPendingAction(() => () => {
      setItems([]);
    });
    setConfirmOpen(true);
  };

  return (
    <div className="flex-1 p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        
        {/* Page Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">ออกใบเสร็จรับเงิน</h2>
            <p className="text-sm text-slate-500 mt-1 font-medium">สร้างรายการขาย พิมพ์ใบเสร็จ และจัดการยกเลิกบิล</p>
          </div>
          
          {/* Sub-tab Selection */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setSubTab('create')}
              className={`px-4 py-2 font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center gap-2 ${
                subTab === 'create'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>ออกใบเสร็จรับเงินใหม่</span>
            </button>
            <button
              onClick={() => setSubTab('manage')}
              className={`px-4 py-2 font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center gap-2 ${
                subTab === 'manage'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Ban className="w-3.5 h-3.5" />
              <span>ยกเลิกออกใบเสร็จรับเงิน</span>
              <span className="bg-slate-200 text-slate-700 text-[10px] px-1.5 py-0.5 rounded-full font-extrabold">
                {allSales.length}
              </span>
            </button>
          </div>
        </div>

        {/* Conditional Workspace */}
        {subTab === 'manage' ? (
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm flex flex-col gap-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-slate-600" />
                  ยกเลิกออกใบเสร็จรับเงิน (Void / Cancel Receipt)
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  ค้นหา ตรวจสอบ และจัดการยกเลิกบิลใบเสร็จรับเงินที่ออกไปแล้ว ระบบจะปรับยอดรายงานอัตโนมัติ
                </p>
              </div>

              {/* Search Bar */}
              <div className="relative w-full md:w-80">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={manageSearch}
                  onChange={(e) => setManageSearch(e.target.value)}
                  placeholder="ค้นหาเลขที่บิล หรือ ชื่อลูกค้า..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none transition-all"
                />
              </div>
            </div>

            {salesLoading ? (
              <div className="py-20 flex flex-col items-center justify-center gap-3">
                <RefreshCw className="w-8 h-8 text-slate-400 animate-spin" />
                <p className="text-xs text-slate-500 font-medium">กำลังโหลดประวัติการออกบิล...</p>
              </div>
            ) : (
              (() => {
                const filteredSales = allSales.filter((sale) => {
                  const queryText = manageSearch.trim().toLowerCase();
                  if (!queryText) return true;
                  
                  const matchesId = sale.id.toLowerCase().includes(queryText);
                  const matchesEmployee = sale.employee?.toLowerCase().includes(queryText) || false;
                  const matchesItems = sale.items?.some(item => item.name.toLowerCase().includes(queryText)) || false;
                  
                  return matchesId || matchesEmployee || matchesItems;
                });

                if (filteredSales.length === 0) {
                  return (
                    <div className="py-16 text-center border border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-2">
                      <Receipt className="w-10 h-10 text-slate-300" />
                      <p className="text-sm font-bold text-slate-700">ไม่พบข้อมูลบิลใบเสร็จ</p>
                      <p className="text-xs text-slate-400">ลองระบุเลขที่บิลอื่น หรือเพิ่มการออกบิลใบเสร็จในระบบ</p>
                    </div>
                  );
                }

                return (
                  <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/70 border-b border-slate-100">
                          <th className="py-3.5 px-4 text-xs font-black text-slate-600 font-sans">เลขที่บิล</th>
                          <th className="py-3.5 px-4 text-xs font-black text-slate-600 font-sans">วันที่ - เวลา</th>
                          <th className="py-3.5 px-4 text-xs font-black text-slate-600 font-sans">พนักงาน</th>
                          <th className="py-3.5 px-4 text-xs font-black text-slate-600 font-sans">ยอดรวมสุทธิ</th>
                          <th className="py-3.5 px-4 text-xs font-black text-slate-600 font-sans text-center">สถานะ</th>
                          <th className="py-3.5 px-4 text-xs font-black text-slate-600 font-sans text-center">จัดการ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredSales.map((sale) => {
                          const isCancelled = sale.status === 'ยกเลิก';
                          return (
                            <tr key={sale.id} className="hover:bg-slate-50/55 transition-colors">
                              <td className="py-3 px-4 text-xs font-black font-mono text-slate-900">
                                {sale.id}
                              </td>
                              <td className="py-3 px-4 text-xs text-slate-600">
                                {new Date(sale.timestamp).toLocaleString('th-TH', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </td>
                              <td className="py-3 px-4 text-xs text-slate-600">
                                {sale.employee || '-'}
                              </td>
                              <td className="py-3 px-4 text-xs font-bold text-slate-900">
                                ฿{(sale.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="py-3 px-4 text-xs text-center">
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black ${
                                    isCancelled
                                      ? 'bg-red-50 text-red-700 border border-red-100'
                                      : 'bg-green-50 text-green-700 border border-green-100'
                                  }`}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${isCancelled ? 'bg-red-500' : 'bg-green-500'}`}></span>
                                  {sale.status || 'สำเร็จ'}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-xs text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => handleLoadSaleToPrint(sale)}
                                    className="px-3 py-1.5 rounded-lg font-bold text-[11px] bg-slate-950 text-white hover:bg-slate-800 transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-sm"
                                  >
                                    <Printer className="w-3.5 h-3.5" />
                                    <span>พิมพ์ใบเสร็จ</span>
                                  </button>
                                  <button
                                    onClick={() => handleCancelReceipt(sale)}
                                    className={`px-3 py-1.5 rounded-lg font-bold text-[11px] transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                                      isCancelled
                                        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                                        : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                                    }`}
                                  >
                                    {isCancelled ? (
                                      <>
                                        <RefreshCw className="w-3.5 h-3.5" />
                                        <span>กู้คืนบิล</span>
                                      </>
                                    ) : (
                                      <>
                                        <Ban className="w-3.5 h-3.5" />
                                        <span>ยกเลิกบิล</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column: Product Search & Cart Editor (Span 7/12) */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            
            {/* Customer Information Panel */}
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-slate-500" />
                  <h3 className="text-sm font-bold text-slate-900">ข้อมูลผู้ซื้อ / Customer Info</h3>
                </div>
                <span className="text-[10px] bg-slate-100 px-2 py-1 rounded-md text-slate-500 font-bold">เลือกสมาชิกด่วน</span>
              </div>

              {/* Select Member Dropdown */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
                  เลือกจากรายชื่อสมาชิกลูกค้า (ถ้ามี)
                </label>
                <select
                  value={selectedCustId}
                  onChange={(e) => handleSelectCustomer(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none bg-white transition-all font-semibold"
                >
                  <option value="">-- ลูกค้าทั่วไป (กรอกข้อมูลเองด้านล่าง) --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Customer Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
                    ชื่อลูกค้า
                  </label>
                  <input
                    type="text"
                    value={custName}
                    onChange={(e) => setCustName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none transition-all"
                    placeholder="ระบุชื่อลูกค้า..."
                  />
                </div>

                {/* Customer Phone */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
                    เบอร์โทรศัพท์ลูกค้า
                  </label>
                  <input
                    type="tel"
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none transition-all"
                    placeholder="ระบุเบอร์โทรศัพท์..."
                  />
                </div>
              </div>

              {/* Tax ID */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
                  เลขประจำตัวผู้เสียภาษี (Tax ID)
                </label>
                <input
                  type="text"
                  value={custTaxId}
                  onChange={(e) => setCustTaxId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none transition-all"
                  placeholder="กรอกเลขประจำตัวผู้เสียภาษี..."
                />
              </div>

              {/* Customer Address */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
                  ที่อยู่ลูกค้า
                </label>
                <textarea
                  value={custAddress}
                  onChange={(e) => setCustAddress(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none transition-all resize-none h-16"
                  placeholder="กรอกที่อยู่ลูกค้า..."
                />
              </div>
            </div>

            {/* Discount Panel */}
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex flex-col gap-3">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                <h3 className="text-sm font-bold text-slate-900">ส่วนลดใบเสร็จ / Discount</h3>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
                  ระบุจำนวนเงินส่วนลด (บาท)
                </label>
                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 shadow-sm focus-within:border-slate-950 focus-within:ring-1 focus-within:ring-slate-950 transition-all">
                  <span className="text-slate-400 font-bold text-sm">฿</span>
                  <input
                    type="number"
                    min="0"
                    max={total}
                    value={discount === 0 ? '' : discount}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (isNaN(val) || val < 0) {
                        setDiscount(0);
                      } else {
                        setDiscount(Math.min(total, val));
                      }
                    }}
                    className="w-full border-none outline-none p-0 text-sm font-bold text-slate-800 focus:ring-0 bg-transparent"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            {/* List Table of Chosen Items */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden flex flex-col">
              <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-900">รายการสินค้า</h3>
                <span className="text-xs font-semibold text-slate-500 bg-white px-2.5 py-1 rounded-lg border border-slate-150">
                  {items.length} รายการ
                </span>
              </div>

              {items.length === 0 ? (
                <div className="py-24 text-center text-slate-400 flex flex-col items-center justify-center">
                  <Printer className="w-12 h-12 mb-3 stroke-[1.5]" />
                  <p className="text-sm font-medium">ยังไม่มีรายการสินค้า</p>
                  <p className="text-xs mt-1 text-slate-400">ค้นหาสินค้าด้านบนเพื่อสร้างรายการใบเสร็จ</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {/* Table headers */}
                  <div className="hidden sm:grid grid-cols-12 gap-4 px-5 py-2.5 bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    <div className="col-span-5">สินค้า</div>
                    <div className="col-span-2 text-right">ราคา/หน่วย</div>
                    <div className="col-span-2 text-center">จำนวน</div>
                    <div className="col-span-2 text-right">รวม</div>
                    <div className="col-span-1 text-center">ลบ</div>
                  </div>

                  {/* Rows */}
                  {items.map((i) => (
                    <div key={i.product.id} className="grid grid-cols-1 sm:grid-cols-12 gap-4 px-5 py-4 items-center hover:bg-slate-50/35 transition-colors">
                      {/* Product Column */}
                      <div className="col-span-5 flex items-center">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">{i.product.name}</p>
                        </div>
                      </div>

                      {/* Price Column */}
                      <div className="col-span-2 flex sm:justify-end justify-between items-center">
                        <span className="sm:hidden text-xs text-slate-400 font-medium">ราคา:</span>
                        <span className="text-sm font-medium text-slate-800">฿{i.product.price.toFixed(2)}</span>
                      </div>

                      {/* Quantity Controls */}
                      <div className="col-span-2 flex justify-center items-center">
                        <div className="flex items-center border border-slate-200 rounded-lg bg-white overflow-hidden shadow-sm">
                          <button
                            onClick={() => incrementQuantity(i.product.id, -1)}
                            className="p-1.5 hover:bg-slate-50 text-slate-500 cursor-pointer transition-colors"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            type="text"
                            value={i.quantity}
                            onChange={(e) => updateQuantity(i.product.id, e.target.value)}
                            className="w-8 text-center border-none text-xs font-bold text-slate-800 p-0 focus:ring-0 bg-transparent"
                          />
                          <button
                            onClick={() => incrementQuantity(i.product.id, 1)}
                            className="p-1.5 hover:bg-slate-50 text-slate-500 cursor-pointer transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Subtotal Column */}
                      <div className="col-span-2 flex sm:justify-end justify-between items-center">
                        <span className="sm:hidden text-xs text-slate-400 font-medium">รวม:</span>
                        <span className="text-sm font-black text-slate-900">
                          ฿{(i.product.price * i.quantity).toFixed(2)}
                        </span>
                      </div>

                      {/* Delete Action Column */}
                      <div className="col-span-1 flex justify-end sm:justify-center">
                        <button
                          onClick={() => removeItem(i.product.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Receipt Preview & Actions (Span 5/12) */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            
            {/* Print Options Panel */}
            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">การตั้งค่าการพิมพ์ / Print Options</h4>
              <div className="flex items-center justify-between py-1.5 border-t border-slate-105/50">
                <div className="flex flex-col pr-4">
                  <span className="text-xs font-bold text-slate-700">พิมพ์ขอบรูหนามเตยกระดาษต่อเนื่อง</span>
                  <span className="text-[10px] text-slate-400 font-semibold leading-relaxed mt-0.5">
                    เปิดหากพิมพ์ด้วยกระดาษธรรมดาเพื่อเลียนแบบกระดาษต่อเนื่องจริง ปิดหากพิมพ์ลงกระดาษต่อเนื่องมีรูอยู่แล้ว
                  </span>
                </div>
                <input
                  id="printPinholeToggle"
                  type="checkbox"
                  checked={printPinhole}
                  onChange={(e) => setPrintPinhole(e.target.checked)}
                  className="w-5 h-5 text-slate-900 border-slate-300 rounded focus:ring-slate-900 cursor-pointer shrink-0"
                />
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">ภาพตัวอย่างใบเสร็จต่อเนื่อง 9" x 5.5"</span>
              <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full font-bold">Dot Matrix Format</span>
            </div>

            {/* Paper Bill Lookalike Preview in Landscape Continuous Form layout */}
            <div ref={previewContainerRef} className="w-full overflow-hidden relative print:overflow-visible print:h-auto print:static" style={{ height: `${528 * previewScale}px` }}>
              <div
                ref={receiptCardRef}
                style={{
                  width: '864px',
                  height: '528px',
                  transform: `scale(${previewScale})`,
                  transformOrigin: 'top left',
                  position: 'absolute',
                  left: 0,
                  top: 0,
                }}
                className={`dot-matrix-print-target print-receipt-card bg-[#fafaf5] border border-stone-250 rounded-xl p-5 shadow-lg font-mono text-[10px] text-stone-800 select-all flex flex-col justify-between overflow-hidden ${printPinhole ? 'print-pinholes-visible' : ''}`}
              >
                
                {/* Continuous Form Pinhole Margins (Left Strip) */}
                {printPinhole && (
                  <div className="print-pinholes absolute left-0 top-0 bottom-0 w-8 border-r border-dashed border-stone-300 bg-stone-100/40 flex flex-col justify-around items-center py-4 z-10">
                    {[...Array(6)].map((_, idx) => (
                      <div key={`pin-l-${idx}`} className="w-2.5 h-2.5 rounded-full bg-slate-100 border border-stone-250 shadow-inner"></div>
                    ))}
                  </div>
                )}

                {/* Continuous Form Pinhole Margins (Right Strip) */}
                {printPinhole && (
                  <div className="print-pinholes absolute right-0 top-0 bottom-0 w-8 border-l border-dashed border-stone-300 bg-stone-100/40 flex flex-col justify-around items-center py-4 z-10">
                    {[...Array(6)].map((_, idx) => (
                      <div key={`pin-r-${idx}`} className="w-2.5 h-2.5 rounded-full bg-slate-100 border border-stone-250 shadow-inner"></div>
                    ))}
                  </div>
                )}

                {/* Main Content (Offset by pinhole strip widths) */}
                <div className={`${printPinhole ? 'mx-6' : 'mx-1'} h-full flex flex-col justify-between gap-2`}>
                  
                  {/* Top Header Block */}
                  <div className="flex justify-between items-start border-b border-stone-250 pb-2">
                    <div>
                      <h3 className="font-extrabold text-stone-900 text-[13px] tracking-wide">ร้านสุเมธค้าข้าว</h3>
                      <p className="text-[9px] text-stone-500 mt-0.5 leading-tight">
                        ถ.จุลจอมเกล้า ต.ท่าข้าม อ.พุนพิน จ.สุราษฎร์ธานี 84130
                      </p>
                      <p className="text-[9px] text-stone-500 mt-0.5 leading-tight">
                        สาขาโค้งวัดดอนกระถิน โทร : <span className="font-semibold text-stone-800">077-441628</span> / สาขาดอนเนียง โทร : <span className="font-semibold text-stone-800">098-6785002</span> | เลขประจำตัวผู้เสียภาษี : <span className="font-mono text-stone-800">084351001529</span>
                      </p>
                    </div>

                    <div className="text-right flex flex-col items-end gap-1">
                      <div className="border border-stone-400 px-3 py-1 font-bold text-[10px] text-stone-900 bg-stone-100/60 tracking-wider rounded-sm">
                        ใบเสร็จรับเงิน / RECEIPT
                      </div>
                      <div className="text-[9px] text-stone-600 mt-1.5 flex flex-col gap-0.5 items-end font-semibold">
                        <div>เลขที่บิล / Invoice No : <span className="text-stone-950 font-bold font-mono">{invoiceNumber}</span></div>
                        <div>วันที่ / Date : <span className="text-stone-950 font-bold">{todayStr}</span></div>
                        <div>หน้า / Page : <span className="text-stone-950">1 / 1</span></div>
                      </div>
                    </div>
                  </div>

                  {/* Customer Information Block */}
                  <div className="border border-dashed border-stone-300 rounded-lg p-2.5 bg-stone-50/50 grid grid-cols-12 gap-2 text-[9px] leading-relaxed">
                    <div className="col-span-8 flex flex-col gap-0.5">
                      <div>
                        <span className="text-stone-400 font-bold">ลูกค้า / Customer :</span>{' '}
                        <span className="text-stone-950 font-bold text-[10px]">
                          {custName || 'ลูกค้าทั่วไป (General Cash Customer)'}
                        </span>
                      </div>
                      <div className="flex items-start gap-1">
                        <span className="text-stone-400 font-bold shrink-0">ที่อยู่ / Address :</span>{' '}
                        <span className="text-stone-800 font-semibold line-clamp-1 leading-normal">
                          {custAddress || '........................................................................................................'}
                        </span>
                      </div>
                    </div>
                    <div className="col-span-4 flex flex-col gap-0.5 border-l border-dashed border-stone-200 pl-3">
                      <div>
                        <span className="text-stone-400 font-bold">เลขผู้เสียภาษี / Tax ID :</span>{' '}
                        <span className="text-stone-950 font-mono font-bold">
                          {custTaxId || '........................'}
                        </span>
                      </div>
                      <div>
                        <span className="text-stone-400 font-bold">เบอร์โทร / Phone :</span>{' '}
                        <span className="text-stone-950 font-bold">
                          {custPhone || '........................'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Items List Table (Formatted in standard dot matrix table layout) */}
                  <div className="flex-1 min-h-[140px] flex flex-col justify-between mt-1">
                    <table className="w-full text-[9px] font-mono border-collapse">
                      <thead>
                        <tr className="border-y border-dashed border-stone-400 bg-stone-100/30 text-stone-700 font-bold text-left">
                          <th className="py-1 text-center w-8">ลำดับ</th>
                          <th className="py-1 px-2">รายการสินค้า / Description</th>
                          <th className="py-1 text-right w-16">จำนวน</th>
                          <th className="py-1 text-right w-24">หน่วยละ</th>
                          <th className="py-1 text-right w-28 pr-1">จำนวนเงิน (บาท)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="text-center py-8 text-stone-400 font-bold italic">
                              -- ไม่มีรายการในใบเสร็จ / No Items Added --
                            </td>
                          </tr>
                        ) : (
                          <>
                            {items.map((i, index) => (
                              <tr key={i.product.id} className="border-b border-dotted border-stone-200">
                                <td className="text-center py-1">{index + 1}</td>
                                <td className="px-2 py-1 font-bold text-stone-950">{i.product.name}</td>
                                <td className="text-right py-1 font-semibold">{i.quantity}</td>
                                <td className="text-right py-1">฿{i.product.price.toFixed(2)}</td>
                                <td className="text-right py-1 font-bold text-stone-950 pr-1">฿{(i.product.price * i.quantity).toFixed(2)}</td>
                              </tr>
                            ))}
                            {/* Pads the table with empty rows to preserve standard 9"x5.5" height (Real-world billing accuracy) */}
                            {items.length < 5 && 
                              Array.from({ length: 5 - items.length }).map((_, idx) => (
                                <tr key={`empty-row-${idx}`} className="border-b border-dotted border-stone-200/40 h-[22px]">
                                  <td className="text-center py-1 text-stone-300">-</td>
                                  <td className="px-2 py-1 text-stone-300">-</td>
                                  <td className="text-right py-1 text-stone-300">-</td>
                                  <td className="text-right py-1 text-stone-300">-</td>
                                  <td className="text-right py-1 text-stone-300 pr-1">-</td>
                                </tr>
                              ))
                            }
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Calculations & Words Summary Grid */}
                  <div className="grid grid-cols-12 border-t border-dashed border-stone-300 pt-2 gap-4">
                    {/* Left part: Baht text */}
                    <div className="col-span-7 flex flex-col justify-center py-0.5">
                      <div className="bg-stone-100/50 border border-dotted border-stone-350 px-2.5 py-2.5 rounded text-[9.5px] text-stone-600 font-bold leading-normal">
                        จำนวนเงินตัวอักษร : <span className="text-stone-950 font-extrabold">{thaiBaht(netTotal)}</span>
                      </div>
                    </div>

                    {/* Right part: Price totals */}
                    <div className="col-span-5 border-l border-dashed border-stone-250 pl-4 py-0.5 flex flex-col justify-center gap-1.5 text-[9.5px] font-bold text-stone-600 font-mono">
                      <div className="flex justify-between">
                        <span>รวมเงิน / Subtotal :</span>
                        <span className="text-stone-900">฿{total.toFixed(2)}</span>
                      </div>
                      {discount > 0 && (
                        <div className="flex justify-between text-[9px] text-emerald-700 font-bold">
                          <span>ส่วนลด / Discount :</span>
                          <span>-฿{discount.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-dashed border-stone-400 pt-1 text-[11px] font-extrabold text-stone-950">
                        <span>ยอดสุทธิ / Net Total :</span>
                        <span className="text-[12px] text-stone-950">฿{netTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Signature fields strip */}
                  <div className="grid grid-cols-2 gap-10 text-center mt-3 border-t border-dotted border-stone-300 pt-2.5 text-[8.5px] text-stone-500 font-bold">
                    <div className="flex flex-col items-center">
                      <div className="h-6"></div> {/* Space for real physical signature */}
                      <p className="text-stone-700">ลงชื่อ ............................................................ ผู้รับสินค้า / Recipient</p>
                      <p className="mt-1 text-stone-400">วันที่ ......../......../........</p>
                    </div>
                    <div className="flex flex-col items-center">
                      <div className="h-6"></div> {/* Space for real physical signature */}
                      <p className="text-stone-700">ลงชื่อ ............................................................ ผู้รับเงิน / Collector</p>
                      <p className="mt-1 text-stone-400">วันที่ ......../......../........</p>
                    </div>
                  </div>

                </div>

              </div>
            </div>

            {/* Print and Save buttons */}
            <div className="flex flex-col gap-2.5">
              <button
                onClick={handlePrint}
                disabled={items.length === 0}
                className={`w-full py-3.5 rounded-xl font-bold text-sm text-white shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all ${
                  items.length === 0
                    ? 'bg-slate-300 cursor-not-allowed shadow-none'
                    : isPrinted
                    ? 'bg-slate-800'
                    : 'bg-slate-950 hover:bg-slate-850 active:scale-[0.98]'
                }`}
              >
                {isPrinted ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>กำลังสั่งพิมพ์...</span>
                  </>
                ) : (
                  <>
                    <Printer className="w-5 h-5" />
                    <span>สั่งพิมพ์ใบเสร็จ (กระดาษต่อเนื่อง)</span>
                  </>
                )}
              </button>

              <div className="flex gap-2.5">
                <button
                  onClick={handleSaveReceipt}
                  disabled={items.length === 0}
                  className="flex-1 py-3 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-40"
                >
                  บันทึกข้อมูลใบเสร็จ
                </button>
                <button
                  onClick={handleClear}
                  disabled={items.length === 0}
                  className="flex-1 py-3 border border-red-200 text-red-600 bg-white hover:bg-red-50 rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-40"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          </div>

        </div>

        )}

        {/* Spacer for mobile menu */}
        <div className="h-16 lg:hidden"></div>
      </div>

      {createPortal(
        <div className="print-portal-container hidden print:block">
          <div
            className={`dot-matrix-print-target print-receipt-card bg-[#ffffff] border border-stone-250 p-5 font-mono text-[10px] text-stone-800 flex flex-col justify-between overflow-hidden ${printPinhole ? 'print-pinholes-visible' : ''}`}
          >
            {/* Main Content */}
            <div className={`${printPinhole ? 'mx-6' : 'mx-1'} h-full flex flex-col justify-between gap-2`}>
              
              {/* Top Header Block */}
              <div className="flex justify-between items-start border-b border-stone-250 pb-2">
                <div>
                  <h3 className="font-extrabold text-stone-900 text-[13px] tracking-wide">ร้านสุเมธค้าข้าว</h3>
                  <p className="text-[9px] text-stone-500 mt-0.5 leading-tight">
                    ถ.จุลจอมเกล้า ต.ท่าข้าม อ.พุนพิน จ.สุราษฎร์ธานี 84130
                  </p>
                  <p className="text-[9px] text-stone-500 mt-0.5 leading-tight">
                    สาขาโค้งวัดดอนกระถิน โทร : <span className="font-semibold text-stone-800">077-441628</span> / สาขาดอนเนียง โทร : <span className="font-semibold text-stone-800">098-6785002</span> | เลขประจำตัวผู้เสียภาษี : <span className="font-mono text-stone-800">084351001529</span>
                  </p>
                </div>

                <div className="text-right flex flex-col items-end gap-1">
                  <div className="border border-stone-400 px-3 py-1 font-bold text-[10px] text-stone-900 bg-stone-100/60 tracking-wider rounded-sm">
                    ใบเสร็จรับเงิน / RECEIPT
                  </div>
                  <div className="text-[9px] text-stone-600 mt-1.5 flex flex-col gap-0.5 items-end font-semibold">
                    <div>เลขที่บิล / Invoice No : <span className="text-stone-950 font-bold font-mono">{invoiceNumber}</span></div>
                    <div>วันที่ / Date : <span className="text-stone-950 font-bold">{todayStr}</span></div>
                    <div>หน้า / Page : <span className="text-stone-950">1 / 1</span></div>
                  </div>
                </div>
              </div>

              {/* Customer Information Block */}
              <div className="border border-dashed border-stone-300 rounded-lg p-2.5 bg-stone-50/50 grid grid-cols-12 gap-2 text-[9px] leading-relaxed">
                <div className="col-span-8 flex flex-col gap-0.5">
                  <div>
                    <span className="text-stone-400 font-bold">ลูกค้า / Customer :</span>{' '}
                    <span className="text-stone-950 font-bold text-[10px]">
                      {custName || 'ลูกค้าทั่วไป (General Cash Customer)'}
                    </span>
                  </div>
                  <div className="flex items-start gap-1">
                    <span className="text-stone-400 font-bold shrink-0">ที่อยู่ / Address :</span>{' '}
                    <span className="text-stone-800 font-semibold line-clamp-1 leading-normal">
                      {custAddress || '........................................................................................................'}
                    </span>
                  </div>
                </div>
                <div className="col-span-4 flex flex-col gap-0.5 border-l border-dashed border-stone-200 pl-3">
                  <div>
                    <span className="text-stone-400 font-bold">เลขผู้เสียภาษี / Tax ID :</span>{' '}
                    <span className="text-stone-950 font-mono font-bold">
                      {custTaxId || '........................'}
                    </span>
                  </div>
                  <div>
                    <span className="text-stone-400 font-bold">เบอร์โทร / Phone :</span>{' '}
                    <span className="text-stone-950 font-bold">
                      {custPhone || '........................'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Items List Table */}
              <div className="flex-1 min-h-[140px] flex flex-col justify-between mt-1">
                <table className="w-full text-[9px] font-mono border-collapse">
                  <thead>
                    <tr className="border-y border-dashed border-stone-400 bg-stone-100/30 text-stone-700 font-bold text-left">
                      <th className="py-1 text-center w-8">ลำดับ</th>
                      <th className="py-1 px-2">รายการสินค้า / Description</th>
                      <th className="py-1 text-right w-16">จำนวน</th>
                      <th className="py-1 text-right w-24">หน่วยละ</th>
                      <th className="py-1 text-right w-28 pr-1">จำนวนเงิน (บาท)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-stone-400 font-bold italic">
                          -- ไม่มีรายการในใบเสร็จ / No Items Added --
                        </td>
                      </tr>
                    ) : (
                      <>
                        {items.map((i, index) => (
                          <tr key={i.product.id} className="border-b border-dotted border-stone-200">
                            <td className="text-center py-1">{index + 1}</td>
                            <td className="px-2 py-1 font-bold text-stone-950">{i.product.name}</td>
                            <td className="text-right py-1 font-semibold">{i.quantity}</td>
                            <td className="text-right py-1">฿{i.product.price.toFixed(2)}</td>
                            <td className="text-right py-1 font-bold text-stone-950 pr-1">฿{(i.product.price * i.quantity).toFixed(2)}</td>
                          </tr>
                        ))}
                        {items.length < 5 && 
                          Array.from({ length: 5 - items.length }).map((_, idx) => (
                            <tr key={`empty-row-portal-${idx}`} className="border-b border-dotted border-stone-200/40 h-[22px]">
                              <td className="text-center py-1 text-stone-300">-</td>
                              <td className="px-2 py-1 text-stone-300">-</td>
                              <td className="text-right py-1 text-stone-300">-</td>
                              <td className="text-right py-1 text-stone-300">-</td>
                              <td className="text-right py-1 text-stone-300 pr-1">-</td>
                            </tr>
                          ))
                        }
                      </>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Calculations & Words Summary Grid */}
              <div className="grid grid-cols-12 border-t border-dashed border-stone-300 pt-2 gap-4">
                {/* Left part: Baht text */}
                <div className="col-span-7 flex flex-col justify-center py-0.5">
                  <div className="bg-stone-100/50 border border-dotted border-stone-350 px-2.5 py-2.5 rounded text-[9.5px] text-stone-600 font-bold leading-normal">
                    จำนวนเงินตัวอักษร : <span className="text-stone-950 font-extrabold">{thaiBaht(netTotal)}</span>
                  </div>
                </div>

                {/* Right part: Price totals */}
                <div className="col-span-5 border-l border-dashed border-stone-250 pl-4 py-0.5 flex flex-col justify-center gap-1.5 text-[9.5px] font-bold text-stone-600 font-mono">
                  <div className="flex justify-between">
                    <span>รวมเงิน / Subtotal :</span>
                    <span className="text-stone-900">฿{total.toFixed(2)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-[9px] text-emerald-700 font-bold">
                      <span>ส่วนลด / Discount :</span>
                      <span>-฿{discount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-dashed border-stone-400 pt-1 text-[11px] font-extrabold text-stone-950">
                    <span>ยอดสุทธิ / Net Total :</span>
                    <span className="text-[12px] text-stone-950">฿{netTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Signature fields strip */}
              <div className="grid grid-cols-2 gap-10 text-center mt-3 border-t border-dotted border-stone-300 pt-2.5 text-[8.5px] text-stone-500 font-bold">
                <div className="flex flex-col items-center">
                  <div className="h-6"></div>
                  <p className="text-stone-700">ลงชื่อ ............................................................ ผู้รับสินค้า / Recipient</p>
                  <p className="mt-1 text-stone-400">วันที่ ......../......../........</p>
                </div>
                <div className="flex flex-col items-center">
                  <div className="h-6"></div>
                  <p className="text-stone-700">ลงชื่อ ............................................................ ผู้รับเงิน / Collector</p>
                  <p className="mt-1 text-stone-400">วันที่ ......../......../........</p>
                </div>
              </div>

            </div>
          </div>
        </div>,
        document.body
      )}

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
        isDanger={confirmIsDanger}
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
