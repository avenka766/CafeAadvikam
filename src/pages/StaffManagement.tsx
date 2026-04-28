import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import { UserPlus, Key, Trash2, ShieldCheck, User, AlertCircle, Check } from 'lucide-react';
import type { UserRole } from '@/types';

const ROLE_LABELS: Record<UserRole, string> = {
  order_taker: 'Order Taker',
  billing: 'Billing Staff',
  admin: 'Administrator',
  kitchen: 'Kitchen / Chef',
};

const ROLE_COLORS: Record<UserRole, string> = {
  order_taker: 'bg-blue-100 text-blue-800',
  billing: 'bg-emerald-100 text-emerald-800',
  admin: 'bg-amber-100 text-amber-800',
  kitchen: 'bg-orange-100 text-orange-800',
};

export default function StaffManagement() {
  const { staffList, addStaff, updateStaffPassword, removeStaff, currentUser, loadStaff } = useAuthStore();
  const [showAdd, setShowAdd] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('billing');
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');
  const [changingPwId, setChangingPwId] = useState<string | null>(null);
  const [newPw, setNewPw] = useState('');
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  const handleAddStaff = async () => {
    setAddError('');
    if (!newUsername.trim() || !newPassword.trim() || !newDisplayName.trim()) { setAddError('All fields are required'); return; }
    if (staffList.some((u) => u.username.toLowerCase() === newUsername.trim().toLowerCase())) { setAddError('Username already exists'); return; }
    const ok = await addStaff({ username: newUsername.trim(), password: newPassword, displayName: newDisplayName.trim(), role: newRole });
    if (ok) {
      setNewUsername(''); setNewPassword(''); setNewDisplayName('');
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
    setTimeout(() => setPwSuccess(null), 2000);
  };

  return (
    <div className="min-h-screen bg-background pt-14 pb-20">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Staff Management</h1>
          <p className="text-sm font-body text-muted-foreground">{staffList.length} staff members</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="px-3 py-2 rounded-lg cafe-gradient text-primary-foreground text-sm font-body font-bold flex items-center gap-1.5 active:scale-95">
          <UserPlus className="size-4" />Add
        </button>
      </div>

      <div className="px-4 py-3 space-y-3">
        {showAdd && (
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <h3 className="font-body text-sm font-bold text-foreground">Add New Staff</h3>
            {addError && <div className="flex items-center gap-2 text-xs text-destructive"><AlertCircle className="size-3" />{addError}</div>}
            <input placeholder="Display Name" value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm font-body placeholder:text-muted-foreground" />
            <input placeholder="Username" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm font-body placeholder:text-muted-foreground" />
            <input placeholder="Password" type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm font-body placeholder:text-muted-foreground" />
            <div className="flex gap-2 flex-wrap">
              {(['order_taker', 'billing', 'kitchen', 'admin'] as UserRole[]).map((r) => (
                <button key={r} onClick={() => setNewRole(r)} className={cn('flex-1 py-2 rounded-lg text-xs font-body font-semibold border transition-all', newRole === r ? 'cafe-gradient text-primary-foreground border-transparent' : 'bg-card border-border text-foreground')}>{ROLE_LABELS[r]}</button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={handleAddStaff} className="flex-1 py-2.5 rounded-lg cafe-gradient text-primary-foreground text-sm font-body font-bold active:scale-95">Add Staff</button>
              <button onClick={() => { setShowAdd(false); setAddError(''); }} className="px-4 py-2.5 rounded-lg bg-muted text-foreground text-sm font-body font-semibold active:scale-95">Cancel</button>
            </div>
          </div>
        )}

        {addSuccess && <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-body"><Check className="size-4" />{addSuccess}</div>}

        {staffList.map((user) => (
          <div key={user.id} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-full bg-muted flex items-center justify-center">
                  {user.role === 'admin' ? <ShieldCheck className="size-5 text-amber-600" /> : <User className="size-5 text-muted-foreground" />}
                </div>
                <div>
                  <p className="text-sm font-body font-bold text-foreground">{user.displayName}</p>
                  <p className="text-xs font-body text-muted-foreground">@{user.username}</p>
                </div>
              </div>
              <span className={cn('text-[10px] font-body font-bold px-2 py-0.5 rounded-full', ROLE_COLORS[user.role])}>{ROLE_LABELS[user.role]}</span>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => { setChangingPwId(changingPwId === user.id ? null : user.id); setNewPw(''); }} className="flex-1 py-2 rounded-lg bg-muted text-foreground text-xs font-body font-semibold flex items-center justify-center gap-1 active:scale-95">
                <Key className="size-3" />Change Password
              </button>
              {user.id !== currentUser?.id && (
                <button onClick={() => { if (window.confirm(`Remove ${user.displayName}?`)) removeStaff(user.id); }} className="px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-xs font-body font-semibold flex items-center gap-1 active:scale-95">
                  <Trash2 className="size-3" />
                </button>
              )}
            </div>
            {pwSuccess === user.id && <p className="text-xs font-body text-emerald-600 mt-2 flex items-center gap-1"><Check className="size-3" /> Password updated</p>}
            {changingPwId === user.id && (
              <div className="flex gap-2 mt-2">
                <input type="text" placeholder="New password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm font-body" />
                <button onClick={() => handleChangePw(user.id)} className="px-4 py-2 rounded-lg cafe-gradient text-primary-foreground text-sm font-body font-bold active:scale-95">Save</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
