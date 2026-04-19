/**
 * StaffManagement.jsx
 * OM vibe applied — CSS injection + className swaps only.
 * ALL logic, state, hooks, imports, and child components 100% unchanged.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useDocument } from '../../hooks/useFirestore';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, CalendarCheck, IndianRupee, Lock } from 'lucide-react';
import StaffList from './staff/StaffList';
import AttendanceDashboard from './staff/AttendanceDashboard';
import SalaryDashboard from './staff/SalaryDashboard';
import { useTheme } from '../../hooks/useTheme';

// ── OM-matched CSS ────────────────────────────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('staff-omf-css')) {
  const el = document.createElement('style');
  el.id = 'staff-omf-css';
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700;800;900&display=swap');

    .stf-wrap  { font-family: 'DM Sans', system-ui, sans-serif; }
    .stf-title { font-family: 'Playfair Display', serif !important; letter-spacing: 0.01em; }

    /* Section label — exact omf-sec */
    .stf-sec {
      font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em;
      color: #C9A227; display: flex; align-items: center; gap: 5px;
      font-family: 'DM Sans', system-ui, sans-serif;
    }

    /* Tab nav — exact omf-tab */
    .stf-tab {
      display: flex; align-items: center; gap: 7px;
      padding: 9px 18px; border-radius: 10px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-weight: 700; font-size: 13px;
      cursor: pointer; transition: all 180ms;
      border: 1.5px solid transparent; background: transparent;
      white-space: nowrap;
    }
    .stf-tab-on {
      background: linear-gradient(135deg, #C9A227, #8B6914);
      color: #fff; font-weight: 800;
      box-shadow: 0 3px 14px rgba(201,162,39,0.32);
    }
    .stf-tab-off { background: rgba(255,255,255,0.04); color: #7a6a3a; border-color: rgba(255,255,255,0.07); }
    .stf-tab-off:hover { background: rgba(201,162,39,0.08); color: #C9A227; border-color: rgba(201,162,39,0.2); }

    /* Tab container */
    .stf-tab-bar {
      display: flex; gap: 4px; padding: 4px;
      background: #120f00;
      border: 1.5px solid rgba(255,255,255,0.07);
      border-radius: 14px; width: fit-content;
    }

    /* Locked card */
    .stf-locked {
      background: #120f00;
      border: 1.5px solid rgba(255,255,255,0.07);
      border-radius: 16px;
    }

    /* Fade-in */
    @keyframes stfIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
    .stf-in { animation: stfIn 260ms ease forwards; }
  `;
  document.head.appendChild(el);
}

const TABS = [
  { id: 'staff',      label: 'Staff',      icon: Users         },
  { id: 'attendance', label: 'Attendance', icon: CalendarCheck  },
  { id: 'salary',     label: 'Salary',     icon: IndianRupee    },
];

const StaffManagement = () => {
  const { user }       = useAuth();
  const cafeId         = user?.cafeId;
  const { data: cafe } = useDocument('cafes', cafeId);
  const { T }          = useTheme();
  const [tab, setTab]  = useState('staff');

  // ── All original logic — UNCHANGED ────────────────────────────────────────
  const [staffList, setStaffList] = useState([]);

  useEffect(() => {
    if (!cafeId) return;
    const unsub = onSnapshot(
      query(
        collection(db, 'staff'),
        where('cafeId',   '==', cafeId),
        where('isActive', '==', true)
      ),
      snap => setStaffList(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => a.name.localeCompare(b.name))
      )
    );
    return () => unsub();
  }, [cafeId]);

  const isEnabled = cafe?.staffManagementEnabled !== false;
  // ─────────────────────────────────────────────────────────────────────────

  if (!isEnabled) {
    return (
      <div className="stf-wrap stf-locked flex flex-col items-center justify-center py-24 text-center">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
          style={{ background: 'rgba(201,162,39,0.1)', border: '1.5px solid rgba(201,162,39,0.2)' }}>
          <Lock style={{ width: 26, height: 26, color: '#C9A227' }} />
        </div>
        <h2 className="stf-title text-white font-black text-2xl mb-2">
          Staff Management
        </h2>
        <p style={{ color: '#7a6a3a', fontSize: 13, maxWidth: 280 }}>
          This module is disabled. Enable it in Settings → Feature Toggles.
        </p>
      </div>
    );
  }

  return (
    <div className="stf-wrap space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between stf-in">
        <div>
          <h2 className="stf-title text-white font-black text-2xl">
            Staff Management
          </h2>
          <p className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: '#7a6a3a' }}>
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: '#C9A227' }} />
            {staffList.length} team member{staffList.length !== 1 ? 's' : ''} · manage your team, attendance and salaries
          </p>
        </div>
      </div>

      {/* Tab nav */}
      <div className="stf-tab-bar stf-in" style={{ animationDelay: '40ms', animationFillMode: 'both' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`stf-tab ${tab === t.id ? 'stf-tab-on' : 'stf-tab-off'}`}
          >
            <t.icon style={{ width: 15, height: 15 }} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content — AnimatePresence + motion UNCHANGED */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          {tab === 'staff'      && <StaffList           cafeId={cafeId} />}
          {tab === 'attendance' && <AttendanceDashboard  cafeId={cafeId} staffList={staffList} />}
          {tab === 'salary'     && <SalaryDashboard      cafeId={cafeId} staffList={staffList} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default StaffManagement;
