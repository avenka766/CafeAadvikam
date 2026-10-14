import { useRef, useState } from 'react';
import { Loader2, Plus, Users, UserPlus } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export type ContractTeam = { id: string; name: string };
type Member = { id: string; name: string; branch: string; department: string; paymentMode?: string };

export default function ContractTeamsPanel({ teams, employees, error, onCreated, onAddNew, onAssigned }: {
  teams: ContractTeam[]; employees: Member[]; error: string;
  onCreated: (team: ContractTeam) => void; onAddNew: (team: string) => void;
  onAssigned: (ids: string[], team: string) => void;
}) {
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [assignTeam, setAssignTeam] = useState<ContractTeam | null>(null);
  const [employeeId, setEmployeeId] = useState('');
  const directEmployees = employees.filter(employee => !employee.paymentMode?.trim());

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (lock.current || !name.trim() || error) return;
    lock.current = true; setBusy(true); setActionError(''); setNotice('');
    try {
      const { data, error: failure } = await supabase.rpc('create_attendance_contract_team', { p_name: name });
      if (failure) throw failure;
      if (!data) throw new Error('The team could not be saved.');
      onCreated(data as ContractTeam); setName(''); setNotice(`${(data as ContractTeam).name} created. Add people below.`);
    } catch (failure) { setActionError((failure as Error).message); }
    finally { lock.current = false; setBusy(false); }
  };
  const assign = async () => {
    if (lock.current || !assignTeam || !employeeId) return;
    lock.current = true; setBusy(true); setActionError(''); setNotice('');
    try {
      const { error: failure } = await supabase.rpc('add_attendance_contract_members', { p_team_id: assignTeam.id, p_employee_ids: [employeeId] });
      if (failure) throw failure;
      onAssigned([employeeId], assignTeam.name); setNotice(`Person added to ${assignTeam.name}.`); setAssignTeam(null); setEmployeeId('');
    } catch (failure) { setActionError((failure as Error).message); }
    finally { lock.current = false; setBusy(false); }
  };
  return <div className="space-y-4 px-4">
    <div className="rounded-2xl border bg-card p-4">
      <h2 className="flex items-center gap-2 font-bold"><Users className="size-5" /> Contract Teams</h2>
      <p className="mt-1 text-sm text-muted-foreground">Create a team and add new or existing people under it.</p>
      <form onSubmit={create} className="mt-4 flex flex-wrap gap-2">
        <input aria-label="New contract team name" maxLength={80} required value={name} onChange={event => setName(event.target.value)} placeholder="New team name" className="min-w-0 flex-1 rounded-xl border bg-background px-3 py-2" />
        <button disabled={busy || !!error || name.trim().length < 2} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">{busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Create team</button>
      </form>
    </div>
    {(error || actionError) && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error || actionError}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <input aria-label="Search contract teams or people" placeholder="Search team or person…" value={search} onChange={event => setSearch(event.target.value)} className="w-full rounded-xl border bg-card px-3 py-2" />
    <div className="grid gap-4 lg:grid-cols-2">
      {teams.filter(team => team.name.toLowerCase().includes(search.toLowerCase()) || employees.some(employee => employee.paymentMode?.trim().toUpperCase() === team.name.toUpperCase() && employee.name.toLowerCase().includes(search.toLowerCase()))).map(team => {
        const members = employees.filter(employee => employee.paymentMode?.trim().toUpperCase() === team.name.toUpperCase());
        return <section key={team.id} className="rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between gap-2"><h3 className="font-bold">{team.name}</h3><span className="text-xs text-muted-foreground">{members.length} people</span></div>
          <div className="my-3 flex flex-wrap gap-2">
            <button disabled={busy || !!error} onClick={() => onAddNew(team.name)} className="flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50"><UserPlus className="size-4" /> Add new person</button>
            <button disabled={busy || !!error || directEmployees.length === 0} onClick={() => { setAssignTeam(team); setEmployeeId(''); setActionError(''); }} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">Add existing person</button>
          </div>
          {assignTeam?.id === team.id && <div className="mb-3 space-y-2 rounded-xl bg-muted p-3">
            <label className="block text-xs font-semibold">Choose an unassigned person<select aria-label={`Person to add to ${team.name}`} value={employeeId} onChange={event => setEmployeeId(event.target.value)} className="mt-1 w-full rounded-lg border bg-card p-2"><option value="">Select a person</option>{directEmployees.map(employee => <option key={employee.id} value={employee.id}>{employee.name} — {employee.branch}</option>)}</select></label>
            <div className="flex gap-2"><button disabled={!employeeId || busy} onClick={() => void assign()} className="rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground disabled:opacity-50">Add to team</button><button disabled={busy} onClick={() => setAssignTeam(null)} className="rounded-lg border px-3 py-2 text-xs">Cancel</button></div>
          </div>}
          {members.length === 0 ? <p className="text-sm text-muted-foreground">No people yet. Add the first person to this team.</p> : <ul className="divide-y">{members.map(employee => <li key={employee.id} className="py-2"><p className="text-sm font-semibold">{employee.name}</p><p className="text-xs text-muted-foreground">{employee.branch} · {employee.department}</p></li>)}</ul>}
        </section>;
      })}
    </div>
    {!error && teams.length > 0 && !teams.some(team => team.name.toLowerCase().includes(search.toLowerCase()) || employees.some(employee => employee.paymentMode?.trim().toUpperCase() === team.name.toUpperCase() && employee.name.toLowerCase().includes(search.toLowerCase()))) && <p className="text-sm text-muted-foreground">No matching teams or people.</p>}
  </div>;
}
