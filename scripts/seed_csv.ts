import { initializeApp } from 'firebase/app';
import { getFirestore, doc, writeBatch, setDoc } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

// Import Firebase config
import firebaseConfig from '../firebase-applet-config.json' assert { type: 'json' };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

async function run() {
  console.log('Starting CSV seeding with writeBatch...');
  const csvPath = path.join(process.cwd(), 'src/data/products.csv');
  if (!fs.existsSync(csvPath)) {
    console.error('CSV file not found at:', csvPath);
    process.exit(1);
  }

  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split(/\r?\n/);
  
  const batch = writeBatch(db);
  let count = 0;
  let skippedCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseCSVLine(line);
    if (cols.length < 3) continue;

    const sku = cols[1];
    const name = cols[2];
    const category = cols[3] || 'ทั่วไป';
    const priceStr = cols[18];

    // Skip placeholder lines
    if (!sku || sku === 'SKU' || name === '...' || !name) {
      skippedCount++;
      continue;
    }

    let price = 0;
    if (priceStr && priceStr.toLowerCase() !== 'variable') {
      const parsedPrice = parseFloat(priceStr.replace(/,/g, ''));
      if (!isNaN(parsedPrice)) {
        price = parsedPrice;
      }
    }

    // Determine category-specific image
    let imageUrl = 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=400';
    if (category.includes('ข้าวสาร')) {
      imageUrl = 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&q=80&w=400';
    } else if (category.includes('เครื่องดื่ม')) {
      imageUrl = 'https://images.unsplash.com/photo-1527061011665-3652c757a4d4?auto=format&fit=crop&q=80&w=400';
    } else if (category.includes('อาหารสัตว์')) {
      imageUrl = 'https://images.unsplash.com/photo-1589923188900-85dae523342b?auto=format&fit=crop&q=80&w=400';
    } else if (category.includes('บุหรี่') || category.includes('ยาเส้น') || category.includes('ใบจาก')) {
      imageUrl = 'https://images.unsplash.com/photo-1527061011665-3652c757a4d4?auto=format&fit=crop&q=80&w=400';
    }

    const productDoc = {
      id: sku,
      name,
      category,
      price,
      stock: 999999, // infinite stock
      imageUrl,
      status: 'พร้อมขาย'
    };

    batch.set(doc(db, 'products', sku), productDoc);
    count++;
  }

  if (count > 0) {
    try {
      console.log(`Committing batch of ${count} products to Firestore...`);
      await batch.commit();
      console.log(`Successfully committed batch of ${count} products.`);
    } catch (err) {
      console.error('Error committing batch:', err);
      process.exit(1);
    }
  }

  // Mark initialized in firestore so seedInitialData doesn't overwrite
  try {
    await setDoc(doc(db, 'system', 'initialized'), { initialized: true });
    console.log('Marked database as initialized.');
  } catch (err) {
    console.error('Error marking initialized:', err);
  }

  console.log(`Seeding complete! Successfully seeded ${count} products, skipped ${skippedCount} items.`);
}

run().catch(console.error);
