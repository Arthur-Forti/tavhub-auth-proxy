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

// --- NOVO ENDPOINT PARA BUSCAR DADOS PÚBLICOS ---
app.post("/fetch-markup", async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  try {
    // 1. Extrai o ID do item da URL
    const itemMatch = /(MLB-?\d+)/.exec(url);
    if (!itemMatch) {
      return res.status(400).json({ error: "Invalid MLB ID found in URL" });
    }
    const itemId = itemMatch[0].replace("-", "");

    // 2. Busca os dados do item
    const itemResponse = await axios.get(`https://api.mercadolibre.com/items/${itemId}`);
    const itemData = itemResponse.data;

    let price = itemData.price;
    let sellerId = itemData.seller_id;
    
    // 3. Lógica de fallback (catálogo ou variações)
    if (!price && itemData.catalog_product_id) {
        const productResponse = await axios.get(`https://api.mercadolibre.com/products/${itemData.catalog_product_id}`);
        price = productResponse.data?.buy_box_winner?.price;
        sellerId = productResponse.data?.buy_box_winner?.seller_id || sellerId;
    } else if (!price) {
        const variationsResponse = await axios.get(`https://api.mercadolibre.com/items/${itemId}/variations`);
        price = variationsResponse.data?.[0]?.price;
    }

    if (!price || !sellerId) {
        return res.status(404).json({ error: "Price or Seller could not be determined." });
    }

    // 4. Busca os dados do vendedor
    const sellerResponse = await axios.get(`https://api.mercadolibre.com/users/${sellerId}`);
    
    // 5. Retorna o resultado
    res.status(200).json({
      sellerName: sellerResponse.data.nickname,
      price: price
    });

  } catch (error) {
    res.status(error.response?.status || 500).json({
        error: "Failed to fetch data from ML API",
        details: error.response?.data,
    });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Auth proxy listening on port ${port}`);
});
