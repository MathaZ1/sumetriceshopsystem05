import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
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

  // Check if system has already been initialized (seeded once)
  try {
    const initDocRef = doc(db, 'system', 'initialized');
    const initDocSnap = await getDoc(initDocRef);
    if (initDocSnap.exists()) {
      console.log('Database already initialized. Skipping seedInitialData.');
      return;
    }
  } catch (error) {
    console.warn('Skipping seedInitialData: failed to read system initialization doc', error);
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
      console.log('Seeding initial products for Sumeth Rice Shop...');
      const initialProducts = [
        {
          id: '10292',
          name: '107 อาหารสัตว์',
          category: 'อาหารสัตว์',
          price: 500.00,
          stock: 999999,
          imageUrl: 'https://images.unsplash.com/photo-1589923188900-85dae523342b?auto=format&fit=crop&q=80&w=400',
          status: 'พร้อมขาย'
        },
        {
          id: '10386',
          name: '114 อาหารสัตว์',
          category: 'อาหารสัตว์',
          price: 520.00,
          stock: 999999,
          imageUrl: 'https://images.unsplash.com/photo-1589923188900-85dae523342b?auto=format&fit=crop&q=80&w=400',
          status: 'พร้อมขาย'
        },
        {
          id: '10515',
          name: '285 (กลม)',
          category: 'เครื่องดื่ม',
          price: 260.00,
          stock: 999999,
          imageUrl: 'https://images.unsplash.com/photo-1527061011665-3652c757a4d4?auto=format&fit=crop&q=80&w=400',
          status: 'พร้อมขาย'
        },
        {
          id: '10516',
          name: '285 (ลัง)',
          category: 'เครื่องดื่ม',
          price: 3120.00,
          stock: 999999,
          imageUrl: 'https://images.unsplash.com/photo-1527061011665-3652c757a4d4?auto=format&fit=crop&q=80&w=400',
          status: 'พร้อมขาย'
        },
        {
          id: '10461',
          name: '4มงกุฎ (15กก)',
          category: 'ข้าวสาร',
          price: 605.00,
          stock: 999999,
          imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&q=80&w=400',
          status: 'พร้อมขาย'
        },
        {
          id: '10621',
          name: '4มงกุฎ (40kg)',
          category: 'ข้าวสาร',
          price: 1610.00,
          stock: 999999,
          imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&q=80&w=400',
          status: 'พร้อมขาย'
        },
        {
          id: '10355',
          name: '4มงกุฎ (5กก)',
          category: 'ข้าวสาร',
          price: 2050.00,
          stock: 999999,
          imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&q=80&w=400',
          status: 'พร้อมขาย'
        },
        {
          id: '10274',
          name: '9920 ดุกเล็ก อาหารสัตว์',
          category: 'อาหารสัตว์',
          price: 520.00,
          stock: 999999,
          imageUrl: 'https://images.unsplash.com/photo-1589923188900-85dae523342b?auto=format&fit=crop&q=80&w=400',
          status: 'พร้อมขาย'
        },
        {
          id: '10275',
          name: '9921 ดุกกลาง อาหารสัตว์',
          category: 'อาหารสัตว์',
          price: 500.00,
          stock: 999999,
          imageUrl: 'https://images.unsplash.com/photo-1589923188900-85dae523342b?auto=format&fit=crop&q=80&w=400',
          status: 'พร้อมขาย'
        },
        {
          id: '10276',
          name: '9922 ดุกใหญ่ อาหารสัตว์',
          category: 'อาหารสัตว์',
          price: 480.00,
          stock: 999999,
          imageUrl: 'https://images.unsplash.com/photo-1589923188900-85dae523342b?auto=format&fit=crop&q=80&w=400',
          status: 'พร้อมขาย'
        },
        {
          id: '10329',
          name: '9931 กินพืชเล็ก อาหารสัตว์',
          category: 'อาหารสัตว์',
          price: 420.00,
          stock: 999999,
          imageUrl: 'https://images.unsplash.com/photo-1589923188900-85dae523342b?auto=format&fit=crop&q=80&w=400',
          status: 'พร้อมขาย'
        },
        {
          id: '10408',
          name: '9933. กินพืชใหญ่ อาหารสัตว์',
          category: 'อาหารสัตว์',
          price: 380.00,
          stock: 999999,
          imageUrl: 'https://images.unsplash.com/photo-1589923188900-85dae523342b?auto=format&fit=crop&q=80&w=400',
          status: 'พร้อมขาย'
        },
        {
          id: '10352',
          name: 'A+ ขวด (ปลีก)',
          category: 'บุหรี่ / ยาเส้น / ใบจาก',
          price: 60.00,
          stock: 999999,
          imageUrl: 'https://images.unsplash.com/photo-1527061011665-3652c757a4d4?auto=format&fit=crop&q=80&w=400',
          status: 'พร้อมขาย'
        },
        {
          id: '10233',
          name: 'A+ (10ขวด)',
          category: 'เครื่องดื่ม',
          price: 500.00,
          stock: 999999,
          imageUrl: 'https://images.unsplash.com/photo-1527061011665-3652c757a4d4?auto=format&fit=crop&q=80&w=400',
          status: 'พร้อมขาย'
        },
        {
          id: '10430',
          name: 'A+ ลัง',
          category: 'เครื่องดื่ม',
          price: 2400.00,
          stock: 999999,
          imageUrl: 'https://images.unsplash.com/photo-1527061011665-3652c757a4d4?auto=format&fit=crop&q=80&w=400',
          status: 'พร้อมขาย'
        },
        {
          id: '10026',
          name: 'M-150',
          category: 'เครื่องดื่ม',
          price: 510.00,
          stock: 999999,
          imageUrl: 'https://images.unsplash.com/photo-1527061011665-3652c757a4d4?auto=format&fit=crop&q=80&w=400',
          status: 'พร้อมขาย'
        },
        {
          id: '10302',
          name: 'M-150 แพค',
          category: 'เครื่องดื่ม',
          price: 105.00,
          stock: 999999,
          imageUrl: 'https://images.unsplash.com/photo-1527061011665-3652c757a4d4?auto=format&fit=crop&q=80&w=400',
          status: 'พร้อมขาย'
        },
        {
          id: '10470',
          name: 'กข43',
          category: 'ข้าวสาร',
          price: 205.00,
          stock: 999999,
          imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&q=80&w=400',
          status: 'พร้อมขาย'
        },
        {
          id: '10213',
          name: 'กระต่าย (15M)',
          category: 'ข้าวสาร',
          price: 380.00,
          stock: 999999,
          imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&q=80&w=400',
          status: 'พร้อมขาย'
        },
        {
          id: '10226',
          name: 'กระต่าย (ใหญ่)',
          category: 'ข้าวสาร',
          price: 960.00,
          stock: 999999,
          imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&q=80&w=400',
          status: 'พร้อมขาย'
        },
        {
          id: '10225',
          name: 'กวาง (ใหญ่)',
          category: 'ข้าวสาร',
          price: 860.00,
          stock: 999999,
          imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&q=80&w=400',
          status: 'พร้อมขาย'
        },
        {
          id: '10695',
          name: 'กวาง 15กกเหลือง',
          category: 'ข้าวสาร',
          price: 310.00,
          stock: 999999,
          imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&q=80&w=400',
          status: 'พร้อมขาย'
        },
        {
          id: '10102',
          name: 'กินดี 20กก',
          category: 'ข้าวสาร',
          price: 580.00,
          stock: 999999,
          imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&q=80&w=400',
          status: 'พร้อมขาย'
        },
        {
          id: '10696',
          name: 'กุหลาบ 5กก',
          category: 'ข้าวสาร',
          price: 108.00,
          stock: 999999,
          imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&q=80&w=400',
          status: 'พร้อมขาย'
        },
        {
          id: '10825',
          name: 'กุหลาบ 5กก (มัด)',
          category: 'ข้าวสาร',
          price: 580.00,
          stock: 999999,
          imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&q=80&w=400',
          status: 'พร้อมขาย'
        },
        {
          id: '10032',
          name: 'ข้าวหอมใหญ่',
          category: 'ข้าวสาร',
          price: 1130.00,
          stock: 999999,
          imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&q=80&w=400',
          status: 'พร้อมขาย'
        },
        {
          id: '10163',
          name: 'ขุนศึก (5M) มัด',
          category: 'ข้าวสาร',
          price: 1930.00,
          stock: 999999,
          imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&q=80&w=400',
          status: 'พร้อมขาย'
        },
        {
          id: '10810',
          name: 'ขุนศึก 15กก ส้ม',
          category: 'ข้าวสาร',
          price: 570.00,
          stock: 999999,
          imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&q=80&w=400',
          status: 'พร้อมขาย'
        },
        {
          id: '10002',
          name: 'ขุนศึก 40กก',
          category: 'ข้าวสาร',
          price: 1430.00,
          stock: 999999,
          imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&q=80&w=400',
          status: 'พร้อมขาย'
        },
        {
          id: '10014',
          name: 'สำรับแดง (15M)',
          category: 'ข้าวสาร',
          price: 620.00,
          stock: 999999,
          imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&q=80&w=400',
          status: 'พร้อมขาย'
        },
        {
          id: '10001',
          name: 'สำรับแดง (ใหญ่)',
          category: 'ข้าวสาร',
          price: 1650.00,
          stock: 999999,
          imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&q=80&w=400',
          status: 'พร้อมขาย'
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

    // Mark as initialized
    await setDoc(doc(db, 'system', 'initialized'), { initialized: true });
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
