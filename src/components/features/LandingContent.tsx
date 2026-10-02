import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase";

export type Testimonial = {
  id: string;
  author: string;
  quote: string;
  rating: number | null;
  meta: string | null;
  venue: "cafe" | "bakery";
};
type CakePhoto = {
  id: string;
  image_url: string;
  caption: string | null;
  category: string | null;
};
type Promo = {
  id: string;
  title: string;
  message: string | null;
  image_url: string | null;
  cta_label: string | null;
  cta_link: string | null;
  venue: "cafe" | "bakery" | "both";
  start_date: string | null;
  end_date: string | null;
};

// Successful empty results stay empty: disabling the last item in Admin must
// remove it from the homepage rather than reveal an old fallback photograph.
export function useLandingContent() {
  const [reviews, setReviews] = useState<Testimonial[]>([]);
  const [cakes, setCakes] = useState<CakePhoto[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  useEffect(() => {
    let cancelled = false;
    let loading = false;
    async function refresh() {
      if (loading || document.visibilityState === "hidden") return;
      loading = true;
      try {
        await Promise.allSettled([
          supabase
            .from("testimonials")
            .select("id,author,quote,rating,meta,venue,display_order")
            .eq("active", true)
            .order("display_order")
            .then(({ data, error }) => {
              if (!cancelled && !error)
                setReviews((data ?? []) as Testimonial[]);
            }),
          supabase
            .from("cake_gallery")
            .select("id,image_url,caption,category,display_order")
            .eq("active", true)
            .order("display_order")
            .then(({ data, error }) => {
              if (!cancelled && !error) setCakes((data ?? []) as CakePhoto[]);
            }),
          supabase
            .from("promo_banners")
            .select(
              "id,title,message,image_url,cta_label,cta_link,venue,start_date,end_date,display_order"
            )
            .eq("active", true)
            .order("display_order")
            .then(({ data, error }) => {
              if (!cancelled && !error) {
                const today = new Date().toISOString().slice(0, 10);
                setPromos(
                  ((data ?? []) as Promo[]).filter(
                    (p) =>
                      (!p.start_date || p.start_date <= today) &&
                      (!p.end_date || p.end_date >= today)
                  )
                );
              }
            }),
        ]);
      } finally {
        loading = false;
      }
    }
    void refresh();
    const interval = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return { reviews, cakes, promos };
}

export function PromoBanners({
  promos,
  venue,
}: {
  promos: Promo[];
  venue: Promo["venue"];
}) {
  const matching = promos.filter((p) => p.venue === venue);
  if (!matching.length) return null;
  return (
    <div className="h-wrap h-promotions" aria-label="Latest offers">
      {matching.map((p) => (
        <aside
          className={`h-promotion ${p.image_url ? "h-promotion-photo" : ""}`}
          key={p.id}
        >
          {p.image_url && (
            <img src={p.image_url} alt={p.title} loading="lazy" />
          )}
          <div>
            <p className="h-eyebrow">A little something special</p>
            <h3>{p.title}</h3>
            {p.message && <p>{p.message}</p>}
            {p.cta_label &&
              p.cta_link &&
              /^(https?:\/\/|\/(?!\/)|#[\w-])/.test(p.cta_link) && (
                <a className="h-link" href={p.cta_link}>
                  {p.cta_label}
                  <ArrowRight aria-hidden="true" />
                </a>
              )}
          </div>
        </aside>
      ))}
    </div>
  );
}

export function CakeGallery({ photos }: { photos: CakePhoto[] }) {
  const [category, setCategory] = useState("All");
  const categories = [
    ...new Set(photos.map((p) => p.category?.trim()).filter(Boolean)),
  ] as string[];
  const activeCategory = categories.includes(category) ? category : "All";
  const visible =
    activeCategory === "All"
      ? photos
      : photos.filter((p) => p.category?.trim() === activeCategory);
  if (!photos.length) return null;
  return (
    <div className="h-cake-gallery">
      <p className="h-eyebrow">A slice of inspiration</p>
      <h3>Made by us. Imagined by you.</h3>
      {categories.length > 1 && (
        <div className="h-gallery-filters" aria-label="Cake categories">
          {["All", ...categories].map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={activeCategory === c}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
      )}
      <div className="h-gallery-grid">
        {visible.map((p) => (
          <figure key={p.id}>
            <img
              src={p.image_url}
              alt={p.caption || `${p.category || "Custom"} cake by SNB Bakery`}
              loading="lazy"
            />
            {(p.caption || p.category) && (
              <figcaption>
                {p.category && <small>{p.category}</small>}
                {p.caption && <p>{p.caption}</p>}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
    </div>
  );
}
