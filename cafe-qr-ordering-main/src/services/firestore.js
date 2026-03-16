// Firestore Service
// Handles all database operations

import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  serverTimestamp,
  runTransaction
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';

// ============ CAFE OPERATIONS ============

/**
 * Get cafe by ID
 */
export const getCafe = async (cafeId) => {
  try {
    const docSnap = await getDoc(doc(db, 'cafes', cafeId));
    if (docSnap.exists()) {
      return { data: { id: docSnap.id, ...docSnap.data() }, error: null };
    }
    return { data: null, error: 'Cafe not found' };
  } catch (error) {
    return { data: null, error: error.message };
  }
};

/**
 * Subscribe to cafe updates
 */
export const subscribeToCafe = (cafeId, callback) => {
  return onSnapshot(doc(db, 'cafes', cafeId), (docSnap) => {
    if (docSnap.exists()) {
      callback({ id: docSnap.id, ...docSnap.data() });
    } else {
      callback(null);
    }
  });
};

/**
 * Update cafe settings
 */
export const updateCafe = async (cafeId, data) => {
  try {
    await updateDoc(doc(db, 'cafes', cafeId), {
      ...data,
      updatedAt: serverTimestamp()
    });
    return { error: null };
  } catch (error) {
    return { error: error.message };
  }
};

/**
 * Get all cafes (admin)
 */
export const getAllCafes = async () => {
  try {
    const snapshot = await getDocs(collection(db, 'cafes'));
    const cafes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return { data: cafes, error: null };
  } catch (error) {
    return { data: [], error: error.message };
  }
};

/**
 * Create new cafe (admin)
 */
export const createCafe = async (cafeData) => {
  try {
    const docRef = await addDoc(collection(db, 'cafes'), {
      ...cafeData,
      primaryColor: '#D4AF37',
      mode: 'light',
      createdAt: serverTimestamp()
    });
    return { id: docRef.id, error: null };
  } catch (error) {
    return { id: null, error: error.message };
  }
};

// ============ MENU OPERATIONS ============

/**
 * Subscribe to menu items
 */
export const subscribeToMenuItems = (cafeId, callback) => {
  const q = query(
    collection(db, 'menuItems'),
    where('cafeId', '==', cafeId)
  );
  
  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(item => item.available !== false);
    callback(items);
  });
};

/**
 * Add menu item
 */
export const addMenuItem = async (itemData) => {
  try {
    const docRef = await addDoc(collection(db, 'menuItems'), {
      ...itemData,
      available: true,
      createdAt: serverTimestamp()
    });
    return { id: docRef.id, error: null };
  } catch (error) {
    return { id: null, error: error.message };
  }
};

/**
 * Update menu item
 */
export const updateMenuItem = async (itemId, data) => {
  try {
    await updateDoc(doc(db, 'menuItems', itemId), data);
    return { error: null };
  } catch (error) {
    return { error: error.message };
  }
};

/**
 * Delete menu item
 */
export const deleteMenuItem = async (itemId) => {
  try {
    await deleteDoc(doc(db, 'menuItems', itemId));
    return { error: null };
  } catch (error) {
    return { error: error.message };
  }
};

// ============ ORDER OPERATIONS ============

/**
 * Create order with sequential number
 */
export const createOrder = async (orderData) => {
  try {
    const counterRef = doc(db, 'system', 'counters');
    let orderNumber;
    
    await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      
      if (!counterDoc.exists()) {
        orderNumber = 1;
        transaction.set(counterRef, { currentOrderNumber: 1 });
      } else {
        orderNumber = (counterDoc.data().currentOrderNumber || 0) + 1;
        transaction.update(counterRef, { currentOrderNumber: orderNumber });
      }
    });

    const docRef = await addDoc(collection(db, 'orders'), {
      ...orderData,
      orderNumber,
      orderStatus: 'new',
      createdAt: serverTimestamp()
    });
    
    return { 
      id: docRef.id, 
      orderNumber: String(orderNumber).padStart(3, '0'), 
      error: null 
    };
  } catch (error) {
    return { id: null, orderNumber: null, error: error.message };
  }
};

/**
 * Subscribe to orders
 */
export const subscribeToOrders = (cafeId, callback) => {
  const q = query(
    collection(db, 'orders'),
    where('cafeId', '==', cafeId)
  );
  
  return onSnapshot(q, (snapshot) => {
    const orders = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        const aTime = a.createdAt?.toDate?.() || new Date(0);
        const bTime = b.createdAt?.toDate?.() || new Date(0);
        return bTime - aTime;
      });
    callback(orders);
  });
};

/**
 * Update order status
 */
export const updateOrderStatus = async (orderId, status) => {
  try {
    await updateDoc(doc(db, 'orders', orderId), { 
      orderStatus: status,
      updatedAt: serverTimestamp()
    });
    return { error: null };
  } catch (error) {
    return { error: error.message };
  }
};

// ============ OFFERS OPERATIONS ============

/**
 * Subscribe to offers
 */
export const subscribeToOffers = (cafeId, callback, activeOnly = true) => {
  const q = query(
    collection(db, 'offers'),
    where('cafeId', '==', cafeId)
  );
  
  return onSnapshot(q, (snapshot) => {
    let offers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (activeOnly) {
      offers = offers.filter(offer => offer.active === true);
    }
    callback(offers);
  });
};

/**
 * Add offer
 */
export const addOffer = async (offerData) => {
  try {
    const docRef = await addDoc(collection(db, 'offers'), {
      ...offerData,
      createdAt: serverTimestamp()
    });
    return { id: docRef.id, error: null };
  } catch (error) {
    return { id: null, error: error.message };
  }
};

/**
 * Update offer
 */
export const updateOffer = async (offerId, data) => {
  try {
    await updateDoc(doc(db, 'offers', offerId), data);
    return { error: null };
  } catch (error) {
    return { error: error.message };
  }
};

/**
 * Delete offer
 */
export const deleteOffer = async (offerId) => {
  try {
    await deleteDoc(doc(db, 'offers', offerId));
    return { error: null };
  } catch (error) {
    return { error: error.message };
  }
};

// ============ STORAGE OPERATIONS ============

/**
 * Upload file to storage
 */
export const uploadFile = async (path, file, onProgress) => {
  try {
    const storageRef = ref(storage, path);
    const uploadTask = uploadBytesResumable(storageRef, file);

    const url = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        uploadTask.cancel();
        reject(new Error('Upload timed out'));
      }, 30000);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          if (onProgress) {
            onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
          }
        },
        (error) => { clearTimeout(timeout); reject(error); },
        async () => {
          clearTimeout(timeout);
          try { resolve(await getDownloadURL(uploadTask.snapshot.ref)); }
          catch (err) { reject(err); }
        }
      );
    });

    return { url, error: null };
  } catch (error) {
    return { url: null, error: error.message };
  }
};
