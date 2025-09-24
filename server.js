const express = require("express");
const axios = require("axios");
const cors = require('cors');
const app = express();
app.use(express.json());
app.use(cors());

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

// Endpoint que a Magalu irá chamar após a autorização do usuário
app.get('/magalu/callback', async (req, res) => {
    const { code } = req.query;

    if (!code) {
        return res.status(400).send('Erro: Código de autorização ausente.');
    }

    // Variáveis de ambiente que você precisa configurar no Render.com
    const MAGALU_CLIENT_ID = process.env.MAGALU_CLIENT_ID;
    const MAGALU_CLIENT_SECRET = process.env.MAGALU_CLIENT_SECRET;
    const REDIRECT_URI = "https://tavhub-auth-proxy.onrender.com/magalu/callback";

    if (!MAGALU_CLIENT_ID || !MAGALU_CLIENT_SECRET) {
        return res.status(500).send('Erro: Credenciais do servidor não configuradas.');
    }

    try {
        // Etapa 1: Trocar o código de autorização pelo token de acesso
        const tokenResponse = await axios.post('https://id.magalu.com/oauth/token', new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: REDIRECT_URI,
            client_id: MAGALU_CLIENT_ID,
            client_secret: MAGALU_CLIENT_SECRET
        }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const { access_token, refresh_token, expires_in, scope } = tokenResponse.data;

        // Etapa 2: Buscar o ID do Vendedor (Seller ID)
        // A API da Magalu requer uma chamada adicional para obter os dados do vendedor.
        const sellerInfoResponse = await axios.get('https://api.magalu.com/sellers/me', {
            headers: {
                'Authorization': `Bearer ${access_token}`,
                'Accept': 'application/json'
            }
        });
        
        const sellerId = sellerInfoResponse.data.seller_id; // Supondo que o campo seja 'seller_id'

        // Etapa 3: Retornar todos os dados para a sua aplicação TavHub
        // O TavHub irá receber este JSON e salvar no banco de dados.
        res.json({
            access_token,
            refresh_token,
            expires_in,
            scope,
            seller_id: sellerId 
        });

    } catch (error) {
        console.error("Erro na autenticação com a Magalu:", error.response ? error.response.data : error.message);
        res.status(500).send('Falha ao trocar o código de autorização da Magalu.');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor proxy de autenticação a correr na porta ${PORT}`);
});
