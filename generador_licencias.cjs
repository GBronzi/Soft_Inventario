const crypto = require('crypto');
const fs = require('fs');

const KEYS_DIR = './keys';

if (!fs.existsSync(KEYS_DIR)) {
  fs.mkdirSync(KEYS_DIR);
}

// 1. Generar par de claves RSA si no existen
const privateKeyPath = `${KEYS_DIR}/private.pem`;
const publicKeyPath = `${KEYS_DIR}/public.pem`;

if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath)) {
  console.log("Generando nuevas claves RSA de 2048 bits...");
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  
  fs.writeFileSync(publicKeyPath, publicKey);
  fs.writeFileSync(privateKeyPath, privateKey);
  console.log("¡Claves generadas con éxito!");
}

const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

// 2. Función para firmar una licencia
function generarLicencia(titular) {
  const payload = JSON.stringify({
    holder: titular,
    createdAt: new Date().toISOString()
  });

  const sign = crypto.createSign('SHA256');
  sign.update(payload);
  sign.end();
  
  const signature = sign.sign(privateKey, 'base64');
  
  const payloadB64 = Buffer.from(payload).toString('base64');
  
  const licenseKey = `${payloadB64}.${signature}`;
  return licenseKey;
}

// Generar una licencia de prueba
const nombreCliente = process.argv[2] || "Empresa Demo";
const licencia = generarLicencia(nombreCliente);

console.log("\n==================================");
console.log(`Licencia para: ${nombreCliente}`);
console.log("==================================");
console.log(licencia);
console.log("==================================\n");
console.log("Pega esta licencia entera en la ventana de activación de la app.");
