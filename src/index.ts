import { providers, utils } from "ethers"
import { BlockData, StorageProof } from "./types"
import blockHeaderFromRpc from "@ethereumjs/block/dist/header-from-rpc"
import EthCommon from "@ethereumjs/common"
import { BaseTrie } from "merkle-patricia-tree"
import { Proof } from "merkle-patricia-tree/dist/baseTrie"
import { rlp } from "ethereumjs-util"

export class ERC20Prover {
    provider: providers.JsonRpcProvider | providers.Web3Provider | providers.IpcProvider | providers.InfuraProvider

    constructor(provider: string | providers.JsonRpcProvider | providers.Web3Provider | providers.IpcProvider | providers.InfuraProvider) {
        if (typeof provider == "string") {
            this.provider = new providers.JsonRpcProvider(provider)
            return
        }
        this.provider = provider
    }

    async getProof(address: string, storageKeys: string[] = [], blockNumber: number | "latest" = "latest", verify?: boolean) {
        const proof = await this.fetchStorageProof(address, storageKeys, blockNumber)
        const block = await this.fetchBlock(blockNumber)

        if (verify) {
            await this.verify(block.stateRoot, address, proof)
        }

        const network = await this.provider.getNetwork()
        const blockHeaderRLP = this.getHeaderRLP(block, network.name)
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

    public static getHolderBalanceSlot(holderAddress: string, balanceMappingSlot: number): string {
        // Equivalent to keccak256(abi.encodePacked(bytes32(holder), balanceMappingPosition));
        return utils.solidityKeccak256(["bytes32", "uint256"], [utils.hexZeroPad(holderAddress.toLowerCase(), 32), balanceMappingSlot])
    }

    public async verify(stateRoot: string, address: string, proof: StorageProof) {
        // Verify account proof locally
        const isAccountProofValid = await this.verifyAccountProof(stateRoot, address, proof)
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
                if (!proofStorageValue) throw new Error("Could not verify the proof")

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

    private encodeProof(proof): string {
        return "0x" + rlp.encode(proof.map(part => rlp.decode(part))).toString("hex")
    }

    private encodeAccountRlp({ nonce, balance, storageHash, codeHash }: { nonce: string, balance: string, storageHash: string, codeHash: string }) {
        if (balance === "0x0") {
            balance = null // account RLP sets a null value if the balance is 0
        }

        return rlp.encode([nonce, balance, storageHash, codeHash])
    }

    private fetchStorageProof(address: string, storageKeys: any[], blockNumber: number | "latest" = "latest"): Promise<StorageProof> {
        return this.provider.send("eth_getProof", [address, storageKeys, utils.hexValue(blockNumber)])
            .then((response: StorageProof) => {
                if (!response) throw new Error("Block not found")
                return response
            })
    }

    private fetchBlock(blockNumber: number | "latest" = "latest"): Promise<BlockData> {
        return this.provider.send("eth_getBlockByNumber", [utils.hexValue(blockNumber), false])
            .then((response: BlockData) => {
                if (!response) throw new Error("Block not found")
                return response
            })
    }

    private getHeaderRLP(rpcBlock: BlockData, networkId: string): string {
        const header = blockHeaderFromRpc(rpcBlock, { common: new EthCommon({ chain: networkId, hardfork: "london" }) })
        const blockHeaderRLP = "0x" + header.serialize().toString("hex")
        const solidityBlockHash = "0x" + header.hash().toString("hex")

        if (solidityBlockHash !== rpcBlock.hash) {
            throw new Error(`Block header RLP hash (${solidityBlockHash}) doesn't match block hash (${rpcBlock.hash})`)
        }

        return blockHeaderRLP
    }
}
