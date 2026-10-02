import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LeadEnquiry } from "./LeadEnquiry";
const db = vi.hoisted(() => ({ insert: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: (table: string) => ({ insert: (payload: unknown) => db.insert(table, payload) }) } }));
let host: HTMLDivElement, root: Root;
beforeEach(async () => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); db.insert.mockReset().mockResolvedValue({ error: null }); host = document.createElement("div"); document.body.append(host); root = createRoot(host); await act(async () => root.render(<LeadEnquiry topic="Custom cake">Plan a cake</LeadEnquiry>)); await act(async () => host.querySelector("button")!.click()); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function fill(type: string, value: string) { const el = document.querySelector<HTMLInputElement>(type)!; await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(el,value); el.dispatchEvent(new Event("input",{bubbles:true})); }); }
async function submit() { await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}))); }
it("captures a contextual lead in the table used by Admin and acknowledges it", async () => {
  await fill('input[autocomplete="name"]', "Test customer"); await fill('input[type="tel"]', "9999999999"); await submit();
  expect(db.insert).toHaveBeenCalledWith("party_hall_enquiries", expect.objectContaining({ name:"Test customer", phone:"9999999999", event_type:"Custom cake", requirements:expect.stringContaining("Custom cake") }));
  expect(document.querySelector('[role="status"]')?.textContent).toContain("We have received");
});
it("rejects an invalid phone without creating a lead", async () => {
  await fill('input[autocomplete="name"]', "Test customer"); await fill('input[type="tel"]', "----------"); await submit();
  expect(db.insert).not.toHaveBeenCalled(); expect(document.querySelector('[role="alert"]')?.textContent).toContain("valid mobile");
});
it("retains customer details and allows retry after a failed submission", async () => {
  db.insert.mockResolvedValueOnce({error:{message:"offline"}}); await fill('input[autocomplete="name"]', "Test customer"); await fill('input[type="tel"]', "9999999999"); await submit();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("could not be sent"); await submit(); expect(db.insert).toHaveBeenCalledTimes(2); expect(document.querySelector('[role="status"]')).not.toBeNull();
});
