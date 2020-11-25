import "mocha" // using @types/mocha
import { expect } from "chai"
import { ERC20Prover } from "../../src/index"
import { readFileSync } from "fs"
import { compile } from "solc"
import { getAccounts, localProvider, TestAccount } from "../util"
import { BigNumber, Contract, ContractFactory } from "ethers"
import { addCompletionHooks } from "../mocha-hooks"

addCompletionHooks()

describe('Token Storage Proofs', () => {
    let storageProover: ERC20Prover
    let tokenInstance: Contract
    let holder: TestAccount, otherHolder: TestAccount, noHolder: TestAccount

    const source = readFileSync(__dirname + "/erc20.sol").toString()
    const erc20Output = compile(JSON.stringify({
        language: "Solidity",
        sources: { "erc20.sol": { content: source } },
        settings: { outputSelection: { "*": { "*": ["*"] } } }
    }))
    const { contracts } = JSON.parse(erc20Output)
    const erc20Abi = contracts["erc20.sol"].SimpleERC20.abi
    const erc20Bytecode = contracts["erc20.sol"].SimpleERC20.evm.bytecode.object

    beforeEach(() => {
        const accounts = getAccounts()
        holder = accounts[0]
        otherHolder = accounts[1]
        noHolder = accounts[2]

        storageProover = new ERC20Prover(localProvider)
    })

    it("Should compute a holder's balance slot", () => {
        const data = [
            { addr: "0x5B38Da6a701c568545dCfcB03FcB875f56beddC4", idx: 1, output: "0x36306db541fd1551fd93a60031e8a8c89d69ddef41d6249f5fdc265dbc8fffa2" },
            { addr: "0x4fa97b031428427ea36B8aDC91D9CB8Ba623F884", idx: 1, output: "0x998248fdc5b7b1d92420008502788c86e9d2075c997efd36254eb498729f099c" },
            { addr: "0x5C3ba3f01CB9Fa7429e7098dd89128b6378b22DE", idx: 1, output: "0x0213953694b427d8f8665bbbc81e58cb9fa05d85f1eb7ee22104c49f9300b40f" },
            { addr: "0xC69Bca872148FaC44a31d1922dd926dea34691F7", idx: 1, output: "0x9942f197e4f58df3c3c91803f59e36320cbb69ef8bd9fad0ca42530dd72532b6" },
            { addr: "0x1F5C3d9956314a5B48BbAb512567582C3FDd4814", idx: 1, output: "0xf4405451b973266bb605a12e1313ae240c8439c378025b544dce0e34e647691e" },
            { addr: "0xB9dCe9de05459a24294406a36D925869C4593b8A", idx: 1, output: "0x9420d1514c615c08c9665f50b7358e806e34c12e09ec3933d6b0dde95121ba6b" },
            { addr: "0x27271634805ADf966CD287157d643F0e7b41767a", idx: 1, output: "0x3221764d0ceea698a12be8ae8a2600d0e3bb26cad5d862c12f641f4831e1f804" },
            { addr: "0x19d1c7de23afC63a61aaf070187D6Fb8c243C64d", idx: 1, output: "0x360835ceba0d2e3baff887c2b7315a24a2bcab2701dd8e7c297782bcb314c7eb" },
        ]

        for (let item of data) {
            expect(ERC20Prover.getHolderBalanceSlot(item.addr, item.idx)).to.eq(item.output)
        }
    })

    context('Vanilla ERC20', () => {
        let blockNumber: number, initialBalance: BigNumber

        const TOTAL_SUPPLY_SLOT = 0
        const BALANCE_MAPPING_SLOT = 1

        beforeEach(async () => {
            const contractFactory = new ContractFactory(erc20Abi, erc20Bytecode, holder.wallet)
            tokenInstance = await contractFactory.deploy() as Contract
            tokenInstance = tokenInstance.connect(holder.wallet) as Contract

            let tx = await tokenInstance.transfer(otherHolder.address, 1)
            await tx.wait()

            blockNumber = await localProvider.getBlockNumber()
            initialBalance = await tokenInstance.balanceOf(holder.address)

            tx = await tokenInstance.transfer(otherHolder.address, 1)
            await tx.wait()
        })

        it('gets balance from proof', async () => {
            // const proof = await storageProover.getProof(tokenInstance.address, [], blockNumber, false)

            const balanceSlot = ERC20Prover.getHolderBalanceSlot(holder.address, BALANCE_MAPPING_SLOT)
            const { storageProofsRLP } = await storageProover.getProof(tokenInstance.address, [balanceSlot], blockNumber, false)

            // const provenBalance = await tokenStorageProofs.getBalance(
            //     tokenInstance.address,
            //     holder,
            //     blockNumber,
            //     storageProofsRLP[0],
            //     tokenType,
            //     BALANCE_MAPPING_SLOT
            // )

            // expect(provenBalance.toNumber()).to.eq(initialBalance.toNumber())
        })

        it('gets 0 balance for non-holder from exclusion proof', async () => {
            const balanceSlot = ERC20Prover.getHolderBalanceSlot(noHolder.address, BALANCE_MAPPING_SLOT)
            const { storageProofsRLP, proof } = await storageProover.getProof(tokenInstance.address, [balanceSlot], blockNumber, false)

            // const provenBalance = await tokenStorageProofs.getBalance(
            //     tokenInstance.address,
            //     noHolder,
            //     blockNumber,
            //     storageProofsRLP[0],
            //     tokenType,
            //     BALANCE_MAPPING_SLOT
            // )

            // expect(provenBalance.toNumber()).to.eq(0)

            // // Ensure that the returned 0 is not from a revert with no error data
            // await assertSuccess(tokenStorageProofs.getBalance.request(
            //     tokenInstance.address,
            //     noHolder,
            //     blockNumber,
            //     storageProofsRLP[0],
            //     tokenType,
            //     BALANCE_MAPPING_SLOT
            // ))
        })

        it('gets total supply from proof', async () => {
            const { storageProofsRLP } = await storageProover.getProof(tokenInstance.address, [String(TOTAL_SUPPLY_SLOT)], blockNumber, false)

            // const provenTotalSupply = await tokenStorageProofs.getTotalSupply(
            //     tokenInstance.address,
            //     blockNumber,
            //     storageProofsRLP[0],
            //     tokenType,
            //     TOTAL_SUPPLY_SLOT
            // )

            // expect(provenTotalSupply.toNumber()).to.eq((await tokenInstance.totalSupply()).toNumber())
        })
    })
})
