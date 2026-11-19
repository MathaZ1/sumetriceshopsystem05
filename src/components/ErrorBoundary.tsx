import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  declare state: ErrorBoundaryState;
  declare props: ErrorBoundaryProps;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readableMessage = error?.message || 'เกิดข้อผิดพลาดที่ไม่คาดคิดในระบบ';
    try {
      const parsed = JSON.parse(readableMessage);
      if (parsed?.error) {
        if (String(parsed.error).toLowerCase().includes('permission')) {
          readableMessage = 'บัญชีของคุณไม่มีสิทธิ์เข้าถึงข้อมูลส่วนนี้ หรือกฎความปลอดภัยปฏิเสธคำขอ กรุณาตรวจสอบสิทธิ์ผู้ใช้งาน';
        } else {
          readableMessage = parsed.error;
        }
      }
    } catch {
      // Plain error message
    }
    return { hasError: true, message: readableMessage };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught application error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200 shadow-lg p-8 text-center flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-red-600" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-900">ระบบพบข้อผิดพลาดชั่วคราว</h2>
              <p className="text-sm text-slate-600 font-medium mt-2 leading-relaxed">
                {this.state.message}
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-xl inline-flex items-center gap-2 transition-colors cursor-pointer shadow-sm"
            >
              <RefreshCw className="w-4 h-4" />
              <span>โหลดหน้าเว็บใหม่</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
