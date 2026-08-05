const express = require("express");

const app = express();

app.use(express.json());

app.get("/", (req, res) => {

  console.log("GET /");

  res.json({

    success: true,

    message: "Server works"

  });

});

app.post("/test", (req, res) => {

  console.log(req.body);

  res.json({

    success: true,

    body: req.body

  });

});

app.listen(4000, () => {

  console.log("Test server running on port 4000");

});