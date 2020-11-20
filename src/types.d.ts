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

export type StorageProof = {
    accountProof: string[],
    balance: string,
    codeHash: string,
    nonce: string,
    storageHash: string,
    storageProof: { key: string, proof: string[], value: string }[]
}

export type RpcGetBlockResponse = {
    jsonrpc: string,
    id: number,
    result: BlockData
}

export type RpcGetProofResponse = {
    jsonrpc: string,
    id: number,
    result: StorageProof
}
