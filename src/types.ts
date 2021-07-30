// Data types

export type BlockData = {
    difficulty: string,
    extraData: string,
    gasLimit: string,
    gasUsed: string,
    hash: string,
    logsBloom: string,
    miner: string,
    mixHash: string,
    nonce: string,
    number: string,
    parentHash: string,
    receiptsRoot: string,
    sha3Uncles: string,
    size: string,
    stateRoot: string,
    timestamp: string,
    totalDifficulty: string,
    transactions: any[],
    transactionsRoot: string,
    uncles: any[]
}

export type EthereumProof = {
    accountProof: string[],
    balance: string,
    codeHash: string,
    nonce: string,
    storageHash: string,
    storageProof: StorageProof
}

export type StorageProof = StorageProofItem[]

export type StorageProofItem = {
    /** 0x prefixed hex string of the key that identifies the value stored on-chain */
    key: string,
    /** 0x prefixed hex strings of the proof */
    proof: string[],
    /** 0x prefixed hex string of the value stored on-chain */
    value: string
}

// JSON RPC Response types

export type JsonRpcResponse<T> = {
    jsonrpc: string,
    id: number,
    result: T
}
