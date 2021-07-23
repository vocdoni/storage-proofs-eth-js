import { EthProofs, EthProvider } from "./common"
import { Contract, BigNumber, providers, utils } from "ethers"
import { MINIME_ABI } from "./abi/erc"
// import { StorageProof } from "./types"

export namespace MiniMeProof {
  const MAX_POSITION_ATTEMPTS = 20

  export function get(contractAddress: string, storageKeys: string[] = [], blockNumber: number | "latest", provider: EthProvider.Providerish) {
    // TODO:
  }

  export function verify() {
    // TODO:
  }

  /**
   * findTokenSlot attempts to find the map index slot for the minime balances.
   * If the position cannot be found, `null` is returned.
   */
  export async function findTokenSlot(tokenAddress: string, holderAddress: string, provider: providers.JsonRpcProvider) {
    const blockNumber = await provider.getBlockNumber()
    const tokenInstance = new Contract(tokenAddress, MINIME_ABI, provider)
    const balance = await tokenInstance.balanceOf(holderAddress) as BigNumber
    if (balance.isZero()) throw new Error("The holder has no balance")

    for (let idx = 0; idx < MAX_POSITION_ATTEMPTS; idx++) {
      try {
        const checkPointsSize = await getArraySize(tokenAddress, holderAddress, idx, blockNumber, provider)
        if (checkPointsSize <= 0) continue

        const { amount, block } = await getCheckPointAtPosition(tokenAddress, holderAddress, idx, checkPointsSize, blockNumber, provider)
        if (block.isZero()) continue

        if (amount.equal(balance)) {
          return idx
        }
      } catch (err) {
        continue
      }
    }
    return null
  }

  // HELPERS

  function getCheckPointAtPosition(tokenAddress: string, holderAddress: string, mapIndexSlot: number, position: number, blockHeight: number, provider: providers.Provider) {
    const mapSlot = EthProofs.getMapSlot(holderAddress, mapIndexSlot)
    const vf = utils.keccak256(mapSlot)

    const offset = BigInt(position - 1)
    const v = BigInt(vf) + offset
    const arraySlot = v.toString(16) // no "0x"

    return provider.getStorageAt(tokenAddress, "0x" + arraySlot, blockHeight)
      .then(value => {
        return parseCheckPointValue(value)
      })
  }

  function getArraySize(tokenAddress: string, holderAddress: string, position: number, blockHeight: number, provider: providers.Provider): Promise<number> {
    const holderMapSlot = EthProofs.getMapSlot(holderAddress, position)

    return provider.getStorageAt(tokenAddress, holderMapSlot, blockHeight)
      .then(value => {
        if (!value) throw new Error("Not found")

        return Number(value) // hex value should be on the JS number range
      })
  }

  function parseCheckPointValue(hexValue: string) {
    // TODO:

    return { amount: null, block: null }
  }
}
