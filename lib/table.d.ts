export interface INode {
    id: Buffer;
    address: string;
    port: number;
}
export declare class Node implements INode {
    id: Buffer;
    address: string;
    port: number;
    private static debugMode;
    static setDebugMode(debug: boolean): void;
    constructor(data?: Partial<INode>);
    static generateID(): Buffer;
    static neighbor(target: Buffer, id: Buffer): Buffer;
    static encodeNodes(nodes: INode[]): Buffer;
    static decodeNodes(data: Buffer): INode[];
    static encodeIP(ip: string): Buffer;
    static encodePort(port: number): Buffer;
}
export declare class Table {
    readonly id: Buffer;
    private nodes;
    readonly capacity: number;
    private nodeMap;
    private batchSize;
    private debugMode;
    constructor(capacity?: number, debugMode?: boolean);
    add(node: INode): boolean;
    shift(): INode | null;
    shiftBatch(count: number): (INode | null)[];
    first(): INode[];
    size(): number;
    clear(): void;
}
