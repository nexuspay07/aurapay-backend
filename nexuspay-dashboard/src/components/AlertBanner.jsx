export default function AlertBanner({ message, type = "info" }) {
  const styles = {
    info: {
      background: "#eef4ff",
      color: "#1d4ed8",
      border: "1px solid #bfdbfe",
    },
    success: {
      background: "#ecfdf5",
      color: "#047857",
      border: "1px solid #a7f3d0",
    },
    warning: {
      background: "#fffbeb",
      color: "#b45309",
      border: "1px solid #fde68a",
    },
    danger: {
      background: "#fef2f2",
      color: "#b91c1c",
      border: "1px solid #fecaca",
    },
  };

  return (
    <div
      style={{
        padding: "12px 16px",
        borderRadius: 10,
        marginBottom: 16,
        ...styles[type],
      }}
    >
      {message}
    </div>
  );
}