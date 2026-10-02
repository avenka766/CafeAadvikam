import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import AdminTestimonialsTab from "./AdminTestimonialsTab";
import AdminCakeGalleryTab from "./AdminCakeGalleryTab";
import AdminPromoBannersTab from "./AdminPromoBannersTab";

const mocks = vi.hoisted(() => ({ insert: vi.fn(), upload: vi.fn(), reload: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: (table: string) => ({ insert: (data: unknown) => mocks.insert(table, data) }) } }));
vi.mock("./useSupabaseRows", () => ({ useSupabaseRows: () => ({ rows: [], loading: false, reload: mocks.reload, flash: "", setFlash: vi.fn() }) }));
vi.mock("./siteContentImages", () => ({ uploadSiteContentImage: mocks.upload }));
let host: HTMLDivElement; let root: Root;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); mocks.insert.mockReset().mockResolvedValue({ error: null }); mocks.upload.mockReset().mockResolvedValue("/test-upload.jpg"); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function render(node: ReactNode) { await act(async () => root.render(node)); }
async function click(text: string) { const el = Array.from(host.querySelectorAll("button")).find(b => b.textContent?.trim() === text); expect(el).toBeTruthy(); await act(async () => el!.click()); }
async function fill(selector: string, value: string) { const el = host.querySelector<HTMLInputElement>(selector)!; expect(el).toBeTruthy(); await act(async () => { const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }); }
async function upload() { const el = host.querySelector<HTMLInputElement>('input[type="file"]')!; Object.defineProperty(el, "files", { value: [new File(["fixture"], "cake.jpg", { type: "image/jpeg" })] }); await act(async () => el.dispatchEvent(new Event("change", { bubbles: true }))); }

describe("Admin publishing forms (isolated database)", () => {
  it("saves the testimonial author, quote, chosen rating and venue", async () => {
    await render(<AdminTestimonialsTab />); await click("Add testimonial");
    await fill('input[placeholder="Author name"]', "Test guest"); await fill("textarea", "Lovely food.");
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="4 stars"]')!.click());
    await act(async () => Array.from(host.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find(b => b.textContent === "bakery")!.click());
    await click("Save");
    expect(mocks.insert).toHaveBeenCalledWith("testimonials", expect.objectContaining({ author: "Test guest", quote: "Lovely food.", rating: 4, venue: "bakery", active: true }));
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });
  it("keeps edits and shows an error when testimonial saving fails", async () => {
    mocks.insert.mockResolvedValue({ error: { message: "Save unavailable" } });
    await render(<AdminTestimonialsTab />); await click("Add testimonial"); await fill('input[placeholder="Author name"]', "Test guest"); await fill("textarea", "Lovely food."); await click("Save");
    expect(host.textContent).toContain("Save unavailable"); expect(host.querySelector<HTMLInputElement>('input[placeholder="Author name"]')?.value).toBe("Test guest");
  });
  it("requires a cake photo and saves the uploaded image, caption and category", async () => {
    await render(<AdminCakeGalleryTab />); await click("Add photo"); await click("Save"); expect(mocks.insert).not.toHaveBeenCalled();
    await upload(); await fill('input[list="cake-categories"]', "Wedding"); await fill('input[placeholder="Caption (optional)"]', "Floral cake"); await click("Save");
    expect(mocks.upload).toHaveBeenCalledWith("cake", expect.any(File));
    expect(mocks.insert).toHaveBeenCalledWith("cake_gallery", expect.objectContaining({ image_url: "/test-upload.jpg", category: "Wedding", caption: "Floral cake", active: true }));
  });
  it("rejects reversed promotion dates and saves a valid scheduled image and order button", async () => {
    await render(<AdminPromoBannersTab />); await click("Add banner"); await fill('input[placeholder="Title"]', "Festival treats");
    const dates = host.querySelectorAll<HTMLInputElement>('input[type="date"]');
    for (const [i, value] of ["2026-10-10", "2026-10-09"].entries()) { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(dates[i], value); dates[i].dispatchEvent(new Event("change",{bubbles:true})); dates[i].dispatchEvent(new Event("input",{bubbles:true})); }); }
    await click("Save"); expect(host.textContent).toContain("End date must be on or after the start date."); expect(mocks.insert).not.toHaveBeenCalled();
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(dates[1], "2026-10-11"); dates[1].dispatchEvent(new Event("input",{bubbles:true})); });
    await fill('input[placeholder^="Button text"]', "Order Now"); await click("Save"); expect(host.textContent).toContain("Add a button link");
    await fill('input[placeholder^="Button link"]', "/order"); await upload(); await click("Save");
    expect(mocks.insert).toHaveBeenCalledWith("promo_banners", expect.objectContaining({ title: "Festival treats", image_url: "/test-upload.jpg", cta_link: "/order", start_date: "2026-10-10", end_date: "2026-10-11" }));
  });
});
