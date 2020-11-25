import "mocha" // using @types/mocha
import { expect } from "chai"
import { StorageProover } from "../../src/index"
import { readFileSync } from "fs"
import { compile } from "solc"
import { getAccounts, localProvider } from "../util"
import { BigNumber, Contract, ContractFactory } from "ethers"

const TOKEN_TYPES = { vanilla: 0, minime: 1 }


describe('Token Storage Proofs', () => {
    let storageProover: StorageProover
    let tokenInstance: Contract

    const source = readFileSync("./erc20.sol")
    const erc20Output = compile(JSON.stringify({
        language: "Solidity",
        sources: { "erc20.sol": { content: source } },
        settings: { outputSelection: { "*": { "*": ["*"] } } }
    }))
    const { contracts } = JSON.parse(erc20Output)
    const erc20Abi = contracts["erc20.sol"].SimpleERC20.abi
    const erc20Bytecode = contracts["erc20.sol"].SimpleERC20.evm.bytecode.object

    const [holder, otherHolder, noHolder] = getAccounts()

    beforeEach(async () => {
        storageProover = new StorageProover(localProvider)
    })

    context('vanilla ERC20', () => {
        let blockNumber: number, initialBalance: BigNumber

        const tokenType = TOKEN_TYPES.vanilla
        const TOTAL_SUPPLY_SLOT = '0'
        const BALANCE_MAPPING_SLOT = '1'

        beforeEach(async () => {
            const contractFactory = new ContractFactory(erc20Abi, erc20Bytecode, holder.wallet)
            tokenInstance = await contractFactory.deploy() as Contract
            tokenInstance = tokenInstance.connect(holder.wallet) as Contract

            let tx = await tokenInstance.transfer(otherHolder.address, 1)
            await tx.wait()

            blockNumber = await localProvider.getBlockNumber()
            initialBalance = await tokenInstance.balanceOf(holder)

            tx = await tokenInstance.transfer(otherHolder.address, 1)
            await tx.wait()
        })

        it('gets balance from proof', async () => {
            // const proof = await storageProover.getProof(tokenInstance.address, [], blockNumber, false)

            // const balanceSlot = await tokenStorageProofs.getVanillaERC20BalanceSlot(holder, BALANCE_MAPPING_SLOT)
            const { storageProofsRLP } = await storageProover.getProof(tokenInstance.address, [balanceSlot], blockNumber, false)

            const provenBalance = await tokenStorageProofs.getBalance(
                tokenInstance.address,
                holder,
                blockNumber,
                storageProofsRLP[0],
                tokenType,
                BALANCE_MAPPING_SLOT
            )

            expect(provenBalance.toNumber()).to.eq(initialBalance.toNumber())
        })

        it('gets 0 balance for non-holder from exclusion proof', async () => {
            // const balanceSlot = await tokenStorageProofs.getVanillaERC20BalanceSlot(noHolder, BALANCE_MAPPING_SLOT)
            const { storageProofsRLP, proof } = await storageProover.getProof(tokenInstance.address, [balanceSlot], blockNumber, false)

            const provenBalance = await tokenStorageProofs.getBalance(
                tokenInstance.address,
                noHolder,
                blockNumber,
                storageProofsRLP[0],
                tokenType,
                BALANCE_MAPPING_SLOT
            )

            expect(provenBalance.toNumber()).to.eq(0)

            // Ensure that the returned 0 is not from a revert with no error data
            await assertSuccess(tokenStorageProofs.getBalance.request(
                tokenInstance.address,
                noHolder,
                blockNumber,
                storageProofsRLP[0],
                tokenType,
                BALANCE_MAPPING_SLOT
            ))
        })

        it('gets total supply from proof', async () => {
            const { storageProofsRLP } = await storageProover.getProof(tokenInstance.address, [TOTAL_SUPPLY_SLOT], blockNumber, false)

            const provenTotalSupply = await tokenStorageProofs.getTotalSupply(
                tokenInstance.address,
                blockNumber,
                storageProofsRLP[0],
                tokenType,
                TOTAL_SUPPLY_SLOT
            )

            expect(provenTotalSupply.toNumber()).to.eq((await tokenInstance.totalSupply()).toNumber())
        })
    })
})
