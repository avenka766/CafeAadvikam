import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Cake,
  Cookie,
  Leaf,
  Sparkles,
  Heart as HeartIcon,
  Check,
  ChevronRight,
  CreditCard,
  Minus,
  PackageCheck,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import {
  catalogCategories,
  useBranchCatalogStore,
  type BranchCatalogItem,
} from "@/stores/branchCatalogStore";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { LeadEnquiry } from "@/components/features/LeadEnquiry";
import snbLogo from "@/assets/snb-logo.png";
import { CAFE_INFO } from "@/constants/cafeInfo";
import "@/styles/heritage.css";
import "@/styles/heritage-shop.css";

const prettyName = (value: string) =>
  value.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const formatCurrency = (value: number) => currencyFormatter.format(value);
const productIcon = (category: string) =>
  /CAKE/.test(category)
    ? Cake
    : /COOK|BISCUIT|BAKERY/.test(category)
    ? Cookie
    : /SWEET|HALWA|JAMUN|PAK|LADDU|BURFI|PEDA|BAKLAVA/.test(category)
    ? Sparkles
    : Leaf;

const COLLECTIONS = [
  {
    id: "sweets",
    label: "Sweets",
    pattern: /SWEET|HALWA|JAMUN|PAK|LADDU|BURFI|PEDA|BAKLAVA|CHOCOLATE/i,
  },
  {
    id: "savouries",
    label: "Savouries",
    pattern: /CHIPS|MURUK|MIX|NIPPAT|PAKODA|DAL/i,
  },
  {
    id: "bakes",
    label: "Bakes & cakes",
    pattern: /BAKERY|CAKE|BISCUIT|COOKIE/i,
  },
  { id: "pantry", label: "Pantry", pattern: /OIL|PICKLE/i },
];
const startingPrice = (item: BranchCatalogItem) =>
  item.price * (item.uom === "Kgs" ? 0.25 : 1);
const CART_STORAGE_KEY = "vrsnb-customer-order-v2";
const PHONE_STORAGE_KEY = "vrsnb-customer-phone";
const TAX_RATE = 0.03;

type CartLine = BranchCatalogItem & { quantity: number };
type CheckoutForm = {
  name: string;
  phone: string;
  address: string;
  locationPin: string;
  note: string;
  deliverySlot: string;
};
type StoredOrderDraft = { cart: CartLine[]; customer: CheckoutForm };

type RazorpayResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const EMPTY_CUSTOMER: CheckoutForm = {
  name: "",
  phone: "",
  address: "",
  locationPin: "",
  note: "",
  deliverySlot: "As soon as possible",
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function quantityStep(item: BranchCatalogItem) {
  return item.uom === "Kgs" ? 0.25 : 1;
}

function quantityLabel(line: CartLine) {
  return line.uom === "Kgs"
    ? `${line.quantity.toFixed(2)} kg`
    : `${line.quantity} ${line.quantity === 1 ? "item" : "items"}`;
}

function loadStoredDraft(): StoredOrderDraft {
  if (typeof window === "undefined")
    return { cart: [], customer: EMPTY_CUSTOMER };
  try {
    const parsed = JSON.parse(
      localStorage.getItem(CART_STORAGE_KEY) || "{}"
    ) as Partial<StoredOrderDraft>;
    return {
      cart: Array.isArray(parsed.cart) ? parsed.cart : [],
      customer: { ...EMPTY_CUSTOMER, ...(parsed.customer || {}) },
    };
  } catch {
    return { cart: [], customer: EMPTY_CUSTOMER };
  }
}

async function ensureRazorpayLoaded() {
  if (window.Razorpay) return;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-vrsnb-razorpay="true"]'
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Unable to load secure payment.")),
        { once: true }
      );
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.vrsnbRazorpay = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load secure payment."));
    document.head.appendChild(script);
  });
}

export default function BakeryOrderPage() {
  const navigate = useNavigate();
  const initialDraft = useMemo(loadStoredDraft, []);
  const [cart, setCart] = useState<CartLine[]>(initialDraft.cart);
  const [customer, setCustomer] = useState<CheckoutForm>(initialDraft.customer);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("featured");
  const [collection, setCollection] = useState("all");
  const [packSizes, setPackSizes] = useState<Record<number, number>>({});
  const [visibleCount, setVisibleCount] = useState(24);
  useEffect(
    () => setVisibleCount(24),
    [search, selectedCategory, collection, sort]
  );
  const [screen, setScreen] = useState<"menu" | "checkout">("menu");
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [screen]);
  const [paying, setPaying] = useState(false);
  // BUG FIX (audit 2026-09-02): payAndPlaceOrder relied only on disabled={paying} — a
  // useState flag updated asynchronously — with no synchronous guard inside the handler.
  // create-razorpay-order (the edge function this calls) has no idempotency key and
  // unconditionally creates a brand-new public_orders row + a brand-new live Razorpay
  // order on every invocation, so a fast double-tap on this public customer checkout
  // button could create two separate payable Razorpay orders for the same cart. Same
  // class already fixed in QROrderPage.tsx via a ref set synchronously before the first
  // await; mirrored here.
  const payingRef = useRef(false);
  const [error, setError] = useState("");
  const [addedNotice, setAddedNotice] = useState("");
  const {
    items: catalogByBranch,
    loadCatalog,
    subscribe,
  } = useBranchCatalogStore();
  const catalogItems = useMemo(
    () => catalogByBranch.VRSNB.filter((item) => item.active),
    [catalogByBranch]
  );
  const categories = useMemo(
    () => catalogCategories(catalogItems),
    [catalogItems]
  );

  useEffect(() => {
    void loadCatalog("VRSNB");
    return subscribe("VRSNB");
  }, [loadCatalog, subscribe]);

  useEffect(() => {
    if (!catalogItems.length) return;
    setCart((current) =>
      current.flatMap((line) => {
        const latest = catalogItems.find(
          (item) => item.barcode === line.barcode
        );
        return latest ? [{ ...latest, quantity: line.quantity }] : [];
      })
    );
  }, [catalogItems]);

  useEffect(() => {
    localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({ cart, customer } satisfies StoredOrderDraft)
    );
  }, [cart, customer]);

  useEffect(() => {
    if (!addedNotice) return;
    const timer = window.setTimeout(() => setAddedNotice(""), 1600);
    return () => window.clearTimeout(timer);
  }, [addedNotice]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = catalogItems.filter(
      (item) =>
        (selectedCategory === "all" || item.category === selectedCategory) &&
        (collection === "all" ||
          COLLECTIONS.find((c) => c.id === collection)!.pattern.test(
            item.category
          )) &&
        (!q ||
          item.name.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q) ||
          String(item.barcode).includes(q))
    );
    return sort === "name"
      ? matches.sort((a, b) => a.name.localeCompare(b.name))
      : sort === "price-low"
      ? matches.sort((a, b) => startingPrice(a) - startingPrice(b))
      : sort === "price-high"
      ? matches.sort((a, b) => startingPrice(b) - startingPrice(a))
      : matches;
  }, [catalogItems, search, selectedCategory, collection, sort]);

  const subtotal = useMemo(
    () =>
      roundMoney(
        cart.reduce((sum, line) => sum + line.price * line.quantity, 0)
      ),
    [cart]
  );
  const taxAmount = useMemo(() => roundMoney(subtotal * TAX_RATE), [subtotal]);
  const grandTotal = useMemo(
    () => roundMoney(subtotal + taxAmount),
    [subtotal, taxAmount]
  );

  const getQuantity = (barcode: number) =>
    cart.find((line) => line.barcode === barcode)?.quantity || 0;

  const setQuantity = (item: BranchCatalogItem, next: number) => {
    const safeNext = Math.max(0, Math.round(next * 100) / 100);
    setCart((current) => {
      if (safeNext <= 0)
        return current.filter((line) => line.barcode !== item.barcode);
      const existing = current.some((line) => line.barcode === item.barcode);
      return existing
        ? current.map((line) =>
            line.barcode === item.barcode
              ? { ...line, quantity: safeNext }
              : line
          )
        : [...current, { ...item, quantity: safeNext }];
    });
  };

  const addItem = (item: BranchCatalogItem) => {
    setQuantity(item, getQuantity(item.barcode) + quantityStep(item));
    setAddedNotice(`${item.name} added to cart`);
  };

  const validateCheckout = () => {
    if (!cart.length) return "Add at least one bakery item.";
    if (!customer.name.trim()) return "Enter the customer name.";
    if (!/^\d{10}$/.test(customer.phone.replace(/\D/g, "")))
      return "Enter a valid 10-digit mobile number.";
    if (!customer.address.trim()) return "Enter the complete delivery address.";
    if (!customer.locationPin.trim())
      return "Enter the area PIN code or map link.";
    return "";
  };

  const openCheckout = () => {
    if (!cart.length) {
      setError("Add at least one item before checkout.");
      return;
    }
    setError("");
    setScreen("checkout");
  };

  const payAndPlaceOrder = async () => {
    if (payingRef.current) return;
    const validationError = validateCheckout();
    if (validationError) {
      setError(validationError);
      return;
    }

    payingRef.current = true;
    setPaying(true);
    setError("");
    try {
      await ensureRazorpayLoaded();
      const phone = customer.phone.replace(/\D/g, "");
      const items = cart.map((line) => ({
        barcode: line.barcode,
        qty: line.quantity,
      }));
      const { data, error: createError } = await supabase.functions.invoke(
        "create-razorpay-order",
        {
          body: {
            customer: { ...customer, phone },
            items,
            subtotal,
            taxRate: 3,
            taxAmount,
            amount: Math.round(grandTotal * 100),
            notes: {
              source: "vrsnb_customer_booking",
              deliverySlot: customer.deliverySlot,
            },
          },
        }
      );
      if (
        createError ||
        !data?.orderId ||
        !data?.keyId ||
        !data?.publicOrderId
      ) {
        throw new Error(
          createError?.message || data?.error || "Unable to create the order."
        );
      }
      if (!window.Razorpay)
        throw new Error(
          "Secure payment is unavailable. Please refresh and retry."
        );

      const razorpay = new window.Razorpay({
        key: data.keyId,
        amount: data.amount,
        currency: "INR",
        name: "Sri Nanjundeshwara Bakery & Sweets",
        description: `Bakery order · ${cart.length} products`,
        order_id: data.orderId,
        prefill: { name: customer.name.trim(), contact: phone },
        notes: { public_order_id: data.publicOrderId, tax_rate: "3%" },
        theme: { color: "#16120d" },
        modal: {
          ondismiss: () => {
            payingRef.current = false;
            setPaying(false);
          },
        },
        config: {
          display: {
            blocks: {
              upi: { name: "Pay via UPI", instruments: [{ method: "upi" }] },
              wallet: {
                name: "Pay via Wallet",
                instruments: [{ method: "wallet" }],
              },
            },
            sequence: ["block.upi", "block.wallet"],
            preferences: { show_default_blocks: false },
          },
        },
        handler: async (response: RazorpayResponse) => {
          try {
            const { data: verified, error: verifyError } =
              await supabase.functions.invoke("verify-razorpay-payment", {
                body: { ...response, publicOrderId: data.publicOrderId },
              });
            if (verifyError || !verified?.success)
              throw new Error(
                verifyError?.message ||
                  verified?.error ||
                  "Payment verification failed."
              );
            payingRef.current = false;
            localStorage.setItem(PHONE_STORAGE_KEY, phone);
            localStorage.removeItem(CART_STORAGE_KEY);
            setCart([]);
            setCustomer(EMPTY_CUSTOMER);
            navigate(
              `/order/track?phone=${encodeURIComponent(
                phone
              )}&order=${encodeURIComponent(
                verified.orderNumber || data.orderNumber || ""
              )}`,
              { replace: true }
            );
          } catch (verificationError) {
            setError(
              verificationError instanceof Error
                ? verificationError.message
                : "Payment verification failed."
            );
            payingRef.current = false;
            setPaying(false);
          }
        },
      });
      razorpay.open();
    } catch (orderError) {
      setError(
        orderError instanceof Error
          ? orderError.message
          : "Unable to place the order."
      );
      payingRef.current = false;
      setPaying(false);
    }
  };

  function cartLines() {
    return cart.map((line) => (
      <article className="s-basket-line" key={line.barcode}>
        <div className="s-line-title">
          <strong>{prettyName(line.name)}</strong>
          <button
            type="button"
            onClick={() => setQuantity(line, 0)}
            aria-label={`Remove ${line.name}`}
          >
            <Trash2 />
          </button>
        </div>
        <div className="s-line-bottom">
          <div className="s-mini-quantity">
            <button
              type="button"
              onClick={() =>
                setQuantity(line, line.quantity - quantityStep(line))
              }
              aria-label={`Decrease ${line.name}`}
            >
              <Minus />
            </button>
            <span>{quantityLabel(line)}</span>
            <button
              type="button"
              onClick={() => addItem(line)}
              aria-label={`Increase ${line.name}`}
            >
              <Plus />
            </button>
          </div>
          <span>{formatCurrency(roundMoney(line.price * line.quantity))}</span>
        </div>
      </article>
    ));
  }
  function totals() {
    return (
      <div className="s-totals">
        <div>
          <span>Subtotal</span>
          <strong>{formatCurrency(subtotal)}</strong>
        </div>
        <div>
          <span>Tax (3%)</span>
          <strong>{formatCurrency(taxAmount)}</strong>
        </div>
        <div>
          <span>Total</span>
          <strong>{formatCurrency(grandTotal)}</strong>
        </div>
      </div>
    );
  }
  return (
    <main
      className={cn(
        "heritage s-shop",
        cart.length > 0 && screen === "menu" && "s-has-cart"
      )}
    >
      <header className="h-nav">
        <div className="h-wrap h-nav-inner">
          <Link to="/" className="h-brand">
            <img src={snbLogo} alt="SNB" />
            <span>
              <strong>SNB Sweets & Bakes</strong>
              <small>Sri Nanjundeshwara Bakery · Since 1988</small>
            </span>
          </Link>
          <nav className="s-header-links" aria-label="Shop navigation">
            <button
              type="button"
              aria-label={
                screen === "checkout" ? "Back to shopping" : "Back to our story"
              }
              onClick={() =>
                screen === "checkout" ? setScreen("menu") : navigate("/")
              }
            >
              <ArrowLeft />
              <span>
                {screen === "checkout" ? "Keep exploring" : "Our story"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => navigate("/order/track")}
              aria-label="Track order"
            >
              <PackageCheck />
              <span>Track order</span>
            </button>
          </nav>
        </div>
      </header>
      <div className="s-announcement">
        A little taste of home, wherever you are. Now delivering Pan-India.
      </div>
      <ol className="s-steps h-wrap" aria-label="Ordering steps">
        <li aria-current={screen === "menu" ? "step" : undefined}>
          <span>01</span> Choose your favourites
        </li>
        <li aria-current={screen === "checkout" ? "step" : undefined}>
          <span>02</span> Delivery details
        </li>
        <li>
          <span>03</span> Secure payment
        </li>
      </ol>
      {addedNotice && (
        <div className="s-toast" role="status" aria-live="polite">
          <Check />
          {addedNotice}
        </div>
      )}
      {screen === "menu" ? (
        <>
          <div className="h-wrap">
            <section className="s-hero">
              <div>
                <p className="h-eyebrow">From our family kitchen to yours</p>
                <h1>
                  A box of joy.
                  <br />
                  <em>A taste of tradition.</em>
                </h1>
                <p className="h-copy">
                  Pick something you love, something to share, or a little of
                  both. Your next sweet memory starts here.
                </p>
                <div className="s-trust">
                  <span>
                    <ShieldCheck />
                    Quality ingredients
                  </span>
                  <span>
                    <Truck />
                    Pan-India delivery
                  </span>
                  <span>
                    <HeartIcon />
                    Made with care
                  </span>
                </div>
              </div>
              <div className="s-hero-art">
                <img
                  src="/images/heritage/special-sweets.jpeg"
                  alt="SNB special sweets assortment"
                />
                <img
                  src="/images/heritage/cashew-sweets.jpeg"
                  alt="SNB cashew sweets assortment"
                />
              </div>
            </section>
            <nav className="s-collections" aria-label="Shop collections">
              <button
                type="button"
                aria-pressed={collection === "all"}
                onClick={() => {
                  setCollection("all");
                  setSelectedCategory("all");
                }}
              >
                All favourites
              </button>
              {COLLECTIONS.filter((c) =>
                catalogItems.some((item) => c.pattern.test(item.category))
              ).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={collection === c.id}
                  onClick={() => {
                    setCollection(c.id);
                    setSelectedCategory("all");
                  }}
                >
                  {c.label}
                </button>
              ))}
            </nav>
            <section className="s-search-row" aria-label="Find products">
              <div className="s-search">
                <Search aria-hidden="true" />
                <input
                  aria-label="Search products"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Find your favourite sweets, savouries and more…"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                  >
                    <X />
                  </button>
                )}
              </div>
              <label className="s-sort">
                Sort by
                <select
                  aria-label="Sort products"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="featured">Our selection</option>
                  <option value="name">Name A–Z</option>
                  <option value="price-low">Starting price: low to high</option>
                  <option value="price-high">
                    Starting price: high to low
                  </option>
                </select>
              </label>
            </section>
            <label className="s-mobile-filter">
              Browse by category
              <select
                value={selectedCategory}
                onChange={(event) => {
                  setSelectedCategory(event.target.value);
                  setCollection("all");
                }}
              >
                <option value="all">All our favourites</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {prettyName(category)}
                  </option>
                ))}
              </select>
            </label>
            <div className="s-layout">
              <aside className="s-categories" aria-label="Product categories">
                <h2>Find your favourites</h2>
                <button
                  type="button"
                  aria-pressed={selectedCategory === "all"}
                  onClick={() => {
                    setSelectedCategory("all");
                    setCollection("all");
                  }}
                >
                  All products<small>{catalogItems.length}</small>
                </button>
                {categories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    aria-pressed={selectedCategory === category}
                    onClick={() => {
                      setSelectedCategory(category);
                      setCollection("all");
                    }}
                  >
                    {prettyName(category)}
                    <small>
                      {
                        catalogItems.filter(
                          (item) => item.category === category
                        ).length
                      }
                    </small>
                  </button>
                ))}
              </aside>
              <section aria-label="Products">
                <div className="s-products-top">
                  <h2>
                    {search
                      ? "Your search results"
                      : selectedCategory === "all"
                      ? "Made for your cravings"
                      : prettyName(selectedCategory)}
                  </h2>
                  <span role="status">{filteredItems.length} products</span>
                </div>
                {filteredItems.length > 0 ? (
                  <>
                    <div className="s-products">
                      {filteredItems.slice(0, visibleCount).map((item) => {
                        const quantity = getQuantity(item.barcode);
                        const Icon = productIcon(item.category);
                        const packSize =
                          item.uom === "Kgs"
                            ? packSizes[item.barcode] || 0.25
                            : 1;
                        return (
                          <article
                            key={item.barcode}
                            className={cn(
                              "s-product",
                              quantity > 0 && "s-product-selected"
                            )}
                          >
                            <div className="s-product-top">
                              <Icon aria-hidden="true" />
                              <small>{prettyName(item.category)}</small>
                            </div>
                            <h3>{prettyName(item.name)}</h3>
                            <p className="s-product-price">
                              <strong>
                                {formatCurrency(
                                  roundMoney(item.price * packSize)
                                )}
                              </strong>
                              <small>
                                {item.uom === "Kgs"
                                  ? ` / ${
                                      packSize === 1
                                        ? "1 kg"
                                        : `${packSize * 1000} g`
                                    }`
                                  : "/ item"}
                              </small>
                            </p>
                            {item.uom === "Kgs" && (
                              <label className="s-pack-size">
                                <span>{formatCurrency(item.price)} / kg</span>
                                <select
                                  aria-label={`Pack size for ${item.name}`}
                                  value={packSize}
                                  onChange={(e) =>
                                    setPackSizes({
                                      ...packSizes,
                                      [item.barcode]: Number(e.target.value),
                                    })
                                  }
                                >
                                  <option value={0.25}>250 g</option>
                                  <option value={0.5}>500 g</option>
                                  <option value={1}>1 kg</option>
                                </select>
                              </label>
                            )}
                            <div className="s-product-bottom">
                              {quantity === 0 ? (
                                <button
                                  type="button"
                                  className="s-add"
                                  onClick={() => {
                                    setQuantity(item, packSize);
                                    setAddedNotice(
                                      `${item.name} added to your basket`
                                    );
                                  }}
                                  aria-label={`Add ${item.name}`}
                                >
                                  <Plus />
                                  {item.uom === "Kgs"
                                    ? `Add ${
                                        packSize === 1
                                          ? "1 kg"
                                          : `${packSize * 1000} g`
                                      }`
                                    : "Add to basket"}
                                </button>
                              ) : (
                                <div className="s-quantity">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setQuantity(
                                        item,
                                        quantity - quantityStep(item)
                                      )
                                    }
                                    aria-label={`Decrease ${item.name}`}
                                  >
                                    <Minus />
                                  </button>
                                  <span>
                                    {item.uom === "Kgs"
                                      ? `${quantity.toFixed(2)} kg`
                                      : `${quantity} ${
                                          quantity === 1 ? "item" : "items"
                                        }`}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => addItem(item)}
                                    aria-label={`Increase ${item.name}`}
                                  >
                                    <Plus />
                                  </button>
                                </div>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                    {visibleCount < filteredItems.length && (
                      <button
                        className="h-button s-show-more"
                        type="button"
                        onClick={() => setVisibleCount((count) => count + 24)}
                      >
                        Explore more favourites <ArrowRight />
                      </button>
                    )}
                  </>
                ) : (
                  <div className="s-empty">
                    <Search />
                    <h3>No favourites found just yet.</h3>
                    <p>Try another name or explore a different category.</p>
                    <button
                      className="h-link"
                      type="button"
                      onClick={() => {
                        setSearch("");
                        setSelectedCategory("all");
                        setCollection("all");
                      }}
                    >
                      Show all products <ArrowRight />
                    </button>
                  </div>
                )}
              </section>
              <aside className="s-basket" aria-label="Your basket">
                <div className="s-basket-title">
                  <h2>Your little box of joy</h2>
                  <span>{cart.length}</span>
                </div>
                {cart.length ? (
                  <>
                    <div className="s-basket-lines">{cartLines()}</div>
                    {totals()}
                    <button
                      className="h-button"
                      type="button"
                      onClick={openCheckout}
                    >
                      Continue to checkout <ArrowRight />
                    </button>
                    <p className="s-payment-note">
                      <ShieldCheck />
                      Secure payment with Razorpay
                    </p>
                  </>
                ) : (
                  <div className="s-empty-basket">
                    <ShoppingBag />
                    <p>Something delicious belongs here.</p>
                    <small>
                      Add your favourites and we will keep them ready in your
                      basket.
                    </small>
                  </div>
                )}
              </aside>
            </div>
          </div>
          {cart.length > 0 && (
            <div className="s-mobile-basket">
              <div>
                <strong>
                  {cart.length} {cart.length === 1 ? "product" : "products"} in
                  your basket
                </strong>
                <small>{formatCurrency(grandTotal)} · including tax</small>
              </div>
              <button type="button" onClick={openCheckout}>
                View basket <ArrowRight />
              </button>
            </div>
          )}
          <section className="h-wrap s-personal-help">
            <div>
              <p className="h-eyebrow">Something a little more personal</p>
              <h2>Big celebrations. Thoughtful gifts.</h2>
              <p>
                Planning a bulk order, corporate gifts or a custom cake? Tell us
                what you have in mind and our team will help you choose.
              </p>
            </div>
            <LeadEnquiry topic="Bulk order & gifting">
              Plan an order with us
            </LeadEnquiry>
          </section>
        </>
      ) : (
        <div className="h-wrap">
          <header className="s-checkout-top">
            <p className="h-eyebrow">A little closer to something delicious</p>
            <h1>
              Let's bring it <em>home.</em>
            </h1>
            <div className="s-steps">
              <span>01 · Your favourites</span>
              <ChevronRight />
              <strong>02 · Delivery & payment</strong>
              <ChevronRight />
              <span>03 · Enjoy</span>
            </div>
          </header>
          <div className="s-checkout">
            <div>
              <section className="s-checkout-panel">
                <div className="s-checkout-heading">
                  <h2>Your favourites</h2>
                  <button
                    type="button"
                    className="h-link"
                    onClick={() => setScreen("menu")}
                  >
                    Add more <Plus size={15} />
                  </button>
                </div>
                {cart.length > 0 ? (
                  <div className="s-checkout-lines">{cartLines()}</div>
                ) : (
                  <div className="s-empty-basket">
                    <ShoppingBag />
                    <p>Your basket is empty.</p>
                    <button
                      type="button"
                      className="h-link"
                      onClick={() => setScreen("menu")}
                    >
                      Find your favourites <ArrowRight />
                    </button>
                  </div>
                )}
              </section>
              <section className="s-checkout-panel">
                <p className="h-eyebrow">Where shall we send your order?</p>
                <h2>Delivery details</h2>
                <p>
                  Use this mobile number to follow your order, from our kitchen
                  to your door.
                </p>
                <div className="s-form-grid">
                  <label>
                    Your name *
                    <input
                      required
                      value={customer.name}
                      onChange={(event) =>
                        setCustomer({ ...customer, name: event.target.value })
                      }
                      autoComplete="name"
                      placeholder="Full name"
                    />
                  </label>
                  <label>
                    Mobile number *
                    <input
                      required
                      value={customer.phone}
                      onChange={(event) =>
                        setCustomer({
                          ...customer,
                          phone: event.target.value
                            .replace(/\D/g, "")
                            .slice(0, 10),
                        })
                      }
                      inputMode="numeric"
                      autoComplete="tel"
                      maxLength={10}
                      placeholder="10-digit mobile number"
                    />
                  </label>
                  <label className="s-form-wide">
                    Delivery address *
                    <textarea
                      required
                      value={customer.address}
                      onChange={(event) =>
                        setCustomer({
                          ...customer,
                          address: event.target.value,
                        })
                      }
                      autoComplete="street-address"
                      rows={3}
                      placeholder="House or building, street, area, city and state"
                    />
                  </label>
                  <label>
                    PIN code or map link *
                    <input
                      required
                      value={customer.locationPin}
                      onChange={(event) =>
                        setCustomer({
                          ...customer,
                          locationPin: event.target.value,
                        })
                      }
                      placeholder="Your PIN code or Google Maps link"
                    />
                  </label>
                  <label>
                    Preferred delivery slot
                    <select
                      value={customer.deliverySlot}
                      onChange={(event) =>
                        setCustomer({
                          ...customer,
                          deliverySlot: event.target.value,
                        })
                      }
                    >
                      <option>As soon as possible</option>
                      <option>Morning · 8 AM–12 PM</option>
                      <option>Afternoon · 12 PM–4 PM</option>
                      <option>Evening · 4 PM–8 PM</option>
                    </select>
                  </label>
                  <label className="s-form-wide">
                    A little note for us
                    <textarea
                      value={customer.note}
                      onChange={(event) =>
                        setCustomer({ ...customer, note: event.target.value })
                      }
                      rows={2}
                      placeholder="Packing requests, a cake message or delivery instructions"
                    />
                  </label>
                </div>
                <p style={{ marginTop: 16 }}>
                  Delivery slots are preferences for local orders. Pan-India
                  delivery timing depends on your destination.
                </p>
              </section>
            </div>
            <aside className="s-basket" aria-label="Payment summary">
              <p className="h-eyebrow">Made with care. Almost yours.</p>
              <h2>Order summary</h2>
              {totals()}
              <p className="s-payment-note">
                <ShieldCheck />
                Secure Razorpay payment
              </p>
              <p className="s-payment-note">
                <PackageCheck />
                Track your order by mobile number
              </p>
              {error && (
                <p className="s-error" role="alert">
                  {error}
                </p>
              )}
              <button
                type="button"
                className="h-button"
                onClick={() => void payAndPlaceOrder()}
                disabled={paying || !cart.length}
              >
                <CreditCard />
                {paying
                  ? "Opening payment…"
                  : `Pay ${formatCurrency(grandTotal)} & place order`}
              </button>
              <button
                className="h-link"
                type="button"
                onClick={() => setScreen("menu")}
              >
                Continue shopping
              </button>
            </aside>
          </div>
        </div>
      )}
      <footer className="s-footer">
        <p>From our family kitchen, with love. Since 1988.</p>
        <p>
          <Link to="/">Our story</Link>
          <a href={`tel:${CAFE_INFO.phone.replace(/\s/g, "")}`}>
            Need a hand? {CAFE_INFO.phone}
          </a>
        </p>
      </footer>
    </main>
  );
}
