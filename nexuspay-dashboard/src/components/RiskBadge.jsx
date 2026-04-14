export default function RiskBadge({ decision }) {
  let bg = "#e5e7eb";
  let color = "#111827";

  if (decision === "APPROVE") {
    bg = "#dcfce7";
    color = "#166534";
  } else if (decision === "FLAG") {
    bg = "#fef3c7";
    color = "#92400e";
  } else if (decision === "BLOCK") {
    bg = "#fee2e2";
    color = "#991b1b";
  }

  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        background: bg,
        color,
      }}
    >
      {decision || "UNKNOWN"}
    </span>
  );
}