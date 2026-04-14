export default function BalanceCard({ balance }) {
  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 12,
        padding: 20,
        background: "#fff",
      }}
    >
      <h3 style={{ marginTop: 0 }}>Wallet Balance</h3>
      <p style={{ margin: "8px 0" }}><strong>USD:</strong> {balance?.usd ?? 0}</p>
      <p style={{ margin: "8px 0" }}><strong>EUR:</strong> {balance?.eur ?? 0}</p>
    </div>
  );
}