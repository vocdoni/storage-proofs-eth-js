import { EthProofs, EthProvider } from "./common"
import { utils } from "ethers"
import { StorageProof } from "./types"

export namespace ERC20Proof {
    /** Fetches the storage proof of the given keys within the given contract */
    export async function get(contractAddress: string, storageKeys: string[] = [], blockNumber: number | "latest", provider: EthProvider.Providerish) {
        const targetBlockNumber = typeof blockNumber == "number" ?
            blockNumber : await provider.getBlockNumber()

        const proof = await EthProvider.fetchStorageProof(contractAddress, storageKeys, targetBlockNumber, provider)
        const block = await EthProvider.fetchBlock(targetBlockNumber, provider)

        const network = await provider.getNetwork()
        const blockHeaderRLP = EthProofs.getHeaderRlp(block, network.name)
        const accountProofRLP = EthProofs.encodeProofRlp(proof.accountProof)
        const storageProofsRLP = proof.storageProof.map(p => EthProofs.encodeProofRlp(p.proof))

        return {
            proof,
            block,
            blockHeaderRLP,
            accountProofRLP,
            storageProofsRLP
        }
    }

    /** Does nothing if the given proof conforms to the given block stateRoot and contract address.
     * Throws an error otherwise.
     */
    export function verify(stateRoot: string, contractAddress: string, proof: StorageProof) {
        // Verify account proof locally
        return EthProofs.verifyAccountProof(stateRoot, contractAddress, proof)
            .then(isAccountProofValid => {
                if (!isAccountProofValid) {
                    throw new Error("The account proof is not valid")
                }

                // Verify storage proofs locally
                return Promise.all(proof.storageProof.map(
                    storageProof => EthProofs.verifyStorageProof(proof.storageHash, storageProof)
                ))
            }).then(storageProofs => {
                const failedProofs = storageProofs.filter(result => !result)

                if (failedProofs.length > 0) {
                    const invalidIndexes = storageProofs.map((valid, idx) => valid ? -1 : idx).filter(idx => idx >= 0)
                    throw new Error(`Some storage proof(s) are not valid: ${invalidIndexes.join(", ")}`)
                }
            })
    }

    /** Computes the slot where the given token holder would have its balance stored,
     * if the balance mapping was assigned the given position */
    export function getHolderBalanceSlot(holderAddress: string, balanceMappingPosition: number): string {
        // Equivalent to keccak256(abi.encodePacked(bytes32(holder), balanceMappingPosition));
        return utils.solidityKeccak256(
            ["bytes32", "uint256"],
            [utils.hexZeroPad(holderAddress.toLowerCase(), 32), balanceMappingPosition]
        )
    }
}
