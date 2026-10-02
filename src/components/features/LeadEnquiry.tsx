import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, Check, Phone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { CAFE_INFO } from "@/constants/cafeInfo";

export function LeadEnquiry({
  topic = "General enquiry",
  message,
  children,
  light = false,
  text = false,
}: {
  topic?: string;
  message?: string;
  children: ReactNode;
  light?: boolean;
  text?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  const busy = useRef(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    date: "",
    guests: "",
    location: "",
    details: "",
  });
  const event =
    /party|wedding|birthday|function|catering|corporate|engagement|anniversar|celebration/i.test(
      topic
    );
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy.current) return;
    const digits = form.phone.replace(/\D/g, "");
    if (
      !form.name.trim() ||
      !/^[\d\s+()-]+$/.test(form.phone) ||
      !/^\d{10,13}$/.test(digits)
    ) {
      setError("Please enter your name and a valid mobile number.");
      return;
    }
    busy.current = true;
    setStatus("sending");
    setError("");
    try {
      const { error: saveError } = await supabase
        .from("party_hall_enquiries")
        .insert({
          name: form.name.trim(),
          phone: form.phone.trim(),
          event_type: topic,
          event_date: form.date || null,
          guest_count: event && form.guests ? Number(form.guests) : null,
          preferred_time: null,
          requirements: [
            form.location.trim() && `Location: ${form.location.trim()}`,
            form.details.trim(),
            `Source: ${window.location.pathname} · ${topic}`,
          ]
            .filter(Boolean)
            .join("\n"),
        });
      if (saveError) throw saveError;
      setStatus("sent");
    } catch {
      setStatus("idle");
      setError(
        "Your request could not be sent. Please try again, or call our team below."
      );
    } finally {
      busy.current = false;
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={
            text ? "h-link" : `h-button ${light ? "h-button-light" : ""}`
          }
        >
          {children}
          <ArrowRight aria-hidden="true" />
        </button>
      </DialogTrigger>
      <DialogContent className="heritage h-enquiry">
        <p className="h-eyebrow">Let us take care of the details</p>
        <DialogTitle>{topic}</DialogTitle>
        <DialogDescription>
          Tell us a little about your plans. Our team will contact you
          personally to help.
        </DialogDescription>
        {status === "sent" ? (
          <div className="h-enquiry-success" role="status">
            <Check />
            <h3>You're on our list.</h3>
            <p>
              Thank you, {form.name}. We have received your{" "}
              {topic.toLowerCase()} request and will contact you on {form.phone}
              .
            </p>
            <button className="h-button" onClick={() => setOpen(false)}>
              Continue exploring
            </button>
          </div>
        ) : (
          <form className="h-hall-form" onSubmit={submit}>
            <label>
              Your name
              <input
                required
                maxLength={100}
                autoComplete="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              Mobile number
              <input
                required
                type="tel"
                maxLength={18}
                autoComplete="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </label>
            <label>
              Preferred date (optional)
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </label>
            <label>
              Your city or area
              <input
                autoComplete="address-level2"
                maxLength={150}
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="Hosur, Bangalore, Attibele…"
              />
            </label>
            {event && (
              <label className="h-form-wide">
                Expected guests (optional)
                <input
                  type="number"
                  min="1"
                  step="1"
                  max="100000"
                  value={form.guests}
                  onChange={(e) => setForm({ ...form, guests: e.target.value })}
                />
              </label>
            )}
            <label className="h-form-wide">
              What do you have in mind?
              <textarea
                rows={3}
                maxLength={2000}
                value={form.details}
                onChange={(e) => setForm({ ...form, details: e.target.value })}
                placeholder={
                  /cake/i.test(topic)
                    ? "Flavour, size, theme and any special touches…"
                    : "Share your requirements and a good time to call…"
                }
              />
            </label>
            <p className="h-form-wide h-enquiry-note">
              By sending, you agree that our team may contact you about this
              request.
            </p>
            {error && (
              <p role="alert" className="h-form-wide">
                {error}
              </p>
            )}
            <button
              type="submit"
              className="h-button h-form-wide"
              disabled={status === "sending"}
            >
              {status === "sending"
                ? "Sending your request…"
                : "Request a callback"}
              <ArrowRight />
            </button>
          </form>
        )}
        <div className="h-enquiry-contact">
          <a href={`tel:${CAFE_INFO.phone.replace(/\s/g, "")}`}>
            <Phone size={15} />
            Prefer to call?
          </a>
          {/cake/i.test(topic) && (
            <a
              href={`https://wa.me/${
                CAFE_INFO.whatsapp
              }?text=${encodeURIComponent(
                message ||
                  `Hi SNB Bakery, I would like to share a reference picture for my ${topic.toLowerCase()}.`
              )}`}
              target="_blank"
              rel="noreferrer"
            >
              Share a cake reference on WhatsApp ↗
            </a>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
