/**
 * StaffManagement.jsx
 * Main Staff Management dashboard — tab-based navigation between
 * Staff List, Attendance, and Salary views.
 * Isolated module — no existing code touched.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useDocument } from '../../hooks/useFirestore';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, CalendarCheck, IndianRupee, UserPlus, Lock } from 'lucide-react';
import StaffList from './staff/StaffList';
import AttendanceDashboard from './staff/AttendanceDashboard';
import SalaryDashboard from './staff/SalaryDashboard';
import { useTheme } from '../../hooks/useTheme';

const TABS = [
  { id: 'staff',      label: 'Staff',      icon: Users         },
  { id: 'attendance', label: 'Attendance', icon: CalendarCheck  },
  { id: 'salary',     label: 'Salary',     icon: IndianRupee    },
];

const StaffManagement = () => {
  const { user }   = useAuth();
  const cafeId     = user?.cafeId;
  const { data: cafe } = useDocument('cafes', cafeId);
  const { T, isLight } = useTheme();
  const [tab, setTab] = useState('staff');

  // Feature gate — owner can enable/disable this module
  const isEnabled = cafe?.staffManagementEnabled !== false;

  if (!isEnabled) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#D4AF37]/10 flex items-center justify-center mb-4">
          <Lock className="w-8 h-8 text-[#D4AF37]" />
        </div>
        <h2 className={`${T.heading} font-bold text-2xl mb-2`} style={{ fontFamily: 'Playfair Display, serif' }}>
          Staff Management
        </h2>
        <p className={`${T.muted} text-sm max-w-xs`}>
          This module is disabled. Enable it in Settings → Feature Toggles.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`${T.heading} font-bold text-2xl`} style={{ fontFamily: 'Playfair Display, serif' }}>
            Staff Management
          </h2>
          <p className={`${T.faint} text-xs mt-1`}>Manage your team, attendance and salaries</p>
        </div>
      </div>

      {/* Tab nav */}
      <div className={`flex gap-1 p-1 rounded-xl ${T.innerCard} border ${T.border} w-fit`}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all"
            style={tab === t.id
              ? { background: 'linear-gradient(135deg,#D4AF37,#C5A059)', color: '#000' }
              : { color: '#A3A3A3' }}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          {tab === 'staff'      && <StaffList      cafeId={cafeId} />}
          {tab === 'attendance' && <AttendanceDashboard cafeId={cafeId} />}
          {tab === 'salary'     && <SalaryDashboard cafeId={cafeId} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default StaffManagement;
