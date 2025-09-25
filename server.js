const express = require("express");
const axios = require("axios");
const cors = require('cors');
const app = express();

// Middlewares para aceitar CORS e JSON no corpo das requisições
app.use(cors());
app.use(express.json());

// --- ROTAS DO MERCADO LIVRE ---

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

app.post("/fetch-markup", async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  try {
    const itemMatch = /(MLB-?\d+)/.exec(url);
    if (!itemMatch) {
      return res.status(400).json({ error: "Invalid MLB ID found in URL" });
    }
    const itemId = itemMatch[0].replace("-", "");

    const itemResponse = await axios.get(`https://api.mercadolibre.com/items/${itemId}`);
    const itemData = itemResponse.data;

    let price = itemData.price;
    let sellerId = itemData.seller_id;
    
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

    const sellerResponse = await axios.get(`https://api.mercadolibre.com/users/${sellerId}`);
    
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


// --- ROTAS DA MAGALU ---

// Endpoint que a Magalu irá chamar no navegador após a autorização do usuário.
// O único objetivo dele é receber o 'code' e redirecionar para algum lugar.
app.get('/magalu/callback', (req, res) => {
    const { code } = req.query;
    if (!code) {
        return res.status(400).send('<h1>Erro: Código de autorização ausente.</h1><p>Pode fechar esta janela.</p>');
    }
    // Apenas informa que o código foi recebido. O usuário irá colar a URL na aplicação.
    res.send('<h1>Código recebido com sucesso!</h1><p>Por favor, copie a URL completa do seu navegador e cole na aplicação TavHub.</p>');
});

// Endpoint que a sua aplicação TavCommerce irá chamar para trocar o 'code' pelo 'access_token'.
app.post('/magalu/exchange-token', async (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ error: 'Erro: Código de autorização ausente no corpo da requisição.' });
    }

    const MAGALU_CLIENT_ID = process.env.MAGALU_CLIENT_ID;
    const MAGALU_CLIENT_SECRET = process.env.MAGALU_CLIENT_SECRET;
    const REDIRECT_URI = "https://tavhub-auth-proxy.onrender.com/magalu/callback";

    if (!MAGALU_CLIENT_ID || !MAGALU_CLIENT_SECRET) {
        return res.status(500).json({ error: 'Erro: Credenciais do servidor não configuradas.' });
    }

    try {
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

      const sellerInfoResponse = await axios.get('https://id.magalu.com/oauth/user_info', {
            headers: {
                'Authorization': `Bearer ${access_token}`
            }
        });
        
        const sellerId = sellerInfoResponse.data.sub; 

        if (!sellerId) {
          return res.status(500).json({ error: "Não foi possível obter o Seller ID da Magalu." });
        }

        res.json({
            access_token,
            refresh_token,
            expires_in,
            scope,
            seller_id: sellerId 
        });

    } catch (error) {
        console.error("Erro na autenticação com a Magalu:", error.response ? error.response.data : error.message);
        res.status(error.response?.status || 500).json({ 
            error: "Falha ao trocar o código de autorização da Magalu.",
            details: error.response?.data
        });
    }
});


// --- INICIALIZAÇÃO DO SERVIDOR ---

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Servidor proxy de autenticação a correr na porta ${PORT}`);
});
