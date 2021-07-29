import { EthProofs, EthProvider } from "./common"
import { Contract, BigNumber, providers, utils } from "ethers"
import { MINIME_ABI } from "./abi/erc"
import { StorageProof } from "./types"

export namespace MiniMeProof {
  const MAX_POSITION_ATTEMPTS = 20

  export async function get(contractAddress: string, holderAddress: string, slot: number, provider: EthProvider.Providerish, blockNumber: number | "latest" = "latest") {
    const targetBlock = Number.isInteger(blockNumber) ?
      BigNumber.from(blockNumber) :
      await provider.getBlockNumber().then(v => BigNumber.from(v))

    const checkPointsSize = await getArraySize(contractAddress, holderAddress, slot, provider, targetBlock.toNumber())

    const hexKeys: string[] = []

    // Check the current checkpoint
    const { block, arraySlot: currHexSlot } = await getCheckPointAtPosition(contractAddress, holderAddress, slot, checkPointsSize, provider, targetBlock.toNumber())

    if (targetBlock.gt(block)) {
      // append the proof of non-existence of +1
      const { arraySlot: nextHexSlot } = await getCheckPointAtPosition(contractAddress, holderAddress, slot, checkPointsSize + 1, provider, targetBlock.toNumber())
      hexKeys.push(currHexSlot)
      hexKeys.push(nextHexSlot)
    }
    else {
      // TODO: Turn into a binary search

      for (let i = checkPointsSize - 1; i > 0; i--) {
        const { block: checkPointBlock, arraySlot: prevHexSlot } = await getCheckPointAtPosition(contractAddress, holderAddress, slot, i - 1, provider, targetBlock.toNumber())

        if (checkPointBlock.gte(targetBlock)) {
          // If minime checkpoint block -1 is equal or greather than the block we
          // are looking for, that's the one we need (the previous and the current)
          const { balance, block, arraySlot: currHexSlot } = await getCheckPointAtPosition(contractAddress, holderAddress, slot, i, provider, targetBlock.toNumber())

          if (balance.gt(0)) throw new Error("Proof of nil has a balance value")
          else if (block.gt(0)) throw new Error("Proof of nil has a block value")

          hexKeys.push(prevHexSlot)
          hexKeys.push(currHexSlot)
          break
        }
      }
    }

    if (hexKeys.length == 0) throw new Error("Check point not found")

    return EthProvider.fetchStorageProof(contractAddress, hexKeys, targetBlock.toNumber(), provider)
  }

  export async function verify(holderAddress: string, storageRoot: string, proof: StorageProof, mapIndexSlot: number,
    targetBalance: BigNumber, targetBlock: number) {
    // Sanity checks
    if (proof.length != 2) throw new Error("Incorrect amount of storage proofs")
    else if (!targetBalance || typeof targetBlock != "number") throw new Error("Invalid parameters")

    proof.forEach((proof, idx) => {
      if (idx == 0 && !proof.value) throw new Error("Empty value")

      const k = utils.hexZeroPad("0x" + proof.key, 32).replace("0x", "")
      const v = utils.hexZeroPad(proof.value, 32).replace("0x", "")

      if (v.length != 64) throw new Error("Invalid value length")
      else if (k.length != 64) throw new Error("Invalid key length")
    })

    // Check the proof keys (should match with the holder)
    checkMiniMeKeys(proof[0].key, proof[1].key, holderAddress, mapIndexSlot)

    // Extract balance and block from the minime proof
    const { block: proof0Block, balance: proof0Balance } = parseCheckPointValue(proof[0].value)
    if (!proof0Balance.eq(targetBalance)) throw new Error("Proof balance does not match")

    // Verify that `proof0Block <= targetBlock < proof1Block`
    if (!proof0Block.lte(targetBlock)) throw new Error("Proof 0 block should be lower or equal to the target block")

    // Check if the proof1 is a proof of non existence (so proof0 is the last checkpoint).
    // If not the last, then check the target block is
    if (proof[1].value && !BigNumber.from(proof[1].value).eq(0)) {
      const { block: proof1Block } = parseCheckPointValue(proof[1].value)

      if (!proof0Block.lt(proof1Block)) throw new Error("Proof 0 block should be behind proof 1 block")
      else if (!BigNumber.from(targetBlock).lt(proof1Block)) throw new Error("The target block should be behind proof 1 block")
    }

    for (let i = 0; i < proof.length; i++) {
      const valid = await EthProofs.verifyStorageProof(storageRoot, proof[i])
      if (!valid) throw new Error("Proof " + i + " not valid")
    }
  }

  /**
   * findMapSlot attempts to find the map index slot for the minime balances.
   * If the position cannot be found, `null` is returned.
   */
  export async function findMapSlot(tokenAddress: string, holderAddress: string, provider: providers.JsonRpcProvider) {
    const blockNumber = await provider.getBlockNumber()
    const tokenInstance = new Contract(tokenAddress, MINIME_ABI, provider)
    const balance = await tokenInstance.balanceOf(holderAddress) as BigNumber
    if (balance.isZero()) throw new Error("The holder has no balance")

    for (let idx = 0; idx < MAX_POSITION_ATTEMPTS; idx++) {
      try {
        const checkPointsSize = await getArraySize(tokenAddress, holderAddress, idx, provider, blockNumber)
        if (checkPointsSize <= 0) continue

        const { balance, block } = await getCheckPointAtPosition(tokenAddress, holderAddress, idx, checkPointsSize, provider, blockNumber)
        if (block.isZero()) continue

        if (balance.eq(balance)) {
          return idx
        }
      } catch (err) {
        continue
      }
    }
    return null
  }
}

///////////////////////////////////////////////////////////////////////////////
// HELPERS

export function getCheckPointAtPosition(tokenAddress: string, holderAddress: string, mapIndexSlot: number, position: number, provider: providers.Provider, blockHeight?: number | "latest") {
  const mapSlot = EthProofs.getMapSlot(holderAddress, mapIndexSlot)
  const vf = utils.keccak256(mapSlot)

  const offset = BigInt(position - 1)
  const v = BigInt(vf) + offset
  const arraySlot = v.toString(16) // no "0x"

  return provider.getStorageAt(tokenAddress, "0x" + arraySlot, blockHeight)
    .then(value => parseCheckPointValue(value))
    .then(({ balance, block }) => {
      return {
        balance,
        block,
        arraySlot
      }
    })
}

export function getArraySize(tokenAddress: string, holderAddress: string, position: number, provider: providers.Provider, blockHeight?: number | "latest"): Promise<number> {
  const holderMapSlot = EthProofs.getMapSlot(holderAddress, position)

  return provider.getStorageAt(tokenAddress, holderMapSlot, blockHeight)
    .then(value => {
      if (!value) throw new Error("Not found")

      return Number(value) // hex value should be on the JS number range
    })
}

export function parseCheckPointValue(hexValue: string) {
  if (hexValue.startsWith("0x")) {
    hexValue = hexValue.replace("0x", "")
  }
  while (hexValue.length < 64) {
    hexValue = "0" + hexValue
  }

  // TODO: https://github.com/Giveth/minime/blob/master/contracts/MiniMeToken.sol#L49
  //       https://github.com/vocdoni/storage-proofs-eth-go/blob/master/token/minime/helpers.go#L101
  // TODO: Shouldn't it be reversed?
  const hexBalance = hexValue.substr(0, 32) // [:16]
  const hexBlock = hexValue.substr(32) // [16:]

  return { balance: BigNumber.from("0x" + hexBalance), block: BigNumber.from("0x" + hexBlock) }
}

// Checks the validity of a storage proof key for a specific token holder address
// As MiniMe includes checkpoints and each one adds +1 to the key, there is a maximum
// hardcoded tolerance of 2^16 positions for the key
export function checkMiniMeKeys(hexKey1: string, hexKey2: string, holderAddress: string, mapIndexSlot: number) {
  const mapSlot = EthProofs.getMapSlot(holderAddress, mapIndexSlot)
  const vf = utils.keccak256(mapSlot)
  const holderMapIndex = BigNumber.from(vf)

  const key1Index = BigNumber.from(hexKey1.startsWith("0x") ? hexKey1 : "0x" + hexKey1)
  const key2Index = BigNumber.from(hexKey2.startsWith("0x") ? hexKey2 : "0x" + hexKey2)

  if (!key1Index.add(1).eq(key2Index)) throw new Error("Keys are not consecutive")

  // We tolerate maximum 2^16 minime checkpoints
  const offset = key1Index.sub(holderMapIndex)

  if (offset.lt(0) || offset.gte(65536)) throw new Error("Key offset overflow")
}
