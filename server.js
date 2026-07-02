require("dotenv").config();

const http = require("http");

const app = require("./app");

const connectDatabase =
  require("./config/database");

const initializeSocket =
  require("./config/socket");

// ======================================
// CREATE HTTP SERVER
// ======================================

const server =
  http.createServer(app);

// ======================================
// SOCKET.IO
// ======================================

initializeSocket(server);

// ======================================
// START APPLICATION
// ======================================

async function startServer() {
  try {

    await connectDatabase();

    const PORT =
      process.env.PORT || 3000;

    server.listen(
      PORT,
      () => {
        console.log(
          "========================================"
        );

        console.log(
          "🚀 AuraPay Backend Started"
        );

        console.log(
          `🌍 Environment: ${process.env.NODE_ENV || "development"}`
        );

        console.log(
          `🚀 Server: http://localhost:${PORT}`
        );

        console.log(
          "========================================"
        );
      }
    );

  } catch (err) {

    console.error(
      "❌ Failed to start server"
    );

    console.error(err);

    process.exit(1);

  }
}

startServer();

// ======================================
// PROCESS ERROR HANDLING
// ======================================

process.on(
  "uncaughtException",
  (err) => {

    console.error(
      "❌ Uncaught Exception"
    );

    console.error(err);

  }
);

process.on(
  "unhandledRejection",
  (err) => {

    console.error(
      "❌ Unhandled Rejection"
    );

    console.error(err);

  }
);