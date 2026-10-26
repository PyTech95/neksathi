import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { rupee } from "@/lib/pay";
import { Package, QrCode, ChevronRight } from "lucide-react";

const STATUS = {
  pending_payment: { l: "Payment pending", c: "pill-warn" },
  paid: { l: "Paid", c: "pill-ok" },
  generating: { l: "QR generating", c: "pill-info" },
  printed: { l: "Printed", c: "pill-info" },
  shipped: { l: "Shipped", c: "pill-info" },
  out_for_delivery: { l: "Out for delivery", c: "pill-info" },
  delivered: { l: "Delivered", c: "pill-ok" },
  cancelled: { l: "Cancelled", c: "pill-danger" },
};

export default function Orders() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/me/orders").then((r) => setItems(r.data.items || [])).finally(() => setLoading(false));
  }, []);

  return (
    <div className="page" data-testid="orders-page">
      <div className="container-nk" style={{ maxWidth: 760 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
          <div>
            <span className="chip"><Package size={13} /> My orders</span>
            <h1 style={{ fontSize: 30, marginTop: 12 }}>QR <span className="neon">orders</span></h1>
          </div>
          <Link to="/buy-qr" className="btn btn-primary" data-testid="buy-qr-btn"><QrCode size={17} /> Order QR</Link>
        </div>

        {loading && <div className="spinner" />}
        {!loading && items.length === 0 && (
          <div className="glass card-pad center" style={{ padding: 34 }}>
            <QrCode size={40} className="muted" />
            <p className="muted" style={{ marginTop: 10 }}>No orders yet. Order a QR sticker for your vehicle.</p>
            <Link to="/buy-qr" className="btn btn-primary" style={{ marginTop: 14 }}><QrCode size={16} /> Order QR</Link>
          </div>
        )}

        <div className="grid" style={{ gap: 12 }}>
          {items.map((o) => {
            const s = STATUS[o.status] || { l: o.status, c: "pill-muted" };
            return (
              <Link key={o.id} to={`/orders/${o.id}`} className="glass glass-hover card-pad" data-testid={`order-${o.id}`}
                style={{ textDecoration: "none", color: "inherit", display: "flex", alignItems: "center", gap: 14 }}>
                <div className="brand-badge" style={{ borderRadius: 12 }}><QrCode size={18} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <b style={{ fontSize: 17 }}>{o.number_plate || (o.product_type === "tag" ? "Tag" : "Vehicle")}</b>
                    <span className="pill pill-muted" style={{ textTransform: "capitalize" }}>{o.product_type === "tag" ? (o.tag_type || "tag") : "vehicle"}</span>
                    <span className={`pill ${s.c}`}>{s.l}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{o.plan_name} · {rupee(o.amount_paise)} · {new Date(o.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })}</div>
                </div>
                <ChevronRight size={18} className="muted" />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
