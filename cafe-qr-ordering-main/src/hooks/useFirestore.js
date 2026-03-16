import { useState, useEffect, useRef } from 'react';
import { collection, query, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';

/**
 * Real-time Firestore collection listener
 * Uses onSnapshot for instant updates when documents change
 */
export const useCollection = (collectionName, constraints = []) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Store constraints in ref to avoid re-creating listener on every render
  const constraintsRef = useRef(constraints);
  const unsubscribeRef = useRef(null);
  const isFirstMount = useRef(true);

  // Update ref when constraints change (compare by stringifying)
  const constraintsKey = JSON.stringify(constraints.map(c => c.toString()));
  
  useEffect(() => {
    // Update constraints ref
    constraintsRef.current = constraints;
    
    // Clean up previous listener
    if (unsubscribeRef.current) {
      console.log(`[Firestore] Cleaning up previous listener for: ${collectionName}`);
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    // Don't set up listener without collection name
    if (!collectionName) {
      setLoading(false);
      return;
    }

    console.log(`[Firestore] Setting up REAL-TIME listener for: ${collectionName}`);
    console.log(`[Firestore] Constraints count: ${constraints.length}`);

    try {
      const collectionRef = collection(db, collectionName);
      const q = constraints.length > 0 
        ? query(collectionRef, ...constraints) 
        : collectionRef;

      // Set up real-time listener with onSnapshot
      const unsubscribe = onSnapshot(
        q, 
        (snapshot) => {
          const documents = snapshot.docs.map(docSnap => ({ 
            id: docSnap.id, 
            ...docSnap.data() 
          }));
          
          console.log(`[Firestore] ${collectionName}: Received ${documents.length} documents (real-time update)`);
          
          // Log changes for debugging
          if (!isFirstMount.current) {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'added') {
                console.log(`[Firestore] ✅ NEW: ${collectionName} document added:`, change.doc.id);
              }
              if (change.type === 'modified') {
                console.log(`[Firestore] 📝 MODIFIED: ${collectionName} document updated:`, change.doc.id);
              }
              if (change.type === 'removed') {
                console.log(`[Firestore] ❌ REMOVED: ${collectionName} document deleted:`, change.doc.id);
              }
            });
          }
          isFirstMount.current = false;
          
          setData(documents);
          setLoading(false);
          setError(null);
        }, 
        (err) => {
          console.error(`[Firestore] ❌ Error in ${collectionName}:`, err.code, err.message);
          setError(err.message);
          setLoading(false);
        }
      );

      unsubscribeRef.current = unsubscribe;
      console.log(`[Firestore] ✅ Real-time listener ACTIVE for: ${collectionName}`);

    } catch (err) {
      console.error(`[Firestore] ❌ Error setting up listener for ${collectionName}:`, err);
      setError(err.message);
      setLoading(false);
    }

    // Cleanup function
    return () => {
      console.log(`[Firestore] Cleaning up listener for: ${collectionName}`);
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionName, constraintsKey]);

  return { data, loading, error };
};

/**
 * Real-time Firestore document listener
 * Uses onSnapshot for instant updates when the document changes
 */
export const useDocument = (collectionName, documentId) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const unsubscribeRef = useRef(null);

  useEffect(() => {
    // Clean up previous listener
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    if (!documentId || !collectionName) {
      setData(null);
      setLoading(false);
      return;
    }

    console.log(`[Firestore] Setting up document listener for: ${collectionName}/${documentId}`);

    try {
      const unsubscribe = onSnapshot(
        doc(db, collectionName, documentId),
        (docSnap) => {
          if (docSnap.exists()) {
            const documentData = { id: docSnap.id, ...docSnap.data() };
            console.log(`[Firestore] Document ${collectionName}/${documentId} updated`);
            setData(documentData);
          } else {
            console.log(`[Firestore] Document ${collectionName}/${documentId} does not exist`);
            setData(null);
          }
          setLoading(false);
          setError(null);
        },
        (err) => {
          console.error(`[Firestore] Document error for ${collectionName}/${documentId}:`, err);
          setError(err.message);
          setLoading(false);
        }
      );

      unsubscribeRef.current = unsubscribe;

    } catch (err) {
      console.error(`[Firestore] Error setting up document listener:`, err);
      setError(err.message);
      setLoading(false);
    }

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [collectionName, documentId]);

  return { data, loading, error };
};
