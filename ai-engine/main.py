from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional

app = FastAPI()

# 📥 Input schema (SAFE VERSION)
class PaymentData(BaseModel):
    amount: float
    currency: str
    user_id: Optional[str] = None
    velocity: Optional[int] = 0
    failures: Optional[int] = 0

# 🧠 AI endpoint
@app.post("/predict")
def predict(data: PaymentData):
    risk_score = 0
    reasons = []

    # RULE 1 — Amount
    if data.amount > 500:
        risk_score += 50
        reasons.append("High amount")

    # RULE 2 — Velocity
    if data.velocity and data.velocity > 3:
        risk_score += 30
        reasons.append("High velocity")

    # RULE 3 — Failures
    if data.failures and data.failures > 2:
        risk_score += 20
        reasons.append("Multiple failures")

    # 🎯 Decision
    if risk_score >= 70:
        decision = "BLOCK"
    elif risk_score >= 40:
        decision = "FLAG"
    else:
        decision = "APPROVE"

    return {
        "riskScore": risk_score,
        "decision": decision,
        "reasons": reasons
    }

# ✅ health check
@app.get("/")
def home():
    return {"message": "AI Engine Running 🚀"}