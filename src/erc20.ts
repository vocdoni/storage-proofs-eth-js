import { providers, utils } from "ethers"
import { EthProofs, EthProvider } from "./common"
import { StorageProof } from "./types"

export class ERC20Prover {
    provider: providers.JsonRpcProvider | providers.Web3Provider | providers.IpcProvider | providers.InfuraProvider

    constructor(provider: string | providers.JsonRpcProvider | providers.Web3Provider | providers.IpcProvider | providers.InfuraProvider) {
        this.provider = EthProvider.get(provider)
    }

    /** Fetches (and optionally verifies) the storage proof of the given keys within the given contract */
    public async getProof(contractAddress: string, storageKeys: string[] = [], blockNumber: number | "latest" = "latest", verify?: boolean) {
        const targetBlockNumber = typeof blockNumber == "number" ?
            blockNumber : await this.provider.getBlockNumber()

        const proof = await EthProvider.fetchStorageProof(contractAddress, storageKeys, targetBlockNumber, this.provider)
        const block = await EthProvider.fetchBlock(targetBlockNumber, this.provider)

        if (verify) {
            await this.verify(block.stateRoot, contractAddress, proof)
        }

        const network = await this.provider.getNetwork()
        const blockHeaderRLP = EthProofs.getHeaderRLP(block, network.name)
        const accountProofRLP = EthProofs.encodeProof(proof.accountProof)
        const storageProofsRLP = proof.storageProof.map(p => EthProofs.encodeProof(p.proof))

        return {
            proof,
            block,
            blockHeaderRLP,
            accountProofRLP,
            storageProofsRLP
        }
    }

    /** Returns true if the given proof conforms to the given block stateRoot and contract address */
    public async verify(stateRoot: string, contractAddress: string, proof: StorageProof) {
        // Verify account proof locally
        const isAccountProofValid = await EthProofs.verifyAccountProof(stateRoot, contractAddress, proof)
        if (!isAccountProofValid) {
            throw new Error("Local verification of account proof failed")
        }

        // Verify storage proofs locally
        const storageProofs = await Promise.all(proof.storageProof.map(
            storageProof => EthProofs.verifyStorageProof(proof.storageHash, storageProof)
        ))

        const failedProofs = storageProofs.filter(result => !result)

        if (failedProofs.length > 0) {
            throw new Error(`Proof failed for storage proofs ${JSON.stringify(failedProofs)}`)
        }
    }

    /** Computes the slot where the given token holder would have its balance stored,
     * if the balance mapping was assigned the given position */
    public static getHolderBalanceSlot(holderAddress: string, balanceMappingPosition: number): string {
        // Equivalent to keccak256(abi.encodePacked(bytes32(holder), balanceMappingPosition));
        return utils.solidityKeccak256(["bytes32", "uint256"], [utils.hexZeroPad(holderAddress.toLowerCase(), 32), balanceMappingPosition])
    }
}
