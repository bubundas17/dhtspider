import crypto from 'crypto';

// Helper function to validate port numbers
function isValidPort(port: number): boolean {
    return Number.isInteger(port) && port > 0 && port < 65536;
}

// Interface for Node data structure
export interface INode {
    id: Buffer;
    address: string;
    port: number;
}

export class Node implements INode {
    id: Buffer;
    address: string; // Added for consistency, though not strictly used in instance methods
    port: number;    // Added for consistency
    
    // Static debug mode flag that will be set by the Table class
    private static debugMode: boolean = false;

    // Static method to set debug mode
    static setDebugMode(debug: boolean): void {
        Node.debugMode = debug;
    }

    // Constructor now accepts optional INode data
    constructor(data?: Partial<INode>) {
        this.id = data?.id || Node.generateID();
        this.address = data?.address || ''; // Initialize address
        this.port = data?.port || 0;      // Initialize port
    }

    static generateID(): Buffer {
        // Use Math.random() directly, ensure it's a string for update
        const randomData = `${Date.now()}:${Math.random()}`;
        return crypto.createHash('sha1').update(randomData).digest();
    }

    static neighbor(target: Buffer, id: Buffer): Buffer {
        // Ensure target and id are Buffers and have sufficient length
        if (!Buffer.isBuffer(target) || target.length < 6 || !Buffer.isBuffer(id) || id.length < 6) {
            // Return a default or throw an error, depending on desired handling
            // For robustness, maybe return a zero buffer or the original id?
            console.warn("[Node.neighbor] Invalid input buffers.");
            return id; // Or Buffer.alloc(20) or throw new Error(...)
        }
        return Buffer.concat([target.subarray(0, 6), id.subarray(6)]);
    }

    static encodeNodes(nodes: INode[]): Buffer {
        return Buffer.concat(nodes.map((node) => 
            Buffer.concat([
                node.id, 
                Node.encodeIP(node.address), 
                Node.encodePort(node.port)
            ])
        ));
    }

    static decodeNodes(data: Buffer): INode[] {
        const nodes: INode[] = [];
        if (!Buffer.isBuffer(data)) {
            if (Node.debugMode) console.error('[Node.decodeNodes] Data is not a Buffer');
            return nodes;
        }

        // DEBUG: Log raw data
        if (Node.debugMode) {
            console.log(`[DecodeNodes] Decoding ${data.length} bytes of node data`);
            console.log(`[DecodeNodes] First bytes: ${data.slice(0, Math.min(40, data.length)).toString('hex')}`);
        }

        // Check length and ensure it's a multiple of 26
        if (data.length === 0) {
            if (Node.debugMode) console.warn('[Node.decodeNodes] Empty node data');
            return nodes;
        }

        if (data.length % 26 !== 0) {
            if (Node.debugMode) console.error(`[Node.decodeNodes] Invalid data length: ${data.length} bytes (not a multiple of 26)`);
            
            // Try to extract as many complete nodes as possible
            const completeNodeCount = Math.floor(data.length / 26);
            if (completeNodeCount === 0) {
                return nodes;
            }
            
            if (Node.debugMode) console.log(`[DecodeNodes] Trying to extract ${completeNodeCount} complete nodes from invalid data`);
            // Truncate data to valid length
            data = data.slice(0, completeNodeCount * 26);
        }

        try {
            for (let i = 0; i + 26 <= data.length; i += 26) {
                try {
                    // Extract node ID (20 bytes)
                    const id = data.subarray(i, i + 20);
                    
                    // Extract IP address (4 bytes)
                    const ipBytes = data.subarray(i + 20, i + 24);
                    const ip = `${ipBytes[0]}.${ipBytes[1]}.${ipBytes[2]}.${ipBytes[3]}`;
                    
                    // Extract port (2 bytes)
                    const port = data.readUInt16BE(i + 24);
                    
                    // Basic validation removed to match JS behavior - validation should happen later
                    // if (id.length === 20 && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip) && port > 0 && port < 65536) {
                    //     if (Node.debugMode) console.log(`[DecodeNodes] Found valid node: ${ip}:${port}`);
                    nodes.push({ id, address: ip, port });
                    // } else {
                    //     if (Node.debugMode) console.warn(`[Node.decodeNodes] Skipping invalid node at offset ${i}: ID length=${id.length}, IP=${ip}, port=${port}`);
                    // }
                } catch (e) {
                    if (Node.debugMode) console.error(`[Node.decodeNodes] Error decoding node at index ${i}:`, e);
                    // Continue to the next node
                }
            }
        } catch (err) {
            if (Node.debugMode) console.error('[Node.decodeNodes] Fatal error decoding nodes:', err);
        }
        
        if (Node.debugMode) console.log(`[DecodeNodes] Successfully decoded ${nodes.length} nodes`);
        
        if (Node.debugMode && nodes.length > 0) {
            // Log a sample of the decoded nodes for debugging
            const sample = nodes.slice(0, Math.min(3, nodes.length));
            sample.forEach((node, idx) => {
                console.log(`[DecodeNodes] Node ${idx}: ${node.address}:${node.port}`);
            });
        }
        
        return nodes;
    }

    static encodeIP(ip: string): Buffer {
        // Add validation for IP format
        if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
            console.warn(`[Node.encodeIP] Invalid IP format: ${ip}. Returning zero buffer.`);
            return Buffer.alloc(4); // Return a zero buffer for invalid IPs
        }
        return Buffer.from(ip.split('.').map((i) => parseInt(i, 10)));
    }

    static encodePort(port: number): Buffer {
        const data = Buffer.alloc(2);
        // Add validation for port range
        if (port > 0 && port < 65536) {
            data.writeUInt16BE(port, 0);
        }
        else {
            console.warn(`[Node.encodePort] Invalid port number: ${port}. Using 0.`);
            // Keep the buffer as zeros if port is invalid
        }
        return data;
    }
}

export class Table {
    readonly id: Buffer;
    private nodes: INode[];
    public readonly capacity: number;
    private nodeMap: Map<string, boolean>; // Use string (hex ID) as key
    private batchSize: number = 8; // Default batch size
    private debugMode: boolean = false; // Debug mode flag

    constructor(capacity: number = 600, debugMode: boolean = false) { // Added debugMode parameter
        this.id = Node.generateID();
        this.nodes = [];
        this.capacity = capacity;
        this.nodeMap = new Map<string, boolean>();
        this.debugMode = debugMode;
        
        // Set the static debugMode on the Node class
        Node.setDebugMode(debugMode);
    }

    add(node: INode): boolean {
        // Basic validation of the node object
        if (!node) {
            if (this.debugMode) console.warn('[Table.add] Attempted to add null/undefined node');
            return false;
        }
        
        // More forgiving validation with detailed logging
        // if (!Buffer.isBuffer(node.id)) {
        //     if (this.debugMode) console.warn('[Table.add] Node has invalid ID (not a buffer):', node.id);
        //     return false;
        // }
        
        // if (node.id.length !== 20) {
        //     if (this.debugMode) console.warn(`[Table.add] Node has invalid ID length: ${node.id.length} bytes (should be 20)`);
        //     return false;
        // }
        
        // if (typeof node.address !== 'string' || !node.address) {
        //     if (this.debugMode) console.warn('[Table.add] Node has invalid address:', node.address);
        //     return false;
        // }
        
        // if (typeof node.port !== 'number' || !isValidPort(node.port)) {
        //     if (this.debugMode) console.warn(`[Table.add] Node has invalid port: ${node.port}`);
        //     return false;
        // }
        
        // Avoid adding self
        if (node.id.equals(this.id)) {
            if (this.debugMode) console.log('[Table.add] Skipping node with same ID as ours');
            return false;
        }
        
        // Check for duplicate using node ID
        const nodeKey = node.id.toString('hex');
        if (this.nodeMap.has(nodeKey)) {
            // We already have this node
            return false;
        }
        
        // Check for space in the table
        if (this.nodes.length >= this.capacity) {
            if (this.debugMode) console.log(`[Table.add] Table is full (${this.capacity} nodes)`);
            return false;
        }

        // All checks passed, add the node
        this.nodes.push(node);
        this.nodeMap.set(nodeKey, true);
        if (this.debugMode) console.log(`[Table.add] Added node ${node.address}:${node.port} - Table size: ${this.nodes.length}`);
        return true;
    }

    shift(): INode | null {
        const node = this.nodes.shift(); // Removes and returns the first element
        if (node) {
            this.nodeMap.delete(node.id.toString('hex'));
            return node;
        }
        return null;
    }

    shiftBatch(count: number): (INode | null)[] {
        const batch: (INode | null)[] = [];
        const numToShift = Math.min(count, this.nodes.length);
        for (let i = 0; i < numToShift; i++) {
            batch.push(this.shift()); // Use shift to remove from map as well
        }
        // Filter out null values if any error occurred in shift, though unlikely here
        return batch.filter(n => n !== null) as INode[]; 
    }

    first(): INode[] {
        const count = Math.min(this.nodes.length, this.batchSize);
        if (count === 0) return [];
        if (this.nodes.length >= this.batchSize) {
             return this.nodes.slice(0, this.batchSize);
        } else {
             // If fewer nodes than batchSize, repeat the first node
             const firstNode = this.nodes[0];
             return Array(this.batchSize).fill(firstNode);
        }
    }

    size(): number {
        return this.nodes.length;
    }

    clear(): void {
        this.nodes = [];
        this.nodeMap.clear();
    }
}