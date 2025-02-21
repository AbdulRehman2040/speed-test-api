const express = require('express');
const FastSpeedtest = require('fast-speedtest-api');
const os = require('os'); // For system information
const dns = require('dns').promises; // For latency testing
const cors = require('cors'); // Add CORS
const app = express();
const port = 3000;

// Add middleware
app.use(express.json());
app.use(cors()); // Enable CORS for all routes

// Cache system metrics to avoid recalculating frequently
let cachedSystemMetrics = null;
const CACHE_DURATION = 50000; // 1 minute cache
let lastCacheTime = 0;

// Function for real latency measurement using multiple servers
async function measureRealLatency() {
    const servers = ['google.com', 'cloudflare.com', 'amazon.com'];
    const pings = [];
    
    for (const server of servers) {
        try {
            const start = Date.now();
            await dns.lookup(server);
            pings.push(Date.now() - start);
        } catch (error) {
            console.error(`Failed to ping ${server}:`, error);
        }
    }
    
    return {
        current: pings[0] || 0,
        average: pings.length ? (pings.reduce((a, b) => a + b, 0) / pings.length).toFixed(2) : 0,
        min: pings.length ? Math.min(...pings) : 0,
        max: pings.length ? Math.max(...pings) : 0
    };
}

// Function for real system metrics
function getSystemMetrics() {
    const now = Date.now();
    if (cachedSystemMetrics && (now - lastCacheTime) < CACHE_DURATION) {
        return cachedSystemMetrics;
    }

    cachedSystemMetrics = {
        cpu: {
            cores: os.cpus().length,
            model: os.cpus()[0].model,
            speed: os.cpus()[0].speed
        },
        memory: {
            total: `${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`,
            free: `${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB`,
            used: `${((os.totalmem() - os.freemem()) / 1024 / 1024 / 1024).toFixed(2)} GB`
        },
        os: {
            platform: os.platform(),
            type: os.type(),
            release: os.release(),
            arch: os.arch(),
            uptime: `${(os.uptime() / 3600).toFixed(2)} hours`
        }
    };
    lastCacheTime = now;
    return cachedSystemMetrics;
}

async function measureLatency() {
    const start = Date.now();
    await dns.lookup('google.com');
    return Date.now() - start;
}

// Basic test route
app.get('/', (req, res) => {
    res.send('Server is running! Try /network-metrics for speed test.');
});

// Network metrics route
app.get('/network-metrics', async (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Accept, Cache-Control');
    
    try {
        // Initialize speed test with optimized parameters
        let speedtest = new FastSpeedtest({
            token: "yDQQYOcujXYc9iw8j3h2ecsFbkgQajI6FSveg",
            verbose: false,
            timeout: 5000,  // Reduced timeout
            https: true,
            urlCount: 3,    // Reduced URL count
            bufferSize: 8,
            unit: FastSpeedtest.UNITS.Mbps
        });

        // Run all tests in parallel
        const [downloadSpeed, latency] = await Promise.all([
            speedtest.getSpeed(),
            measureLatency()
        ]);
        
        // Get system metrics (cached)
        const systemMetrics = getSystemMetrics();

        // Get network info (instant)
        const networkInfo = {
            ip: req.ip,
            protocol: req.protocol,
            httpVersion: req.httpVersion,
            userAgent: req.headers['user-agent']
        };

        // Estimate upload speed
        const estimatedUploadSpeed = downloadSpeed * 0.3;

        const result = {
            timestamp: new Date().toISOString(),
            speeds: {
                download: `${downloadSpeed.toFixed(2)} Mbps`,
                upload: `${estimatedUploadSpeed.toFixed(2)} Mbps (estimated)`
            },
            latency: {
                current: `${latency} ms`
            },
            network: networkInfo,
            system: systemMetrics
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

// Add a simple HTML interface
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Network Speed Test</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                #result { white-space: pre; font-family: monospace; }
                button { padding: 10px; margin: 10px 0; }
            </style>
        </head>
        <body>
            <h1>Network Speed Test</h1>
            <button onclick="runTest()">Run Speed Test</button>
            <div id="status"></div>
            <pre id="result"></pre>

            <script>
                function runTest() {
                    document.getElementById('status').textContent = 'Testing...';
                    document.getElementById('result').textContent = '';
                    
                    fetch('/network-metrics')
                        .then(response => response.json())
                        .then(data => {
                            document.getElementById('status').textContent = 'Test Complete!';
                            document.getElementById('result').textContent = JSON.stringify(data, null, 2);
                        })
                        .catch(error => {
                            document.getElementById('status').textContent = 'Error: ' + error.message;
                        });
                }
            </script>
        </body>
        </html>
    `);
});

// Start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`Access network metrics at: http://localhost:${port}/network-metrics`);
}); 