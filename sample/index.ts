import Spider from '../src/spider'

// More complete options for better connectivity
const spider = new Spider({ 
    debugMode: false,  // Set to true to enable detailed debug output
    v1Only: false,     // Support both v1 and v2 infohashes
    udpPort: 6881,     // Use standard BitTorrent DHT port
    concurrency: 100,  // More concurrent lookups
    joinIntervalTime: 500, // Try to join more frequently
    walkIntervalTime: 1    // Walk the table aggressively
});

// Listen for successful DHT announcements
spider.on('ensureHash', (hash, addr) => {
    console.log(`========== ANNOUNCE ==========`);
    console.log(`magnet:?xt=urn:btih:${hash}`);
    console.log(`From: ${addr.address}:${addr.port} (v${addr.version})`);
    console.log(`==============================`);
});

// Listen for peer requests (get_peers)
spider.on('unensureHash', (hash, version) => {
    console.log(`[GET_PEERS] ${hash} (v${version})`);
});

// Periodically show statistics about DHT table size
let lastLog = Date.now();
let statsInterval = setInterval(() => {
    const now = Date.now();
    const uptime = Math.floor((now - lastLog) / 1000);
    console.log(`[STATS] Uptime: ${uptime}s | Spider running... | Node count: ${spider.getNodeCount()}`);
    lastLog = now;

    // Every minute, try to force some get_peers requests to stimulate the DHT
    if (uptime % 60 === 0) {
        spider.forceGetPeers();
    }
}, 10000);

// Start the spider and report current status
console.log('Starting DHT Spider...');
console.log('Listening on UDP port 6881');
console.log('Waiting for infohash announcements and requests...');

spider.start();

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down...');
    clearInterval(statsInterval);
    spider.stop();
    process.exit(0);
});