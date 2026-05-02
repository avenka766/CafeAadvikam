// src/pages/StaffManagement.tsx  ← REPLACE EXISTING FILE
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import {
  UserPlus, Key, Trash2, ShieldCheck, User,
  AlertCircle, Check, Pencil, X, ChevronDown, ChevronUp,
} from 'lucide-react';
import type { UserRole } from '@/types';

// ─── Role config ─────────────────────────────────────────────────────────────
const ROLE_GROUPS = [
  {
    label: '☕ Cafe',
    roles: ['order_taker', 'billing', 'kitchen', 'admin'] as UserRole[],
  },
  {
    label: '🥐 Bakery Workflow',
    roles: ['order_receiver', 'store', 'baker', 'packing'] as UserRole[],
  },
  {
    label: '🏬 Branch Sales',
    roles: ['branch_vrsnb', 'branch_snb', 'branch_hosur'] as UserRole[],
  },
];

const ROLE_LABELS: Record<UserRole, string> = {
  order_taker:   'Order Taker',
  billing:       'Billing',
  admin:         'Administrator',
  kitchen:       'Kitchen / Chef',
  order_receiver:'Order Receiver',
  store:         'Store',
  baker:         'Baker',
  packing:       'Packing',
  branch_vrsnb:  'VR SNB Branch',
  branch_snb:    'SNB Branch',
  branch_hosur:  'Hosur Branch',
};

const ROLE_COLORS: Record<UserRole, string> = {
  order_taker:   'bg-blue-100 text-blue-800',
  billing:       'bg-emerald-100 text-emerald-800',
  admin:         'bg-amber-100 text-amber-800',
  kitchen:       'bg-orange-100 text-orange-800',
  order_receiver:'bg-purple-100 text-purple-800',
  store:         'bg-cyan-100 text-cyan-800',
  baker:         'bg-rose-100 text-rose-800',
  packing:       'bg-indigo-100 text-indigo-800',
  branch_vrsnb:  'bg-blue-100 text-blue-800',
  branch_snb:    'bg-amber-100 text-amber-700',
  branch_hosur:  'bg-emerald-100 text-emerald-800',
};

// ─── Role Picker component ────────────────────────────────────────────────────
function RolePicker({ value, onChange }: { value: UserRole; onChange: (r: UserRole) => void }) {
  return (
    <div className="space-y-2">
      {ROLE_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1.5">{group.label}</p>
          <div className="flex flex-wrap gap-1.5">
            {group.roles.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onChange(r)}
                className={cn(
                  'px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                  value === r
                    ? 'bg-primary text-primary-foreground border-transparent'
                    : 'bg-card border-border text-foreground',
                )}
              >
                {ROLE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function StaffManagement() {
  const { staffList, addStaff, updateStaffPassword, updateStaffDetails, removeStaff, currentUser, loadStaff } =
    useAuthStore();

  // ── Add form state ──────────────────────────────────────────────────────────
  const [showAdd, setShowAdd]           = useState(false);
  const [newUsername, setNewUsername]   = useState('');
  const [newPassword, setNewPassword]   = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole]           = useState<UserRole>('billing');
  const [addError, setAddError]         = useState('');
  const [addSuccess, setAddSuccess]     = useState('');

  // ── Password change state ───────────────────────────────────────────────────
  const [changingPwId, setChangingPwId] = useState<string | null>(null);
  const [newPw, setNewPw]               = useState('');
  const [pwSuccess, setPwSuccess]       = useState<string | null>(null);

  // ── Edit details state ──────────────────────────────────────────────────────
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editError, setEditError]       = useState('');
  const [editSuccess, setEditSuccess]   = useState<string | null>(null);

  // ── Expand card state ───────────────────────────────────────────────────────
  const [expandedId, setExpandedId]     = useState<string | null>(null);

  useEffect(() => { loadStaff(); }, [loadStaff]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleAddStaff = async () => {
    setAddError('');
    if (!newUsername.trim() || !newPassword.trim() || !newDisplayName.trim()) {
      setAddError('All fields are required');
      return;
    }
    if (staffList.some((u) => u.username.toLowerCase() === newUsername.trim().toLowerCase())) {
      setAddError('Username already exists');
      return;
    }
    const ok = await addStaff({
      username: newUsername.trim(), password: newPassword,
      displayName: newDisplayName.trim(), role: newRole,
    });
    if (ok) {
      setNewUsername(''); setNewPassword(''); setNewDisplayName(''); setNewRole('billing');
      setAddSuccess(`${newDisplayName.trim()} added successfully`);
      setTimeout(() => setAddSuccess(''), 3000);
      setShowAdd(false);
    } else {
      setAddError('Failed to add staff. Username may already exist.');
    }
  };

  const handleChangePw = async (userId: string) => {
    if (!newPw.trim()) return;
    await updateStaffPassword(userId, newPw);
    setChangingPwId(null); setNewPw('');
    setPwSuccess(userId);
    setTimeout(() => setPwSuccess(null), 2500);
  };

  const startEdit = (user: { id: string; username: string; displayName: string }) => {
    setEditingId(user.id);
    setEditUsername(user.username);
    setEditDisplayName(user.displayName);
    setEditError('');
  };

  const handleSaveDetails = async (userId: string) => {
    setEditError('');
    const err = await updateStaffDetails(userId, {
      username: editUsername, displayName: editDisplayName,
    });
    if (err) { setEditError(err); return; }
    setEditingId(null);
    setEditSuccess(userId);
    setTimeout(() => setEditSuccess(null), 2500);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background pt-14 pb-20">
      {/* Page header */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Staff Management</h1>
          <p className="text-sm font-body text-muted-foreground">{staffList.length} staff members</p>
        </div>
        <button
          onClick={() => { setShowAdd(!showAdd); setAddError(''); }}
          className="px-3 py-2 rounded-lg cafe-gradient text-primary-foreground text-sm font-body font-bold flex items-center gap-1.5 active:scale-95"
        >
          <UserPlus className="size-4" />Add
        </button>
      </div>

      <div className="px-4 py-3 space-y-3">

        {/* ── Add form ─────────────────────────────────────────────────────── */}
        {showAdd && (
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <h3 className="font-body text-sm font-bold text-foreground">Add New Staff</h3>
            {addError && (
              <div className="flex items-center gap-2 text-xs text-destructive">
                <AlertCircle className="size-3" />{addError}
              </div>
            )}
            <input
              placeholder="Display Name" value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm font-body placeholder:text-muted-foreground"
            />
            <input
              placeholder="Username" value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm font-body placeholder:text-muted-foreground"
            />
            <input
              placeholder="Password" type="text" value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm font-body placeholder:text-muted-foreground"
            />

            {/* Role picker — all roles grouped */}
            <div className="border border-border rounded-lg p-3 bg-muted/30">
              <p className="text-xs font-semibold text-foreground mb-2">Select Role</p>
              <RolePicker value={newRole} onChange={setNewRole} />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleAddStaff}
                className="flex-1 py-2.5 rounded-lg cafe-gradient text-primary-foreground text-sm font-body font-bold active:scale-95"
              >
                Add Staff
              </button>
              <button
                onClick={() => { setShowAdd(false); setAddError(''); }}
                className="px-4 py-2.5 rounded-lg bg-muted text-foreground text-sm font-body font-semibold active:scale-95"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── Add success ───────────────────────────────────────────────── */}
        {addSuccess && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-body">
            <Check className="size-4" />{addSuccess}
          </div>
        )}

        {/* ── Staff cards ───────────────────────────────────────────────── */}
        {staffList.map((user) => {
          const isExpanded  = expandedId === user.id;
          const isEditing   = editingId  === user.id;
          const isChangingPw = changingPwId === user.id;

          return (
            <div key={user.id} className="bg-card border border-border rounded-xl overflow-hidden">
              {/* ── Card header ── */}
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                      {user.role === 'admin'
                        ? <ShieldCheck className="size-5 text-amber-600" />
                        : <User className="size-5 text-muted-foreground" />}
                    </div>
                    <div>
                      <p className="text-sm font-body font-bold text-foreground">{user.displayName}</p>
                      <p className="text-xs font-body text-muted-foreground">@{user.username}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn('text-[10px] font-body font-bold px-2 py-0.5 rounded-full', ROLE_COLORS[user.role])}>
                      {ROLE_LABELS[user.role]}
                    </span>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : user.id)}
                      className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
                    >
                      {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    </button>
                  </div>
                </div>

                {/* Inline success messages */}
                {pwSuccess === user.id && (
                  <p className="text-xs font-body text-emerald-600 mt-2 flex items-center gap-1">
                    <Check className="size-3" /> Password updated
                  </p>
                )}
                {editSuccess === user.id && (
                  <p className="text-xs font-body text-emerald-600 mt-2 flex items-center gap-1">
                    <Check className="size-3" /> Details updated
                  </p>
                )}
              </div>

              {/* ── Expanded actions ── */}
              {isExpanded && (
                <div className="border-t border-border px-4 pb-4 pt-3 space-y-3 bg-muted/20">

                  {/* Action buttons row */}
                  {!isEditing && !isChangingPw && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEdit(user)}
                        className="flex-1 py-2 rounded-lg bg-muted text-foreground text-xs font-body font-semibold flex items-center justify-center gap-1 active:scale-95"
                      >
                        <Pencil className="size-3" />Edit Details
                      </button>
                      <button
                        onClick={() => { setChangingPwId(user.id); setEditingId(null); setNewPw(''); }}
                        className="flex-1 py-2 rounded-lg bg-muted text-foreground text-xs font-body font-semibold flex items-center justify-center gap-1 active:scale-95"
                      >
                        <Key className="size-3" />Change Password
                      </button>
                      {user.id !== currentUser?.id && (
                        <button
                          onClick={() => {
                            if (window.confirm(`Remove ${user.displayName}?`)) removeStaff(user.id);
                          }}
                          className="px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-xs font-body font-semibold flex items-center gap-1 active:scale-95"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* ── Edit username / display name ── */}
                  {isEditing && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-foreground">Edit Details</p>
                      {editError && (
                        <div className="flex items-center gap-2 text-xs text-destructive">
                          <AlertCircle className="size-3" />{editError}
                        </div>
                      )}
                      <input
                        placeholder="Display Name"
                        value={editDisplayName}
                        onChange={(e) => setEditDisplayName(e.target.value)}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-body"
                      />
                      <input
                        placeholder="Username"
                        value={editUsername}
                        onChange={(e) => setEditUsername(e.target.value)}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-body"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSaveDetails(user.id)}
                          className="flex-1 py-2 rounded-lg cafe-gradient text-primary-foreground text-xs font-body font-bold active:scale-95"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => { setEditingId(null); setEditError(''); }}
                          className="px-4 py-2 rounded-lg bg-muted text-foreground text-xs font-body font-semibold flex items-center gap-1 active:scale-95"
                        >
                          <X className="size-3" />Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── Change password ── */}
                  {isChangingPw && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-foreground">New Password</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Enter new password"
                          value={newPw}
                          onChange={(e) => setNewPw(e.target.value)}
                          className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm font-body"
                        />
                        <button
                          onClick={() => handleChangePw(user.id)}
                          className="px-4 py-2 rounded-lg cafe-gradient text-primary-foreground text-sm font-body font-bold active:scale-95"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => { setChangingPwId(null); setNewPw(''); }}
                          className="px-3 py-2 rounded-lg bg-muted text-foreground text-xs font-body font-semibold flex items-center gap-1 active:scale-95"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
