import https from 'https';
import crypto from 'crypto';

/**
 * Tiendanube OAuth Bridge
 * Recibe el `code` de autorización, lo intercambia por el Access Token,
 * y redirige a la app de escritorio usando el protocolo deep-link.
 */
export default async function handler(req, res) {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Falta el código de autorización.' });
  }

  const data = JSON.stringify({
    client_id: process.env.TIENDANUBE_CLIENT_ID,
    client_secret: process.env.TIENDANUBE_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
  });

  const options = {
    hostname: 'www.tiendanube.com',
    port: 443,
    path: '/apps/authorize/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
      'User-Agent': 'Soft Inventario (bronzidigital@gmail.com)',
    },
  };

  try {
    const result = await new Promise((resolve, reject) => {
      const request = https.request(options, (response) => {
        let body = '';
        response.on('data', (d) => (body += d));
        response.on('end', () => {
          try { resolve(JSON.parse(body)); }
          catch (e) { reject(new Error('Respuesta inválida de Tiendanube')); }
        });
      });
      request.on('error', reject);
      request.write(data);
      request.end();
    });

    if (result.error) {
      return res.status(400).json({ error: result.error_description });
    }

    const { access_token, user_id } = result;
    const bridgeToken = crypto
      .createHmac('sha256', process.env.TIENDANUBE_CLIENT_SECRET)
      .update(String(user_id))
      .digest('hex');

    // Redirigir a la app de escritorio Soft Inventario via Deep Link
    res.redirect(
      `soft-inventario://auth?token=${encodeURIComponent(access_token)}&user_id=${encodeURIComponent(user_id)}&bridge_token=${encodeURIComponent(bridgeToken)}`
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
