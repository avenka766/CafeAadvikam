import {Simulate} from 'react-dom/test-utils';
import {act} from 'react';import {createRoot,type Root} from 'react-dom/client';import {afterEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({load:vi.fn(),excel:vi.fn()}));
vi.mock('./plannerGstRegister',()=>({loadPlannerGstRegister:mock.load}));vi.mock('./reportExport',()=>({generateExcelReport:mock.excel}));
import Panel from './GstBillRegisterPanel';
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,host:HTMLDivElement;
async function mount(){host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>{root.render(<Panel/>);});}
afterEach(()=>{act(()=>root?.unmount());host?.remove();mock.load.mockReset();mock.excel.mockReset();});
const excel=()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='Excel')!;
it('keeps Excel disabled when a report source fails and displays the failure',async()=>{mock.load.mockRejectedValue(Error('Source timeout'));await mount();expect(host.textContent).toContain('Source timeout');expect(excel().disabled).toBe(true);expect(mock.excel).not.toHaveBeenCalled();});
it('exports the same saved invoices and amounts displayed in the register',async()=>{const rows=[{Source:'Planner Sales','Invoice Number':'SALES/26-27/123',Date:'2026-11-02T08:00:00Z',Customer:'Fixture customer',GSTIN:'',Total:105,Status:'active',Items:'[]'}];mock.load.mockResolvedValue(rows);await mount();expect(host.textContent).toContain('SALES/26-27/123');expect(excel().disabled).toBe(false);act(()=>excel().click());expect(mock.excel.mock.calls[0][0].sections[0].sheets[0].rows).toEqual(rows);const [from,until]=mock.load.mock.calls[0];expect(from).toContain('+05:30');expect(Date.parse(until)).toBeGreaterThan(Date.parse(from));});

it('clearing a date shows a validation message and disables export',async()=>{mock.load.mockResolvedValue([]);await mount();const input=host.querySelector('input[aria-label="GST bills to date"]') as HTMLInputElement;await act(async()=>{Simulate.change(input,{target:{value:''}} as any);});expect(host.textContent).toContain('Choose both From and To dates.');expect(excel().disabled).toBe(true);});
