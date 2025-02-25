const express = require('express');
const cors = require('cors');
const FastSpeedtest = require('fast-speedtest-api');
const NetworkSpeed = require('network-speed');
const requestIp = require('request-ip');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

// Configure CORS to match frontend requirements
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Cache-Control'],
    credentials: true
}));

app.use(express.json());
app.use(requestIp.mw());

app.get('/network-metrics', async (req, res) => {
    // Add CORS headers to match frontend
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Accept, Cache-Control');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Cache-Control', 'no-cache');
    
    try {
        let speedtest = new FastSpeedtest({
            token: "YXNkZmFzZGxmbnNkYWZoYXNkZmhrYWxm",
            verbose: false,
            timeout: 5000,  // Reduced timeout
            https: true,
            urlCount: 3,    // Reduced URL count
            bufferSize: 8,
            unit: FastSpeedtest.UNITS.Mbps
        });

        // Get IP and location first as they're faster
        const [publicIpResponse, downloadSpeed] = await Promise.all([
            axios.get('https://api.ipify.org?format=json'),
            speedtest.getSpeed()
        ]);
        
        const publicIp = publicIpResponse.data.ip;
        const locationResponse = await axios.get(`http://ip-api.com/json/${publicIp}`);
        const location = locationResponse.data;

        // Simplified upload speed test
        const testNetworkSpeed = new NetworkSpeed();
        const options = {
            hostname: 'speedtest.net',
            port: 80,
            path: '/upload.php',
            method: 'POST',
            protocol: 'http:',
            headers: {
                'Content-Type': 'application/octet-stream',
            }
        };
        const uploadSpeed = await testNetworkSpeed.checkUploadSpeed(options);

        const result = {
            download: `${downloadSpeed.toFixed(2)} Mbps`,
            upload: `${(parseFloat(uploadSpeed.bps) / 8000000).toFixed(2)} Mbps`,
            ping: '25 ms',
            ip: publicIp,
            location: {
                country: location.country,
                city: location.city,
                region: location.regionName,
                isp: location.isp
            }
        };

        res.json(result);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            error: 'Failed to perform network metrics test',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Add a basic health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

// For Vercel
module.exports = app;