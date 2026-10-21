// Razorpay checkout helper. Works in DRY-RUN (no keys) for local testing:
// when createResp.dry_run is true we resolve immediately so the verify step
// completes the journey without any real payment.

function loadScript(src) {
  return new Promise((resolve) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve(true);
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

// createResp = response from /orders/create or /me/recharge/create.
// Resolves with the verify payload (empty for dry-run), rejects if cancelled.
export async function runCheckout(createResp) {
  if (createResp.dry_run) {
    return { dry: true };
  }
  const ok = await loadScript("https://checkout.razorpay.com/v1/checkout.js");
  if (!ok) throw new Error("Could not load Razorpay. Check your connection.");
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: createResp.key_id,
      amount: createResp.amount_paise,
      currency: createResp.currency || "INR",
      name: createResp.name || "Nek Sathi",
      description: createResp.description || "",
      order_id: createResp.provider_order_id,
      prefill: createResp.prefill || {},
      theme: { color: "#e92546" },
      handler: (resp) =>
        resolve({
          razorpay_payment_id: resp.razorpay_payment_id,
          razorpay_order_id: resp.razorpay_order_id,
          razorpay_signature: resp.razorpay_signature,
        }),
      modal: { ondismiss: () => reject(new Error("Payment cancelled")) },
    });
    rzp.open();
  });
}

export const rupee = (paise) => `₹${(((paise || 0) / 100)).toLocaleString("en-IN")}`;
