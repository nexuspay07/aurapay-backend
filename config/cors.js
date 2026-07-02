const cors =
  require("cors");

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",

  "https://aurapay-dashboard.vercel.app",
];

module.exports = cors({
  origin(origin, callback) {

    if (!origin) {
      return callback(
        null,
        true
      );
    }

    if (
      allowedOrigins.includes(
        origin
      )
    ) {
      return callback(
        null,
        true
      );
    }

    if (
      origin.endsWith(
        ".vercel.app"
      )
    ) {
      return callback(
        null,
        true
      );
    }

    console.log(
      "Blocked by CORS:",
      origin
    );

    return callback(
      new Error(
        "Not allowed by CORS"
      )
    );

  },

  credentials: true,
});