import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { db, handleFirestoreError, OperationType, auth, getNextInvoiceNumber } from '../firebase';
import { collection, onSnapshot, doc, setDoc, query, orderBy, updateDoc, runTransaction } from 'firebase/firestore';
import { Product, CartItem, Customer, Sale, SaleItem } from '../types';
import { Search, Plus, Minus, Trash2, Printer, CheckCircle2, User, MapPin, FileText, Users, Ban, RefreshCw, Eye, Tag, Receipt, Maximize2, X, PackagePlus, ShoppingCart } from 'lucide-react';
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

function itemLineSatang(item: CartItem): number {
  return Math.round(item.product.price * item.quantity * 100);
}

function sumItemsSatang(list: CartItem[]): number {
  return list.reduce((sum, item) => sum + itemLineSatang(item), 0);
}

function sumItemsQuantity(list: CartItem[]): number {
  return list.reduce((sum, item) => sum + item.quantity, 0);
}

interface ContinuousReceiptPaperProps {
  paperSize: '9.5x11' | '9.5x5.5' | 'a4';
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
  linesPerPage?: number;
  visiblePageIndex?: number | null;
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
  linesPerPage = 35,
  visiblePageIndex = null,
}: ContinuousReceiptPaperProps) {
  const isA4 = paperSize === 'a4';
  const effectivePinhole = isA4 ? false : printPinhole;
  // Default lines per page: 35 for both A4 portrait and 9.5x11 continuous, 10 for half-page
  const defaultPageLimit = isA4 ? 35 : paperSize === '9.5x11' ? 35 : 10;
  const itemsPerPage = linesPerPage && linesPerPage > 0 ? linesPerPage : defaultPageLimit;
  const totalPages = Math.max(1, Math.ceil(items.length / itemsPerPage));
  const paperWidthPx = isA4 ? 794 : 912;
  const paperHeightPx = isA4 ? 1123 : paperSize === '9.5x11' ? 1056 : 620;
  const totalQty = sumItemsQuantity(items);

  return (
    <div className={isPrintPortal ? 'receipt-pages-wrapper' : 'flex flex-col gap-6 w-full'}>
      {Array.from({ length: totalPages }).map((_, pageIdx) => {
        if (!isPrintPortal && visiblePageIndex !== null && visiblePageIndex !== undefined && pageIdx !== visiblePageIndex) {
          return null;
        }
        const pageItems = items.slice(pageIdx * itemsPerPage, (pageIdx + 1) * itemsPerPage);
        const isLastPage = pageIdx === totalPages - 1;
        const count = pageItems.length;
        const isUltraDense = !isA4 && count > 35; // > 35 items (only if forced onto 1 page)
        const contFull = !isA4 && count > 26 && count <= 35; // 27 - 35 items on 9.5x11 continuous
        const isSuperDense = !isA4 && count > 20 && count <= 26; // 21 - 26 items
        const isDense = !isA4 && count > 12 && count <= 20; // 13 - 20 items
        const a4Full = isA4 && count > 26; // 27 - 35 items on A4
        const a4Medium = isA4 && count > 16 && count <= 26; // 17 - 26 items on A4
        const previousItemCount = pageIdx * itemsPerPage;
        const runningItemCount = previousItemCount + pageItems.length;
        const previousItemsSlice = items.slice(0, previousItemCount);
        const previousQtyTotal = sumItemsQuantity(previousItemsSlice);
        const pageQtyTotal = sumItemsQuantity(pageItems);
        const runningQtyTotal = previousQtyTotal + pageQtyTotal;
        const previousSubtotalSatang = sumItemsSatang(previousItemsSlice);
        const pageSubtotalSatang = sumItemsSatang(pageItems);
        const runningSubtotalSatang = previousSubtotalSatang + pageSubtotalSatang;
        const previousSubtotal = previousSubtotalSatang / 100;
        const pageSubtotal = pageSubtotalSatang / 100;
        const runningSubtotal = runningSubtotalSatang / 100;

        return (
          <div key={`receipt-page-wrapper-${pageIdx}`} className="flex flex-col gap-1 w-full">
            {!isPrintPortal && totalPages > 1 && (
              <div className="flex items-center justify-between text-xs font-bold text-slate-600 px-1 py-0.5">
                <span className="inline-flex items-center gap-1.5 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-lg shadow-2xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-900"></span>
                  แผ่นที่ {pageIdx + 1} จาก {totalPages} ({pageItems.length} รายการ · {pageQtyTotal.toLocaleString('th-TH')} ชิ้น)
                  {pageIdx === 0 && ' • มียอดและจำนวนรายการยกไป'}
                  {pageIdx > 0 && !isLastPage && ' • ยอดยกมา / ยอดยกไป'}
                  {isLastPage && ' • ยอดรวมสุทธิและลายเซ็นต์'}
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  รายการที่ {previousItemCount + 1} - {runningItemCount}
                </span>
              </div>
            )}
            <div
              key={`receipt-page-${pageIdx}`}
              className={`dot-matrix-print-target ${isA4 ? 'a4-print-target' : ''} print-receipt-card bg-[#ffffff] border border-stone-300 ${
                isPrintPortal ? '' : 'rounded-xl shadow-lg'
              } ${
                isA4
                  ? a4Full
                    ? 'p-4'
                    : a4Medium
                    ? 'p-5 sm:p-6'
                    : 'p-6 sm:p-7'
                  : isUltraDense
                  ? 'p-2.5 sm:p-3'
                  : contFull
                  ? 'p-3'
                  : isSuperDense
                  ? 'p-3.5 sm:p-4'
                  : isDense
                  ? 'p-4'
                  : 'p-6 sm:p-7'
              } font-mono text-black select-all flex flex-col justify-between overflow-hidden relative ${
                effectivePinhole ? 'print-pinholes-visible' : ''
              } ${!isLastPage ? 'page-break' : 'last-page'}`}
              style={{
                width: `${paperWidthPx}px`,
                minHeight: `${paperHeightPx}px`,
                maxHeight: `${paperHeightPx}px`,
                height: `${paperHeightPx}px`,
                boxSizing: 'border-box',
                pageBreakAfter: isLastPage ? 'auto' : 'always',
                breakAfter: isLastPage ? 'auto' : 'page',
              }}
            >
            {/* Continuous Form Pinhole Margins (Left Strip) */}
            {effectivePinhole && (
              <div className="print-pinholes absolute left-0 top-0 bottom-0 w-8 border-r border-dashed border-stone-300 bg-stone-100/40 flex flex-col justify-around items-center py-4 z-10">
                {[...Array(paperSize === '9.5x11' ? 14 : 7)].map((_, idx) => (
                  <div
                    key={`pin-l-${pageIdx}-${idx}`}
                    className="w-2.5 h-2.5 rounded-full bg-white border border-stone-300 shadow-inner"
                  ></div>
                ))}
              </div>
            )}

            {/* Continuous Form Pinhole Margins (Right Strip) */}
            {effectivePinhole && (
              <div className="print-pinholes absolute right-0 top-0 bottom-0 w-8 border-l border-dashed border-stone-300 bg-stone-100/40 flex flex-col justify-around items-center py-4 z-10">
                {[...Array(paperSize === '9.5x11' ? 14 : 7)].map((_, idx) => (
                  <div
                    key={`pin-r-${pageIdx}-${idx}`}
                    className="w-2.5 h-2.5 rounded-full bg-white border border-stone-300 shadow-inner"
                  ></div>
                ))}
              </div>
            )}

            {/* Main Content */}
            <div className={`${effectivePinhole && !isPrintPortal ? 'mx-6' : 'mx-0'} h-full flex flex-col justify-between ${
              isA4
                ? a4Full
                  ? 'gap-0.5'
                  : a4Medium
                  ? 'gap-1.5'
                  : 'gap-2.5'
                : isUltraDense
                ? 'gap-0.5'
                : contFull
                ? 'gap-0.5'
                : isSuperDense
                ? 'gap-1'
                : isDense
                ? 'gap-2'
                : 'gap-3'
            } w-full overflow-hidden`}>
              {/* Top Header Block */}
              <div className={`flex justify-between items-start ${
                isA4
                  ? a4Full
                    ? 'pb-1'
                    : a4Medium
                    ? 'pb-2'
                    : 'pb-2.5'
                  : isUltraDense
                  ? 'pb-0.5'
                  : contFull
                  ? 'pb-1'
                  : isSuperDense
                  ? 'pb-1'
                  : isDense
                  ? 'pb-2'
                  : 'pb-3'
              } border-b border-black/15`}>
                <div>
                  <h3 className={`font-black text-black ${
                    isA4
                      ? a4Full
                        ? 'text-[16.5px]'
                        : a4Medium
                        ? 'text-[18px]'
                        : 'text-[19px]'
                      : isUltraDense
                      ? 'text-[16px]'
                      : contFull
                      ? 'text-[16.5px]'
                      : isSuperDense
                      ? 'text-[18px]'
                      : isDense
                      ? 'text-[20px]'
                      : 'text-[22px]'
                  } tracking-wide leading-tight`}>
                    ร้านสุเมธค้าข้าว
                  </h3>
                  <p className={`${
                    isA4
                      ? a4Full
                        ? 'text-[11px] mt-0.5'
                        : a4Medium
                        ? 'text-[12.5px] mt-0.5'
                        : 'text-[13.5px] mt-1'
                      : isUltraDense
                      ? 'text-[11px] mt-0.5'
                      : contFull
                      ? 'text-[11.5px] mt-0.5'
                      : isSuperDense
                      ? 'text-[13px] mt-0.5'
                      : isDense
                      ? 'text-[15px] mt-0.5'
                      : 'text-[16.5px] mt-1'
                  } font-bold text-black leading-tight`}>
                    ถ.จุลจอมเกล้า ต.ท่าข้าม อ.พุนพิน จ.สุราษฎร์ธานี 84130
                  </p>
                  <p className={`${
                    isA4
                      ? a4Full
                        ? 'text-[11px] mt-0.5'
                        : a4Medium
                        ? 'text-[12.5px] mt-0.5'
                        : 'text-[13.5px] mt-1'
                      : isUltraDense
                      ? 'text-[11px] mt-0.5'
                      : contFull
                      ? 'text-[11.5px] mt-0.5'
                      : isSuperDense
                      ? 'text-[13px] mt-0.5'
                      : isDense
                      ? 'text-[15px] mt-0.5'
                      : 'text-[16.5px] mt-1'
                  } font-bold text-black leading-tight`}>
                    สาขาโค้งวัดดอนกระถิน โทร : <span className="font-black text-black">077-441628</span> / สาขาดอนเนียง โทร :{' '}
                    <span className="font-black text-black">098-6785002</span>
                  </p>
                </div>

                <div className="text-right flex flex-col items-end gap-0.5">
                  <div className={`font-black ${
                    isA4
                      ? a4Full
                        ? 'text-[16.5px]'
                        : a4Medium
                        ? 'text-[18px]'
                        : 'text-[19px]'
                      : isUltraDense
                      ? 'text-[16px]'
                      : contFull
                      ? 'text-[16.5px]'
                      : isSuperDense
                      ? 'text-[18px]'
                      : isDense
                      ? 'text-[20px]'
                      : 'text-[22px]'
                  } text-black tracking-wider leading-tight`}>
                    ใบเสร็จรับเงิน / RECEIPT
                  </div>
                  <div className={`${
                    isA4
                      ? a4Full
                        ? 'text-[11px] gap-0.5'
                        : a4Medium
                        ? 'text-[12.5px] gap-0.5'
                        : 'text-[13.5px] gap-0.5'
                      : isUltraDense
                      ? 'text-[11px] gap-0.5'
                      : contFull
                      ? 'text-[11.5px] gap-0.5'
                      : isSuperDense
                      ? 'text-[13px] gap-0.5'
                      : isDense
                      ? 'text-[15px] gap-0.5'
                      : 'text-[16.5px] gap-1'
                  } text-black mt-0.5 flex flex-col items-end font-bold font-mono leading-tight`}>
                    <div>
                      เลขที่บิล / Invoice No : <span className="text-black font-black">{invoiceNumber}</span>
                    </div>
                    <div>
                      วันที่ / Date : <span className="text-black font-black">{todayStr}</span>
                    </div>
                    <div>
                      หน้า / Page : <span className="text-black font-black">{pageIdx + 1} / {totalPages}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Customer Information Block */}
              <div className={`${
                isA4
                  ? a4Full
                    ? 'py-0.5 gap-0.5 text-[11px]'
                    : a4Medium
                    ? 'py-1.5 gap-1 text-[12.5px]'
                    : 'py-2 gap-1.5 text-[13.5px]'
                  : isUltraDense
                  ? 'py-0.5 gap-0.5 text-[11px]'
                  : contFull
                  ? 'py-0.5 gap-0.5 text-[11.5px]'
                  : isSuperDense
                  ? 'py-1 gap-1 text-[13px]'
                  : isDense
                  ? 'py-1.5 gap-1.5 text-[14.5px]'
                  : 'py-2 gap-2 text-[16px]'
              } bg-transparent flex flex-col leading-tight border-b border-black/15 pb-1`}>
                {/* Row 1: Customer Name, Phone, and Tax ID */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <span className="text-black font-bold shrink-0 whitespace-nowrap">ลูกค้า :</span>
                    <span className="text-black font-black truncate">
                      {custName || 'ลูกค้าทั่วไป'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-black font-bold shrink-0 whitespace-nowrap">เบอร์โทร :</span>
                    <span className="text-black font-black font-mono">
                      {custPhone || '-'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-black font-bold shrink-0 whitespace-nowrap">เลขผู้เสียภาษี :</span>
                    <span className="text-black font-black font-mono">
                      {custTaxId || '-'}
                    </span>
                  </div>
                </div>

                {/* Row 2: Customer Address (Full width for complete information without overflowing into other rows) */}
                <div className="flex items-start gap-1.5 w-full min-w-0">
                  <span className="text-black font-bold shrink-0 whitespace-nowrap">ที่อยู่ :</span>
                  <span className={`text-black font-bold break-words flex-1 ${isUltraDense || contFull || a4Full ? 'leading-tight' : 'leading-snug'}`} title={custAddress || ''}>
                    {custAddress || '-'}
                  </span>
                </div>
              </div>

              {/* Items List Table */}
              <div className="flex-1 flex flex-col justify-start my-0.5 overflow-hidden">
                <table className="w-full font-mono border-collapse table-fixed">
                  <thead>
                    <tr className={`text-black font-black text-left bg-transparent border-y-2 border-black ${
                      isA4
                        ? a4Full
                          ? 'text-[11.5px]'
                          : a4Medium
                          ? 'text-[13px]'
                          : 'text-[14px]'
                        : isUltraDense
                        ? 'text-[11.5px]'
                        : contFull
                        ? 'text-[11.5px]'
                        : isSuperDense
                        ? 'text-[13px]'
                        : isDense
                        ? 'text-[15px]'
                        : 'text-[16.5px]'
                    }`}>
                      <th className={`${
                        isA4
                          ? a4Full
                            ? 'py-[3px] w-[44px]'
                            : a4Medium
                            ? 'py-1.5 w-[48px]'
                            : 'py-2 w-[50px]'
                          : isUltraDense
                          ? 'py-[2px] w-[48px]'
                          : contFull
                          ? 'py-[3px] w-[48px]'
                          : isSuperDense
                          ? 'py-1 w-[54px]'
                          : isDense
                          ? 'py-1.5 w-[54px]'
                          : 'py-2 w-[54px]'
                      } text-center font-black whitespace-nowrap`}>ลำดับ</th>
                      <th className={`${
                        isA4
                          ? a4Full
                            ? 'py-[3px] px-2'
                            : a4Medium
                            ? 'py-1.5 px-2.5'
                            : 'py-2 px-3'
                          : isUltraDense
                          ? 'py-[2px] px-2'
                          : contFull
                          ? 'py-[3px] px-2'
                          : isSuperDense
                          ? 'py-1 px-2'
                          : isDense
                          ? 'py-1.5 px-3'
                          : 'py-2 px-3'
                      } font-black whitespace-nowrap`}>รายการสินค้า</th>
                      <th className={`${
                        isA4
                          ? a4Full
                            ? 'py-[3px] w-[64px]'
                            : a4Medium
                            ? 'py-1.5 w-[68px]'
                            : 'py-2 w-[72px]'
                          : isUltraDense
                          ? 'py-[2px] w-[68px]'
                          : contFull
                          ? 'py-[3px] w-[68px]'
                          : isSuperDense
                          ? 'py-1 w-[76px]'
                          : isDense
                          ? 'py-1.5 w-[76px]'
                          : 'py-2 w-[76px]'
                      } text-right font-black whitespace-nowrap`}>จำนวน</th>
                      <th className={`${
                        isA4
                          ? a4Full
                            ? 'py-[3px] w-[98px]'
                            : a4Medium
                            ? 'py-1.5 w-[106px]'
                            : 'py-2 w-[110px]'
                          : isUltraDense
                          ? 'py-[2px] w-[108px]'
                          : contFull
                          ? 'py-[3px] w-[108px]'
                          : isSuperDense
                          ? 'py-1 w-[118px]'
                          : isDense
                          ? 'py-1.5 w-[118px]'
                          : 'py-2 w-[118px]'
                      } text-right font-black whitespace-nowrap`}>หน่วยละ</th>
                      <th className={`${
                        isA4
                          ? a4Full
                            ? 'py-[3px] pr-1.5 w-[124px]'
                            : a4Medium
                            ? 'py-1.5 pr-2 w-[134px]'
                            : 'py-2 pr-2 w-[140px]'
                          : isUltraDense
                          ? 'py-[2px] pr-1 w-[136px]'
                          : contFull
                          ? 'py-[3px] pr-1.5 w-[136px]'
                          : isSuperDense
                          ? 'py-1 pr-1 w-[152px]'
                          : isDense
                          ? 'py-1.5 pr-2 w-[152px]'
                          : 'py-2 pr-2 w-[152px]'
                      } text-right font-black whitespace-nowrap`}>จำนวนเงิน (บาท)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.length === 0 ? (
                      <tr>
                        <td colSpan={5} className={`text-center py-10 text-black font-black ${isA4 ? 'text-[14.5px]' : 'text-[16.5px]'} italic`}>
                          ไม่มีรายการในใบเสร็จ
                        </td>
                      </tr>
                    ) : (
                      <>
                        {pageIdx > 0 && (
                          <tr className="bg-stone-50 border-b border-black font-bold">
                            <td className={`text-center ${
                              isA4
                                ? a4Full
                                  ? 'py-[1px] text-[10.5px] leading-[1.15]'
                                  : a4Medium
                                  ? 'py-0.5 text-[11.5px]'
                                  : 'py-1 text-[12px]'
                                : isUltraDense
                                ? 'py-0 text-[10.5px] leading-[1.1]'
                                : contFull
                                ? 'py-[1px] text-[10.5px] leading-[1.15]'
                                : isSuperDense
                                ? 'py-0.5 text-[12px]'
                                : isDense
                                ? 'py-1 text-[12.5px]'
                                : 'py-1.5 text-[12.5px]'
                            } text-stone-500 font-mono`}>
                              -
                            </td>
                            <td className={`px-2 ${
                              isA4
                                ? a4Full
                                  ? 'py-[1px] text-[10.5px] leading-[1.15]'
                                  : a4Medium
                                  ? 'py-0.5 text-[12px]'
                                  : 'py-1 text-[13px]'
                                : isUltraDense
                                ? 'py-0 text-[10.5px] leading-[1.1]'
                                : contFull
                                ? 'py-[1px] text-[11px] leading-[1.15]'
                                : isSuperDense
                                ? 'py-0.5 text-[12.5px]'
                                : isDense
                                ? 'py-1 text-[15px]'
                                : 'py-1.5 text-[16px]'
                            } font-black text-black whitespace-nowrap`} colSpan={3}>
                              ยอดยกมาจากหน้าที่ {pageIdx} ({previousItemCount} รายการ / {previousQtyTotal.toLocaleString('th-TH')} ชิ้น)
                            </td>
                            <td className={`text-right ${
                              isA4
                                ? a4Full
                                  ? 'py-[1px] pr-1.5 text-[10.5px] leading-[1.15]'
                                  : a4Medium
                                  ? 'py-0.5 pr-2 text-[12px]'
                                  : 'py-1 pr-2 text-[13px]'
                                : isUltraDense
                                ? 'py-0 pr-1 text-[10.5px] leading-[1.1]'
                                : contFull
                                ? 'py-[1px] pr-1.5 text-[11px] leading-[1.15]'
                                : isSuperDense
                                ? 'py-0.5 pr-1 text-[12.5px]'
                                : isDense
                                ? 'py-1 pr-2 text-[15px]'
                                : 'py-1.5 pr-2 text-[16px]'
                            } font-black text-black whitespace-nowrap font-mono`}>
                              {previousSubtotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        )}
                        {pageItems.map((i, index) => {
                          const globalSeq = previousItemCount + index + 1;
                          return (
                            <tr
                              key={i.product.id || `${pageIdx}-${index}`}
                              className={`align-middle ${
                                isA4
                                  ? a4Full
                                    ? 'text-[11.5px] leading-[1.16]'
                                    : a4Medium
                                    ? 'text-[12.5px] leading-snug'
                                    : 'text-[13.5px] leading-normal'
                                  : isUltraDense
                                  ? 'text-[11px] leading-[1.12]'
                                  : contFull
                                  ? 'text-[11.5px] leading-[1.15]'
                                  : isSuperDense
                                  ? 'text-[13px] leading-tight'
                                  : isDense
                                  ? 'text-[15px] leading-tight'
                                  : 'text-[16.5px] leading-normal'
                              }`}
                            >
                              <td className={`text-center ${
                                isA4
                                  ? a4Full
                                    ? 'py-[1px]'
                                    : a4Medium
                                    ? 'py-0.5'
                                    : 'py-1'
                                  : isUltraDense
                                  ? 'py-[0.5px]'
                                  : contFull
                                  ? 'py-[1px]'
                                  : isSuperDense
                                  ? 'py-0.5'
                                  : isDense
                                  ? 'py-1'
                                  : 'py-1.5'
                              } text-black font-bold whitespace-nowrap`}>
                                {globalSeq}
                              </td>
                              <td className={`px-2 ${
                                isA4
                                  ? a4Full
                                    ? 'py-[1px]'
                                    : a4Medium
                                    ? 'py-0.5'
                                    : 'py-1'
                                  : isUltraDense
                                  ? 'py-[0.5px]'
                                  : contFull
                                  ? 'py-[1px]'
                                  : isSuperDense
                                  ? 'py-0.5'
                                  : isDense
                                  ? 'py-1'
                                  : 'py-1.5'
                              } font-bold text-black whitespace-nowrap overflow-hidden text-ellipsis`} title={i.product.name}>
                                {i.product.name}
                              </td>
                              <td className={`text-right ${
                                isA4
                                  ? a4Full
                                    ? 'py-[1px]'
                                    : a4Medium
                                    ? 'py-0.5'
                                    : 'py-1'
                                  : isUltraDense
                                  ? 'py-[0.5px]'
                                  : contFull
                                  ? 'py-[1px]'
                                  : isSuperDense
                                  ? 'py-0.5'
                                  : isDense
                                  ? 'py-1'
                                  : 'py-1.5'
                              } font-bold text-black whitespace-nowrap font-mono`}>
                                {i.quantity}
                              </td>
                              <td className={`text-right ${
                                isA4
                                  ? a4Full
                                    ? 'py-[1px]'
                                    : a4Medium
                                    ? 'py-0.5'
                                    : 'py-1'
                                  : isUltraDense
                                  ? 'py-[0.5px]'
                                  : contFull
                                  ? 'py-[1px]'
                                  : isSuperDense
                                  ? 'py-0.5'
                                  : isDense
                                  ? 'py-1'
                                  : 'py-1.5'
                              } font-bold text-black whitespace-nowrap font-mono`}>
                                {i.product.price.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className={`text-right ${
                                isA4
                                  ? a4Full
                                    ? 'py-[1px] pr-1.5'
                                    : a4Medium
                                    ? 'py-0.5 pr-2'
                                    : 'py-1 pr-2'
                                  : isUltraDense
                                  ? 'py-[0.5px] pr-1'
                                  : contFull
                                  ? 'py-[1px] pr-1.5'
                                  : isSuperDense
                                  ? 'py-0.5 pr-1'
                                  : isDense
                                  ? 'py-1 pr-2'
                                  : 'py-2 pr-2'
                              } font-black text-black whitespace-nowrap font-mono`}>
                                {(itemLineSatang(i) / 100).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          );
                        })}
                        {/* Pads the table with empty rows to preserve standard paper layout when items are few */}
                        {pageItems.length < 8 &&
                          Array.from({
                            length: 8 - pageItems.length,
                          }).map((_, idx) => (
                            <tr
                              key={`empty-row-${pageIdx}-${idx}`}
                              className={
                                isA4
                                  ? a4Full
                                    ? 'h-[16px]'
                                    : a4Medium
                                    ? 'h-[22px]'
                                    : 'h-[26px]'
                                  : isUltraDense
                                  ? 'h-[14px]'
                                  : contFull
                                  ? 'h-[16px]'
                                  : isSuperDense
                                  ? 'h-[18px]'
                                  : isDense
                                  ? 'h-[22px]'
                                  : 'h-[28px]'
                              }
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

              {/* Bottom Section: Calculations on last page, Carry forward on intermediate pages */}
              {isLastPage ? (
                <div className="mt-auto shrink-0 flex flex-col">
                  {/* Calculations & Baht Text Block */}
                  <div className={`grid grid-cols-12 ${
                    isA4
                      ? a4Full
                        ? 'pt-1 pb-0.5 gap-2'
                        : a4Medium
                        ? 'pt-2 pb-1.5 gap-3'
                        : 'pt-2.5 pb-2 gap-4'
                      : isUltraDense
                      ? 'pt-0.5 pb-0.5 gap-2'
                      : contFull
                      ? 'pt-1 pb-0.5 gap-2'
                      : isSuperDense
                      ? 'pt-1 pb-1 gap-2'
                      : isDense
                      ? 'pt-2 pb-1 gap-3'
                      : 'pt-3 pb-2 gap-4'
                  } border-t-2 border-black`}>
                    <div className={`${totalPages > 1 ? 'col-span-5' : 'col-span-6'} flex flex-col justify-center`}>
                      <div className="px-1 py-0.5">
                        <p className={`${
                          isA4
                            ? a4Full
                              ? 'text-[11px]'
                              : a4Medium
                              ? 'text-[12.5px]'
                              : 'text-[13.5px]'
                            : isUltraDense
                            ? 'text-[11px]'
                            : contFull
                            ? 'text-[11.5px]'
                            : isSuperDense
                            ? 'text-[13px]'
                            : isDense
                            ? 'text-[15px]'
                            : 'text-[16.5px]'
                        } text-black font-bold leading-tight`}>
                          จำนวนเงินตัวอักษร : <span className="text-black font-black">( {thaiBaht(netTotal)} )</span>
                        </p>
                      </div>
                    </div>

                    <div className={`${totalPages > 1 ? 'col-span-7' : 'col-span-6'} pl-2 py-0.5 flex flex-col justify-center ${
                      isA4
                        ? a4Full
                          ? 'gap-0.5 text-[11px] leading-tight'
                          : a4Medium
                          ? 'gap-1 text-[12px]'
                          : 'gap-1 text-[13px]'
                        : isUltraDense
                        ? 'gap-0.5 text-[11px] leading-tight'
                        : contFull
                        ? 'gap-0.5 text-[11px] leading-tight'
                        : isSuperDense
                        ? 'gap-1 text-[12.5px]'
                        : isDense
                        ? 'gap-1 text-[14.5px]'
                        : 'gap-1.5 text-[16px]'
                    } font-bold text-black font-mono`}>
                      {totalPages > 1 && pageIdx > 0 && (
                        <>
                          <div className="flex justify-between items-center text-slate-800">
                            <span className="font-bold whitespace-nowrap">ยอดยกมาจากหน้าก่อน ({previousItemCount} รายการ / {previousQtyTotal.toLocaleString('th-TH')} ชิ้น) :</span>
                            <span className="font-black whitespace-nowrap">
                              {previousSubtotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-slate-800">
                            <span className="font-bold whitespace-nowrap">ยอดสินค้าหน้านี้ ({pageItems.length} รายการ / {pageQtyTotal.toLocaleString('th-TH')} ชิ้น) :</span>
                            <span className="font-black whitespace-nowrap">
                              {pageSubtotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        </>
                      )}
                      <div className={`flex justify-between items-center ${totalPages > 1 && pageIdx > 0 ? 'border-t border-dashed border-stone-400 pt-0.5' : ''}`}>
                        <span className="font-bold whitespace-nowrap">
                          รวมเงิน ({items.length} รายการ / {totalQty.toLocaleString('th-TH')} ชิ้น) :
                        </span>
                        <span className="font-black whitespace-nowrap">
                          {total.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      {discount > 0 && (
                        <div className="flex justify-between items-center text-black font-bold">
                          <span className="whitespace-nowrap">ส่วนลด :</span>
                          <span className="font-black whitespace-nowrap">
                            -{discount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                      <div className={`flex justify-between items-center border-t border-black pt-0.5 ${
                        isA4
                          ? a4Full
                            ? 'text-[13.5px]'
                            : a4Medium
                            ? 'text-[15.5px]'
                            : 'text-[17px]'
                          : isUltraDense
                          ? 'text-[13px]'
                          : contFull
                          ? 'text-[13.5px]'
                          : isSuperDense
                          ? 'text-[15px]'
                          : isDense
                          ? 'text-[17px]'
                          : 'text-[19px]'
                      } font-black text-black`}>
                        <span className="whitespace-nowrap">ยอดสุทธิ :</span>
                        <span className="text-black font-black whitespace-nowrap">
                          {netTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Signature fields strip */}
                  <div className={`grid grid-cols-2 ${
                    isA4
                      ? a4Full
                        ? 'gap-8 mt-1 pt-0.5 text-[11px]'
                        : a4Medium
                        ? 'gap-10 mt-2 pt-1.5 text-[12.5px]'
                        : 'gap-12 mt-3 pt-2 text-[13.5px]'
                      : isUltraDense
                      ? 'gap-6 mt-0.5 pt-0.5 text-[11px]'
                      : contFull
                      ? 'gap-8 mt-1 pt-0.5 text-[11px]'
                      : isSuperDense
                      ? 'gap-8 mt-1 pt-1 text-[12.5px]'
                      : isDense
                      ? 'gap-10 mt-1.5 pt-1 text-[14px]'
                      : 'gap-12 mt-3 pt-2 text-[15.5px]'
                  } text-black font-bold border-t border-dashed border-stone-300 leading-tight`}>
                    <div className="flex flex-col items-center justify-center w-full px-2">
                      <div className={
                        isA4
                          ? a4Full
                            ? 'h-2'
                            : a4Medium
                            ? 'h-3.5'
                            : 'h-5'
                          : isUltraDense
                          ? 'h-1.5'
                          : contFull
                          ? 'h-2'
                          : isSuperDense
                          ? 'h-2.5'
                          : isDense
                          ? 'h-3'
                          : 'h-5'
                      }></div>
                      <div className="w-full max-w-[290px] flex items-baseline justify-center gap-1 leading-tight">
                        <span className="shrink-0 whitespace-nowrap">ลงชื่อ</span>
                        <span className="flex-1 overflow-hidden whitespace-nowrap text-center tracking-wider font-mono select-none">
                          ................................
                        </span>
                        <span className="shrink-0 whitespace-nowrap">ผู้รับสินค้า</span>
                      </div>
                      <p className={`${isUltraDense || contFull || a4Full ? 'mt-0.5' : 'mt-1'} text-black font-bold whitespace-nowrap text-center`}>
                        วันที่ ......../......../........
                      </p>
                    </div>

                    <div className="flex flex-col items-center justify-center w-full px-2">
                      <div className={
                        isA4
                          ? a4Full
                            ? 'h-2'
                            : a4Medium
                            ? 'h-3.5'
                            : 'h-5'
                          : isUltraDense
                          ? 'h-1.5'
                          : contFull
                          ? 'h-2'
                          : isSuperDense
                          ? 'h-2.5'
                          : isDense
                          ? 'h-3'
                          : 'h-5'
                      }></div>
                      <div className="w-full max-w-[290px] flex items-baseline justify-center gap-1 leading-tight">
                        <span className="shrink-0 whitespace-nowrap">ลงชื่อ</span>
                        <span className="flex-1 overflow-hidden whitespace-nowrap text-center tracking-wider font-mono select-none">
                          ................................
                        </span>
                        <span className="shrink-0 whitespace-nowrap">ผู้รับเงิน</span>
                      </div>
                      <p className={`${isUltraDense || contFull || a4Full ? 'mt-0.5' : 'mt-1'} text-black font-bold whitespace-nowrap text-center`}>
                        วันที่ ......../......../........
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-auto shrink-0 flex flex-col">
                  {/* Intermediate Page Carry Forward Block */}
                  <div className={`grid grid-cols-12 ${
                    isA4
                      ? a4Full
                        ? 'pt-1 pb-0.5 gap-2'
                        : a4Medium
                        ? 'pt-2 pb-1 gap-3'
                        : 'pt-2.5 pb-1.5 gap-4'
                      : isUltraDense
                      ? 'pt-0.5 pb-0.5 gap-2'
                      : contFull
                      ? 'pt-1 pb-0.5 gap-2'
                      : isSuperDense
                      ? 'pt-1.5 pb-1 gap-2'
                      : isDense
                      ? 'pt-2 pb-1 gap-3'
                      : 'pt-3 pb-2 gap-4'
                  } border-t-2 border-black`}>
                    <div className="col-span-5 flex flex-col justify-center">
                      <div className="px-1 py-0.5">
                        <p className={`${
                          isA4
                            ? a4Full
                              ? 'text-[11px]'
                              : a4Medium
                              ? 'text-[12.5px]'
                              : 'text-[13.5px]'
                            : isUltraDense
                            ? 'text-[11px]'
                            : contFull
                            ? 'text-[11.5px]'
                            : isSuperDense
                            ? 'text-[13px]'
                            : isDense
                            ? 'text-[15px]'
                            : 'text-[16.5px]'
                        } text-black font-black leading-tight italic`}>
                          *** มีต่อหน้าที่ {pageIdx + 2} (สะสม {runningItemCount} รายการ / {runningQtyTotal.toLocaleString('th-TH')} ชิ้น) ***
                        </p>
                      </div>
                    </div>

                    <div className={`col-span-7 pl-2 py-0.5 flex flex-col justify-center ${
                      isA4
                        ? a4Full
                          ? 'gap-0.5 text-[11px] leading-tight'
                          : a4Medium
                          ? 'gap-1 text-[12px]'
                          : 'gap-1 text-[13px]'
                        : isUltraDense
                        ? 'gap-0.5 text-[11px] leading-tight'
                        : contFull
                        ? 'gap-0.5 text-[11px] leading-tight'
                        : isSuperDense
                        ? 'gap-1 text-[12.5px]'
                        : isDense
                        ? 'gap-1 text-[14.5px]'
                        : 'gap-1.5 text-[16px]'
                    } font-bold text-black font-mono`}>
                      {pageIdx > 0 && (
                        <div className="flex justify-between items-center text-slate-800">
                          <span className="font-bold whitespace-nowrap">ยอดยกมาจากหน้าก่อน ({previousItemCount} รายการ / {previousQtyTotal.toLocaleString('th-TH')} ชิ้น) :</span>
                          <span className="font-black whitespace-nowrap">
                            {previousSubtotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between items-center text-slate-800">
                        <span className="font-bold whitespace-nowrap">ยอดรวมหน้านี้ ({pageItems.length} รายการ / {pageQtyTotal.toLocaleString('th-TH')} ชิ้น) :</span>
                        <span className="font-black whitespace-nowrap">
                          {pageSubtotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between items-center border-t border-black pt-0.5">
                        <span className="font-bold whitespace-nowrap">ยอดยกไป ({runningItemCount} รายการ / {runningQtyTotal.toLocaleString('th-TH')} ชิ้น) :</span>
                        <span className="font-black whitespace-nowrap">
                          {runningSubtotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Note for intermediate page */}
                  <div className={`flex justify-between items-center ${
                    isA4
                      ? a4Full
                        ? 'mt-0.5 pt-0.5 text-[10.5px]'
                        : a4Medium
                        ? 'mt-1.5 pt-1 text-[12px]'
                        : 'mt-2 pt-1.5 text-[12.5px]'
                      : isUltraDense
                      ? 'mt-0.5 pt-0.5 text-[10.5px]'
                      : contFull
                      ? 'mt-0.5 pt-0.5 text-[10.5px]'
                      : isSuperDense
                      ? 'mt-1 pt-1 text-[12px]'
                      : isDense
                      ? 'mt-2 pt-1 text-[13.5px]'
                      : 'mt-3 pt-2 text-[14.5px]'
                  } text-slate-800 font-bold border-t border-dashed border-stone-300 px-1 leading-tight`}>
                    <span>{isA4 ? 'ใบเสร็จรับเงินขนาด A4' : 'ใบเสร็จรับเงินต่อเนื่อง'} (หน้าที่ {pageIdx + 1} จาก {totalPages} หน้า)</span>
                    <span className="font-black text-black">โปรดดูยอดรวมสุทธิและลายเซ็นต์ที่หน้า {totalPages}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
          </div>
        );
      })}
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
  onSaleSaved?: (savedInvoiceId: string, savedItems: CartItem[], savedDiscount: number) => void;
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
  onSaleSaved,
  setActiveTab,
}: ReceiptViewProps = {}) {
  const [localItems, setLocalItems] = useState<CartItem[]>([]);
  const [localDiscount, setLocalDiscount] = useState<number>(0);
  const [localSavedInvoiceId, setLocalSavedInvoiceId] = useState<string>('');
  const [isSavingSale, setIsSavingSale] = useState<boolean>(false);
  const savingLockRef = React.useRef<boolean>(false);
  const effectiveInvoiceId = invoiceId || localSavedInvoiceId;
  
  // Inner Sub-tab navigation
  const [subTab, setSubTab] = useState<'create' | 'manage'>('create');
  const [paperMode, setPaperMode] = useState<'continuous' | 'a4'>('continuous');
  const [printPaperMode, setPrintPaperMode] = useState<'continuous' | 'a4'>('continuous');
  const [activePrintMode, setActivePrintMode] = useState<'continuous' | 'a4' | null>(null);
  const printPinhole = paperMode === 'continuous';
  const paperSize = paperMode === 'a4' ? ('a4' as const) : ('9.5x11' as const);
  const effectiveLinesPerPage = 35;
  const printPaperSize = printPaperMode === 'a4' ? ('a4' as const) : ('9.5x11' as const);
  const printLinesPerPage = 35;
  const previewTargetWidth = paperMode === 'a4' ? 794 : 912;
  const previewTargetHeight = paperMode === 'a4' ? 1123 : 1056;
  
  // Outer container ref and scale state to automatically fit the receipt preview to the width
  const previewContainerRef = React.useRef<HTMLDivElement>(null);
  const receiptCardRef = React.useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState<number>(1);
  const [cardContentHeight, setCardContentHeight] = useState<number>(1056);
  const [previewZoom, setPreviewZoom] = useState<'fit' | '100'>('fit');
  const [selectedPreviewPage, setSelectedPreviewPage] = useState<'all' | number>('all');
  const [showFullPreviewModal, setShowFullPreviewModal] = useState<boolean>(false);

  useEffect(() => {
    if (!previewContainerRef.current) return;
    const updateScale = (containerWidth: number) => {
      if (containerWidth < previewTargetWidth) {
        setPreviewScale(containerWidth / previewTargetWidth);
      } else {
        setPreviewScale(1);
      }
    };
    updateScale(previewContainerRef.current.clientWidth || previewTargetWidth);
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        updateScale(entry.contentRect.width);
      }
    });
    resizeObserver.observe(previewContainerRef.current);
    return () => resizeObserver.disconnect();
  }, [previewTargetWidth]);

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
    const el = receiptCardRef.current;
    if (!el) return;
    const updateCardHeight = () => {
      const h = el.offsetHeight || el.scrollHeight;
      if (h > 0) {
        setCardContentHeight(h);
      }
    };
    updateCardHeight();
    const observer = new ResizeObserver(updateCardHeight);
    observer.observe(el);
    const timer = setTimeout(updateCardHeight, 50);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [items, previewZoom, selectedPreviewPage, paperMode, custName, custAddress, custPhone, custTaxId, discount]);

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
    if (!effectiveInvoiceId && subTab === 'create') {
      const fetchNextNum = async () => {
        const nextNum = await getNextInvoiceNumber();
        const seq = parseInt(nextNum, 10);
        if (!isNaN(seq)) {
          setInvoiceSeq(seq);
        }
      };
      fetchNextNum();
    }
  }, [effectiveInvoiceId, subTab, items.length]);

  // Load sales history for cancellation/management (Both Admin and Employee can access)
  useEffect(() => {
    if (!auth.currentUser) return;
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
      handleFirestoreError(error, OperationType.GET, 'sales');
    });
    return () => unsubscribe();
  }, []);

  // Load customer lists from Firestore if not provided from parent
  useEffect(() => {
    if ((propCustomers && propCustomers.length > 0) || !auth.currentUser) return;
    const customersCol = collection(db, 'customers');
    const unsubscribe = onSnapshot(customersCol, (snapshot) => {
      const list: Customer[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Customer);
      });
      setLocalCustomers(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'customers');
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

  // Calculations (satang-accurate integer summation + complete order & unit quantity totals)
  const total = sumItemsSatang(items) / 100;
  const totalQty = sumItemsQuantity(items);
  const netTotal = Math.max(0, Math.round((total - discount) * 100) / 100);
  const totalPages = Math.max(1, Math.ceil(items.length / effectiveLinesPerPage));

  useEffect(() => {
    if (typeof selectedPreviewPage === 'number' && selectedPreviewPage >= totalPages) {
      setSelectedPreviewPage('all');
    }
  }, [totalPages, selectedPreviewPage]);

  const pageSummaries = React.useMemo(() => {
    return Array.from({ length: totalPages }).map((_, idx) => {
      const startIdx = idx * effectiveLinesPerPage;
      const endIdx = Math.min(items.length, (idx + 1) * effectiveLinesPerPage);
      const prevSlice = items.slice(0, startIdx);
      const slice = items.slice(startIdx, endIdx);
      const carryInSatang = sumItemsSatang(prevSlice);
      const pageSatang = sumItemsSatang(slice);
      const carryOutSatang = carryInSatang + pageSatang;
      const carryInQty = sumItemsQuantity(prevSlice);
      const pageQty = sumItemsQuantity(slice);
      const carryOutQty = carryInQty + pageQty;
      return {
        pageNumber: idx + 1,
        pageIndex: idx,
        startItem: startIdx + 1,
        endItem: endIdx,
        itemCount: slice.length,
        carryInQty,
        pageQty,
        carryOutQty,
        carryIn: carryInSatang / 100,
        pageTotal: pageSatang / 100,
        carryOut: carryOutSatang / 100,
        isLast: idx === totalPages - 1,
      };
    });
  }, [items, totalPages, effectiveLinesPerPage]);

  const invoiceNumber = effectiveInvoiceId || String(invoiceSeq).padStart(6, '0');
  const todayStr = new Date().toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const saveSaleToFirestore = async (options?: { keepAfterSave?: boolean }): Promise<string | null> => {
    if (items.length === 0) {
      setAlertTitle('คำเตือน');
      setAlertMessage('กรุณาเพิ่มรายการสินค้าก่อนทำรายการ');
      setAlertOpen(true);
      return null;
    }

    // หากบิลนี้ถูกบันทึกแล้ว (จากหน้า POS, ประวัติบิล, หรือเพิ่งสั่งพิมพ์ไปแล้ว) ให้ใช้เลขบิลเดิมโดยไม่บันทึกซ้ำและไม่ตัดสต็อกเบิ้ล
    if (effectiveInvoiceId) {
      return effectiveInvoiceId;
    }

    // ป้องกันการกดปุ่มซ้ำซ้อนระหว่างที่กำลังบันทึกลงฐานข้อมูล
    if (savingLockRef.current) {
      return null;
    }

    savingLockRef.current = true;
    setIsSavingSale(true);

    const finalInvoiceNumber = invoiceNumber;

    const saleItems: SaleItem[] = items.map((item) => ({
      productId: String(item.product.id).slice(0, 128),
      name: String(item.product.name || 'สินค้า').slice(0, 200),
      price: item.product.price,
      quantity: item.quantity,
      subtotal: item.product.price * item.quantity,
    }));

    const newSale: Sale = {
      id: finalInvoiceNumber.slice(0, 128),
      timestamp: new Date().toISOString(),
      employee: (auth.currentUser?.displayName || 'พนักงานหน้าร้าน').slice(0, 120), // Dynamic employee name from Gmail login
      total: netTotal,
      status: 'สำเร็จ',
      items: saleItems,
      discount: Math.max(0, discount || 0),
      customerName: (custName || 'ลูกค้าทั่วไป').slice(0, 200),
      customerPhone: (custPhone || '').slice(0, 50),
      customerAddress: (custAddress || '').slice(0, 500),
      customerTaxId: (custTaxId || '').slice(0, 32),
    };

    try {
      await runTransaction(db, async (transaction) => {
        const saleRef = doc(db, 'sales', finalInvoiceNumber);
        const existingSaleDoc = await transaction.get(saleRef);
        if (existingSaleDoc.exists()) {
          throw new Error(`เลขที่ใบเสร็จ #${finalInvoiceNumber} มีอยู่ในระบบแล้ว ระบบได้อัปเดตเลขที่ถัดไปให้ใหม่ กรุณากดทำรายการอีกครั้ง`);
        }

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
        transaction.set(saleRef, newSale);
      });

      // อัปเดตเลขบิลถัดไปสำหรับบิลใบหน้า
      const nextSeq = invoiceSeq + 1;
      setInvoiceSeq(nextSeq);
      localStorage.setItem('receipt_invoice_seq', String(nextSeq));

      // หากบันทึกจากการกดสั่งพิมพ์ ให้ผูกเลขบิลนี้ไว้ในหน้าจอเพื่อให้กดพิมพ์ซ้ำได้โดยไม่สร้างบิลใหม่
      if (options?.keepAfterSave) {
        if (onSaleSaved) {
          onSaleSaved(finalInvoiceNumber, [...items], discount);
        } else {
          setLocalSavedInvoiceId(finalInvoiceNumber);
          if (setInvoiceId) {
            setInvoiceId(finalInvoiceNumber);
          }
        }
      }

      return finalInvoiceNumber;
    } catch (error: any) {
      console.error('Error saving printed receipt:', error);
      // ซิงก์เลขที่บิลล่าสุดจาก Firestore เผื่อมีเครื่องอื่นออกบิลชนกัน
      try {
        const latestNum = await getNextInvoiceNumber();
        const latestSeq = parseInt(latestNum, 10);
        if (!isNaN(latestSeq)) {
          setInvoiceSeq(latestSeq);
        }
      } catch {
        // Ignore refresh fallback failure
      }
      setAlertTitle('การทำรายการล้มเหลว');
      setAlertMessage(error.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูลใบเสร็จ');
      setAlertOpen(true);
      return null;
    } finally {
      savingLockRef.current = false;
      setIsSavingSale(false);
    }
  };

  const handlePrint = async (targetMode: 'continuous' | 'a4' = 'continuous') => {
    if (isPrinted || isSavingSale) return;
    setPaperMode(targetMode);
    setPrintPaperMode(targetMode);
    setActivePrintMode(targetMode);
    setIsPrinted(true);
    try {
      const invoiceNum = await saveSaleToFirestore({ keepAfterSave: true });
      if (invoiceNum) {
        // Wait two frames so the print portal DOM and @page rules match the chosen paper size before printing
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
        try {
          window.focus();
          window.print();
        } catch (err) {
          console.error('Print failed:', err);
        }
      }
    } finally {
      setIsPrinted(false);
      setActivePrintMode(null);
    }
  };

  const handleSaveReceipt = async () => {
    if (isSavingSale) return;
    if (effectiveInvoiceId) {
      setAlertTitle('บิลถูกบันทึกแล้ว');
      setAlertMessage(`ใบเสร็จเลขที่ ${effectiveInvoiceId} ถูกบันทึกในระบบแล้ว สามารถกดสั่งพิมพ์ซ้ำได้ทันทีโดยไม่สร้างบิลซ้ำ`);
      setAlertOpen(true);
      return;
    }
    const invoiceNum = await saveSaleToFirestore({ keepAfterSave: false });
    if (invoiceNum) {
      setAlertTitle('บันทึกสำเร็จ');
      setAlertMessage(`บันทึกข้อมูลใบเสร็จรับเงินเลขที่ ${invoiceNum} สำเร็จและเชื่อมโยงกับหน้ารายงานแล้ว!`);
      setAlertOpen(true);
      setItems([]);
      setDiscount(0);
    }
  };

  const handleClear = () => {
    setConfirmTitle(effectiveInvoiceId ? 'ล้างหน้าจอและเริ่มบิลใหม่' : 'เคลียร์รายการทั้งหมด');
    setConfirmMessage(
      effectiveInvoiceId
        ? `คุณต้องการล้างหน้าจอบิลเลขที่ #${effectiveInvoiceId} เพื่อเริ่มเปิดบิลใหม่ใช่หรือไม่? (บิลเดิมยังถูกเก็บไว้ในประวัติบิลและรายงาน)`
        : 'คุณต้องการเคลียร์รายการทั้งหมดใช่หรือไม่?'
    );
    setConfirmIsDanger(true);
    setPendingAction(() => () => {
      setItems([]);
      setDiscount(0);
      setLocalSavedInvoiceId('');
      if (setInvoiceId) {
        setInvoiceId('');
      }
    });
    setConfirmOpen(true);
  };

  return (
    <div className="flex-1 p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        
        {/* Page Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-2xl font-extrabold text-slate-900">ออกใบเสร็จรับเงิน</h2>
              {effectiveInvoiceId && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 tabular-nums">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>บันทึกแล้ว • เลขที่บิล: #{effectiveInvoiceId} (พิมพ์ซ้ำได้ไม่สร้างบิลซ้ำ)</span>
                </span>
              )}
            </div>
            <p className="text-base text-slate-600 mt-1 font-medium">สร้างรายการขาย พิมพ์ใบเสร็จ และจัดการยกเลิกบิล</p>
          </div>
          
          <div className="flex items-center gap-2.5 flex-wrap">
            {effectiveInvoiceId && (
              <button
                type="button"
                onClick={() => {
                  setLocalSavedInvoiceId('');
                  if (setInvoiceId) setInvoiceId('');
                  if (onStartNewSale) onStartNewSale();
                }}
                className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-800 rounded-xl text-sm font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                title="ล้างบิลนี้และเริ่มเปิดบิลใหม่"
              >
                <Plus className="w-4 h-4 text-slate-600" />
                <span>เริ่มบิลใหม่</span>
              </button>
            )}

            {setActiveTab && (
              <button
                type="button"
                onClick={() => setActiveTab('pos')}
                className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-800 rounded-xl text-sm font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <ShoppingCart className="w-4 h-4 text-slate-600" />
                <span>ไปยังหน้าขาย (POS)</span>
              </button>
            )}

            {/* Sub-tab Selection */}
            {(role === 'admin' || role === 'employee') && (
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  onClick={() => setSubTab('create')}
                  className={`px-3.5 py-1.5 font-bold text-sm rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                    subTab === 'create'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  <span>ออกใบเสร็จใหม่</span>
                </button>
                <button
                  onClick={() => setSubTab('manage')}
                  className={`px-3.5 py-1.5 font-bold text-sm rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                    subTab === 'manage'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Ban className="w-4 h-4" />
                  <span>ยกเลิกบิล</span>
                  <span className="bg-slate-200 text-slate-800 text-xs px-2 py-0.5 rounded-full font-extrabold tabular-nums">
                    {allSales.length}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Conditional Workspace */}
        {subTab === 'manage' ? (
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm flex flex-col gap-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-slate-600" />
                  ยกเลิกออกใบเสร็จรับเงิน
                </h3>
                <p className="text-sm text-slate-600 font-medium mt-0.5">
                  ค้นหา ตรวจสอบ และจัดการยกเลิกบิลใบเสร็จรับเงินที่ออกไปแล้ว ระบบจะปรับยอดรายงานอัตโนมัติ
                </p>
              </div>

              {/* Search Bar */}
              <div className="relative w-full md:w-80">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={manageSearch}
                  onChange={(e) => setManageSearch(e.target.value)}
                  placeholder="ค้นหาเลขที่บิล หรือ ชื่อลูกค้า..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none transition-all"
                />
              </div>
            </div>

            {salesLoading ? (
              <div className="py-20 flex flex-col items-center justify-center gap-3">
                <RefreshCw className="w-8 h-8 text-slate-400 animate-spin" />
                <p className="text-sm text-slate-500 font-medium">กำลังโหลดประวัติการออกบิล...</p>
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
                      <p className="text-base font-bold text-slate-700">ไม่พบข้อมูลบิลใบเสร็จ</p>
                      <p className="text-sm text-slate-500">ลองระบุเลขที่บิลอื่น หรือเพิ่มการออกบิลใบเสร็จในระบบ</p>
                    </div>
                  );
                }

                return (
                  <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/80 border-b border-slate-200">
                          <th className="py-3.5 px-4 text-sm font-bold text-slate-700 font-sans">เลขที่บิล</th>
                          <th className="py-3.5 px-4 text-sm font-bold text-slate-700 font-sans">วันที่ - เวลา</th>
                          <th className="py-3.5 px-4 text-sm font-bold text-slate-700 font-sans">พนักงาน</th>
                          <th className="py-3.5 px-4 text-sm font-bold text-slate-700 font-sans">ยอดรวมสุทธิ</th>
                          <th className="py-3.5 px-4 text-sm font-bold text-slate-700 font-sans text-center">สถานะ</th>
                          <th className="py-3.5 px-4 text-sm font-bold text-slate-700 font-sans text-center">จัดการ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredSales.map((sale) => {
                          const isCancelled = sale.status === 'ยกเลิก';
                          return (
                            <tr key={sale.id} className="hover:bg-slate-50/70 transition-colors">
                              <td className="py-3.5 px-4 text-sm font-black font-mono text-slate-900 tabular-nums">
                                {sale.id}
                              </td>
                              <td className="py-3.5 px-4 text-sm text-slate-600 tabular-nums">
                                {new Date(sale.timestamp).toLocaleString('th-TH', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </td>
                              <td className="py-3.5 px-4 text-sm text-slate-700">
                                {sale.employee || '-'}
                              </td>
                              <td className="py-3.5 px-4 text-sm font-bold text-slate-950 font-mono tabular-nums">
                                ฿{(sale.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="py-3.5 px-4 text-sm text-center">
                                <span
                                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                                    isCancelled
                                      ? 'bg-red-50 text-red-700 border border-red-200'
                                      : 'bg-green-50 text-green-700 border border-green-200'
                                  }`}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${isCancelled ? 'bg-red-500' : 'bg-green-500'}`}></span>
                                  {sale.status || 'สำเร็จ'}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-sm text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => handleLoadSaleToPrint(sale)}
                                    className="px-3.5 py-1.5 rounded-lg font-bold text-xs bg-slate-950 text-white hover:bg-slate-800 transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-sm"
                                  >
                                    <Printer className="w-3.5 h-3.5" />
                                    <span>พิมพ์ใบเสร็จ</span>
                                  </button>
                                  <button
                                    onClick={() => handleCancelReceipt(sale)}
                                    className={`px-3.5 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer inline-flex items-center gap-1.5 ${
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
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column: Customer Details & Items in Bill (Span 5/12 on desktop for ideal balance) */}
          <div className="lg:col-span-5 xl:col-span-5 flex flex-col gap-5">
            
            {/* Customer Information Panel */}
            <div className="bg-white border border-slate-150 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-slate-700" />
                  <h3 className="text-base font-bold text-slate-900">ข้อมูลผู้ซื้อ</h3>
                </div>
                <span className="text-xs bg-slate-100 px-2.5 py-1 rounded-md text-slate-700 font-bold">เลือกลูกค้า</span>
              </div>

              {/* Select Member Dropdown */}
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1.5">
                  เลือกจากรายชื่อสมาชิกลูกค้า (ถ้ามี)
                </label>
                <select
                  value={selectedCustId}
                  onChange={(e) => handleSelectCustomer(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm sm:text-base text-slate-900 font-bold focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none bg-white transition-all"
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
                  <label className="block text-sm font-bold text-slate-800 mb-1.5">
                    ชื่อลูกค้า
                  </label>
                  <input
                    type="text"
                    value={custName}
                    onChange={(e) => setCustName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm sm:text-base font-bold text-slate-900 focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none transition-all"
                    placeholder="ระบุชื่อลูกค้า..."
                  />
                </div>

                {/* Customer Phone */}
                <div>
                  <label className="block text-sm font-bold text-slate-800 mb-1.5">
                    เบอร์โทรศัพท์ลูกค้า
                  </label>
                  <input
                    type="tel"
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm sm:text-base font-bold text-slate-900 focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none transition-all"
                    placeholder="ระบุเบอร์โทรศัพท์..."
                  />
                </div>
              </div>

              {/* Tax ID */}
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1.5">
                  เลขประจำตัวผู้เสียภาษี
                </label>
                <input
                  type="text"
                  value={custTaxId}
                  onChange={(e) => setCustTaxId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm sm:text-base font-bold text-slate-900 focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none transition-all"
                  placeholder="กรอกเลขประจำตัวผู้เสียภาษี..."
                />
              </div>

              {/* Customer Address */}
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1.5">
                  ที่อยู่ลูกค้า
                </label>
                <textarea
                  value={custAddress}
                  onChange={(e) => setCustAddress(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm sm:text-base font-bold text-slate-900 focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none transition-all resize-none h-20"
                  placeholder="กรอกที่อยู่ลูกค้า..."
                />
              </div>
            </div>

            {/* Discount Panel */}
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex flex-col gap-3">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                <h3 className="text-base font-bold text-slate-900">ส่วนลดใบเสร็จ</h3>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1.5">
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
                    className="w-full border-none outline-none p-0 text-base font-bold text-slate-900 focus:ring-0 bg-transparent font-mono tabular-nums"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            {/* List Table of Chosen Items */}
            <div className="bg-white border border-slate-150 rounded-2xl shadow-xs overflow-hidden flex flex-col">
              <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex justify-between items-center gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">รายการสินค้าในบิล</h3>
                  <span className={`text-xs sm:text-sm font-bold px-2.5 py-0.5 rounded-lg border tabular-nums ${
                    items.length > effectiveLinesPerPage
                      ? 'bg-blue-50 text-blue-700 border-blue-200' 
                      : 'bg-white text-slate-700 border-slate-200'
                  }`}>
                    {items.length} รายการ {items.length > 0 && `(${Math.max(1, Math.ceil(items.length / effectiveLinesPerPage))} แผ่น)`}
                  </span>
                </div>
                
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setShowCustomItemModal(true)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                  >
                    <PackagePlus className="w-3.5 h-3.5 text-slate-500" />
                    <span>+ รายการเอง</span>
                  </button>
                  {items.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAllItems}
                      className="text-xs sm:text-sm text-red-600 hover:text-red-700 hover:underline font-bold cursor-pointer transition-colors px-1.5"
                    >
                      ล้างรายการ
                    </button>
                  )}
                </div>
              </div>

              {items.length === 0 ? (
                <div className="py-10 text-center text-slate-400 flex flex-col items-center justify-center px-4">
                  <Printer className="w-10 h-10 mb-2 stroke-[1.5] text-slate-300" />
                  <p className="text-base font-bold text-slate-700">ยังไม่มีรายการสินค้าในบิล</p>
                  <p className="text-sm mt-1 text-slate-500">ทำรายการขายจาก "หน้าขาย (POS)" หรือกดปุ่ม "+ รายการเอง" ด้านบน หรือเลือกจากแท็บ "ยกเลิกบิล"</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {/* Table headers */}
                  <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-slate-100/70 text-xs sm:text-sm font-bold text-slate-700 border-b border-slate-200">
                    <div className="col-span-1 text-center">ลำดับ</div>
                    <div className="col-span-4">สินค้า</div>
                    <div className="col-span-2 text-right">ราคา/หน่วย</div>
                    <div className="col-span-2 text-center">จำนวน</div>
                    <div className="col-span-2 text-right pr-2">รวมเงิน</div>
                    <div className="col-span-1 text-center">ลบ</div>
                  </div>

                  {/* Rows */}
                  {items.map((i, idx) => (
                    <div key={i.product.id} className="grid grid-cols-12 gap-2 px-4 py-2.5 items-center hover:bg-slate-50/70 transition-colors text-sm border-b border-slate-100 last:border-b-0">
                      {/* Item No */}
                      <div className="col-span-1 flex justify-center items-center text-slate-500 font-mono font-bold text-xs sm:text-sm tabular-nums">
                        {idx + 1}
                      </div>

                      {/* Product Name */}
                      <div className="col-span-4 flex items-center min-w-0 pr-1">
                        <input
                          type="text"
                          value={i.product.name}
                          onChange={(e) => updateItemName(i.product.id, e.target.value)}
                          className="w-full text-sm font-bold text-slate-900 border-none bg-transparent hover:bg-slate-100/80 focus:bg-white focus:ring-1 focus:ring-slate-400 rounded px-1.5 py-1 transition-colors truncate"
                          title={i.product.name}
                        />
                      </div>

                      {/* Price Column */}
                      <div className="col-span-2 flex justify-end items-center">
                        <div className="flex items-center gap-0.5 justify-end w-full">
                          <span className="text-slate-400 text-xs">฿</span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={i.product.price}
                            onChange={(e) => updateItemPrice(i.product.id, e.target.value)}
                            className="w-20 text-right text-sm font-bold font-mono tabular-nums text-slate-900 border-none bg-transparent hover:bg-slate-100/80 focus:bg-white focus:ring-1 focus:ring-slate-400 rounded px-1 py-0.5"
                          />
                        </div>
                      </div>

                      {/* Quantity Controls */}
                      <div className="col-span-2 flex justify-center items-center">
                        <div className="flex items-center border border-slate-200 rounded-lg bg-white overflow-hidden shadow-xs">
                          <button
                            onClick={() => incrementQuantity(i.product.id, -1)}
                            className="p-1.5 hover:bg-slate-100 text-slate-700 cursor-pointer transition-colors"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            type="text"
                            value={i.quantity}
                            onChange={(e) => updateQuantity(i.product.id, e.target.value)}
                            className="w-8 text-center border-none text-sm font-bold text-slate-900 p-0 focus:ring-0 bg-transparent font-mono tabular-nums"
                          />
                          <button
                            onClick={() => incrementQuantity(i.product.id, 1)}
                            className="p-1.5 hover:bg-slate-100 text-slate-700 cursor-pointer transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Subtotal Column - allocated 2 columns so numbers never wrap into another line */}
                      <div className="col-span-2 flex justify-end items-center pr-2">
                        <span className="text-sm font-bold text-slate-950 font-mono tabular-nums whitespace-nowrap">
                          {(i.product.price * i.quantity).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>

                      {/* Delete Action Column */}
                      <div className="col-span-1 flex justify-center">
                        <button
                          onClick={() => removeItem(i.product.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded cursor-pointer transition-colors"
                          title="ลบรายการนี้"
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

          {/* Right Column: Receipt Preview & Actions (Span 7/12 for spacious, legible paper view) */}
          <div className="lg:col-span-7 xl:col-span-7 flex flex-col gap-5">
            
            {totalPages > 1 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <h4 className="text-sm sm:text-base font-bold text-slate-900">
                      สรุปยอดคำนวณต่อเนื่องแยกตามแผ่น (เช็กยอดก่อนพิมพ์)
                    </h4>
                  </div>
                  <span className="text-xs sm:text-sm font-bold text-slate-700 tabular-nums">
                    ครบทั้ง {items.length} รายการ · {totalQty.toLocaleString('th-TH')} ชิ้น · {totalPages} แผ่น
                  </span>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                        <th className="py-2 px-2.5 whitespace-nowrap">แผ่นที่</th>
                        <th className="py-2 px-2.5 whitespace-nowrap">รายการ (ออเดอร์)</th>
                        <th className="py-2 px-2.5 text-right whitespace-nowrap">จำนวนชิ้น</th>
                        <th className="py-2 px-2.5 text-right whitespace-nowrap">ยอดยกมา</th>
                        <th className="py-2 px-2.5 text-right whitespace-nowrap">ยอดแผ่นนี้</th>
                        <th className="py-2 px-2.5 text-right whitespace-nowrap">ยอดสะสม / ยอดยกไป</th>
                        <th className="py-2 px-2.5 text-center whitespace-nowrap">ดูตัวอย่าง</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pageSummaries.map((p) => {
                        const isSelected = selectedPreviewPage === p.pageIndex;
                        return (
                          <tr
                            key={`summary-row-${p.pageIndex}`}
                            onClick={() => setSelectedPreviewPage(p.pageIndex)}
                            className={`cursor-pointer transition-colors ${
                              isSelected ? 'bg-slate-100/90' : 'hover:bg-slate-50'
                            }`}
                          >
                            <td className="py-2 px-2.5 font-bold text-slate-900 whitespace-nowrap tabular-nums">
                              แผ่นที่ {p.pageNumber}
                            </td>
                            <td className="py-2 px-2.5 text-slate-700 whitespace-nowrap tabular-nums">
                              #{p.startItem}–{p.endItem} ({p.itemCount})
                            </td>
                            <td className="py-2 px-2.5 text-right font-mono tabular-nums text-slate-800 whitespace-nowrap">
                              {p.pageQty.toLocaleString('th-TH')} (สะสม {p.carryOutQty.toLocaleString('th-TH')})
                            </td>
                            <td className="py-2 px-2.5 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                              {p.pageIndex === 0 ? '-' : `฿${p.carryIn.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                            </td>
                            <td className="py-2 px-2.5 text-right font-mono font-bold tabular-nums text-slate-900 whitespace-nowrap">
                              ฿{p.pageTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-2 px-2.5 text-right font-mono font-bold tabular-nums text-slate-950 whitespace-nowrap">
                              ฿{p.carryOut.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-2 px-2.5 text-center whitespace-nowrap">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedPreviewPage(p.pageIndex);
                                }}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer transition-colors ${
                                  isSelected
                                    ? 'bg-slate-950 text-white border-slate-950'
                                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                {isSelected ? 'กำลังแสดง' : `ดูแผ่น ${p.pageNumber}`}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between flex-wrap gap-2 pt-1 text-xs sm:text-sm font-bold text-slate-800">
                  <span>
                    รวมครบทุกแผ่น ({items.length} รายการ · {totalQty.toLocaleString('th-TH')} ชิ้น)
                    {discount > 0 && ` · หักส่วนลด ฿${discount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </span>
                  <span className="font-mono tabular-nums text-slate-950 text-sm sm:text-base font-black">
                    ยอดสุทธิรวมทั้งหมด: ฿{netTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-bold">
                  <button
                    type="button"
                    onClick={() => setPaperMode('continuous')}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                      paperMode === 'continuous'
                        ? 'bg-white text-slate-950 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    กระดาษต่อเนื่อง 9.5"×11" (35/แผ่น)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaperMode('a4')}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                      paperMode === 'a4'
                        ? 'bg-white text-slate-950 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    กระดาษ A4 แนวตั้ง (35/แผ่น)
                  </button>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs sm:text-sm font-bold flex-wrap">
                    <button
                      type="button"
                      onClick={() => setSelectedPreviewPage('all')}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap ${
                        selectedPreviewPage === 'all' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      ทุกแผ่น ({totalPages})
                    </button>
                    {pageSummaries.map((p) => (
                      <button
                        key={`preview-tab-${p.pageIndex}`}
                        type="button"
                        onClick={() => setSelectedPreviewPage(p.pageIndex)}
                        className={`px-2.5 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap ${
                          selectedPreviewPage === p.pageIndex ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        แผ่นที่ {p.pageNumber}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs sm:text-sm font-bold">
                  <button
                    type="button"
                    onClick={() => setPreviewZoom('fit')}
                    className={`px-2.5 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap ${
                      previewZoom === 'fit' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    พอดีจอ
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewZoom('100')}
                    className={`px-2.5 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap ${
                      previewZoom === '100' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    ขนาดจริง 100%
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setShowFullPreviewModal(true)}
                  title="ดูตัวอย่างเต็มจอ 100%"
                  className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer border border-slate-200 bg-white shadow-xs"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Paper Bill Lookalike Preview */}
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
                    width: `${previewTargetWidth}px`,
                    minHeight: `${previewTargetHeight}px`,
                    transform: `scale(${previewScale})`,
                    transformOrigin: 'top center',
                    position: 'absolute',
                    left: '50%',
                    marginLeft: `-${previewTargetWidth / 2}px`,
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
                    linesPerPage={effectiveLinesPerPage}
                    visiblePageIndex={selectedPreviewPage === 'all' ? null : selectedPreviewPage}
                  />
                </div>
              </div>
            ) : (
              <div className="w-full overflow-x-auto overflow-y-auto max-h-[680px] border border-slate-200 rounded-2xl bg-slate-100/70 p-4 flex justify-start shadow-inner">
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
                  linesPerPage={effectiveLinesPerPage}
                  visiblePageIndex={selectedPreviewPage === 'all' ? null : selectedPreviewPage}
                />
              </div>
            )}

            {/* Print and Save buttons */}
            <div className="flex flex-col gap-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  onClick={() => handlePrint('continuous')}
                  disabled={items.length === 0 || isSavingSale || isPrinted}
                  className={`w-full py-3.5 px-3 rounded-xl font-bold text-sm sm:text-base text-white shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all ${
                    items.length === 0
                      ? 'bg-slate-300 cursor-not-allowed shadow-none'
                      : isPrinted || isSavingSale
                      ? 'bg-slate-800 cursor-wait'
                      : 'bg-slate-950 hover:bg-slate-850 active:scale-[0.98]'
                  }`}
                >
                  {(isPrinted || isSavingSale) && activePrintMode === 'continuous' ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>{isSavingSale ? 'กำลังบันทึกข้อมูลบิล...' : 'กำลังสั่งพิมพ์...'}</span>
                    </>
                  ) : (
                    <>
                      <Printer className="w-4 h-4 shrink-0" />
                      <span>
                        {effectiveInvoiceId
                          ? `พิมพ์ซ้ำต่อเนื่อง (#${effectiveInvoiceId})`
                          : 'สั่งพิมพ์กระดาษต่อเนื่อง (35/แผ่น)'}
                      </span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => handlePrint('a4')}
                  disabled={items.length === 0 || isSavingSale || isPrinted}
                  className={`w-full py-3.5 px-3 rounded-xl font-bold text-sm sm:text-base shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all border ${
                    items.length === 0
                      ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed shadow-none'
                      : isPrinted || isSavingSale
                      ? 'bg-emerald-700 text-white border-emerald-700 cursor-wait'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 active:scale-[0.98]'
                  }`}
                >
                  {(isPrinted || isSavingSale) && activePrintMode === 'a4' ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>{isSavingSale ? 'กำลังบันทึกข้อมูลบิล...' : 'กำลังสั่งพิมพ์ A4...'}</span>
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4 shrink-0" />
                      <span>
                        {effectiveInvoiceId
                          ? `พิมพ์ซ้ำกระดาษ A4 (#${effectiveInvoiceId})`
                          : 'สั่งพิมพ์กระดาษ A4 (35/หน้า)'}
                      </span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex gap-2.5">
                <button
                  onClick={handleSaveReceipt}
                  disabled={items.length === 0 || isSavingSale || Boolean(effectiveInvoiceId)}
                  className={`flex-1 py-3 border rounded-xl text-sm font-bold shadow-sm transition-colors ${
                    effectiveInvoiceId
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 cursor-default'
                      : 'border-slate-200 text-slate-800 bg-white hover:bg-slate-50 cursor-pointer disabled:opacity-40'
                  }`}
                >
                  {effectiveInvoiceId ? `บันทึกแล้ว (#${effectiveInvoiceId})` : 'บันทึกข้อมูลใบเสร็จ'}
                </button>
                <button
                  onClick={handleClear}
                  disabled={items.length === 0 || isSavingSale}
                  className="flex-1 py-3 border border-red-200 text-red-600 bg-white hover:bg-red-50 rounded-xl text-sm font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-40"
                >
                  {effectiveInvoiceId ? 'ล้างหน้าจอ' : 'ยกเลิก'}
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
                size: ${printPaperMode === 'a4' ? 'A4 portrait' : '9.5in 11in portrait'} !important;
                margin: 0 !important;
              }
              html, body {
                width: 100% !important;
                height: auto !important;
                margin: 0 !important;
                padding: 0 !important;
                display: block !important;
              }
              .print-portal-container {
                width: 100% !important;
                height: auto !important;
                display: block !important;
                margin: 0 !important;
                padding: 0 !important;
              }
              .receipt-pages-wrapper {
                display: block !important;
                margin: 0 !important;
                padding: 0 !important;
              }
              .dot-matrix-print-target {
                width: 100% !important;
                max-width: 100% !important;
                height: ${printPaperMode === 'a4' ? '297mm' : '11in'} !important;
                max-height: ${printPaperMode === 'a4' ? '297mm' : '11in'} !important;
                margin: 0 !important;
                padding: ${printPaperMode === 'a4' ? '5mm 8mm' : '3.5mm 7mm'} !important;
                box-sizing: border-box !important;
                overflow: hidden !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
              .dot-matrix-print-target.page-break {
                page-break-after: always !important;
                break-after: page !important;
              }
              .dot-matrix-print-target:last-child {
                page-break-after: avoid !important;
                break-after: avoid !important;
              }
            }
          `}</style>
          <ContinuousReceiptPaper
            paperSize={printPaperSize}
            printPinhole={printPaperMode === 'continuous'}
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
            linesPerPage={printLinesPerPage}
          />
        </div>,
        document.body
      )}

      {/* Full 100% Scale Preview Modal */}
      {showFullPreviewModal && (
        <div className="fixed inset-0 bg-black/75 z-50 flex flex-col items-center justify-start p-4 sm:p-6 overflow-y-auto backdrop-blur-xs">
          <div className="w-full max-w-[960px] flex items-center justify-between gap-3 flex-wrap py-2 text-white mb-3">
            <div className="flex items-center gap-3">
              <Receipt className="w-6 h-6 text-emerald-400" />
              <div>
                <h3 className="font-bold text-base sm:text-lg">
                  {paperMode === 'a4'
                    ? 'ภาพตัวอย่างใบเสร็จกระดาษ A4 100% (ตรงตามการพิมพ์จริง 1:1)'
                    : 'ภาพตัวอย่างใบเสร็จต่อเนื่อง 100% (ตรงตามการพิมพ์จริง 1:1)'}
                </h3>
                <p className="text-xs text-slate-300">
                  {paperMode === 'a4'
                    ? 'ขนาดกระดาษ A4 แนวตั้ง (210mm x 297mm) • สูงสุด 35 รายการต่อหน้า'
                    : 'ขนาดกระดาษ 9.5" x 11" • สูงสุด 35 รายการต่อแผ่น'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 bg-white/10 p-1 rounded-xl text-xs sm:text-sm font-bold">
                <button
                  type="button"
                  onClick={() => setPaperMode('continuous')}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                    paperMode === 'continuous' ? 'bg-white text-slate-950' : 'text-white/80 hover:text-white'
                  }`}
                >
                  ต่อเนื่อง 9.5"×11"
                </button>
                <button
                  type="button"
                  onClick={() => setPaperMode('a4')}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                    paperMode === 'a4' ? 'bg-white text-slate-950' : 'text-white/80 hover:text-white'
                  }`}
                >
                  กระดาษ A4
                </button>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center gap-1 bg-white/10 p-1 rounded-xl text-xs sm:text-sm font-bold">
                  <button
                    type="button"
                    onClick={() => setSelectedPreviewPage('all')}
                    className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                      selectedPreviewPage === 'all' ? 'bg-white text-slate-950' : 'text-white/80 hover:text-white'
                    }`}
                  >
                    ทุกแผ่น ({totalPages})
                  </button>
                  {pageSummaries.map((p) => (
                    <button
                      key={`modal-tab-${p.pageIndex}`}
                      type="button"
                      onClick={() => setSelectedPreviewPage(p.pageIndex)}
                      className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                        selectedPreviewPage === p.pageIndex ? 'bg-white text-slate-950' : 'text-white/80 hover:text-white'
                      }`}
                    >
                      แผ่นที่ {p.pageNumber}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => setShowFullPreviewModal(false)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
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
              linesPerPage={effectiveLinesPerPage}
              visiblePageIndex={selectedPreviewPage === 'all' ? null : selectedPreviewPage}
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
                <h3 className="font-bold text-lg text-slate-900">เพิ่มรายการสินค้ากำหนดเอง</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomItemModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCustomItem} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1.5">
                  ชื่อสินค้า / รายการ <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="เช่น ข้าวหอมมะลิคัดพิเศษ, ค่าขนส่งรอบพิเศษ ฯลฯ"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-base font-bold text-slate-900 focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold text-slate-800 mb-1.5">
                    ราคาต่อหน่วย (บาท) <span className="text-slate-400 font-normal">(ใส่ 0 ได้)</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={customPrice}
                    onChange={(e) => setCustomPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-base font-bold font-mono tabular-nums text-slate-900 focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-800 mb-1.5">
                    จำนวน <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={customQty}
                    onChange={(e) => setCustomQty(e.target.value)}
                    placeholder="1"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-base font-bold font-mono tabular-nums text-slate-900 focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCustomItemModal(false)}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 rounded-xl text-sm font-bold transition-colors cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-slate-950 hover:bg-slate-800 text-white rounded-xl text-sm font-bold shadow-sm transition-colors cursor-pointer"
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
