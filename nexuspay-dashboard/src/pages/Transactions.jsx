import { useEffect, useState } from "react";
import API from "../services/api";
import TransactionTable from "../components/TransactionTable";

export default function Transactions({ reloadKey = 0 }) {
  const [transactions, setTransactions] = useState([]);

  async function loadTransactions() {
    const res = await API.get("/wallet/transactions");
    setTransactions(res.data);
  }

  useEffect(() => {
    loadTransactions();
  }, [reloadKey]);

  return <TransactionTable transactions={transactions} />;
}