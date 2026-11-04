import {afterEach,describe,expect,it,vi} from 'vitest';import {act} from 'react';import {createRoot,type Root} from 'react-dom/client';import {MemoryRouter,Route,Routes,useLocation} from 'react-router-dom';import {readFileSync} from 'node:fs';
import type {UserRole} from '@/types';import {getRoleDefaultPath} from '@/lib/routing';
const state=vi.hoisted(()=>({role:null as UserRole|null}));
vi.mock('@/stores/authStore',()=>({useAuthStore:(selector:any)=>selector({currentUser:state.role?{id:'fixture',role:state.role}:null})}));
import ProtectedRoute from './ProtectedRoute';
const roles:UserRole[]=['order_taker','billing','admin','kitchen','store','cake_master','planner','receiver_vrsnb','receiver_snb','branch_vrsnb','branch_snb','branch_hosur','admin_vrsnb','admin_snb','audit','finance','owner'];
const Location=()=>{const l=useLocation();return <p data-testid="location">{l.pathname}{l.search}</p>;};
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root;let container:HTMLDivElement;
const mount=(allowed:UserRole[])=>{container=document.createElement('div');document.body.append(container);root=createRoot(container);act(()=>root.render(<MemoryRouter initialEntries={['/protected']}><Routes><Route path="/protected" element={<ProtectedRoute allowedRoles={allowed}><p>Allowed workflow</p></ProtectedRoute>}/><Route path="*" element={<Location/>}/></Routes></MemoryRouter>));};
afterEach(()=>{act(()=>root?.unmount());container?.remove();});
describe('Role routing boundaries',()=>{
 it.each(roles)('allows %s into its authorized workflow',role=>{state.role=role;mount([role]);expect(container.textContent).toContain('Allowed workflow');});
 it.each(roles)('redirects %s away from an unauthorized workflow',role=>{state.role=role;mount([role==='admin'?'billing':'admin']);expect(container.textContent).toBe(getRoleDefaultPath(role));});
 it('requires login without a signed-in user',()=>{state.role=null;mount(['admin']);expect(container.textContent).toBe('/login');});
 it.each(roles)('%s has a declared default route that permits its role',role=>{
  const app=readFileSync('src/App.tsx','utf8');const pathname=getRoleDefaultPath(role).split('?')[0];
  const route=app.split('\n').find(line=>line.includes(`path="${pathname}"`)&&line.includes('allowedRoles'));
  expect(route).toBeTruthy();expect(route?.match(/allowedRoles=\{\[([^\]]+)\]/)?.[1]).toContain(`'${role}'`);
 });
});
