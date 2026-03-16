import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Toaster } from 'sonner';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AdminPanel from './pages/AdminPanel';
import CafeOrdering from './pages/CafeOrdering';
import KitchenDisplay from './pages/KitchenDisplay';
import './App.css';

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
            
            <Route path="/cafe/:cafeId" element={<CafeOrdering />} />

            {/* Feature 4: Kitchen Display System — public URL, staff open on tablet */}
            <Route path="/kitchen/:cafeId" element={<KitchenDisplay />} />
            
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
