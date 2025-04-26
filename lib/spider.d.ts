import { EventEmitter } from 'events';
import { INode } from './table';
export interface BootstrapNode {
    address: string;
    port: number;
    dnsFailures?: number;
}
export interface SpiderOptions {
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
export interface KRPCMessage {
    t: string | Buffer;
    y: 'q' | 'r' | 'e';
    q?: string;
    r?: any;
    a?: any;
    e?: any;
}
export interface RemoteInfo {
    address: string;
    port: number;
    family: 'IPv4' | 'IPv6';
    size: number;
}
export interface EnsureHashPayload {
    address: string;
    port: number;
    version: 1 | 2;
}
export interface SpiderEvents {
    nodes: (nodes: INode[]) => void;
    unensureHash: (infoHash: string, version: 1 | 2) => void;
    ensureHash: (infoHash: string, payload: EnsureHashPayload) => void;
}
export declare class Spider extends EventEmitter {
    private udp;
    private table;
    private bootstraps;
    private udpPort;
    private token;
    private walkInterval;
    private joinInterval;
    private statsInterval;
    private concurrency;
    private joinIntervalTime;
    private walkIntervalTime;
    private debugMode;
    private v1Count;
    private v2Count;
    private v1Only;
    private disableEnsureHash;
    constructor(options?: SpiderOptions);
    on<K extends keyof SpiderEvents>(event: K, listener: SpiderEvents[K]): this;
    emit<K extends keyof SpiderEvents>(event: K, ...args: Parameters<SpiderEvents[K]>): boolean;
    private send;
    private findNode;
    join(): void;
    private walk;
    private sendGetPeers;
    private onFoundNodes;
    private onFindNodeRequest;
    private onGetPeersRequest;
    private onAnnouncePeerRequest;
    private onPingRequest;
    private parse;
    private initSocket;
    start(): void;
    stop(): void;
    listen(port?: number): void;
    getNodeCount(): number;
    forceGetPeers(): void;
}
export default Spider;
