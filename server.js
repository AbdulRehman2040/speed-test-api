const express = require('express');
const cors = require('cors');
const FastSpeedtest = require('fast-speedtest-api');
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
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Accept, Cache-Control');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Cache-Control', 'no-cache');
    
    try {
        // Initialize speed test with Netflix's fast.com
        let speedtest = new FastSpeedtest({
            token: "YXNkZmFzZGxmbnNkYWZoYXNkZmhrYWxm",
            verbose: false,
            timeout: 5000,
            https: true,
            urlCount: 3,
            bufferSize: 8,
            unit: FastSpeedtest.UNITS.Mbps
        });

        // Get download speed and IP info in parallel
        const [downloadSpeed, ipInfo] = await Promise.all([
            speedtest.getSpeed(),
            axios.get('https://ipapi.co/json/')
        ]);

        // Calculate upload speed (typically 1/10 of download for most connections)
        const estimatedUpload = downloadSpeed * 0.1;

        // Get ping using a simple request
        const startTime = Date.now();
        await axios.get('https://www.google.com');
        const ping = Date.now() - startTime;

        const result = {
            download: `${downloadSpeed.toFixed(2)} Mbps`,
            upload: `${estimatedUpload.toFixed(2)} Mbps`,
            ping: `${ping} ms`,
            ip: ipInfo.data.ip,
            location: {
                country: ipInfo.data.country_name,
                city: ipInfo.data.city,
                region: ipInfo.data.region,
                isp: ipInfo.data.org
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

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

module.exports = app;