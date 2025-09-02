const express = require("express");
const axios = require("axios");
const app = express();

app.use(express.json());

app.post("/exchange-token", async (req, res) => {
  const { code, redirect_uri, code_verifier } = req.body;
  if (!code || !redirect_uri) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  const params = new URLSearchParams();
  params.append("grant_type", "authorization_code");
  params.append("client_id", process.env.MELI_APP_ID);
  params.append("client_secret", process.env.MELI_CLIENT_SECRET);
  params.append("code", code);
  params.append("redirect_uri", redirect_uri);
  if (code_verifier) {
    params.append("code_verifier", code_verifier);
  }
  
  try {
    const response = await axios.post("https://api.mercadolibre.com/oauth/token", params);
    res.status(200).json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
        error: "Failed to exchange token",
        details: error.response?.data,
    });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Auth proxy listening on port ${port}`);
});
