export default function StaffPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "linear-gradient(180deg, #51208b 0%, #3b0d68 100%)",
        color: "white",
        padding: "24px",
      }}
    >
      <section
        style={{
          width: "min(520px, 100%)",
          textAlign: "center",
          padding: "28px",
          border: "1px solid rgba(255,255,255,.2)",
          borderRadius: "12px",
          background: "rgba(0,0,0,.18)",
        }}
      >
        <div style={{ fontSize: "34px", marginBottom: "10px" }}>🛡</div>
        <h1 style={{ margin: 0, fontSize: "28px" }}>Kwentayo Staff</h1>
        <p style={{ marginTop: "10px", opacity: 0.85 }}>
          Use the Staff button in the lower-right corner to sign in with your private admin or moderator PIN.
        </p>
      </section>
    </main>
  );
}
