import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Toaster } from 'sonner';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AdminPanel from './pages/AdminPanel';
import CafeOrdering from './pages/CafeOrdering';
import CafeOrderingPremium from './pages/CafeOrderingPremium';
import KitchenDisplay from './pages/KitchenDisplay';
import InvoicePage from './pages/InvoicePage';
import OrderTracking from './pages/OrderTracking';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './lib/firebase';
import './App.css';

// ── Smart router — loads Basic or Premium page based on cafe.planType ─────────
const CafeOrderingRouter = () => {
  const { cafeId } = useParams();
  const [planType, setPlanType] = useState(null);
  const [checked,  setChecked ] = useState(false);

  useEffect(() => {
    if (!cafeId) { setChecked(true); return; }
    const unsub = onSnapshot(
      doc(db, 'cafes', cafeId),
      (snap) => {
        setPlanType(snap.exists() ? (snap.data().planType || 'basic') : 'basic');
        setChecked(true);
      },
      () => { setPlanType('basic'); setChecked(true); }
    );
    return () => unsub();
  }, [cafeId]);

  if (!checked) return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-4 border-[#D4AF37]/30 border-t-[#D4AF37] animate-spin" />
    </div>
  );

  return planType === 'premium' ? <CafeOrderingPremium /> : <CafeOrdering />;
};

const RoleBasedRedirect = () => {
  const { userRole, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="text-[#D4AF37] text-xl font-semibold">Loading...</div>
      </div>
    );
  }

  if (userRole === 'admin') return <Navigate to="/admin" replace />;
  if (userRole === 'cafe') return <Navigate to="/dashboard" replace />;
  if (userRole === 'partner') return <Navigate to="/partner" replace />;
  
  return <Navigate to="/login" replace />;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<RoleBasedRedirect />} />
            
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute allowedRoles={['cafe']}>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminPanel />
                </ProtectedRoute>
              }
            />
            
            <Route path="/cafe/:cafeId" element={<CafeOrderingRouter />} />

            {/* Feature 4: Kitchen Display System — public URL, staff open on tablet */}
            <Route path="/kitchen/:cafeId" element={<KitchenDisplay />} />

            {/* Feature 3: Public Invoice Page — no auth required */}
            <Route path="/invoice/:invoiceId" element={<InvoicePage />} />

            {/* Task 7: Customer order tracking — real-time status */}
            <Route path="/track/:orderId" element={<OrderTracking />} />
            
            <Route
              path="/unauthorized"
              element={
                <div className="min-h-screen bg-[#050505] flex items-center justify-center">
                  <div className="text-center">
                    <h1 className="text-4xl font-bold text-red-500 mb-4">Unauthorized</h1>
                    <p className="text-[#A3A3A3]">You don't have permission to access this page.</p>
                  </div>
                </div>
              }
            />
            
            <Route
              path="*"
              element={
                <div className="min-h-screen bg-[#050505] flex items-center justify-center">
                  <div className="text-center">
                    <h1 className="text-4xl font-bold text-[#D4AF37] mb-4">404 - Not Found</h1>
                    <p className="text-[#A3A3A3]">The page you're looking for doesn't exist.</p>
                  </div>
                </div>
              }
            />
          </Routes>
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: '#0F0F0F',
                color: '#E5E5E5',
                border: '1px solid rgba(255,255,255,0.1)',
              },
            }}
          />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
