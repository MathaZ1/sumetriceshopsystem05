import { useState } from 'react';
import { auth, googleProvider } from '../firebase';
import { signInWithPopup } from 'firebase/auth';
import { motion } from 'motion/react';
import { ShieldCheck, Wheat, HelpCircle, AlertTriangle, Copy, Check, Mail, ArrowRight } from 'lucide-react';

export default function LoginView() {
  const [gmailInput, setGmailInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  const handleGoogleLogin = async (customEmail?: string) => {
    setLoading(true);
    setError('');
    
    try {
      const emailToHint = customEmail || gmailInput.trim();
      let formattedEmail = emailToHint;
      
      if (formattedEmail) {
        if (!formattedEmail.includes('@')) {
          formattedEmail = `${formattedEmail}@gmail.com`;
        }
        googleProvider.setCustomParameters({
          prompt: 'select_account',
          login_hint: formattedEmail,
        });
      } else {
        googleProvider.setCustomParameters({
          prompt: 'select_account',
        });
      }

      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error('Google Sign-In Error:', err);
      if (err?.code === 'auth/popup-closed-by-user') {
        setError('การเข้าสู่ระบบถูกยกเลิก (ปิดหน้าต่างล็อกอินของ Google)');
      } else if (err?.code === 'auth/cancelled-popup-request') {
        // Request cancelled due to duplicate popup
      } else if (err?.message && err.message.includes('auth/unauthorized-domain')) {
        setError('auth/unauthorized-domain: โดเมนปัจจุบันยังไม่ได้เปิดอนุญาตในระบบความปลอดภัยของ Firebase');
      } else if (err?.message) {
        setError(err.message);
      } else {
        setError('เกิดข้อผิดพลาดในการเชื่อมต่อกับระบบ Google กรุณาลองใหม่อีกครั้ง');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCopyDomain = () => {
    navigator.clipboard.writeText(window.location.hostname);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isUnauthorizedDomainError = error.includes('auth/unauthorized-domain');

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center px-4 relative overflow-hidden py-12">
      {/* Decorative ambient background elements */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-amber-100 rounded-full blur-3xl opacity-40 pointer-events-none"></div>
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-slate-200 rounded-full blur-3xl opacity-60 pointer-events-none"></div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="w-full max-w-lg bg-white rounded-3xl border border-slate-100 shadow-xl p-8 md:p-10 z-10 my-8"
        id="login-card"
      >
        {/* App Logo / Heading */}
        <div className="text-center mb-8 flex flex-col items-center">
          <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center border border-amber-100 mb-4 shadow-sm">
            <Wheat className="w-9 h-9 text-amber-600" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">สุเมธค้าข้าว</h1>
          <p className="text-sm text-slate-500 font-medium mt-1">ระบบบริหารจัดการร้านค้าและจุดขาย (POS)</p>
        </div>

        {/* Info Card */}
        <div className="bg-amber-50/60 rounded-2xl p-4 border border-amber-100/80 mb-6">
          <div className="flex gap-3 items-start">
            <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-amber-900">กรอก Gmail ก่อนเข้าใช้งานทุกครั้ง</p>
              <p className="text-[11px] text-amber-800/80 mt-0.5 leading-relaxed">
                เพื่อระบุตัวตนพนักงาน/แอดมิน และลงบันทึกยอดขายแยกตามบัญชีผู้ใช้งานอย่างแม่นยำ
              </p>
            </div>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="bg-red-50 text-red-600 border border-red-100 text-xs font-semibold p-4 rounded-xl mb-6 text-center leading-relaxed">
            {error}
          </div>
        )}

        {/* Unauthorized Domain Guide */}
        {isUnauthorizedDomainError && (
          <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-5 mb-6 text-slate-800 text-xs">
            <div className="flex gap-2 items-center mb-3 text-amber-800 font-bold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>วิธีเปิดใช้งานระบบล็อกอินด้วย Gmail (สำหรับเจ้าของร้าน)</span>
            </div>
            
            <p className="text-[11px] text-slate-600 leading-relaxed mb-4">
              สาเหตุเกิดจากโดเมนของแอปนี้ยังไม่ได้รับอนุญาตในระบบรักษาความปลอดภัยของ Firebase โครงการของคุณ
            </p>

            <ol className="space-y-3 pl-1 text-[11px] font-medium text-slate-700 list-decimal list-inside">
              <li>
                คัดลอกโดเมนปัจจุบันของคุณด้านล่างนี้:
                <div className="mt-1.5 flex gap-1.5 items-center bg-white border border-slate-200 rounded-lg p-2 font-mono text-[10px] text-slate-800 shadow-sm">
                  <span className="flex-1 truncate font-semibold">{window.location.hostname}</span>
                  <button
                    onClick={handleCopyDomain}
                    className="p-1 text-slate-400 hover:text-slate-600 bg-slate-50 border border-slate-200 rounded cursor-pointer transition-all shrink-0"
                    title="คัดลอกโดเมน"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </li>
              <li>
                ไปที่หน้าตั้งค่าความปลอดภัยของ Firebase:
                <a
                  href="https://console.firebase.google.com/project/dev-apparatus-t2t1j/authentication/settings"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 bg-slate-900 hover:bg-slate-850 text-white px-2.5 py-1.5 rounded-lg text-[10px] font-bold shadow-sm transition-all cursor-pointer"
                >
                  <HelpCircle className="w-3 h-3" />
                  <span>เปิด Firebase Console (Authentication Settings)</span>
                </a>
              </li>
              <li>
                เลื่อนลงไปที่หัวข้อ <strong>"Authorized domains" (โดเมนที่ได้รับอนุญาต)</strong>
              </li>
              <li>
                คลิกปุ่ม <strong>"Add domain" (เพิ่มโดเมน)</strong> แล้ววางโดเมนที่คัดลอกมาลงไป
              </li>
              <li>
                กดรีเฟรชหน้านี้แล้วลองเข้าสู่ระบบด้วย Gmail อีกครั้งหนึ่งครับ!
              </li>
            </ol>
          </div>
        )}

        {/* Gmail Input Form & Google Login */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleGoogleLogin();
          }}
          className="flex flex-col gap-4"
        >
          {/* Gmail Input Field */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              ใส่อีเมล Gmail ของคุณก่อนเข้าใช้งาน
            </label>
            <div className="relative flex items-center">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
              <input
                type="text"
                value={gmailInput}
                onChange={(e) => setGmailInput(e.target.value)}
                placeholder="เช่น sumat3292@gmail.com หรือ Namsitang"
                className="w-full pl-10 pr-24 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all"
              />
              {!gmailInput.includes('@') && gmailInput.trim().length > 0 && (
                <span className="absolute right-3 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-md border border-amber-200/60 pointer-events-none">
                  @gmail.com
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400 mt-1 font-medium pl-1">
              * หากไม่พิมพ์ @gmail.com ระบบจะเติมให้อัตโนมัติ
            </p>
          </div>

          {/* Main Google Login Button */}
          <button
            type="submit"
            disabled={loading}
            className={`w-full flex items-center justify-center gap-3.5 bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 px-5 rounded-2xl shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer text-sm ${
              loading ? 'opacity-70 cursor-wait' : 'active:scale-[0.98]'
            }`}
            id="google-login-btn"
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>กำลังยืนยันตัวตนกับ Google...</span>
              </div>
            ) : (
              <>
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                  <g transform="matrix(1, 0, 0, 1, 0, 0)">
                    <path d="M21.35,11.1H12v2.7h5.38c-0.24,1.28 -0.96,2.37 -2.04,3.1l3.12,2.42c1.83,-1.69 2.89,-4.17 2.89,-7.12C21.35,11.97 21.27,11.51 21.35,11.1z" fill="#4285F4" />
                    <path d="M12,20.62c2.43,0 4.47,-0.81 5.96,-2.2l-3.12,-2.42c-0.86,0.58 -1.97,0.92 -2.84,0.92 -2.18,0 -4.03,-1.48 -4.69,-3.46L4.1,15.89c1.48,2.94 4.53,4.73 7.9,4.73z" fill="#34A853" />
                    <path d="M7.31,13.46c-0.17,-0.5 -0.27,-1.03 -0.27,-1.58s0.1,-1.08 0.27,-1.58L4.1,7.87c-0.57,1.14 -0.9,2.43 -0.9,3.79s0.33,2.65 0.9,3.79l3.21,-2.43z" fill="#FBBC05" />
                    <path d="M12,6.38c1.32,0 2.51,0.45 3.44,1.35l2.58,-2.58C16.46,3.67 14.42,2.88 12,2.88c-3.37,0 -6.42,1.79 -7.9,4.73l3.21,2.43c0.66,-1.98 2.51,-3.46 4.69,-3.46z" fill="#EA4335" />
                  </g>
                </svg>
                <span>เข้าสู่ระบบด้วย Gmail</span>
                <ArrowRight className="w-4 h-4 ml-auto opacity-60" />
              </>
            )}
          </button>
        </form>

        {/* Quick Select Admin Accounts */}
        <div className="mt-6 pt-5 border-t border-slate-100">
          <p className="text-[11px] font-bold text-slate-400 mb-2">เลือกบัญชีที่บันทึกไว้ได้อย่างรวดเร็ว:</p>
          <div className="flex flex-wrap gap-1.5">
            {['sumat3292@gmail.com', 'Namsitang@gmail.com', 'mathaza8@gmail.com'].map((email) => (
              <button
                key={email}
                type="button"
                onClick={() => {
                  setGmailInput(email);
                  handleGoogleLogin(email);
                }}
                className="text-[10px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200/80 px-2.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1 active:scale-95"
              >
                <Mail className="w-3 h-3 text-slate-400" />
                <span>{email}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Footer Brand */}
        <div className="text-center mt-8 text-slate-400 text-xs font-medium">
          ระบบร้านข้าวสารอัจฉริยะ &copy; {new Date().getFullYear()} สุเมธค้าข้าว
        </div>
      </motion.div>
    </div>
  );
}

