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

// Track statistics
let v1Count = 0;
let v2Count = 0;

// Listen for successful DHT announcements
spider.on('ensureHash', (hash, addr) => {
    // Track the infohash version
    if (addr.version === 2) {
        v2Count++;
        console.log(`========== V2 ANNOUNCE ==========`);
    } else {
        v1Count++;
        console.log(`========== V1 ANNOUNCE ==========`);
    }
    console.log(`magnet:?xt=urn:btih:${hash}`);
    console.log(`From: ${addr.address}:${addr.port} (v${addr.version})`);
    console.log(`==============================`);
});

// Listen for peer requests (get_peers)
spider.on('unensureHash', (hash, version) => {
    if (version === 2) {
        v2Count++;
        console.log(`[GET_PEERS v2] ${hash}`);
    } else {
        v1Count++;
        console.log(`[GET_PEERS v1] ${hash}`);
    }
});

// Periodically show statistics about DHT table size
let lastLog = Date.now();
let statsInterval = setInterval(() => {
    const now = Date.now();
    const uptime = Math.floor((now - lastLog) / 1000);
    const v2Ratio = (v1Count + v2Count > 0) ? ((v2Count / (v1Count + v2Count)) * 100).toFixed(2) : '0.00';
    
    console.log(`[STATS] Uptime: ${uptime}s | Nodes: ${spider.getNodeCount()} | v1: ${v1Count} | v2: ${v2Count} | v2 ratio: ${v2Ratio}%`);
    lastLog = now;

    // More frequently try to force get_peers requests to stimulate the DHT
    if (uptime % 15 === 0) {  // Every 15 seconds (down from 30)
        console.log("[FORCE] Sending get_peers queries to stimulate DHT activity");
        spider.forceGetPeers();
        
        // Every minute, actively try to join new nodes that might support v2
        if (uptime % 60 === 0) {
            console.log("[REFRESH] Attempting to find more nodes supporting BEP-52...");
            spider.join();
        }
    }
}, 10000);

// Start the spider and report current status
console.log('Starting DHT Spider with BEP-52 (v2 infohash) support...');
console.log('Listening on UDP port 6881');
console.log('Waiting for infohash announcements and requests...');

spider.start();

// Graceful shutdown
process.on('SIGINT', () => {
    const v2Ratio = (v1Count + v2Count > 0) ? ((v2Count / (v1Count + v2Count)) * 100).toFixed(2) : '0.00';
    
    console.log('\n========== FINAL STATISTICS ==========');
    console.log(`Total nodes found: ${spider.getNodeCount()}`);
    console.log(`Total infohashes: ${v1Count + v2Count}`);
    console.log(`v1 infohashes: ${v1Count}`);
    console.log(`v2 infohashes: ${v2Count}`);
    console.log(`v2 ratio: ${v2Ratio}%`);
    console.log('======================================');
    console.log('Shutting down...');
    
    clearInterval(statsInterval);
    spider.stop();
    process.exit(0);
});