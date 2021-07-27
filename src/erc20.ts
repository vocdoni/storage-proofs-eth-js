import { EthProofs, EthProvider } from "./common"
import { Contract, BigNumber, providers } from "ethers"
import { StorageProof } from "./types"
import { ERC20_ABI } from "./abi/erc"

const MAX_POSITION_ATTEMPTS = 50

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
            })
            .then(storageProofs => {
                const failedProofs = storageProofs.filter(result => !result)

                if (failedProofs.length > 0) {
                    const invalidIndexes = storageProofs.map((valid, idx) => valid ? -1 : idx).filter(idx => idx >= 0)
                    throw new Error(`Some storage proof(s) are not valid: ${invalidIndexes.join(", ")}`)
                }
            })
    }

    /**
     * Attempts to find the index at which the holder balances are stored within the token contract.
     * If the position cannot be found among the 50 first ones, `null` is returned.
     */
    export async function findBalanceMappingPosition(tokenAddress: string, holderAddress: string, provider: providers.JsonRpcProvider) {
        const blockNumber = await provider.getBlockNumber()
        const tokenInstance = new Contract(tokenAddress, ERC20_ABI, provider)
        const balance = await tokenInstance.balanceOf(holderAddress) as BigNumber
        if (balance.isZero()) throw new Error("The holder has no balance")

        for (let pos = 0; pos < MAX_POSITION_ATTEMPTS; pos++) {
            try {
                const holderBalanceSlot = EthProofs.getMapSlot(holderAddress, pos)

                const result = await get(tokenAddress, [holderBalanceSlot], blockNumber, provider)
                if (result == null || !result.proof) continue

                // Throws if not valid
                await verify(result.block.stateRoot, tokenAddress, result.proof)

                const onChainBalance = BigNumber.from(result.proof.storageProof[0].value)
                if (!onChainBalance.eq(balance)) continue

                // Found
                return pos
            }
            catch (err) {
                continue
            }
        }
        return null
    }
}
