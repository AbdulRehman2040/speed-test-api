const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { performance } = require('perf_hooks');
const app = express();
const port = process.env.PORT || 3000;

// Configuration
const TEST_CONFIG = {
  DOWNLOAD_SIZE: 10 * 1024 * 1024, // 10MB
  UPLOAD_SIZE: 2 * 1024 * 1024,   // 2MB
  PING_TARGETS: [
    'https://www.google.com',
    'https://www.cloudflare.com',
    'https://www.amazon.com'
  ],
  DOWNLOAD_ENDPOINTS: [
    'https://speed.cloudflare.com/__down?bytes=10000000',
    'https://proof.ovh.net/files/10Mb.dat'
  ],
  UPLOAD_ENDPOINTS: [
    'https://httpbin.org/post',
    'https://postman-echo.com/post'
  ]
};

app.use(cors());
app.use(express.json());

// Helper to get public IP
async function getPublicIP() {
  const services = [
    'https://api.ipify.org?format=json',
    'https://ipapi.co/json/',
    'https://ipinfo.io/json'
  ];

  for (const service of services) {
    try {
      const response = await axios.get(service);
      return response.data.ip || response.data.ip;
    } catch (error) {
      console.warn(`Failed to fetch IP from ${service}: ${error.message}`);
    }
  }
  throw new Error('Could not determine public IP');
}

// Helper to test endpoint availability
async function testEndpoint(endpoint, method = 'get', data = null) {
  try {
    const config = { method, url: endpoint };
    if (data) {
      config.data = data;
      config.headers = { 'Content-Type': 'application/octet-stream' };
    }
    await axios(config);
    return true;
  } catch (error) {
    return false;
  }
}

// Network metrics endpoint
app.get('/network-metrics', async (req, res) => {
  try {
    // 🔹 IP Detection
    let userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    userIp = userIp.split(',')[0].trim();

    if (['::1', '127.0.0.1'].includes(userIp)) {
      userIp = await getPublicIP();
    }

    // 🔹 Geolocation
    const location = await axios.get(`https://ipapi.co/${userIp}/json/`)
      .then(response => ({
        country: response.data.country_name,
        city: response.data.city,
        region: response.data.region,
        isp: response.data.org
      }))
      .catch(() => ({}));

    // 🔹 Ping Test
    const pingResults = await Promise.all(
      TEST_CONFIG.PING_TARGETS.map(async (target) => {
        const start = performance.now();
        await axios.head(target);
        return performance.now() - start;
      })
    );
    const ping = Math.min(...pingResults).toFixed(1);

    // 🔹 Download Test
    let downloadSpeed = 0;
    for (const endpoint of TEST_CONFIG.DOWNLOAD_ENDPOINTS) {
      if (await testEndpoint(endpoint)) {
        const start = performance.now();
        const response = await axios.get(endpoint, { responseType: 'stream' });
        let receivedBytes = 0;
        response.data.on('data', (chunk) => (receivedBytes += chunk.length));
        await new Promise((resolve) => response.data.on('end', resolve));
        const duration = (performance.now() - start) / 1000;
        downloadSpeed = ((receivedBytes * 8) / (1024 * 1024)) / duration;
        break;
      }
    }

    // 🔹 Upload Test
    let uploadSpeed = 0;
    const uploadData = Buffer.alloc(TEST_CONFIG.UPLOAD_SIZE);
    for (const endpoint of TEST_CONFIG.UPLOAD_ENDPOINTS) {
      if (await testEndpoint(endpoint, 'post', uploadData)) {
        const start = performance.now();
        await axios.post(endpoint, uploadData, {
          headers: { 'Content-Type': 'application/octet-stream' }
        });
        const duration = (performance.now() - start) / 1000;
        uploadSpeed = ((TEST_CONFIG.UPLOAD_SIZE * 8) / (1024 * 1024)) / duration;
        break;
      }
    }

    // 🔹 Results
    res.json({
      download: `${downloadSpeed.toFixed(2)} Mbps`,
      upload: `${uploadSpeed.toFixed(2)} Mbps`,
      ping: `${ping} ms`,
      ip: userIp,
      location: {
        country: location.country || 'Unknown',
        city: location.city || 'Unknown',
        region: location.region || 'Unknown',
        isp: location.isp || 'Unknown'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});