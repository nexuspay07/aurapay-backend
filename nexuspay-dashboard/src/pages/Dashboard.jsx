import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import API from "../services/api";

import BalanceCard from "../components/BalanceCard";
import SendMoney from "./SendMoney";
import Transactions from "./Transactions";
import FraudStatus from "./FraudStatus";

export default function Dashboard() {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [balance, setBalance] = useState({ usd: 0, eur: 0 });
  const [reloadKey, setReloadKey] = useState(0);

  async function loadBalance() {
    const res = await API.get("/user/balance");
    setBalance(res.data);
  }

  async function refreshAll() {
    await Promise.all([loadBalance(), refreshUser()]);
    setReloadKey((prev) => prev + 1);
  }

  useEffect(() => {
    loadBalance();
  }, []);

  function handleLogout() {
    logout();
    navigate("/");
  }

  return (
    <div style={page}>
      <header style={header}>
        <div>
          <h1 style={{ margin: 0 }}>Aurapay</h1>
          <p style={{ margin: "6px 0 0", color: "#666" }}>
            Welcome {user?.email}
          </p>
        </div>

        <button style={logoutBtn} onClick={handleLogout}>
          Logout
        </button>
      </header>

      <div style={grid}>
        <BalanceCard balance={balance} />
        <SendMoney onPaymentSuccess={refreshAll} />
      </div>

      <div style={{ marginTop: 20 }}>
        <FraudStatus />
      </div>

      <div style={{ marginTop: 20 }}>
        <Transactions reloadKey={reloadKey} />
      </div>
    </div>
  );
}

const page = {
  minHeight: "100vh",
  background: "#f5f7fb",
  padding: 24,
};

const header = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 20,
};

const grid = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 20,
};

const logoutBtn = {
  padding: "10px 16px",
  border: "none",
  borderRadius: 8,
  background: "#111827",
  color: "#fff",
  cursor: "pointer",
};