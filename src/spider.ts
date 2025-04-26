import dgram from 'dgram';
import { EventEmitter } from 'events';
import * as bencode from 'bencode';
import { Table, Node, INode } from './table';
import Token from './token';
import { Console } from 'console';
import crypto from 'crypto';

// Interfaces for configuration and network data
interface BootstrapNode {
    address: string;
    port: number;
    dnsFailures?: number; // Track DNS resolution failures
}

interface SpiderOptions {
    tableCapacity?: number;
    bootstraps?: BootstrapNode[];
    udpPort?: number;
    concurrency?: number;
    joinIntervalTime?: number;
    walkIntervalTime?: number;
    debugMode?: boolean;
    v1Only?: boolean;
    disableEnsureHash?: boolean;
}

// Interfaces for KRPC messages (simplified)
interface KRPCMessage {
    t: string | Buffer; // Transaction ID
    y: 'q' | 'r' | 'e'; // Message type: query, response, error
    q?: string;          // Query type (for y='q')
    r?: any;             // Response data (for y='r')
    a?: any;             // Query arguments (for y='q')
    e?: any;             // Error details (for y='e')
}

interface RemoteInfo {
    address: string;
    port: number;
    family: 'IPv4' | 'IPv6';
    size: number;
}

interface EnsureHashPayload {
    address: string;
    port: number;
    version: 1 | 2;
}

// Type definition for Spider events
interface SpiderEvents {
    nodes: (nodes: INode[]) => void;
    unensureHash: (infoHash: string, version: 1 | 2) => void;
    ensureHash: (infoHash: string, payload: EnsureHashPayload) => void;
}

// Helper functions with types
function isValidPort(port: number): boolean {
    return Number.isInteger(port) && port > 0 && port < 65536;
}

function isInfoHashV1(infohash: Buffer): boolean {
    return Buffer.isBuffer(infohash) && infohash.length === 20;
}

function isInfoHashV2(infohash: Buffer): boolean {
    return Buffer.isBuffer(infohash) && infohash.length === 32;
}

function isValidInfoHash(infohash: Buffer, v1Only: boolean = false): boolean {
    if (!Buffer.isBuffer(infohash)) return false;
    
    // Check if it's a v1 infohash (20 bytes)
    if (infohash.length === 20) return true;
    
    // Check if it's a v2 infohash (32 bytes) and v2 is allowed
    if (infohash.length === 32 && !v1Only) return true;
    
    return false;
}

function generateTid(): string {
    // Generate a short random string (safer than potentially large number)
    return Math.random().toString(36).substring(2, 6);
}

const defaultBootstraps: BootstrapNode[] = [
    // Use IP addresses directly for reliable nodes
    { address: '87.98.162.88', port: 6881 },           // Transmission node - confirmed working
    { address: '67.215.246.10', port: 6881 },          // Confirmed working (likely router.bittorrent.com)
    { address: '185.157.221.247', port: 25401 },       // Confirmed working (likely dht.libtorrent.org)
    
    // Standard hostnames as fallbacks
    { address: 'router.utorrent.com', port: 6881 },
    { address: 'router.bittorrent.com', port: 6881 },
    { address: 'dht.transmissionbt.com', port: 6881 },
    { address: 'dht.aelitis.com', port: 6881 },
    { address: 'dht.libtorrent.org', port: 25401 },
    
    // Known nodes that support BEP-52 (v2 infohashes)
    { address: 'router.breittorrent.com', port: 6881 },
    { address: 'router.experimentalbit.com', port: 6881 },
    { address: 'router.utorrent.com', port: 6881 },
    { address: 'dht.vuze.com', port: 6881 },
    
    // Commented out unreliable nodes
    // { address: 'dht.bt.bencoded.ninja', port: 6881 },
    // { address: 'router.silotis.us', port: 6881 },
    // { address: 'adefrgtyha.edns.ip.foolo.fr', port: 6969 },
];


export class Spider extends EventEmitter {
    private udp: dgram.Socket | null = null;
    private table: Table;
    private bootstraps: BootstrapNode[];
    private udpPort: number;
    private token: Token;
    private walkInterval: NodeJS.Timeout | null = null;
    private joinInterval: NodeJS.Timeout | null = null;
    private statsInterval: NodeJS.Timeout | null = null;
    private concurrency: number;
    private joinIntervalTime: number;
    private walkIntervalTime: number;
    private debugMode: boolean;
    private v1Count: number = 0;
    private v2Count: number = 0;
    private v1Only: boolean;
    private disableEnsureHash: boolean;

    constructor(options: SpiderOptions = {}) {
        super();
        this.debugMode = options.debugMode || false;
        this.table = new Table(options.tableCapacity || 10000, this.debugMode);
        this.bootstraps = options.bootstraps || defaultBootstraps;
        this.udpPort = options.udpPort || 6339;
        this.token = new Token();
        this.concurrency = options.concurrency || 10;
        this.joinIntervalTime = options.joinIntervalTime || 1000;
        this.walkIntervalTime = options.walkIntervalTime || 100;
        this.v1Only = options.v1Only !== undefined ? options.v1Only : false;
        this.disableEnsureHash = options.disableEnsureHash || false;
        
        if (this.debugMode && !this.v1Only) {
            console.log(`[Spider] BEP-52 (v2 infohash) support enabled`);
        }
    }

    // Type overrides for EventEmitter methods for stronger typing
    on<K extends keyof SpiderEvents>(event: K, listener: SpiderEvents[K]): this {
        return super.on(event, listener);
    }

    emit<K extends keyof SpiderEvents>(event: K, ...args: Parameters<SpiderEvents[K]>): boolean {
        return super.emit(event, ...args);
    }

    private send(message: KRPCMessage, address: BootstrapNode | RemoteInfo): void {
        if (!address || typeof address !== 'object' || !isValidPort(address.port) || !address.address) {
             if (this.debugMode) console.warn(`[Send] Invalid address object:`, address);
            return; 
        }

        try {
            const data = bencode.encode(message);
            // Use setImmediate for non-blocking send
            if (this.debugMode) console.log(data);
            setImmediate(() => {
                if (this.udp) { // Ensure UDP socket exists
                    this.udp.send(data, 0, data.length, address.port, address.address, (err) => {
                         if (err && this.debugMode) {
                              console.error(`[Send] UDP send error to ${address.address}:${address.port}:`, err);
                              
                              // If DNS resolution failed, track it for potential blacklisting
                              if ((err as NodeJS.ErrnoException).code === 'DNS_ENOTFOUND' && 'dnsFailures' in address) {
                                  // Increment failure count
                                  const node = address as BootstrapNode;
                                  node.dnsFailures = (node.dnsFailures || 0) + 1;
                                  
                                  // If node has failed DNS resolution multiple times, blacklist it
                                  if (node.dnsFailures >= 3) {
                                      this.bootstraps = this.bootstraps.filter(n => 
                                          n.address !== node.address || n.port !== node.port);
                                      if (this.debugMode) {
                                          console.log(`[Blacklist] Removed unreachable node: ${node.address}:${node.port}`);
                                      }
                                  }
                              }
                         }
                    });
                }
            });
        } catch (err) {
             if (this.debugMode) {
                  console.error(`[Send] Bencode encoding error:`, err, message);
             }
        }
    }

    private findNode(id: Buffer, address: BootstrapNode | RemoteInfo): void {
        if (!address || !isValidPort(address.port)) {
            if (this.debugMode) console.warn(`[FindNode] Invalid address for findNode:`, address);
            return;
        }

        if (!Buffer.isBuffer(id) || id.length !== 20) {
            if (this.debugMode) console.warn(`[FindNode] Invalid ID for findNode: ${id ? 'length=' + id.length : 'undefined'}`);
            return;
        }

        // Generate a random target ID if we're querying bootstrap nodes
        const isBootstrap = this.bootstraps.some(
            node => node.address === address.address && node.port === address.port
        );
        
        // Always use a random target for better DHT exploration
        const target = Node.generateID();

        const message: KRPCMessage = {
            t: generateTid(),
            y: 'q',
            q: 'find_node',
            a: {
                id: id,       // Our node ID or neighbor
                target: target, // Random target ID
                v2: 1        // Advertise support for BEP-52 (v2 infohashes)
            }
        };

        if (isBootstrap && this.debugMode) {
            console.log(`[FindNode] Sending to bootstrap ${address.address}:${address.port} with ID=${id.toString('hex').substring(0, 8)}... target=${target.toString('hex').substring(0, 8)}...`);
        }
        
        this.send(message, address);
    }

    public join(): void {
        if (this.debugMode) console.log(`[Join] Sending find_node to ${this.bootstraps.length} bootstrap nodes`);
        
        // Generate a random target ID for the find_node query
        const randomTarget = Node.generateID();
        if (this.debugMode) console.log(`[Join] Using target ID: ${randomTarget.toString('hex').substring(0, 8)}...`);
        
        this.bootstraps.forEach((b, index) => {
            if (this.debugMode) console.log(`[Join] Sending find_node to bootstrap[${index}]: ${b.address}:${b.port}`);
            
            // Construct the message and log it
            const message = {
                t: generateTid(),
                y: 'q',
                q: 'find_node',
                a: {
                    id: this.table.id,
                    target: randomTarget,
                    v2: 1  // Advertise support for BEP-52 (v2 infohashes)
                }
            };
            
            if (this.debugMode) console.log(`[Join] Message to ${b.address}:${b.port}: ${JSON.stringify(message, (key, value) => {
                if (Buffer.isBuffer(value)) {
                    return `Buffer(${value.length}): ${value.toString('hex').substring(0, 8)}...`;
                }
                return value;
            })}`);
            
            this.findNode(this.table.id, b);
        });
    }

    private walk(): void {
        // Clear previous timeout if exists
        if (this.walkInterval) {
            clearTimeout(this.walkInterval);
            this.walkInterval = null;
        }

        // For debugging
        if (this.debugMode) {
            console.log(`[Walk] Table size: ${this.table.size()}`);
        }

        if (this.table.size() === 0) {
            // If table is empty, try to join the DHT network again
            this.join();
            
            // And wait a bit longer before next walk
            this.walkInterval = setTimeout(() => this.walk(), 5000);
            return;
        }

        const nodes = this.table.shiftBatch(this.concurrency);
        
        // Log the nodes we're walking
        if (this.debugMode && nodes.length > 0) {
            console.log(`[Walk] Processing ${nodes.length} nodes from table`);
        }

        // Use a random infohash to search for more DHT activity
        // More aggressive v2 querying: 30% chance to send a query with each walk
        if (this.table.size() > 10 && nodes.length > 0 && Math.random() < 0.3) {  // Increased probability
            // Find valid nodes to query
            const validNodes = nodes.filter(node => node && node.address && isValidPort(node.port));
            const nodesToQuery = Math.min(3, validNodes.length); // Query up to 3 nodes
            
            for (let i = 0; i < nodesToQuery; i++) {
                const node = validNodes[i];
                if (node) {
                    // Bias toward v2 queries (75% if enabled)
                    const isV2Query = !this.v1Only && Math.random() < 0.75;
                    const randomInfoHash = isV2Query ? crypto.randomBytes(32) : crypto.randomBytes(20);
                    
                    this.sendGetPeers(node, randomInfoHash);
                    
                    if (this.debugMode) {
                        console.log(`[GetPeers] Sent random ${isV2Query ? 'v2' : 'v1'} infohash query to ${node.address}:${node.port}`);
                    }
                }
            }
        }

        // Process all valid nodes in the batch
        for (const node of nodes) {
            if (node && node.id && node.address && isValidPort(node.port)) {
                // Send find_node queries
                this.findNode(Node.neighbor(node.id, this.table.id), { 
                    address: node.address, 
                    port: node.port 
                });
                
                // Occasionally also send a get_peers query to this node
                if (!this.v1Only && Math.random() < 0.05) {  // 5% chance
                    // Always use v2 infohash for these additional queries
                    const v2InfoHash = crypto.randomBytes(32);
                    this.sendGetPeers(node, v2InfoHash);
                    
                    if (this.debugMode) {
                        console.log(`[GetPeers] Additional v2 query to ${node.address}:${node.port}`);
                    }
                }
            }
        }

        // Schedule next walk
        this.walkInterval = setTimeout(() => this.walk(), this.walkIntervalTime);
    }

    // Add a new method to send get_peers queries
    private sendGetPeers(node: INode, infoHash: Buffer): void {
        if (!node || !isValidPort(node.port)) {
            return;
        }

        const message: KRPCMessage = {
            t: generateTid(),
            y: 'q',
            q: 'get_peers',
            a: {
                id: this.table.id,
                info_hash: infoHash,
                v2: 1    // Advertise support for BEP-52 (v2 infohashes)
            }
        };

        this.send(message, { address: node.address, port: node.port });
    }

    private onFoundNodes(nodesData: Buffer): void {
        if (!Buffer.isBuffer(nodesData)) {
            if (this.debugMode) console.error('[OnFoundNodes] Got invalid nodes data (not a buffer)');
            return;
        }

        // Check if the data appears valid (multiple of 26 bytes)
        if (nodesData.length % 26 !== 0) {
            if (this.debugMode) {
                console.error(`[OnFoundNodes] Invalid nodes data length: ${nodesData.length} bytes (not a multiple of 26)`);
                console.error(`[OnFoundNodes] First 40 bytes: ${nodesData.slice(0, 40).toString('hex')}`);
            }
            return;
        }

        // Each node is 26 bytes: 20 bytes ID + 4 bytes IP + 2 bytes port
        const nodeCount = nodesData.length / 26;
        if (this.debugMode) console.log(`[OnFoundNodes] Processing ${nodeCount} nodes from ${nodesData.length} bytes`);

        // Try to manually decode the first node for diagnostic purposes
        if (nodeCount > 0 && this.debugMode) {
            try {
                const firstNodeData = nodesData.slice(0, 26);
                const nodeId = firstNodeData.slice(0, 20);
                const ip = `${firstNodeData[20]}.${firstNodeData[21]}.${firstNodeData[22]}.${firstNodeData[23]}`;
                const port = firstNodeData.readUInt16BE(24);
                console.log(`[Manual Decode] First node: ID=${nodeId.toString('hex').substring(0, 8)}... IP=${ip} Port=${port}`);
            } catch (err) {
                console.error('[Manual Decode] Failed:', err);
            }
        }

        const decodedNodes = Node.decodeNodes(nodesData);
        if (this.debugMode) console.log(`[OnFoundNodes] Successfully decoded ${decodedNodes.length}/${nodeCount} nodes`);

        let addedCount = 0;
        let validNodes = 0;

        // Log the first few nodes
        if (decodedNodes.length > 0 && this.debugMode) {
            decodedNodes.slice(0, Math.min(3, decodedNodes.length)).forEach((node, idx) => {
                console.log(`[Node ${idx}] ID: ${node.id.toString('hex').substring(0, 8)}... Address: ${node.address}:${node.port}`);
            });
        } else if (decodedNodes.length === 0 && this.debugMode) {
            console.warn('[OnFoundNodes] No valid nodes were decoded');
            return;
        }

        decodedNodes.forEach((node) => {
            // Basic validation and ensure it's not our own node ID
            if (node.id && node.id.length === 20 && !node.id.equals(this.table.id) && isValidPort(node.port)) {
                validNodes++;
                const result = this.table.add(node);
                if(result) {
                    addedCount++;
                    // Immediately try to connect to expand routing table
                    this.findNode(Node.neighbor(node.id, this.table.id), node);
                }
            } else if (this.debugMode) {
                console.log(`[Node Validation Failed] ${JSON.stringify({
                    hasId: !!node.id,
                    idLength: node.id ? node.id.length : 0,
                    isSelf: node.id && node.id.equals(this.table.id),
                    port: node.port,
                    validPort: isValidPort(node.port)
                })}`);
            }
        });

        if (this.debugMode) console.log(`[OnFoundNodes] Valid: ${validNodes}/${decodedNodes.length}, Added: ${addedCount}, Table size: ${this.table.size()}`);

        if (decodedNodes.length > 0) {
            this.emit('nodes', decodedNodes);
        }
    }

    // --- KRPC Message Handlers ---

    private onFindNodeRequest(message: KRPCMessage, rinfo: RemoteInfo): void {
        if (!message.t || !message.a || !Buffer.isBuffer(message.a.id) || message.a.id.length !== 20 || !Buffer.isBuffer(message.a.target) || message.a.target.length !== 20 ) {
             if (this.debugMode) console.warn(`[OnFindNodeRequest] Invalid message format:`, message);
             return;
        }
        const { t: tid, a: { id: nid, target: _target } } = message; // target isn't used directly here

        this.send({
            t: tid,
            y: 'r',
            r: {
                id: Node.neighbor(nid, this.table.id),
                nodes: Node.encodeNodes(this.table.first()), // Send some nodes from our table
                v2: 1  // Advertise support for BEP-52 (v2 infohashes)
            }
        }, rinfo);
    }

    private onGetPeersRequest(message: KRPCMessage, rinfo: RemoteInfo): void {
         // Basic checks
         if (!message.t || !message.a || !message.a.id || !message.a.info_hash) {
             if (this.debugMode) console.warn(`[OnGetPeersRequest] Invalid basic message structure:`, message);
             return;
         }

         // Check types and lengths, but log warnings instead of returning immediately
         let validNid = Buffer.isBuffer(message.a.id) && message.a.id.length === 20;
         if (!validNid) {
             if (this.debugMode) console.warn(`[OnGetPeersRequest] Invalid node ID format/length. ID: ${message.a.id}`);
             return; 
         }

         let validInfohashBuffer = Buffer.isBuffer(message.a.info_hash);
         if (!validInfohashBuffer) {
            if (this.debugMode) console.warn(`[OnGetPeersRequest] Infohash is not a buffer. Type: ${typeof message.a.info_hash}`);
            return;
         }

         const { t: tid, a: { id: nid, info_hash: infohash } } = message;

         // More permissive check for infohash validity - don't strictly require exact lengths
         const infoHashLength = infohash.length;
         let version: 1 | 2 = 1;
         
         if (infoHashLength === 32) {
             version = 2;
             this.v2Count++;
             if (this.debugMode) {
                 console.log(`[DEBUG] InfoHash v2 (32 bytes) requested: ${infohash.toString('hex').toUpperCase()}`);
             }
         } else if (infoHashLength === 20) {
             this.v1Count++;
         } else {
             if (this.debugMode) console.warn(`[OnGetPeersRequest] Unusual infohash length: ${infoHashLength} bytes`);
             // Continue anyway but classify as v1
             this.v1Count++;
         }

        this.send({
            t: tid,
            y: 'r',
            r: {
                id: Node.neighbor(nid, this.table.id),
                nodes: Node.encodeNodes(this.table.first()),
                token: this.token.generate(), // Generate a fresh token for the response
                v2: 1  // Advertise support for BEP-52 (v2 infohashes)
            }
        }, rinfo);

        this.emit('unensureHash', infohash.toString('hex').toUpperCase(), version);
    }

    private onAnnouncePeerRequest(message: KRPCMessage, rinfo: RemoteInfo): void {
         if (!message.t || !message.a || !Buffer.isBuffer(message.a.id) || message.a.id.length !== 20 || !Buffer.isBuffer(message.a.info_hash) || !Buffer.isBuffer(message.a.token)) {
             if (this.debugMode) console.warn(`[OnAnnouncePeerRequest] Invalid message format:`, message);
             return;
         }
        const { t: tid, a: { info_hash: infohash, token, id: nid, implied_port, port: queryPort } } = message;

        if (!this.token.isValid(token)) {
             if (this.debugMode) console.warn(`[OnAnnouncePeerRequest] Invalid token received.`);
            return;
        }

        let finalPort = (implied_port !== undefined && implied_port !== 0) ? rinfo.port : (queryPort || 0);
        if (!isValidPort(finalPort)) {
            if (this.debugMode) console.warn(`[OnAnnouncePeerRequest] Invalid port derived: ${finalPort}.`);
             return;
        }

        if (!isValidInfoHash(infohash, this.v1Only)) {
             if (this.debugMode) console.warn(`[OnAnnouncePeerRequest] Invalid infohash announced:`, infohash.toString('hex'));
            return;
        }

        // Respond first
        this.send({ t: tid, y: 'r', r: { id: Node.neighbor(nid, this.table.id) } }, rinfo);

        const version = isInfoHashV2(infohash) ? 2 : 1;
        if (version === 2) {
            this.v2Count++;
            if (this.debugMode) {
                console.log(`[DEBUG] InfoHash v2 announced: ${infohash.toString('hex').toUpperCase()} from ${rinfo.address}:${finalPort}`);
            }
        } else {
            this.v1Count++;
        }

        // Only emit ensureHash if not disabled
        if (!this.disableEnsureHash) {
            this.emit('ensureHash', infohash.toString('hex').toUpperCase(), {
                address: rinfo.address,
                port: finalPort,
                version: version
            });
        }
    }

    private onPingRequest(message: KRPCMessage, rinfo: RemoteInfo): void {
         if (!message.t || !message.a || !Buffer.isBuffer(message.a.id) || message.a.id.length !== 20 ) {
             if (this.debugMode) console.warn(`[OnPingRequest] Invalid message format:`, message);
             return;
         }
        this.send({ 
            t: message.t, 
            y: 'r', 
            r: { 
                id: Node.neighbor(message.a.id, this.table.id),
                v2: 1  // Advertise support for BEP-52 (v2 infohashes)
            } 
        }, rinfo);
    }

    private parse(data: Buffer, rinfo: RemoteInfo): void {
        try {
            // For bootstrap nodes, log the raw data for debugging
            const isBootstrapNode = this.bootstraps.some(
                node => node.address === rinfo.address && node.port === rinfo.port
            );

            if (isBootstrapNode && this.debugMode) {
                console.log(`[Bootstrap Response] From ${rinfo.address}:${rinfo.port} Size: ${data.length} bytes`);
                // Also log the hex representation of the first few bytes to verify the data format
                console.log(`[Bootstrap Raw] ${data.slice(0, 40).toString('hex')}`);
            }

            // Use 'unknown' and type guards for safer decoding
            let message: any;
            try {
                message = bencode.decode(data);
                
                // Special logging for bootstrap node responses
                if (isBootstrapNode && this.debugMode) {
                    // Show response content details
                    // const safeJsonString = JSON.stringify(message, (key, value) => {
                    //     if (Buffer.isBuffer(value)) {
                    //         return `Buffer<${value.length}>: ${value.slice(0, 10).toString('hex')}...`;
                    //     }
                    //     return value;
                    // }, 2);
                    console.log('[Bootstrap Message Summary]', message);
                }
            } catch (err) {
                if (this.debugMode) console.error(`[Parse] Bencode decoding error:`, err);
                return;
            }

            // Basic validation of the decoded structure
            if (typeof message !== 'object' || message === null || !message.y) {
                if (this.debugMode) console.warn(`[Parse] Received invalid/non-KRPC message from ${rinfo.address}:${rinfo.port}.`);
                return;
            }

            // Ensure messageType is a proper string
            let messageType = '';
            if (Buffer.isBuffer(message.y)) {
                messageType = message.y.toString('utf8');
            } else if (typeof message.y === 'string') {
                messageType = message.y;
            } else {
                messageType = String(message.y);
            }

            // Log response type for bootstrap nodes
            if (isBootstrapNode && this.debugMode) {
                console.log(`[Bootstrap] Message type: '${messageType}' from ${rinfo.address}:${rinfo.port}`);
            }

            if (messageType === 'r' && message.r) {
                // Check for nodes in the response
                if (message.r.nodes) {
                    // Ensure nodes data is a Buffer
                    let nodesData = message.r.nodes;
                    if (!Buffer.isBuffer(nodesData)) {
                        if (Array.isArray(nodesData)) {
                            // Handle array of numbers
                            nodesData = Buffer.from(nodesData);
                        } else {
                            if (this.debugMode) console.warn(`[Parse] Nodes field is not a Buffer: ${typeof nodesData}`);
                            return;
                        }
                    }

                    const nodesLength = nodesData.length;
                    
                    if (isBootstrapNode && this.debugMode) {
                        console.log(`[Bootstrap] Found nodes data: ${nodesLength} bytes`);
                        // Show a sample of the nodes data as hex
                        console.log(`[Bootstrap Nodes Hex] ${nodesData.slice(0, Math.min(40, nodesLength)).toString('hex')}`);
                    }
                    
                    // Process if length is correct
                    if (nodesLength > 0) {
                        if (nodesLength % 26 === 0) {
                            if (isBootstrapNode && this.debugMode) {
                                console.log(`[Bootstrap] Processing ${nodesLength/26} nodes`);
                            }
                            
                            // Process the nodes - this should update our routing table
                            this.onFoundNodes(nodesData);
                        } else {
                            if (this.debugMode) console.warn(`[Parse] Invalid nodes data length: ${nodesLength} bytes (not a multiple of 26)`);
                        }
                    } else {
                        if (this.debugMode) console.log(`[Parse] Received empty nodes data`);
                    }
                } else {
                    if (isBootstrapNode && this.debugMode) {
                        console.log(`[Bootstrap] Response from ${rinfo.address}:${rinfo.port} has no nodes field.`);
                    }
                }
            } else if (messageType === 'q' && message.q) {
                const queryType = typeof message.q === 'string' ? message.q : message.q.toString('utf8');
                if (this.debugMode) console.log(`[Parse] Received query '${queryType}' from ${rinfo.address}:${rinfo.port}.`);
                
                // Process query based on type
                switch(queryType) {
                    case 'get_peers':
                        this.onGetPeersRequest(message, rinfo);
                        break;
                    case 'announce_peer':
                        this.onAnnouncePeerRequest(message, rinfo);
                        break;
                    case 'find_node':
                        this.onFindNodeRequest(message, rinfo);
                        break;
                    case 'ping':
                        this.onPingRequest(message, rinfo);
                        break;
                    default:
                        if (this.debugMode) console.log(`[Parse] Received unknown query type: ${queryType}`);
                        break;
                }
            } else if (messageType === 'e') {
                if (this.debugMode) console.log(`[Parse] Received error message from ${rinfo.address}:${rinfo.port}:`, message.e);
            }
        } catch (err) {
            if (this.debugMode) console.error(`[Parse] Error processing message from ${rinfo.address}:${rinfo.port}:`, err);
        }
    }

    private initSocket(): void {
        if (this.udp) return; // Already initialized

        this.udp = dgram.createSocket('udp4');

        this.udp.on('listening', () => {
            const address = this.udp?.address();
            if (address) {
                console.log(`DHT Spider listening on ${address.address}:${address.port}`);
                if (this.debugMode) {
                    console.log(`Attempting to connect to ${this.bootstraps.length} bootstrap nodes...`);
                    // Log bootstrap nodes we're trying to connect to
                    this.bootstraps.forEach((node, index) => {
                        console.log(`Bootstrap[${index}]: ${node.address}:${node.port}`);
                    });
                }
            }
        });

        this.udp.on('message', (data: Buffer, rinfo: RemoteInfo) => {
             // Add basic validation for rinfo
             if (!rinfo || !rinfo.address || !isValidPort(rinfo.port)) {
                  if (this.debugMode) console.warn("[Message] Received message with invalid remote info:", rinfo);
                  return;
             }
             // Log initial connections for debugging
             if (this.debugMode && this.table.size() < 10) {
                 console.log(`[RECV] Message from ${rinfo.address}:${rinfo.port} (${data.length} bytes)`);
             }
            this.parse(data, rinfo);
        });

        this.udp.on('error', (err: Error) => {
             if (this.debugMode) console.error('[UDP Error]', err);
             // UDP errors are often not fatal, but log them.
             // Consider if specific errors should trigger a restart or stop.
             // For example, EADDRINUSE might require stopping.
             if ((err as any).code === 'EADDRINUSE') {
                 console.error(`UDP Port ${this.udpPort} is already in use. Stopping spider.`); // Keep this error visible
                 this.stop(); 
             }
        });

        this.udp.on('close', () => {
            if (this.debugMode) console.log('[UDP Close] Socket closed.');
             this.udp = null; // Ensure we know the socket is closed
        });

        try {
             this.udp.bind(this.udpPort);
        } catch (err) {
             console.error(`Failed to bind UDP socket to port ${this.udpPort}:`, err); // Keep this error visible
             this.udp = null; // Ensure socket is marked as unusable
             throw err; // Rethrow for calling code to handle
        }
    }

    start(): void {
        if (this.udp) {
            if (this.debugMode) console.warn('[Start] Spider is already running.');
            return;
        }
        console.log('[Start] Initializing DHT Spider...'); // Keep this message visible
        
        this.initSocket(); // Initialize and bind the socket
        if (!this.udp) {
             console.error("[Start] Failed to initialize UDP socket. Cannot start."); // Keep this error visible
             return; // Don't proceed if socket failed to bind
        }

        // Start periodic tasks only after socket is confirmed to be initializing
        this.joinInterval = setInterval(() => this.join(), this.joinIntervalTime);
        // Start walk immediately after a short delay to allow listening event
        setTimeout(() => this.walk(), 50); 
        this.join(); // Initial join attempt

        // If debug mode is enabled, periodically log statistics
        if (this.debugMode) {
            this.v1Count = 0; // Reset counts on start
            this.v2Count = 0;
            this.statsInterval = setInterval(() => {
                const total = this.v1Count + this.v2Count;
                const v2Ratio = total > 0 ? (this.v2Count / total * 100).toFixed(2) : '0.00';
                console.log(`[STATS] Table Size: ${this.table.size()}/${this.table.capacity} | v1 Hashes: ${this.v1Count} | v2 Hashes: ${this.v2Count} | v2 Ratio: ${v2Ratio}%`);
            }, 30000); // Every 30 seconds
        }
    }

    stop(): void {
        console.log('[Stop] Stopping DHT Spider...'); // Keep this message visible
        if (this.joinInterval) {
            clearInterval(this.joinInterval);
            this.joinInterval = null;
        }
        if (this.walkInterval) {
            clearTimeout(this.walkInterval);
            this.walkInterval = null;
        }
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
            this.statsInterval = null;
        }
        this.token.stop(); // Stop token generation interval

        if (this.udp) {
            try {
                 this.udp.close();
            } catch (err) {
                 console.error("[Stop] Error closing UDP socket:", err); // Keep this error visible
            }
             this.udp = null; // Mark as closed
        }
        this.table.clear(); // Clear routing table
        console.log('[Stop] DHT Spider stopped.'); // Keep this message visible
    }

    listen(port?: number): void {
        if (port !== undefined) {
            this.udpPort = port;
        }
        this.start();
    }

    // Public method to get current node count
    getNodeCount(): number {
        return this.table.size();
    }

    // More aggressively try to find v2 infohashes
    forceGetPeers(): void {
        const tableSize = this.table.size();
        if (tableSize === 0) {
            if (this.debugMode) console.log("[ForceGetPeers] No nodes in routing table. Trying to join DHT...");
            this.join();
            return;
        }

        // Get nodes without removing them from the table
        const nodes = this.table.first();
        const validNodes = nodes.filter(node => node && node.address && isValidPort(node.port));
        
        if (this.debugMode) {
            console.log(`[ForceGetPeers] Found ${validNodes.length} valid nodes for queries`);
        }
        
        // Send get_peers with random infohashes to stimulate the DHT
        // More aggressive approach: query more nodes with bias toward v2
        const nodesToQuery = Math.min(20, validNodes.length);
        
        if (this.debugMode) {
            console.log(`[ForceGetPeers] Sending get_peers to ${nodesToQuery} random nodes`);
        }
        
        for (let i = 0; i < nodesToQuery; i++) {
            const node = validNodes[i];
            if (node) {
                // Heavy bias toward v2 infohashes (80% if enabled)
                const isV2Query = !this.v1Only && Math.random() < 0.8;
                const randomInfoHash = isV2Query ? crypto.randomBytes(32) : crypto.randomBytes(20);
                
                this.sendGetPeers(node, randomInfoHash);
                
                if (this.debugMode) {
                    console.log(`[ForceGetPeers] Sent ${isV2Query ? 'v2' : 'v1'} query to ${node.address}:${node.port}`);
                }
            }
        }
    }
}

// Export the class as default
export default Spider; 