'use strict'

const dgram = require('dgram')
const Emiter = require('events')
const bencode = require('bencode')
const {Table, Node} = require('./table')
const Token = require('./token')
const crypto = require('crypto')

const bootstraps = [{
    address: 'router.bittorrent.com',
    port: 6881
}, {
    address: 'dht.transmissionbt.com',
    port: 6881
}, {
    address: 'router.utorrent.com',
    port: 6881
}, {
    address: 'router.bitcomet.com',
    port: 6881
}, {
    address: 'dht.aelitis.com',
    port: 6881
}, {
    address: 'dht.libtorrent.org',
    port: 25401
}]

function isValidPort(port) {
    return port > 0 && port < (1 << 16)
}

function isInfoHashV1(infohash) {
    return infohash && infohash.length === 20
}

function isInfoHashV2(infohash) {
    return infohash && infohash.length === 32
}

function isValidInfoHash(infohash, v1Only = false) {
    return isInfoHashV1(infohash) || (!v1Only && isInfoHashV2(infohash))
}

function generateTid() {
    return parseInt(Math.random() * 99).toString()
}

class Spider extends Emiter {
    constructor() {
        super()
        const options = arguments.length? arguments[0]: {}
        this.udp = dgram.createSocket('udp4')
        this.table = new Table(options.tableCaption || 600)
        this.bootstraps = options.bootstraps || bootstraps
        this.udpPort = options.udpPort || 6339
        this.token = new Token()
        this.walkInterval = null
        this.joinInterval = null
        this.concurrency = options.concurrency || 10 // Number of nodes to process in parallel
        this.joinIntervalTime = options.joinIntervalTime || 1000 // Reduced from 3000ms
        this.walkIntervalTime = options.walkIntervalTime || 1 // Reduced from 2ms
        this.debugMode = options.debugMode || false
        this.v1Count = 0
        this.v2Count = 0
        this.v1Only = options.v1Only !== undefined ? options.v1Only : true // Default to v1 only
        this.disableEnsureHash = options.disableEnsureHash || false // Option to disable ensureHash events
    }

    send(message, address) {
        // Validate that address has required properties before sending
        if (!address || typeof address !== 'object' || !address.port || !address.address) {
            return; // Skip if invalid address
        }
        
        const data = bencode.encode(message)
        setImmediate(() => {
            this.udp.send(data, 0, data.length, address.port, address.address)
        })
    }

    findNode(id, address) {
        if (!address || !isValidPort(address.port)) {
            return; // Skip invalid addresses
        }
        
        const message = {
            t: generateTid(),
            y: 'q',
            q: 'find_node',
            a: {
                id: id,
                target: Node.generateID()
            }
        }
        
        // Don't wait for send to complete
        setImmediate(() => {
            this.send(message, address)
        })
    }

    join() {
        this.bootstraps.forEach((b) => {
            this.findNode(this.table.id, b)
        })
    }

    walk() {
        // Process multiple nodes per walk cycle using batch functionality
        const nodes = this.table.shiftBatch(this.concurrency);
        
        for (const node of nodes) {
            if (node) {
                this.findNode(Node.neighbor(node.id, this.table.id), {address: node.address, port: node.port})
            }
        }
        
        this.walkInterval = setTimeout(() => this.walk(), this.walkIntervalTime)
    }

    onFoundNodes(data) {
        const nodes = Node.decodeNodes(data)
        nodes.forEach((node) => {
            if (node.id != this.table.id && isValidPort(node.port)) {
                this.table.add(node)
            }
        })
        this.emit('nodes', nodes)
    }

    onFindNodeRequest(message, address) {
    	const {t: tid, a: {id: nid, target: infohash}} = message

        if (tid === undefined || !isValidInfoHash(infohash, this.v1Only) || nid.length != 20) {
            return
        }

        this.send({
            t: tid,
            y: 'r',
            r: {
                id: Node.neighbor(nid, this.table.id),
                nodes: Node.encodeNodes(this.table.first())
            }
        }, address)
    }

    onGetPeersRequest(message, address) {
        const {t: tid, a: {id: nid, info_hash: infohash}} = message

        if (tid === undefined || !isValidInfoHash(infohash, this.v1Only) || nid.length != 20) {
            return
        }

        this.send({
            t: tid,
            y: 'r',
            r: {
                id: Node.neighbor(nid, this.table.id),
                nodes: Node.encodeNodes(this.table.first()),
                token: this.token.token
            }
        }, address)

        const version = isInfoHashV2(infohash) ? 2 : 1;
        if (version === 2) {
            this.v2Count++;
            if (this.debugMode) {
                console.log(`[DEBUG] InfoHash v2 detected: ${infohash.toString('hex').toUpperCase()}`);
            }
        } else {
            this.v1Count++;
        }
        
        this.emit('unensureHash', infohash.toString('hex').toUpperCase(), version)
    }

    onAnnouncePeerRequest(message, address) {
        let {t: tid, a: {info_hash: infohash, token: token, id: id, implied_port: implied, port: port}} = message
        if (!tid) return

        if (!this.token.isValid(token)) return
       
        port = (implied != undefined && implied != 0) ? address.port : (port || 0)
        if (!isValidPort(port)) return

        if (!isValidInfoHash(infohash, this.v1Only)) return

        this.send({ t: tid, y: 'r', r: { id: Node.neighbor(id, this.table.id) } }, address)

        const version = isInfoHashV2(infohash) ? 2 : 1;
        if (version === 2) {
            this.v2Count++;
            if (this.debugMode) {
                console.log(`[DEBUG] InfoHash v2 announced: ${infohash.toString('hex').toUpperCase()}`);
            }
        } else {
            this.v1Count++;
        }
        
        // Only emit ensureHash if not disabled
        if (!this.disableEnsureHash) {
            this.emit('ensureHash', infohash.toString('hex').toUpperCase(), {
                address: address.address,
                port: port,
                version: version
            })
        }
    }

    onPingRequest(message, addr) {
    	this.send({ t: message.t, y: 'r', r: { id: Node.neighbor(message.a.id, this.table.id) } }, addr)
    }

    parse(data, address) {
        try {
            const message = bencode.decode(data)
            if (!message || !message.y) return;
            
            const messageType = message.y.toString();
            
            if (messageType === 'r' && message.r && message.r.nodes) {
                this.onFoundNodes(message.r.nodes)
            } else if (messageType === 'q' && message.q) {
                const queryType = message.q.toString();
                
                switch(queryType) {
                    case 'get_peers':
                        this.onGetPeersRequest(message, address);
                        break;
                    case 'announce_peer':
                        this.onAnnouncePeerRequest(message, address);
                        break;
                    case 'find_node':
                        this.onFindNodeRequest(message, address);
                        break;
                    case 'ping':
                        this.onPingRequest(message, address);
                        break;
                }
            }
        } catch (err) {
            // Silently ignore malformed messages
        }
    }
    
    start() {
        this.udp = dgram.createSocket('udp4')
        this.init()
        this.joinInterval = setInterval(() => this.join(), this.joinIntervalTime)
        this.udp.bind(this.udpPort)
        this.walk()
        this.join()
        
        // If debug mode is enabled, periodically log statistics
        if (this.debugMode) {
            setInterval(() => {
                console.log(`[STATS] InfoHash v1: ${this.v1Count}, InfoHash v2: ${this.v2Count}, Ratio: ${(this.v2Count / (this.v1Count || 1) * 100).toFixed(4)}%`);
            }, 30000); // Every 30 seconds
        }
    }
    
    stop() {
        this.udp.close();
        clearInterval(this.joinInterval);
        clearInterval(this.walkInterval);
    }
    
    init(){
        this.udp.on('listening', () => {
            console.log(`Listen on ${this.udp.address().address}:${this.udp.address().port}`)
        })
        this.udp.on('message', (data, addr) => {
            this.parse(data, addr)
        })
        this.udp.on('error', (err) => {})
    }

    listen(port) {
        this.udpPort = port || this.udpPort;
        this.start();
    }
}

module.exports = Spider
