// Small, centered, responsive copyright line used across the app (auth screens +
// Profile). The year is dynamic so it never needs updating. Colour uses var(--muted)
// so it reads well in both Light and Dark themes, on phone and web.
export default function Copyright({ style }) {
  const year = new Date().getFullYear();
  return (
    <div
      data-testid="copyright"
      style={{
        textAlign: "center",
        fontSize: 11.5,
        lineHeight: 1.65,
        color: "var(--muted)",
        padding: "18px 16px 22px",
        maxWidth: 420,
        margin: "0 auto",
        ...style,
      }}
    >
      © {year} Nek Sathi. All rights reserved.
      <br />
      Powered by NSTU India Pvt. Ltd.
    </div>
  );
}
