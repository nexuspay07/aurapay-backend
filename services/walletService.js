const User = require("../models/User");
const { convert } = require("./fxService");

const round = (num) =>
  Math.round(num * 100) / 100;

async function validateWalletBalance(
  user,
  amount,
  currency
) {
  const currentUsd =
    Number(user.balance?.usd || 0);

  const currentEur =
    Number(user.balance?.eur || 0);

  let usedConverted = false;

  const currentBalance =
    currency === "usd"
      ? currentUsd
      : currentEur;

  if (currentBalance >= amount) {
    return {
      usedConverted: false,
    };
  }

  const otherCurrency =
    currency === "usd"
      ? "eur"
      : "usd";

  const otherBalance =
    otherCurrency === "usd"
      ? currentUsd
      : currentEur;

  const converted =
    convert(
      otherBalance,
      otherCurrency,
      currency
    );

  if (converted < amount) {
    throw new Error(
      "Insufficient balance."
    );
  }

  const deduction =
    round(
      convert(
        amount,
        currency,
        otherCurrency
      )
    );

  await User.findByIdAndUpdate(
    user._id,
    {
      $inc: {
        [`balance.${otherCurrency}`]:
          -deduction,
      },
    }
  );

  usedConverted = true;

  return {
    usedConverted,
  };
}

async function debitWallet(
  userId,
  currency,
  amount
) {
  await User.findByIdAndUpdate(
    userId,
    {
      $inc: {
        [`balance.${currency}`]:
          -amount,
      },
    }
  );
}

async function refundConvertedBalance(
  userId,
  currency,
  amount
) {
  const otherCurrency =
    currency === "usd"
      ? "eur"
      : "usd";

  const refund =
    round(
      convert(
        amount,
        currency,
        otherCurrency
      )
    );

  await User.findByIdAndUpdate(
    userId,
    {
      $inc: {
        [`balance.${otherCurrency}`]:
          refund,
      },
    }
  );
}

module.exports = {
  validateWalletBalance,
  debitWallet,
  refundConvertedBalance,
};