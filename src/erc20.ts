import { EthProof, EthProvider } from "./common"
import { Contract, BigNumber, providers } from "ethers"
import { EthereumProof } from "./types"
import { ERC20_ABI } from "./abi/erc"

const MAX_POSITION_ATTEMPTS = 50

export namespace ERC20Proof {
    /** Fetches the storage proof of the given keys within the given contract */
    export function get(contractAddress: string, holderAddress: string, balanceMappingSlot: number, blockNumber: number | "latest", provider: EthProvider.Providerish) {
        const balanceSlot = EthProof.getMapSlot(holderAddress, balanceMappingSlot)

        const prom = typeof blockNumber == "number" ?
            Promise.resolve(blockNumber) : provider.getBlockNumber()

        return prom.then(targetBlockNumber =>
            EthProvider.fetchProof(contractAddress, [balanceSlot], targetBlockNumber, provider)
        )
    }

    /** Fetches the account and storage proofs, along with the block header data of the given keys within the given contract */
    export function getFull(contractAddress: string, holderAddress: string, balanceMappingSlot: number, blockNumber: number | "latest", provider: EthProvider.Providerish) {
        const prom = typeof blockNumber == "number" ?
            Promise.resolve(blockNumber) : provider.getBlockNumber()

        return prom.then(targetBlockNumber => {
            return get(contractAddress, holderAddress, balanceMappingSlot, targetBlockNumber, provider)
                .then(proof => EthProvider.fetchFullProof(proof, targetBlockNumber, provider))
        })
    }

    /** Does nothing if the given proof conforms to the given block stateRoot and contract address.
     * Throws an error otherwise.
     */
    export function verify(stateRoot: string, contractAddress: string, proof: EthereumProof) {
        return EthProof.verifyAccountProof(stateRoot, contractAddress, proof)
            .then(isAccountProofValid => {
                if (!isAccountProofValid) {
                    throw new Error("The account proof is not valid")
                }

                // Verify the storage proof
                return Promise.all(proof.storageProof.map(
                    storageProof => EthProof.verifyStorageProof(proof.storageHash, storageProof)
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
    export async function findMapSlot(tokenAddress: string, holderAddress: string, provider: providers.JsonRpcProvider) {
        const blockNumber = await provider.getBlockNumber()
        const tokenInstance = new Contract(tokenAddress, ERC20_ABI, provider)
        const balance = await tokenInstance.balanceOf(holderAddress) as BigNumber
        if (balance.isZero()) throw new Error("The holder has no balance")

        for (let pos = 0; pos < MAX_POSITION_ATTEMPTS; pos++) {
            try {
                const holderBalanceSlot = EthProof.getMapSlot(holderAddress, pos)

                const value = await provider.getStorageAt(tokenAddress, "0x" + holderBalanceSlot, blockNumber)

                const onChainBalance = BigNumber.from(value)
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
