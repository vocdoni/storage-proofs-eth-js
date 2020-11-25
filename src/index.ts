import { providers, utils } from "ethers"
import { BlockData, StorageProof, JsonRpcResponse } from "./types"
import blockHeaderFromRpc from "@ethereumjs/block/dist/header-from-rpc"
import { BaseTrie } from "merkle-patricia-tree"
import { Proof } from "merkle-patricia-tree/dist/baseTrie"
import { rlp } from "ethereumjs-util"

// TODO: For browsers to work, using Buffer from NPM is required
// import { Buffer } from "buffer/"

export class StorageProover {
    provider: providers.JsonRpcProvider | providers.Web3Provider | providers.IpcProvider | providers.InfuraProvider

    constructor(provider: string | providers.JsonRpcProvider | providers.Web3Provider | providers.IpcProvider | providers.InfuraProvider) {
        if (typeof provider == "string") {
            this.provider = new providers.JsonRpcProvider(provider)
            return
        }
        this.provider = provider
    }

    async getProof(address: string, storageKeys: string[] = [], blockNumber: number | "latest" = "latest", verify: boolean = true) {
        const proof = await this.fetchStorageProof(address, storageKeys, blockNumber)
        const block = await this.fetchBlock(blockNumber)
        const blockHeaderRLP = this.getHeaderRLP(block)

        if (verify) {
            // Verify account proof locally
            const isAccountProofValid = await this.verifyAccountProof(block.stateRoot, address, proof)
            if (!isAccountProofValid) {
                throw new Error("Local verification of account proof failed")
            }

            // Verify storage proofs locally
            const storageProofs = await Promise.all(proof.storageProof.map(
                storageProof => this.verifyStorageProof(proof.storageHash, storageProof)
            ))

            const failedProofs = storageProofs.filter(result => !result)

            if (failedProofs.length > 0) {
                throw new Error(`Proof failed for storage proofs ${JSON.stringify(failedProofs)}`)
            }
        }

        const accountProofRLP = this.encodeProof(proof.accountProof)
        const storageProofsRLP = proof.storageProof.map(p => this.encodeProof(p.proof))

        return {
            proof,
            block,
            blockHeaderRLP,
            accountProofRLP,
            storageProofsRLP
        }
    }

    private encodeProof(proof): string {
        return "0x" + rlp.encode(proof.map(part => rlp.decode(part))).toString("hex")
    }

    private verifyAccountProof(stateRoot: string, address: string, proof: StorageProof): Promise<boolean> {
        const path = utils.keccak256(address).slice(2)

        return this.verifyProof(stateRoot, path, proof.accountProof)
            .then(proofAccountRLP => {
                const stateAccountRlp = this.encodeAccountRlp(proof)
                return Buffer.compare(stateAccountRlp, proofAccountRLP) === 0
            })
    }

    private verifyStorageProof(storageRoot: string, storageProof: { key: string, proof: string[], value: string }): Promise<boolean> {
        const path = utils.solidityKeccak256(["uint256",], [storageProof.key]).slice(2)

        return this.verifyProof(storageRoot, path, storageProof.proof)
            .then(proofStorageValue => {
                const stateValueRLP = rlp.encode(storageProof.value)
                return Buffer.compare(proofStorageValue, stateValueRLP) === 0
            })
    }

    private verifyProof(rootHash: string, path: string, proof: string[]): Promise<Buffer> {
        // Note: crashing when the account is not used???
        // Error: Key does not match with the proof one (extention|leaf)

        const rootHashBuff = Buffer.from(rootHash.replace("0x", ""), "hex")
        const pathBuff = Buffer.from(path.replace("0x", ""), "hex")
        const proofBuffers: Proof = proof.map(p => Buffer.from(p.replace("0x", ""), "hex"))

        return BaseTrie.verifyProof(rootHashBuff, pathBuff, proofBuffers)
    }

    private encodeAccountRlp({ nonce, balance, storageHash, codeHash }: { nonce: string, balance: string, storageHash: string, codeHash: string }) {
        if (balance === "0x0") {
            balance = null // account RLP sets a null value if the balance is 0
        }

        return rlp.encode([nonce, balance, storageHash, codeHash])
    }

    private fetchStorageProof(address: string, storageKeys: any[], blockNumber: number | "latest" = "latest"): Promise<StorageProof> {
        return this.provider.send("eth_getProof", [address, storageKeys, utils.hexValue(blockNumber)])
            .then((response: JsonRpcResponse<StorageProof>) => {
                if (!response.result) throw new Error("Block not found")
                return response.result
            })
    }

    private fetchBlock(blockNumber: number | "latest" = "latest"): Promise<BlockData> {
        return this.provider.send("eth_getBlockByNumber", [utils.hexValue(blockNumber), false])
            .then((response: JsonRpcResponse<BlockData>) => {
                if (!response.result) throw new Error("Block not found")
                return response.result
            })
    }

    private getHeaderRLP(rpcBlock: BlockData): string {
        const header = blockHeaderFromRpc(rpcBlock)
        const blockHeaderRLP = "0x" + header.serialize().toString("hex")
        const solidityBlockHash = "0x" + header.hash().toString("hex")

        if (solidityBlockHash !== rpcBlock.hash) {
            throw new Error(`Block header RLP hash (${solidityBlockHash}) doesn't match block hash (${rpcBlock.hash})`)
        }

        return blockHeaderRLP
    }
}
