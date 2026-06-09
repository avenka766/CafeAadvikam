// src/pages/AdminHosurDashboard.tsx
// Hosur Admin Dashboard — dedicated admin view for the Hosur branch.
// Added to resolve the MISSING issue: there was no admin_hosur role or isolated
// admin dashboard for Hosur, creating an asymmetry with admin_vrsnb and admin_snb.
//
// This page wraps HosurDashboard with an admin identity banner so it is clear
// which branch context the admin is operating in.  Further feature parity with
// AdminSNBDashboard (ledger, purchase records, salesperson management, etc.) can
// be added incrementally as needed.

import { useAuthStore } from '@/stores/authStore';
import HosurDashboard from './HosurDashboard';
import { ShieldCheck } from 'lucide-react';

export default function AdminHosurDashboard() {
  const { currentUser } = useAuthStore();

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Admin identity banner */}
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2 text-amber-800 text-xs font-bold">
        <ShieldCheck className="size-4 shrink-0" />
        <span>
          Hosur Admin Dashboard
          {currentUser?.displayName ? ` — ${currentUser.displayName}` : ''}
        </span>
      </div>

      {/* Full Hosur branch dashboard */}
      <div className="flex-1">
        <HosurDashboard />
      </div>
    </div>
  );
}
