import pandas as pd
from sklearn.ensemble import RandomForestClassifier
import joblib

# Dummy training data (replace later with real DB data)
data = pd.DataFrame({
    "amount": [10, 50, 500, 1000, 20, 700],
    "velocity": [1, 2, 5, 6, 1, 5],
    "currency_anomaly": [0, 0, 1, 1, 0, 1],
    "fraud_history": [0, 0, 1, 1, 0, 1],
    "fraud": [0, 0, 1, 1, 0, 1]
})

X = data[["amount", "velocity", "currency_anomaly", "fraud_history"]]
y = data["fraud"]

model = RandomForestClassifier()
model.fit(X, y)

joblib.dump(model, "fraud_model.pkl")

print("✅ Model trained and saved")