import "mocha" // using @types/mocha
import { expect } from "chai"
import { ERC20Prover } from "../../src/index"
import { provider } from "../util"
import { addCompletionHooks } from "../mocha-hooks"

addCompletionHooks()

describe('Token Storage Proofs', () => {
    let storageProover: ERC20Prover
    let blockNumber: number

    beforeEach(() => {
        storageProover = new ERC20Prover(provider)
    })

    const BALANCE_MAPPING_SLOT = 1

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

    it('Should generate proofs', async () => {
        const tokenAddr = "0xdac17f958d2ee523a2206206994597c13d831ec7"
        const holderAddr = "0x1062a747393198f70f71ec65a582423dba7e5ab3"

        blockNumber = await provider.getBlockNumber()
        const balanceSlot = ERC20Prover.getHolderBalanceSlot(holderAddr, BALANCE_MAPPING_SLOT)
        const result = await storageProover.getProof(tokenAddr, [balanceSlot], blockNumber, false)

        expect(result.proof).to.be.ok
        expect(Array.isArray(result.proof.accountProof)).to.eq(true)
        expect(result.proof.balance).to.match(/^0x[0-9a-fA-F]+$/)
        expect(result.proof.codeHash).to.match(/^0x[0-9a-fA-F]+$/)
        expect(result.proof.nonce).to.match(/^0x[0-9a-fA-F]+$/)
        expect(result.proof.storageHash).to.match(/^0x[0-9a-fA-F]+$/)
        expect(typeof result.proof.storageProof).to.eq("object")
        expect(result.blockHeaderRLP).to.match(/^0x[0-9a-fA-F]+$/)
        expect(result.accountProofRLP).to.match(/^0x[0-9a-fA-F]+$/)
        result.storageProofsRLP.forEach(proof => {
            expect(proof).to.match(/^0x[0-9a-fA-F]+$/)
        })
    }).timeout(5000)
})
