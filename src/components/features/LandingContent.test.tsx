import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CakeGallery, PromoBanners, useLandingContent } from "./LandingContent";

const db = vi.hoisted(() => ({ rows: {} as Record<string, { data: unknown[] | null; error: unknown }> }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: (table: string) => ({
  select: () => ({ eq: () => ({ order: () => Promise.resolve(db.rows[table] ?? { data: [], error: null }) }) }),
}) } }));

let host: HTMLDivElement;
let root: Root;
function Preview() {
  const { cakes, promos, reviews } = useLandingContent();
  return <><CakeGallery photos={cakes} /><PromoBanners promos={promos} venue="bakery" /><output>{reviews.map(r => r.quote).join(" ")}</output></>;
}
const cake = (id: string, category = "Birthday") => ({ id, image_url: `/cake-${id}.jpg`, category, caption: `Cake ${id}` });
const promo = (id: string, extra = {}) => ({ id, title: `Offer ${id}`, message: "Made to share", venue: "bakery", image_url: "/offer.jpg", cta_label: "Shop sweets", cta_link: "/order", start_date: null, end_date: null, ...extra });

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  db.rows = {};
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); });

describe("homepage Admin content", () => {
  it("shows no substitute photos or reviews when Admin has no active content", async () => {
    await act(async () => root.render(<Preview />));
    expect(host.querySelectorAll("img").length).toBe(0);
    expect(host.textContent).toBe("");
  });
  it("shows uploaded cake captions and filters by the Admin category", async () => {
    db.rows.cake_gallery = { data: [cake("1"), cake("2", "Wedding")], error: null };
    await act(async () => root.render(<Preview />));
    expect(host.querySelectorAll("img").length).toBe(2);
    await act(async () => Array.from(host.querySelectorAll("button")).find(b => b.textContent === "Wedding")!.click());
    expect(host.querySelector("img")?.getAttribute("src")).toBe("/cake-2.jpg");
    expect(host.textContent).not.toContain("Cake 1");
  });
  it("removes the final disabled or deleted item after returning from Admin", async () => {
    db.rows.cake_gallery = { data: [cake("1")], error: null };
    db.rows.testimonials = { data: [{ id: "1", quote: "Lovely sweets" }], error: null };
    await act(async () => root.render(<Preview />));
    expect(host.textContent).toContain("Lovely sweets");
    db.rows = {};
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toBe("");
  });
  it("honours promotion dates inclusively, venue, image and order link", async () => {
    const today = new Date().toISOString().slice(0, 10);
    db.rows.promo_banners = { data: [promo("live", { start_date: today, end_date: today }), promo("future", { start_date: "2999-01-01" }), promo("expired", { end_date: "2000-01-01" }), promo("cafe", { venue: "cafe" })], error: null };
    await act(async () => root.render(<Preview />));
    expect(host.querySelectorAll("aside").length).toBe(1);
    expect(host.textContent).toContain("Offer live");
    expect(host.querySelector("img")?.getAttribute("src")).toBe("/offer.jpg");
    expect(host.querySelector("a")?.getAttribute("href")).toBe("/order");
  });
  it("keeps the last loaded content if a refresh fails", async () => {
    db.rows.cake_gallery = { data: [cake("1")], error: null };
    await act(async () => root.render(<Preview />));
    db.rows.cake_gallery = { data: null, error: new Error("Offline") };
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(host.querySelector("img")?.getAttribute("src")).toBe("/cake-1.jpg");
  });
});
