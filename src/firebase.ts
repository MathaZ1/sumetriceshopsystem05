import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  getFirestore,
  collection,
  getDocs,
  setDoc,
  doc,
  initializeFirestore,
  query,
  orderBy,
  limit
} from 'firebase/firestore';

// Import config directly from the root to ensure proper, dynamically-provisioned IDs are used
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Initialize Firestore with custom database ID from config
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Seed Initial Data function
export async function seedInitialData() {
  if (!auth.currentUser) {
    console.log('Skipping seedInitialData: User is not authenticated yet.');
    return;
  }

  const productsColPath = 'products';
  let productsSnap;
  try {
    const productsCol = collection(db, productsColPath);
    productsSnap = await getDocs(productsCol);
  } catch (error) {
    console.warn('Skipping initial products seeding read:', error);
    return;
  }

  try {
    if (productsSnap.empty) {
      console.log('Seeding initial products...');
      const initialProducts = [
        {
          id: 'PRD-001',
          name: 'น้ำดื่ม ตราสิงห์ 600มล.',
          category: 'เครื่องดื่ม',
          price: 10,
          stock: 145,
          imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB1JFPcKEmeEisqL6gEbsd1PIZsfqpY8kNHnapz9unXEjRawKoLCd6pEkWlp7S2gbHHUEvhdDidezOnXqJ8m7frAMTPDa3XGyx7PiSiaE74YwaLQea2sxjHRAW3utkZTrhp7eW45WXdwMAKKXeHnJ-Vy3cfDlJPFV2YYFnUeCBWsx_uZfsp3j-_QdivRK41eGxoOuLlENYP4t_MMb3vf8nzJUukji0LKvXXrLHWD1za1_FD28rNvMQuTj1xrlx3o6_gtbOrtAcL5Gs',
          status: 'พร้อมขาย'
        },
        {
          id: 'PRD-002',
          name: 'เลย์ รสมันฝรั่งแท้ 50กรัม',
          category: 'ขนม',
          price: 20,
          stock: 12,
          imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA1GjzrwIGCHFuO5y-p_UGo-tgtpxbTQRtjkX-dvFS8LHxlVjbCkY-ouh2mGsyyrH4LrgOO4a-sIQMJOnjpKU9xkMTGkxsepsx8UsQg8CpFt-1MAYDth--JIR799n06YlWgo1KJdTEBTBXA9wPDVoj7kkw_gQ8a6L1Kw88_SXx9VtM1Q-Trn6wcw2ou9U4N0pn_fgI-WouepT8eTBWvGTlbjDSJmF3vECjBX_zu9jMR4zpeRQ10UUZgLWHkCOIbfHdGpK1VihCHLRg',
          status: 'ใกล้หมด'
        },
        {
          id: 'PRD-003',
          name: 'ผงซักฟอก บรีส 1000กรัม',
          category: 'ของใช้',
          price: 85,
          stock: 30,
          imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDrlwV4uIcsl6hKdc1eqbIPkp3Pq9rc7lpYci9hA8XjTLKcOhNNAiSUH_eF-Njjtqa3qrXurHzW0mLsls7-c1k5gsbaI62YF2coEV7HgG2Xi_nzRbMweQhjPwFpkJJ8nmruf5O1mkmAuzJ5PSb0KazUiW3mocdsdmm7QK9OHJY3eOgYMxzZkHrYfDd16bXuzxQGoSlAhgUThv8kK_JjHDJx3GJZVC-h7Zl_ZPgvf1RPUdVAllk1bB70cK7jXHA9lF5_a7En_PMqj3g',
          status: 'พร้อมขาย'
        },
        {
          id: 'PRD-004',
          name: 'เครื่องดื่มชูกำลัง กระทิงแดง',
          category: 'เครื่องดื่ม',
          price: 12,
          stock: 80,
          imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCee84rRJzMaFlx9316TQ9nhfmxesA3N0IM9kVl3LOKMHYVv1xsMBODQ2fOeVphP3O_9QdYTTTl3lxr2w-x8WpF_1AAy29UIV3X5J9EnOJFA54cw_ITX5yocw6xFapCfTEBD9eG5FHFLS3mWj5zXuo94SUT-ah0fCMWnN0Is42QPEJlF7tezS5cgCZg8EtbF8Hh2Kftva016yPu73RLH9b8gtnnX-iynvIcdnZJXORRG_TsV-07ewNjNJBBlIaGw5mglUhl5ZIAetM',
          status: 'พร้อมขาย'
        },
        {
          id: 'PRD-005',
          name: 'มาม่า รสต้มยำกุ้ง 55กรัม',
          category: 'ขนม',
          price: 6,
          stock: 0,
          imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCvbSwX3e683WE2_QIb943ayVYFP6Lirs39lSRHRQKj67gxBEyFFl02AtHDxFPB-bFrjziS-zYzgvJioSIZpxbkHBngnzFhPiYRw6cozBtypJL758seMn8HE8a0uCoiEEL6IJCYYeEnmlCH0-4eH_Jm9NIJRRpH2GPgPGxQW8ZQLE9KRtODz_lCMi3nY3pVrmxbcUuhWwCGuwKhsytb_oVp4Xzlv1T0wwAvjJaODV2p4Ca27F4h_aVbSdIC4-HW9wYaNTHhIfRKfY8',
          status: 'หมดสต็อก'
        }
      ];

      for (const p of initialProducts) {
        const productsCol = collection(db, productsColPath);
        await setDoc(doc(productsCol, p.id), p);
      }
    }
  } catch (error) {
    console.warn('Skipping products seeding write:', error);
    return;
  }

  const salesColPath = 'sales';
  let salesSnap;
  try {
    const salesCol = collection(db, salesColPath);
    salesSnap = await getDocs(salesCol);
  } catch (error) {
    console.warn('Skipping initial sales seeding read:', error);
    return;
  }

  try {
    if (salesSnap.empty) {
      console.log('Seeding initial sales transactions...');
      const baseDate = new Date();
      
      const initialSales = [
        {
          id: 'INV-00124',
          timestamp: new Date(baseDate.getTime() - 1000 * 60 * 15).toISOString(), // 15 mins ago
          employee: 'สมชาย ร.',
          total: 1250,
          status: 'สำเร็จ',
          items: [
            { productId: 'PRD-003', name: 'ผงซักฟอก บรีส 1000กรัม', price: 85, quantity: 10, subtotal: 850 },
            { productId: 'PRD-002', name: 'เลย์ รสมันฝรั่งแท้ 50กรัม', price: 20, quantity: 20, subtotal: 400 }
          ]
        },
        {
          id: 'INV-00123',
          timestamp: new Date(baseDate.getTime() - 1000 * 60 * 32).toISOString(), // 32 mins ago
          employee: 'สมหญิง ด.',
          total: 450,
          status: 'สำเร็จ',
          items: [
            { productId: 'PRD-001', name: 'น้ำดื่ม ตราสิงห์ 600มล.', price: 10, quantity: 45, subtotal: 450 }
          ]
        },
        {
          id: 'INV-00122',
          timestamp: new Date(baseDate.getTime() - 1000 * 60 * 67).toISOString(), // ~1 hr ago
          employee: 'สมชาย ร.',
          total: 2890,
          status: 'สำเร็จ',
          items: [
            { productId: 'PRD-003', name: 'ผงซักฟอก บรีส 1000กรัม', price: 85, quantity: 34, subtotal: 2890 }
          ]
        },
        {
          id: 'INV-00121',
          timestamp: new Date(baseDate.getTime() - 1000 * 60 * 97).toISOString(), // ~1.5 hr ago
          employee: 'วิภา จ.',
          total: 150,
          status: 'ยกเลิก',
          items: [
            { productId: 'PRD-001', name: 'น้ำดื่ม ตราสิงห์ 600มล.', price: 10, quantity: 15, subtotal: 150 }
          ]
        },
        {
          id: 'INV-00120',
          timestamp: new Date(baseDate.getTime() - 1000 * 60 * 140).toISOString(), // ~2.3 hr ago
          employee: 'สมชาย ร.',
          total: 890,
          status: 'สำเร็จ',
          items: [
            { productId: 'PRD-002', name: 'เลย์ รสมันฝรั่งแท้ 50กรัม', price: 20, quantity: 40, subtotal: 800 },
            { productId: 'PRD-004', name: 'เครื่องดื่มชูกำลัง กระทิงแดง', price: 12, quantity: 7, subtotal: 84,  }
          ]
        }
      ];

      for (const s of initialSales) {
        const salesCol = collection(db, salesColPath);
        await setDoc(doc(salesCol, s.id), s);
      }
    }
  } catch (error) {
    console.warn('Skipping initial sales seeding write:', error);
    return;
  }
}

// ฟังก์ชันหาเลขที่ใบเสร็จถัดไปโดยอิงจาก Firestore เพื่อให้เชื่อมโยงกันทุกเครื่องและพนักงานสามารถออกบิลได้ต่อเนื่อง
export async function getNextInvoiceNumber(): Promise<string> {
  try {
    const salesCol = collection(db, 'sales');
    // ดึงรายการล่าสุด 100 รายการเพื่อหาเลขสูงสุด (ป้องกันกรณี timestamp ไม่ตรง)
    const q = query(salesCol, orderBy('timestamp', 'desc'), limit(100));
    const querySnapshot = await getDocs(q);
    
    let maxSeq = 123; // เริ่มต้นที่ 124 เพื่อให้ล้อกับเดโม (เช่น INV-00123)
    querySnapshot.forEach((docSnap) => {
      const idStr = docSnap.id; // เช่น "INV-00124" หรือ "000124"
      // ดึงเฉพาะตัวเลขออกมา
      const numPart = idStr.replace(/[^0-9]/g, '');
      const seq = parseInt(numPart, 10);
      if (!isNaN(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    });
    
    const nextSeq = maxSeq + 1;
    return String(nextSeq).padStart(6, '0');
  } catch (err) {
    console.error('Error getting next invoice number:', err);
    // หากเกิดข้อผิดพลาด ให้ใช้ timestamp เพื่อไม่ให้ซ้ำกัน
    const timestampSeq = Math.floor(Date.now() / 1000) % 1000000;
    return String(timestampSeq).padStart(6, '0');
  }
}
