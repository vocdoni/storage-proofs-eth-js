import { providers, utils } from "ethers"
import { BlockData, EthereumProof } from "./types"
import blockHeaderFromRpc from "@ethereumjs/block/dist/header-from-rpc"
import EthCommon from "@ethereumjs/common"
import { BaseTrie } from "merkle-patricia-tree"
import { Proof } from "merkle-patricia-tree/dist/baseTrie"
import { rlp } from "ethereumjs-util"

// NETWORK

export namespace EthProvider {
  type ProviderDetails = string | providers.JsonRpcProvider | providers.Web3Provider | providers.IpcProvider | providers.InfuraProvider
  export type Providerish = providers.JsonRpcProvider | providers.Web3Provider | providers.IpcProvider | providers.InfuraProvider

  export function get(provider: ProviderDetails): Providerish {
    if (typeof provider == "string") {
      return new providers.JsonRpcProvider(provider)
    }
    return provider
  }

  export function fetchStorageProof(contractAddress: string, storageKeys: string[], blockNumber: number, provider: Providerish): Promise<EthereumProof> {
    const hexBlockNumber = utils.hexValue(blockNumber)

    return provider.send("eth_getProof", [contractAddress, storageKeys, hexBlockNumber])
      .then((response: EthereumProof) => {
        if (!response) throw new Error("Block not found")
        return response
      })
  }

  export function fetchBlock(blockNumber: number, provider: Providerish): Promise<BlockData> {
    const hexBlockNumber = utils.hexValue(blockNumber)

    return provider.send("eth_getBlockByNumber", [hexBlockNumber, false])
      .then((response: BlockData) => {
        if (!response) throw new Error("Block not found")
        return response
      })
  }
}

// PROOF MANAGEMENT

export namespace EthProofs {
  export function verifyAccountProof(stateRoot: string, contractAddress: string, proof: EthereumProof): Promise<boolean> {
    const path = utils.keccak256(contractAddress).slice(2)

    return verifyProof(stateRoot, path, proof.accountProof)
      .then(proofAccountRLP => {
        if (!proofAccountRLP) throw new Error("Could not verify the account proof")

        const stateAccountRlp = encodeAccountRlp(proof)
        return Buffer.compare(stateAccountRlp, proofAccountRLP) === 0
      })
  }

  export function verifyStorageProof(storageRoot: string, storageProof: { key: string, proof: string[], value: string }): Promise<boolean> {
    const path = utils.solidityKeccak256(["uint256"], ["0x" + storageProof.key]).slice(2)

    return verifyProof(storageRoot, path, storageProof.proof)
      .then(proofStorageValue => {
        // If non-existing, then the value should be zero
        if (proofStorageValue === null) {
          return storageProof.value === "0x0"
        }

        const stateValueRLP = rlp.encode(storageProof.value)
        return Buffer.compare(proofStorageValue, stateValueRLP) === 0
      })
  }

  export function encodeAccountRlp({ nonce, balance, storageHash, codeHash }: { nonce: string, balance: string, storageHash: string, codeHash: string }) {
    if (balance === "0x0") {
      balance = null // account RLP sets a null value if the balance is 0
    }

    return rlp.encode([nonce, balance, storageHash, codeHash])
  }

  export function encodeProofRlp(proofHexParts: string[]): string {
    const proofParts = proofHexParts.map(part => rlp.decode(part)) as Buffer[][]
    return "0x" + rlp.encode(proofParts).toString("hex")
  }

  export function getHeaderRlp(rpcBlock: BlockData, networkId: string): string {
    const common = getEthHeaderParseOptions(parseInt(rpcBlock.number), networkId)

    const header = blockHeaderFromRpc(rpcBlock, { common })

    const blockHash = "0x" + header.hash().toString("hex")
    if (blockHash !== rpcBlock.hash) {
      throw new Error(`Block header RLP hash (${blockHash}) doesn't match block hash (${rpcBlock.hash})`)
    }

    const blockHeaderRLP = header.serialize().toString("hex")
    return "0x" + blockHeaderRLP
  }

  /** Computes the slot where the given token holder would have its balance stored,
   * if the balance mapping was assigned the given position */
  export function getMapSlot(holderAddress: string, mappingPosition: number): string {
    // Equivalent to keccak256(abi.encodePacked(bytes32(holder), mappingPosition));
    return utils.solidityKeccak256(
      ["bytes32", "uint256"],
      [utils.hexZeroPad(holderAddress.toLowerCase(), 32), mappingPosition]
    )
  }

  /** Computes the slot where the given token holder would have its balance stored,
   * if the balance mapping was assigned the given position */
  export function getArraySlot(position: number): string {
    // Equivalent to keccak256(abi.encodePacked(position));
    return utils.solidityKeccak256(["uint256"], [position])
  }
}

///////////////////////////////////////////////////////////////////////////////
// HELPERS

/**  Returns null if not existing. Returns the leaf value otherwise. */
function verifyProof(rootHash: string, path: string, proof: string[]): Promise<Buffer> {
  // Note: crashing when the account is not used???
  // Error: Key does not match with the proof one (extention|leaf)

  const rootHashBuff = Buffer.from(rootHash.replace("0x", ""), "hex")
  const pathBuff = Buffer.from(path.replace("0x", ""), "hex")
  const proofBuffers: Proof = proof.map(p => Buffer.from(p.replace("0x", ""), "hex"))

  return BaseTrie.verifyProof(rootHashBuff, pathBuff, proofBuffers)
}

/** Provides the right flags to handle Ethereum headers */
export function getEthHeaderParseOptions(blockNumber: number, networkId: string) {
  switch (networkId) {
    case "mainnet":
    case "homestead":
      networkId = "mainnet"
      if (blockNumber < 12965000) return new EthCommon({ chain: networkId })
    case "ropsten":
      if (blockNumber < 10499401) return new EthCommon({ chain: networkId })
    case "goerli":
      if (blockNumber < 5062605) return new EthCommon({ chain: networkId })
    case "rinkeby":
      if (blockNumber < 8897988) return new EthCommon({ chain: networkId })
  }

  return new EthCommon({ chain: networkId, hardfork: "london" })
}