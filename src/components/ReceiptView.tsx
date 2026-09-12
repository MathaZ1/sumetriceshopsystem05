import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { db, handleFirestoreError, OperationType, auth, getNextInvoiceNumber } from '../firebase';
import { collection, onSnapshot, doc, setDoc, query, orderBy, updateDoc, runTransaction } from 'firebase/firestore';
import { Product, CartItem, Customer, Sale, SaleItem } from '../types';
import { Search, Plus, Minus, Trash2, Printer, CheckCircle2, User, MapPin, FileText, Users, Ban, RefreshCw, Eye, Tag, Receipt, Maximize2, X, PackagePlus, Sparkles, AlertTriangle, ShoppingCart } from 'lucide-react';
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

interface ContinuousReceiptPaperProps {
  paperSize: '9.5x11' | '9.5x5.5';
  printPinhole: boolean;
  invoiceNumber: string;
  todayStr: string;
  custName: string;
  custAddress: string;
  custPhone: string;
  custTaxId: string;
  items: CartItem[];
  total: number;
  discount: number;
  netTotal: number;
  isPrintPortal?: boolean;
}

function ContinuousReceiptPaper({
  paperSize,
  printPinhole,
  invoiceNumber,
  todayStr,
  custName,
  custAddress,
  custPhone,
  custTaxId,
  items,
  total,
  discount,
  netTotal,
  isPrintPortal = false,
}: ContinuousReceiptPaperProps) {
  const count = items.length;
  const isSuperDense = count > 18; // 19 - 25 items
  const isDense = count > 10 && count <= 18; // 11 - 18 items

  return (
    <div
      className={`dot-matrix-print-target print-receipt-card bg-[#ffffff] border border-stone-300 ${
        isPrintPortal ? '' : 'rounded-xl shadow-lg'
      } ${
        isSuperDense ? 'p-3.5 sm:p-4' : isDense ? 'p-5' : 'p-6 sm:p-7'
      } font-mono text-black select-all flex flex-col justify-between overflow-hidden relative ${
        printPinhole ? 'print-pinholes-visible' : ''
      }`}
      style={{
        width: '912px',
        minHeight: paperSize === '9.5x11' ? '1056px' : '620px',
        maxHeight: paperSize === '9.5x11' ? '1056px' : '620px',
        height: paperSize === '9.5x11' ? '1056px' : '620px',
        boxSizing: 'border-box',
      }}
    >
      {/* Continuous Form Pinhole Margins (Left Strip) */}
      {printPinhole && (
        <div className="print-pinholes absolute left-0 top-0 bottom-0 w-8 border-r border-dashed border-stone-300 bg-stone-100/40 flex flex-col justify-around items-center py-4 z-10">
          {[...Array(paperSize === '9.5x11' ? 14 : 7)].map((_, idx) => (
            <div
              key={`pin-l-${idx}`}
              className="w-2.5 h-2.5 rounded-full bg-white border border-stone-300 shadow-inner"
            ></div>
          ))}
        </div>
      )}

      {/* Continuous Form Pinhole Margins (Right Strip) */}
      {printPinhole && (
        <div className="print-pinholes absolute right-0 top-0 bottom-0 w-8 border-l border-dashed border-stone-300 bg-stone-100/40 flex flex-col justify-around items-center py-4 z-10">
          {[...Array(paperSize === '9.5x11' ? 14 : 7)].map((_, idx) => (
            <div
              key={`pin-r-${idx}`}
              className="w-2.5 h-2.5 rounded-full bg-white border border-stone-300 shadow-inner"
            ></div>
          ))}
        </div>
      )}

      {/* Main Content */}
      <div className={`${printPinhole && !isPrintPortal ? 'mx-6' : 'mx-0'} h-full flex flex-col justify-between ${isSuperDense ? 'gap-1' : isDense ? 'gap-2' : 'gap-3'} w-full overflow-hidden`}>
        {/* Top Header Block */}
        <div className={`flex justify-between items-start ${isSuperDense ? 'pb-1' : isDense ? 'pb-2' : 'pb-3'} border-b border-black/15`}>
          <div>
            <h3 className={`font-black text-black ${isSuperDense ? 'text-[17px]' : isDense ? 'text-[18.5px]' : 'text-[20px]'} tracking-wide leading-tight`}>
              ร้านสุเมธค้าข้าว
            </h3>
            <p className={`${isSuperDense ? 'text-[12px] mt-0.5' : isDense ? 'text-[13.5px] mt-0.5' : 'text-[15px] mt-1'} font-bold text-black leading-tight`}>
              ถ.จุลจอมเกล้า ต.ท่าข้าม อ.พุนพิน จ.สุราษฎร์ธานี 84130
            </p>
            <p className={`${isSuperDense ? 'text-[12px] mt-0.5' : isDense ? 'text-[13.5px] mt-0.5' : 'text-[15px] mt-1'} font-bold text-black leading-tight`}>
              สาขาโค้งวัดดอนกระถิน โทร : <span className="font-black text-black">077-441628</span> / สาขาดอนเนียง โทร :{' '}
              <span className="font-black text-black">098-6785002</span>
            </p>
          </div>

          <div className="text-right flex flex-col items-end gap-0.5">
            <div className={`font-black ${isSuperDense ? 'text-[17px]' : isDense ? 'text-[18.5px]' : 'text-[20px]'} text-black tracking-wider leading-tight`}>
              ใบเสร็จรับเงิน / RECEIPT
            </div>
            <div className={`${isSuperDense ? 'text-[12px] gap-0.5' : isDense ? 'text-[13.5px] gap-0.5' : 'text-[15px] gap-1'} text-black mt-0.5 flex flex-col items-end font-bold font-mono`}>
              <div>
                เลขที่บิล / Invoice No : <span className="text-black font-black">{invoiceNumber}</span>
              </div>
              <div>
                วันที่ / Date : <span className="text-black font-black">{todayStr}</span>
              </div>
              <div>
                หน้า / Page : <span className="text-black font-black">1 / 1</span>
              </div>
            </div>
          </div>
        </div>

        {/* Customer Information Block */}
        <div className={`${isSuperDense ? 'py-1 gap-1 text-[12px]' : isDense ? 'py-1.5 gap-1.5 text-[13px]' : 'py-2 gap-2 text-[14.5px]'} bg-transparent flex flex-col leading-tight border-b border-black/15 pb-1`}>
          {/* Row 1: Customer Name, Phone, and Tax ID */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="text-black font-bold shrink-0 whitespace-nowrap">ลูกค้า / Customer :</span>
              <span className="text-black font-black truncate">
                {custName || 'ลูกค้าทั่วไป (General Cash Customer)'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-black font-bold shrink-0 whitespace-nowrap">เบอร์โทร / Phone :</span>
              <span className="text-black font-black font-mono">
                {custPhone || '-'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-black font-bold shrink-0 whitespace-nowrap">เลขผู้เสียภาษี / Tax ID :</span>
              <span className="text-black font-black font-mono">
                {custTaxId || '-'}
              </span>
            </div>
          </div>

          {/* Row 2: Customer Address (Full width for complete information without overflowing into other rows) */}
          <div className="flex items-start gap-1.5 w-full min-w-0">
            <span className="text-black font-bold shrink-0 whitespace-nowrap">ที่อยู่ / Address :</span>
            <span className="text-black font-bold break-words flex-1 leading-snug" title={custAddress || ''}>
              {custAddress || '................................................................................................................................................'}
            </span>
          </div>
        </div>

        {/* Items List Table (Supports up to 25 items on 1 page without row overflowing) */}
        <div className="flex-1 flex flex-col justify-start my-0.5 overflow-hidden">
          <table className="w-full font-mono border-collapse table-fixed">
            <thead>
              <tr className={`text-black font-black text-left bg-transparent border-y-2 border-black ${isSuperDense ? 'text-[12px]' : isDense ? 'text-[13.5px]' : 'text-[15px]'}`}>
                <th className={`${isSuperDense ? 'py-1' : isDense ? 'py-1.5' : 'py-2'} text-center w-[48px] font-black whitespace-nowrap`}>ลำดับ</th>
                <th className={`${isSuperDense ? 'py-1 px-2' : isDense ? 'py-1.5 px-3' : 'py-2 px-3'} font-black whitespace-nowrap`}>รายการสินค้า / Description</th>
                <th className={`${isSuperDense ? 'py-1' : isDense ? 'py-1.5' : 'py-2'} text-right w-[72px] font-black whitespace-nowrap`}>จำนวน</th>
                <th className={`${isSuperDense ? 'py-1' : isDense ? 'py-1.5' : 'py-2'} text-right w-[110px] font-black whitespace-nowrap`}>หน่วยละ</th>
                <th className={`${isSuperDense ? 'py-1 pr-1' : isDense ? 'py-1.5 pr-2' : 'py-2 pr-2'} text-right w-[138px] font-black whitespace-nowrap`}>จำนวนเงิน (บาท)</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-black font-black text-[15px] italic">
                    ไม่มีรายการในใบเสร็จ (No Items Added)
                  </td>
                </tr>
              ) : (
                <>
                  {items.slice(0, 25).map((i, index) => (
                    <tr
                      key={i.product.id || index}
                      className={`align-middle ${
                        isSuperDense
                          ? 'text-[11.5px] leading-tight'
                          : isDense
                          ? 'text-[13px] leading-tight'
                          : 'text-[14.5px] leading-normal'
                      }`}
                    >
                      <td className={`text-center ${isSuperDense ? 'py-0.5' : isDense ? 'py-1' : 'py-1.5'} text-black font-bold whitespace-nowrap`}>
                        {index + 1}
                      </td>
                      <td className={`px-2 ${isSuperDense ? 'py-0.5' : isDense ? 'py-1' : 'py-1.5'} font-bold text-black whitespace-nowrap overflow-hidden text-ellipsis`} title={i.product.name}>
                        {i.product.name}
                      </td>
                      <td className={`text-right ${isSuperDense ? 'py-0.5' : isDense ? 'py-1' : 'py-1.5'} font-bold text-black whitespace-nowrap font-mono`}>
                        {i.quantity}
                      </td>
                      <td className={`text-right ${isSuperDense ? 'py-0.5' : isDense ? 'py-1' : 'py-1.5'} font-bold text-black whitespace-nowrap font-mono`}>
                        {i.product.price.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className={`text-right ${isSuperDense ? 'py-0.5 pr-1' : isDense ? 'py-1 pr-2' : 'py-2 pr-2'} font-black text-black whitespace-nowrap font-mono`}>
                        {(i.product.price * i.quantity).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                  {/* Pads the table with empty rows to preserve standard paper layout */}
                  {items.length < (paperSize === '9.5x11' ? (isSuperDense ? 25 : isDense ? 18 : 10) : 5) &&
                    Array.from({
                      length:
                        (paperSize === '9.5x11' ? (isSuperDense ? 25 : isDense ? 18 : 10) : 5) - items.length,
                    }).map((_, idx) => (
                      <tr
                        key={`empty-row-${idx}`}
                        className={isSuperDense ? 'h-[20px]' : isDense ? 'h-[24px]' : 'h-[28px]'}
                      >
                        <td className="text-center py-0.5 whitespace-nowrap">&nbsp;</td>
                        <td className="px-2 py-0.5 whitespace-nowrap">&nbsp;</td>
                        <td className="text-right py-0.5 whitespace-nowrap">&nbsp;</td>
                        <td className="text-right py-0.5 whitespace-nowrap">&nbsp;</td>
                        <td className="text-right py-0.5 pr-2 whitespace-nowrap">&nbsp;</td>
                      </tr>
                    ))}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Calculations & Baht Text Block */}
        <div className={`grid grid-cols-12 ${isSuperDense ? 'pt-1 pb-1 gap-2' : isDense ? 'pt-2 pb-1 gap-3' : 'pt-3 pb-2 gap-4'} border-t-2 border-black`}>
          <div className="col-span-7 flex flex-col justify-center">
            <div className="px-1 py-0.5">
              <p className={`${isSuperDense ? 'text-[12px]' : isDense ? 'text-[13.5px]' : 'text-[15px]'} text-black font-bold leading-tight`}>
                จำนวนเงินตัวอักษร : <span className="text-black font-black">( {thaiBaht(netTotal)} )</span>
              </p>
            </div>
          </div>

          <div className={`col-span-5 pl-3 py-0.5 flex flex-col justify-center ${isSuperDense ? 'gap-1 text-[12px]' : isDense ? 'gap-1.5 text-[13.5px]' : 'gap-1.5 text-[15px]'} font-bold text-black font-mono`}>
            <div className="flex justify-between items-center">
              <span className="font-bold whitespace-nowrap">รวมเงิน / Subtotal :</span>
              <span className="font-black whitespace-nowrap">
                {total.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between items-center text-black font-bold">
                <span className="whitespace-nowrap">ส่วนลด / Discount :</span>
                <span className="font-black whitespace-nowrap">
                  -{discount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
            <div className={`flex justify-between items-center border-t border-black pt-1 ${isSuperDense ? 'text-[14px]' : isDense ? 'text-[15.5px]' : 'text-[17px]'} font-black text-black`}>
              <span className="whitespace-nowrap">ยอดสุทธิ / Net Total :</span>
              <span className="text-black font-black whitespace-nowrap">
                {netTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Signature fields strip */}
        <div className={`grid grid-cols-2 ${isSuperDense ? 'gap-6 mt-1 pt-1 text-[11.5px]' : isDense ? 'gap-8 mt-2 pt-1 text-[13px]' : 'gap-10 mt-3 pt-2 text-[14px]'} text-center text-black font-bold border-t border-dashed border-stone-300`}>
          <div className="flex flex-col items-center">
            <div className={isSuperDense ? 'h-3' : isDense ? 'h-5' : 'h-6'}></div>
            <p className="text-black font-bold leading-tight whitespace-nowrap">
              ลงชื่อ .................................................... ผู้รับสินค้า / Recipient
            </p>
            <p className={`${isSuperDense ? 'mt-0.5' : 'mt-1'} text-black font-bold whitespace-nowrap`}>วันที่ ......../......../........</p>
          </div>
          <div className="flex flex-col items-center">
            <div className={isSuperDense ? 'h-3' : isDense ? 'h-5' : 'h-6'}></div>
            <p className="text-black font-bold leading-tight whitespace-nowrap">
              ลงชื่อ .................................................... ผู้รับเงิน / Collector
            </p>
            <p className={`${isSuperDense ? 'mt-0.5' : 'mt-1'} text-black font-bold whitespace-nowrap`}>วันที่ ......../......../........</p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ReceiptViewProps {
  items?: CartItem[];
  setItems?: React.Dispatch<React.SetStateAction<CartItem[]>>;
  discount?: number;
  setDiscount?: React.Dispatch<React.SetStateAction<number>>;
  invoiceId?: string;
  setInvoiceId?: React.Dispatch<React.SetStateAction<string>>;
  role?: 'admin' | 'employee';
  customers?: Customer[];
  selectedCustId?: string;
  onSelectCustomer?: (id: string) => void;
  customerName?: string;
  setCustomerName?: React.Dispatch<React.SetStateAction<string>>;
  customerPhone?: string;
  setCustomerPhone?: React.Dispatch<React.SetStateAction<string>>;
  customerAddress?: string;
  setCustomerAddress?: React.Dispatch<React.SetStateAction<string>>;
  customerTaxId?: string;
  setCustomerTaxId?: React.Dispatch<React.SetStateAction<string>>;
  onStartNewSale?: () => void;
  setActiveTab?: (tab: string) => void;
}

export default function ReceiptView({
  items: propItems,
  setItems: propSetItems,
  discount: propDiscount,
  setDiscount: propSetDiscount,
  invoiceId,
  setInvoiceId,
  role = 'employee',
  customers: propCustomers,
  selectedCustId: propSelectedCustId,
  onSelectCustomer: propOnSelectCustomer,
  customerName: propCustomerName,
  setCustomerName: propSetCustomerName,
  customerPhone: propCustomerPhone,
  setCustomerPhone: propSetCustomerPhone,
  customerAddress: propCustomerAddress,
  setCustomerAddress: propSetCustomerAddress,
  customerTaxId: propCustomerTaxId,
  setCustomerTaxId: propSetCustomerTaxId,
  onStartNewSale,
  setActiveTab,
}: ReceiptViewProps = {}) {
  const [localItems, setLocalItems] = useState<CartItem[]>([]);
  const [localDiscount, setLocalDiscount] = useState<number>(0);
  
  // Inner Sub-tab navigation
  const [subTab, setSubTab] = useState<'create' | 'manage'>('create');
  const [printPinhole, setPrintPinhole] = useState<boolean>(true);
  const [paperSize, setPaperSize] = useState<'9.5x11' | '9.5x5.5'>(() => {
    const saved = localStorage.getItem('receipt_paper_size');
    return saved === '9.5x5.5' ? '9.5x5.5' : '9.5x11'; // Default to standard 9.5" x 11" Dot Matrix paper
  });

  const handlePaperSizeChange = (size: '9.5x11' | '9.5x5.5') => {
    setPaperSize(size);
    localStorage.setItem('receipt_paper_size', size);
  };
  
  // Outer container ref and scale state to automatically fit the receipt preview to the width
  const previewContainerRef = React.useRef<HTMLDivElement>(null);
  const receiptCardRef = React.useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState<number>(1);
  const [cardContentHeight, setCardContentHeight] = useState<number>(paperSize === '9.5x11' ? 1056 : 620);
  const [previewZoom, setPreviewZoom] = useState<'fit' | '100'>('fit');
  const [showFullPreviewModal, setShowFullPreviewModal] = useState<boolean>(false);

  useEffect(() => {
    if (!previewContainerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const containerWidth = entry.contentRect.width;
        // Standard width for 9.5 inches continuous form paper at 96 dpi is 912px
        const targetWidth = 912;
        if (containerWidth < targetWidth) {
          setPreviewScale(containerWidth / targetWidth);
        } else {
          setPreviewScale(1);
        }
      }
    });
    resizeObserver.observe(previewContainerRef.current);
    return () => resizeObserver.disconnect();
  }, [paperSize]);

  // Sales list states
  const [allSales, setAllSales] = useState<Sale[]>([]);
  const [salesLoading, setSalesLoading] = useState<boolean>(true);
  const [manageSearch, setManageSearch] = useState<string>('');

  // Customer/Buyer Info States & Fallbacks
  const [localCustName, setLocalCustName] = useState<string>('');
  const [localCustAddress, setLocalCustAddress] = useState<string>('');
  const [localCustTaxId, setLocalCustTaxId] = useState<string>('');
  const [localCustPhone, setLocalCustPhone] = useState<string>('');
  const [localCustomers, setLocalCustomers] = useState<Customer[]>([]);
  const [localSelectedCustId, setLocalSelectedCustId] = useState<string>('');

  const customers = propCustomers && propCustomers.length > 0 ? propCustomers : localCustomers;
  const selectedCustId = propSelectedCustId !== undefined ? propSelectedCustId : localSelectedCustId;
  const custName = propCustomerName !== undefined ? propCustomerName : localCustName;
  const setCustName = propSetCustomerName !== undefined ? propSetCustomerName : setLocalCustName;
  const custPhone = propCustomerPhone !== undefined ? propCustomerPhone : localCustPhone;
  const setCustPhone = propSetCustomerPhone !== undefined ? propSetCustomerPhone : setLocalCustPhone;
  const custAddress = propCustomerAddress !== undefined ? propCustomerAddress : localCustAddress;
  const setCustAddress = propSetCustomerAddress !== undefined ? propSetCustomerAddress : setLocalCustAddress;
  const custTaxId = propCustomerTaxId !== undefined ? propCustomerTaxId : localCustTaxId;
  const setCustTaxId = propSetCustomerTaxId !== undefined ? propSetCustomerTaxId : setLocalCustTaxId;

  const setSelectedCustId = (id: string) => {
    if (propOnSelectCustomer) {
      propOnSelectCustomer(id);
    } else {
      setLocalSelectedCustId(id);
    }
  };

  const items = propItems !== undefined ? propItems : localItems;
  const setItems = propSetItems !== undefined ? propSetItems : setLocalItems;
  const discount = propDiscount !== undefined ? propDiscount : localDiscount;
  const setDiscount = propSetDiscount !== undefined ? propSetDiscount : setLocalDiscount;

  // Keep cardContentHeight strictly in sync with the real rendered height of the receipt
  useEffect(() => {
    const updateCardHeight = () => {
      if (receiptCardRef.current) {
        const h = receiptCardRef.current.offsetHeight || receiptCardRef.current.scrollHeight;
        if (h > 0) {
          setCardContentHeight(h);
        }
      }
    };
    updateCardHeight();
    const timer = setTimeout(updateCardHeight, 50);
    return () => clearTimeout(timer);
  }, [items, paperSize, custName, custAddress, custPhone, custTaxId, discount, printPinhole]);

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

  // Custom Item Modal states
  const [showCustomItemModal, setShowCustomItemModal] = useState<boolean>(false);
  const [customName, setCustomName] = useState<string>('');
  const [customPrice, setCustomPrice] = useState<string>('');
  const [customQty, setCustomQty] = useState<string>('1');

  // Allow both admin and employee to use all subtabs (no restriction)
  useEffect(() => {
    // Both roles can use any subtab
  }, [role, subTab]);

  // เมื่อเปิดหน้าออกใบเสร็จรับเงินใหม่ หรือเมื่อเซฟสำเร็จ ให้ดึงเลขที่ถัดไปมาเตรียมไว้เลยเพื่อให้เชื่อมโยงกันทุกเครื่อง
  useEffect(() => {
    if (!invoiceId && subTab === 'create') {
      const fetchNextNum = async () => {
        const nextNum = await getNextInvoiceNumber();
        const seq = parseInt(nextNum, 10);
        if (!isNaN(seq)) {
          setInvoiceSeq(seq);
        }
      };
      fetchNextNum();
    }
  }, [invoiceId, subTab, items.length]);

  // Load sales history for cancellation/management (Both Admin and Employee can access)
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

  // Load customer lists from Firestore if not provided from parent
  useEffect(() => {
    if (propCustomers && propCustomers.length > 0) return;
    const customersCol = collection(db, 'customers');
    const unsubscribe = onSnapshot(customersCol, (snapshot) => {
      const list: Customer[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Customer);
      });
      setLocalCustomers(list);
    }, (error) => {
      console.error('Error loading customers in receipt view:', error);
    });
    return () => unsubscribe();
  }, [propCustomers]);

  const handleSelectCustomer = (id: string) => {
    if (propOnSelectCustomer) {
      propOnSelectCustomer(id);
    } else {
      setLocalSelectedCustId(id);
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
    }
  };

  // Load sale details if invoiceId is provided (e.g., from POS checkout or history selection)
  useEffect(() => {
    if (!invoiceId) return;

    const matchedSale = allSales.find(s => s.id === invoiceId);
    if (matchedSale) {
      // Set customer name, phone, address, and tax ID
      setCustName(matchedSale.customerName || 'ลูกค้าทั่วไป');
      setCustPhone(matchedSale.customerPhone || '');
      setCustAddress(matchedSale.customerAddress || '');
      setCustTaxId(matchedSale.customerTaxId || '');
      
      // Look up customer details in our loaded customer list
      if (matchedSale.customerName && matchedSale.customerName !== 'ลูกค้าทั่วไป') {
        const matchedCust = customers.find(c => c.name === matchedSale.customerName);
        if (matchedCust) {
          if (!matchedSale.customerAddress) setCustAddress(matchedCust.address || '');
          if (!matchedSale.customerTaxId) setCustTaxId(matchedCust.taxId || '');
          setSelectedCustId(matchedCust.id);
        } else {
          setSelectedCustId('');
        }
      } else {
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

  const handleAddCustomItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length >= 25) {
      setAlertTitle('ครบจำนวน 25 รายการแล้ว');
      setAlertMessage('สามารถใส่รายการสินค้าได้สูงสุด 25 รายการต่อ 1 ใบเสร็จ เพื่อให้จัดพิมพ์ลงใน 1 หน้าได้อย่างสมบูรณ์');
      setAlertOpen(true);
      return;
    }
    if (!customName.trim()) {
      setAlertTitle('กรุณาระบุข้อมูล');
      setAlertMessage('กรุณาระบุชื่อสินค้าหรือรายการ');
      setAlertOpen(true);
      return;
    }
    const priceVal = customPrice === '' ? 0 : parseFloat(customPrice);
    if (isNaN(priceVal) || priceVal < 0) {
      setAlertTitle('ข้อมูลไม่ถูกต้อง');
      setAlertMessage('กรุณาระบุราคาที่ถูกต้อง (ราคาต้องไม่ติดลบ)');
      setAlertOpen(true);
      return;
    }
    const qtyVal = parseInt(customQty, 10) || 1;
    const customProduct: Product = {
      id: `custom-${Date.now()}`,
      name: customName.trim(),
      price: priceVal,
      stock: 9999,
      category: 'ทั่วไป',
      imageUrl: '',
      status: 'พร้อมขาย',
    };
    setItems((prev) => [...prev, { product: customProduct, quantity: qtyVal }]);
    setCustomName('');
    setCustomPrice('');
    setCustomQty('1');
    setShowCustomItemModal(false);
    if (items.length >= 8 && paperSize !== '9.5x11') {
      handlePaperSizeChange('9.5x11');
    }
  };

  const handleClearAllItems = () => {
    setItems([]);
  };

  const updateItemPrice = (productId: string, priceStr: string) => {
    if (priceStr === '') {
      setItems((prev) =>
        prev.map((i) =>
          i.product.id === productId ? { ...i, product: { ...i.product, price: 0 } } : i
        )
      );
      return;
    }
    const price = parseFloat(priceStr);
    if (isNaN(price) || price < 0) return;
    setItems((prev) =>
      prev.map((i) =>
        i.product.id === productId ? { ...i, product: { ...i.product, price } } : i
      )
    );
  };

  const updateItemName = (productId: string, name: string) => {
    setItems((prev) =>
      prev.map((i) =>
        i.product.id === productId ? { ...i, product: { ...i.product, name } } : i
      )
    );
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
        await runTransaction(db, async (transaction) => {
          const saleRef = doc(db, 'sales', sale.id);
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

        setAlertTitle('สำเร็จ');
        setAlertMessage(`เปลี่ยนสถานะบิลเลขที่ ${sale.id} เป็น "${newStatus}" สำเร็จ!`);
        setAlertOpen(true);
      } catch (error: any) {
        console.error('Error toggling receipt status:', error);
        setAlertTitle('เกิดข้อผิดพลาด');
        setAlertMessage(error.message || 'เกิดข้อผิดพลาดในการเปลี่ยนสถานะใบเสร็จ');
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
    setCustAddress(sale.customerAddress || '');
    setCustTaxId(sale.customerTaxId || '');
    
    // Query/lookup customer full address and tax id from current customers list if missing
    if (sale.customerName && sale.customerName !== 'ลูกค้าทั่วไป') {
      const matchedCust = customers.find(c => c.name === sale.customerName);
      if (matchedCust) {
        if (!sale.customerAddress) setCustAddress(matchedCust.address || '');
        if (!sale.customerTaxId) setCustTaxId(matchedCust.taxId || '');
        setSelectedCustId(matchedCust.id);
      } else {
        setSelectedCustId('');
      }
    } else {
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

  const saveSaleToFirestore = async (): Promise<string | null> => {
    if (items.length === 0) {
      setAlertTitle('คำเตือน');
      setAlertMessage('กรุณาเพิ่มรายการสินค้าก่อนทำรายการ');
      setAlertOpen(true);
      return null;
    }

    // หากเปิดดูบิลเดิม หรือบิลที่เกิดจากการชำระเงินทางหน้า POS สำเร็จแล้ว (มี invoiceId) ให้ผ่านการบันทึกไปได้เลยเพื่อไม่ให้ตัดสต็อกเบิ้ล
    if (invoiceId) {
      return invoiceId;
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
      employee: auth.currentUser?.displayName || 'พนักงานหน้าร้าน', // Dynamic employee name from Gmail login
      total: netTotal,
      status: 'สำเร็จ',
      items: saleItems,
      discount: discount,
      customerName: custName || 'ลูกค้าทั่วไป',
      customerPhone: custPhone || '',
      customerAddress: custAddress || '',
      customerTaxId: custTaxId || '',
    };

    try {
      await runTransaction(db, async (transaction) => {
        // 1. Fetch current product stocks and check availability
        const prodDataList: { ref: any; newStock: number; newStatus: string }[] = [];
        
        for (const item of items) {
          // If custom item or sample item, bypass product catalog stock check
          if (item.product.id.startsWith('custom-') || item.product.id.startsWith('sample-')) {
            continue;
          }
          const prodRef = doc(db, 'products', item.product.id);
          const prodDoc = await transaction.get(prodRef);
          if (!prodDoc.exists()) {
            continue;
          }
          const currentStock = prodDoc.data().stock || 0;
          if (currentStock < item.quantity) {
            throw new Error(`สินค้า "${item.product.name}" มีสต็อกไม่เพียงพอ (เหลือ ${currentStock} ชิ้น)`);
          }
          const newStock = currentStock - item.quantity;
          const newStatus = newStock === 0 ? 'หมดสต็อก' : newStock <= 15 ? 'ใกล้หมด' : 'พร้อมขาย';
          prodDataList.push({ ref: prodRef, newStock, newStatus });
        }

        // 2. Perform all updates
        for (const prod of prodDataList) {
          transaction.update(prod.ref, {
            stock: prod.newStock,
            status: prod.newStatus
          });
        }

        // 3. Save Sale document
        transaction.set(doc(db, 'sales', finalInvoiceNumber), newSale);
      });

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

      return finalInvoiceNumber;
    } catch (error: any) {
      console.error('Error saving printed receipt:', error);
      setAlertTitle('การทำรายการล้มเหลว');
      setAlertMessage(error.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูลใบเสร็จ');
      setAlertOpen(true);
      return null;
    }
  };

  const handlePrint = async () => {
    setIsPrinted(true);
    const invoiceNum = await saveSaleToFirestore();
    if (invoiceNum) {
      try {
        window.focus();
        window.print();
      } catch (err) {
        console.error('Print failed:', err);
      }
    }
    setIsPrinted(false);
  };

  const handleSaveReceipt = async () => {
    const invoiceNum = await saveSaleToFirestore();
    if (invoiceNum) {
      setAlertTitle('บันทึกสำเร็จ');
      setAlertMessage(`บันทึกข้อมูลใบเสร็จรับเงินเลขที่ ${invoiceNum} สำเร็จและเชื่อมโยงกับหน้ารายงานแล้ว!`);
      setAlertOpen(true);
      setItems([]);
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
          {(role === 'admin' || role === 'employee') && (
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
          )}
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
          <div className="flex flex-col gap-5 w-full">
            {/* Status & Sync Banner */}
            {invoiceId ? (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shrink-0"></span>
                  <div className="text-xs">
                    <span className="font-semibold text-slate-700">กำลังแสดงบิลที่ออกแล้ว: </span>
                    <span className="font-mono font-black text-amber-950 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-300 mr-2">{invoiceId}</span>
                    <span className="text-[11px] text-amber-800 font-medium">(มี {items.length} รายการ | ยอดสุทธิ ฿{netTotal.toFixed(2)})</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => {
                      if (setInvoiceId) setInvoiceId('');
                      if (onStartNewSale) onStartNewSale();
                    }}
                    className="flex-1 sm:flex-none px-3 py-1.5 bg-white border border-amber-300 hover:bg-amber-100 active:bg-amber-200 text-amber-900 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>เริ่มบิลใหม่</span>
                  </button>
                  {setActiveTab && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('pos')}
                      className="flex-1 sm:flex-none px-3 py-1.5 bg-amber-900 hover:bg-amber-950 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <ShoppingCart className="w-3.5 h-3.5" />
                      <span>กลับไปหน้าขาย</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
                  <div className="text-xs">
                    <span className="font-semibold text-slate-700">
                      {items.length > 0
                        ? `เชื่อมโยงสินค้าจากตะกร้าขาย (POS) ครบถ้วน ${items.length} รายการ`
                        : 'ออกใบเสร็จรับเงินใหม่ (ยังไม่มีรายการสินค้า)'}
                    </span>
                    {items.length > 0 && (
                      <span className="text-[11px] text-slate-500 ml-2 font-medium">
                        (ยอดสุทธิ ฿{netTotal.toFixed(2)})
                      </span>
                    )}
                  </div>
                </div>
                {setActiveTab && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('pos')}
                    className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-800 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <ShoppingCart className="w-3.5 h-3.5" />
                    <span>ไปยังหน้าขาย (POS) เพื่อเลือกสินค้าเพิ่ม</span>
                  </button>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column: Customer Details & Items in Bill (Span 5/12 on desktop for ideal balance) */}
          <div className="lg:col-span-5 xl:col-span-5 flex flex-col gap-5">
            
            {/* Customer Information Panel */}
            <div className="bg-white border border-slate-150 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-slate-700" />
                  <h3 className="text-sm font-bold text-slate-900">ข้อมูลผู้ซื้อ / Customer Info</h3>
                </div>
                <span className="text-[10px] bg-slate-100 px-2 py-1 rounded-md text-slate-700 font-bold">เลือกลูกค้า</span>
              </div>

              {/* Select Member Dropdown */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5 uppercase tracking-wide">
                  เลือกจากรายชื่อสมาชิกลูกค้า (ถ้ามี)
                </label>
                <select
                  value={selectedCustId}
                  onChange={(e) => handleSelectCustomer(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 font-bold focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none bg-white transition-all"
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
                  <label className="block text-xs font-bold text-slate-800 mb-1.5 uppercase tracking-wide">
                    ชื่อลูกค้า
                  </label>
                  <input
                    type="text"
                    value={custName}
                    onChange={(e) => setCustName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-900 focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none transition-all"
                    placeholder="ระบุชื่อลูกค้า..."
                  />
                </div>

                {/* Customer Phone */}
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5 uppercase tracking-wide">
                    เบอร์โทรศัพท์ลูกค้า
                  </label>
                  <input
                    type="tel"
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-900 focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none transition-all"
                    placeholder="ระบุเบอร์โทรศัพท์..."
                  />
                </div>
              </div>

              {/* Tax ID */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5 uppercase tracking-wide">
                  เลขประจำตัวผู้เสียภาษี (Tax ID)
                </label>
                <input
                  type="text"
                  value={custTaxId}
                  onChange={(e) => setCustTaxId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-900 focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none transition-all"
                  placeholder="กรอกเลขประจำตัวผู้เสียภาษี..."
                />
              </div>

              {/* Customer Address */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5 uppercase tracking-wide">
                  ที่อยู่ลูกค้า
                </label>
                <textarea
                  value={custAddress}
                  onChange={(e) => setCustAddress(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-900 focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none transition-all resize-none h-16"
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
                <label className="block text-xs font-bold text-slate-800 mb-1.5 uppercase tracking-wide">
                  ระบุจำนวนเงินส่วนลด (บาท)
                </label>
                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 shadow-sm focus-within:border-slate-950 focus-within:ring-1 focus-within:ring-slate-950 transition-all">
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
                    className="w-full border-none outline-none p-0 text-sm font-bold text-slate-900 focus:ring-0 bg-transparent font-mono"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            {/* List Table of Chosen Items */}
            <div className="bg-white border border-slate-150 rounded-2xl shadow-xs overflow-hidden flex flex-col">
              <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex justify-between items-center gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">รายการสินค้าในบิล</h3>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${
                    items.length >= 25 
                      ? 'bg-rose-50 text-rose-700 border-rose-200' 
                      : 'bg-white text-slate-700 border-slate-200'
                  }`}>
                    {items.length} / 25
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCustomItemModal(true)}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                  >
                    <PackagePlus className="w-3.5 h-3.5 text-slate-500" />
                    <span>+ รายการเอง</span>
                  </button>
                  {items.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAllItems}
                      className="text-xs text-red-500 hover:text-red-700 hover:underline font-bold cursor-pointer transition-colors px-1"
                    >
                      ล้างรายการ
                    </button>
                  )}
                </div>
              </div>

              {items.length === 0 ? (
                <div className="py-10 text-center text-slate-400 flex flex-col items-center justify-center px-4">
                  <Printer className="w-10 h-10 mb-2 stroke-[1.5] text-slate-300" />
                  <p className="text-sm font-bold text-slate-700">ยังไม่มีรายการสินค้าในบิล</p>
                  <p className="text-xs mt-1 text-slate-400">ทำรายการขายจาก "หน้าขาย (POS)" หรือกดปุ่ม "+ รายการเอง" ด้านบน หรือเลือกจากแท็บ "จัดการบิล"</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {/* Table headers */}
                  <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-slate-100/70 text-[11px] font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                    <div className="col-span-1 text-center">ลำดับ</div>
                    <div className="col-span-4">สินค้า</div>
                    <div className="col-span-2 text-right">ราคา/หน่วย</div>
                    <div className="col-span-2 text-center">จำนวน</div>
                    <div className="col-span-2 text-right pr-2">รวมเงิน</div>
                    <div className="col-span-1 text-center">ลบ</div>
                  </div>

                  {/* Rows */}
                  {items.map((i, idx) => (
                    <div key={i.product.id} className="grid grid-cols-12 gap-2 px-4 py-2 items-center hover:bg-slate-50/70 transition-colors text-xs border-b border-slate-100 last:border-b-0">
                      {/* Item No */}
                      <div className="col-span-1 flex justify-center items-center text-slate-400 font-mono font-bold text-[11px]">
                        {idx + 1}
                      </div>

                      {/* Product Name */}
                      <div className="col-span-4 flex items-center min-w-0 pr-1">
                        <input
                          type="text"
                          value={i.product.name}
                          onChange={(e) => updateItemName(i.product.id, e.target.value)}
                          className="w-full text-xs font-bold text-slate-900 border-none bg-transparent hover:bg-slate-100/80 focus:bg-white focus:ring-1 focus:ring-slate-400 rounded px-1.5 py-1 transition-colors truncate"
                          title={i.product.name}
                        />
                      </div>

                      {/* Price Column */}
                      <div className="col-span-2 flex justify-end items-center">
                        <div className="flex items-center gap-0.5 justify-end w-full">
                          <span className="text-slate-400 text-[10px]">฿</span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={i.product.price}
                            onChange={(e) => updateItemPrice(i.product.id, e.target.value)}
                            className="w-16 text-right text-xs font-bold font-mono text-slate-900 border-none bg-transparent hover:bg-slate-100/80 focus:bg-white focus:ring-1 focus:ring-slate-400 rounded px-1 py-0.5"
                          />
                        </div>
                      </div>

                      {/* Quantity Controls */}
                      <div className="col-span-2 flex justify-center items-center">
                        <div className="flex items-center border border-slate-200 rounded-lg bg-white overflow-hidden shadow-xs">
                          <button
                            onClick={() => incrementQuantity(i.product.id, -1)}
                            className="p-1 hover:bg-slate-100 text-slate-700 cursor-pointer transition-colors"
                          >
                            <Minus className="w-2.5 h-2.5" />
                          </button>
                          <input
                            type="text"
                            value={i.quantity}
                            onChange={(e) => updateQuantity(i.product.id, e.target.value)}
                            className="w-7 text-center border-none text-xs font-bold text-slate-900 p-0 focus:ring-0 bg-transparent font-mono"
                          />
                          <button
                            onClick={() => incrementQuantity(i.product.id, 1)}
                            className="p-1 hover:bg-slate-100 text-slate-700 cursor-pointer transition-colors"
                          >
                            <Plus className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>

                      {/* Subtotal Column - allocated 2 columns so numbers never wrap into another line */}
                      <div className="col-span-2 flex justify-end items-center pr-2">
                        <span className="text-xs font-bold text-slate-900 font-mono whitespace-nowrap">
                          {(i.product.price * i.quantity).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>

                      {/* Delete Action Column */}
                      <div className="col-span-1 flex justify-center">
                        <button
                          onClick={() => removeItem(i.product.id)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer transition-colors"
                          title="ลบรายการนี้"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Receipt Preview & Actions (Span 7/12 for spacious, legible paper view) */}
          <div className="lg:col-span-7 xl:col-span-7 flex flex-col gap-5">
            
            {/* Print Options Panel */}
            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">การตั้งค่าการพิมพ์ / Print Options</h4>
              
              {/* Paper Size Selector */}
              <div className="flex flex-col gap-1.5 py-1 border-t border-slate-100">
                <label className="text-xs font-bold text-slate-700">ขนาดกระดาษต่อเนื่อง (Dot Matrix Paper Size)</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => handlePaperSizeChange('9.5x11')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      paperSize === '9.5x11'
                        ? 'border-slate-950 bg-slate-950 text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>9.5" x 11" (เต็มหน้า)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePaperSizeChange('9.5x5.5')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      paperSize === '9.5x5.5'
                        ? 'border-slate-950 bg-slate-950 text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>9.5" x 5.5" (ครึ่งหน้า)</span>
                  </button>
                </div>

                {/* Auto recommendation alert if > 8 items on half page */}
                {items.length > 8 && paperSize === '9.5x5.5' && (
                  <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-800">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-bold">มีรายการสินค้า {items.length} รายการ (เกิน 8 รายการ)</p>
                      <p className="text-[11px] text-amber-700 mt-0.5">
                        แนะนำให้เลือกกระดาษขนาด <strong>9.5" x 11" (เต็มหน้า)</strong> เพื่อให้ทุกรายการแสดงพอดีใน 1 แผ่นโดยไม่ล้น
                      </p>
                      <button
                        type="button"
                        onClick={() => handlePaperSizeChange('9.5x11')}
                        className="mt-2 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-[11px] shadow-xs cursor-pointer transition-colors"
                      >
                        สลับเป็นขนาด 9.5" x 11"
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between py-1.5 border-t border-slate-100">
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
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                ภาพตัวอย่างใบเสร็จต่อเนื่อง ({paperSize === '9.5x11' ? '9.5" x 11"' : '9.5" x 5.5"'})
              </span>
              <div className="flex items-center gap-1.5">
                <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setPreviewZoom('fit')}
                    className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                      previewZoom === 'fit' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    พอดีจอ
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewZoom('100')}
                    className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                      previewZoom === '100' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    ขนาดจริง 100%
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setShowFullPreviewModal(true)}
                  title="ดูตัวอย่างเต็มจอ 100%"
                  className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer border border-slate-200 bg-white shadow-xs"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Paper Bill Lookalike Preview in Continuous Form layout */}
            {previewZoom === 'fit' ? (
              <div
                ref={previewContainerRef}
                className="w-full relative flex justify-center"
                style={{
                  height: `${Math.ceil(cardContentHeight * previewScale)}px`,
                  minHeight: '320px',
                }}
              >
                <div
                  ref={receiptCardRef}
                  style={{
                    width: '912px',
                    minHeight: paperSize === '9.5x11' ? '1056px' : '620px',
                    transform: `scale(${previewScale})`,
                    transformOrigin: 'top center',
                    position: 'absolute',
                    left: '50%',
                    marginLeft: '-456px',
                    top: 0,
                  }}
                >
                  <ContinuousReceiptPaper
                    paperSize={paperSize}
                    printPinhole={printPinhole}
                    invoiceNumber={invoiceNumber}
                    todayStr={todayStr}
                    custName={custName}
                    custAddress={custAddress}
                    custPhone={custPhone}
                    custTaxId={custTaxId}
                    items={items}
                    total={total}
                    discount={discount}
                    netTotal={netTotal}
                    isPrintPortal={false}
                  />
                </div>
              </div>
            ) : (
              <div className="w-full overflow-x-auto overflow-y-auto max-h-[620px] border border-slate-200 rounded-2xl bg-slate-100/70 p-4 flex justify-start shadow-inner">
                <ContinuousReceiptPaper
                  paperSize={paperSize}
                  printPinhole={printPinhole}
                  invoiceNumber={invoiceNumber}
                  todayStr={todayStr}
                  custName={custName}
                  custAddress={custAddress}
                  custPhone={custPhone}
                  custTaxId={custTaxId}
                  items={items}
                  total={total}
                  discount={discount}
                  netTotal={netTotal}
                  isPrintPortal={false}
                />
              </div>
            )}

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
        </div>

        )}

        {/* Spacer for mobile menu */}
        <div className="h-16 lg:hidden"></div>
      </div>

      {createPortal(
        <div className="print-portal-container">
          <style>{`
            @media print {
              @page {
                size: ${paperSize === '9.5x11' ? '9.5in 11in portrait' : '9.5in 5.5in landscape'} !important;
                margin: 0 !important;
              }
              html, body {
                width: 100% !important;
                height: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
                display: block !important;
              }
              .print-portal-container {
                width: 100% !important;
                height: 100% !important;
                display: block !important;
                margin: 0 !important;
                padding: 0 !important;
              }
              .dot-matrix-print-target {
                width: 100% !important;
                max-width: 100% !important;
                height: ${paperSize === '9.5x11' ? '11in' : '5.5in'} !important;
                max-height: ${paperSize === '9.5x11' ? '11in' : '5.5in'} !important;
                margin: 0 !important;
                padding: ${items.length > 18 ? '4mm 8mm' : items.length > 10 ? '5mm 9mm' : '6mm 10mm'} !important;
                box-sizing: border-box !important;
                overflow: hidden !important;
                page-break-inside: avoid !important;
                page-break-after: avoid !important;
                page-break-before: avoid !important;
              }
            }
          `}</style>
          <ContinuousReceiptPaper
            paperSize={paperSize}
            printPinhole={printPinhole}
            invoiceNumber={invoiceNumber}
            todayStr={todayStr}
            custName={custName}
            custAddress={custAddress}
            custPhone={custPhone}
            custTaxId={custTaxId}
            items={items}
            total={total}
            discount={discount}
            netTotal={netTotal}
            isPrintPortal={true}
          />
        </div>,
        document.body
      )}

      {/* Full 100% Scale Preview Modal */}
      {showFullPreviewModal && (
        <div className="fixed inset-0 bg-black/75 z-50 flex flex-col items-center justify-start p-4 sm:p-6 overflow-y-auto backdrop-blur-xs">
          <div className="w-full max-w-[960px] flex items-center justify-between py-2 text-white mb-3">
            <div className="flex items-center gap-3">
              <Receipt className="w-6 h-6 text-emerald-400" />
              <div>
                <h3 className="font-bold text-base sm:text-lg">ภาพตัวอย่างใบเสร็จต่อเนื่อง 100% (ตรงตามการพิมพ์จริง 1:1)</h3>
                <p className="text-xs text-slate-300">
                  ขนาดกระดาษ {paperSize === '9.5x11' ? '9.5" x 11"' : '9.5" x 5.5"'} • ขนาดตัวหนังสือ ความเข้ม และตำแหน่งตรงตามที่สั่งพิมพ์
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowFullPreviewModal(false)}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          <div className="bg-stone-300/60 p-4 sm:p-6 rounded-2xl shadow-2xl max-w-full overflow-x-auto flex justify-center">
            <ContinuousReceiptPaper
              paperSize={paperSize}
              printPinhole={printPinhole}
              invoiceNumber={invoiceNumber}
              todayStr={todayStr}
              custName={custName}
              custAddress={custAddress}
              custPhone={custPhone}
              custTaxId={custTaxId}
              items={items}
              total={total}
              discount={discount}
              netTotal={netTotal}
              isPrintPortal={false}
            />
          </div>
        </div>
      )}

      {/* Custom Item Modal */}
      {showCustomItemModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-slate-100 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <PackagePlus className="w-5 h-5 text-slate-800" />
                <h3 className="font-bold text-base text-slate-900">เพิ่มรายการสินค้ากำหนดเอง</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomItemModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCustomItem} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  ชื่อสินค้า / รายการ <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="เช่น ข้าวหอมมะลิคัดพิเศษ, ค่าขนส่งรอบพิเศษ ฯลฯ"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-900 focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    ราคาต่อหน่วย (บาท) <span className="text-slate-400 font-normal lowercase">(ใส่ 0 ได้)</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={customPrice}
                    onChange={(e) => setCustomPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold font-mono text-slate-900 focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    จำนวน <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={customQty}
                    onChange={(e) => setCustomQty(e.target.value)}
                    placeholder="1"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold font-mono text-slate-900 focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCustomItemModal(false)}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-slate-950 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer"
                >
                  + เพิ่มในใบเสร็จ
                </button>
              </div>
            </form>
          </div>
        </div>
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
