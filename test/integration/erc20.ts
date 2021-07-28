import "mocha" // using @types/mocha
import { expect } from "chai"
import { ERC20Proof, EthProofs } from "../../src/index"
import { provider } from "../util"
import { addCompletionHooks } from "../mocha-hooks"

addCompletionHooks()

describe('ERC20 Storage Proofs', () => {
    let blockNumber: number

    const TOKEN_ADDRESS = "0xdac17f958d2ee523a2206206994597c13d831ec7" // Tether
    const BALANCE_MAPPING_SLOT = 2

    it('Should generate valid proofs', async () => {
        const holderAddr = "0x1062a747393198f70f71ec65a582423dba7e5ab3"

        blockNumber = await provider.getBlockNumber()
        const balanceSlot = EthProofs.getMapSlot(holderAddr, BALANCE_MAPPING_SLOT)
        const result = await ERC20Proof.get(TOKEN_ADDRESS, [balanceSlot], blockNumber, provider)

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

        // verify
        const { block, proof } = result
        expect(async () => await ERC20Proof.verify(block.stateRoot, TOKEN_ADDRESS, proof)).to.not.throw

        const badStateRoot = "0x" + (block.stateRoot.substr(2).split("").reverse().join(""))
        expect(async () => await ERC20Proof.verify(badStateRoot, TOKEN_ADDRESS, proof)).to.throw
    }).timeout(10000)

    it('Should proof that a value does exist', async () => {
        const holderAddress = "0x1062a747393198f70f71ec65a582423dba7e5ab3"

        const balanceSlot = EthProofs.getMapSlot(holderAddress, BALANCE_MAPPING_SLOT)
        const storageKeys = [balanceSlot]
        const { block, proof } = await ERC20Proof.get(TOKEN_ADDRESS, storageKeys, "latest", provider)
        expect(proof.storageProof[0].value).to.not.eq("0x0")

        // verify
        expect(async () => await ERC20Proof.verify(block.stateRoot, TOKEN_ADDRESS, proof)).to.not.throw

        const badStateRoot = "0x" + (block.stateRoot.substr(2).split("").reverse().join(""))
        expect(async () => await ERC20Proof.verify(badStateRoot, TOKEN_ADDRESS, proof)).to.throw
    }).timeout(10000)

    it('Should verify a proof of non-existence', async () => {
        const holderAddress = "0x0010000000000000000000000000000000000000"
        const tokenAddress = "0x6b175474e89094c44da98b954eedeac495271d0f"

        const balanceSlot = EthProofs.getMapSlot(holderAddress, 100)
        const storageKeys = [balanceSlot]

        const { proof, block } = await ERC20Proof.get(tokenAddress, storageKeys, "latest", provider)
        expect(proof.storageProof[0].value).to.eq("0x0")

        // verify
        expect(async () => await ERC20Proof.verify(block.stateRoot, TOKEN_ADDRESS, proof)).to.not.throw

        const badStateRoot = "0x" + (block.stateRoot.substr(2).split("").reverse().join(""))
        expect(async () => await ERC20Proof.verify(badStateRoot, TOKEN_ADDRESS, proof)).to.throw
    }).timeout(10000)

    it('Should fail verifying if some value has been tampered with', async () => {
        const holderAddress = "0x0010000000000000000000000000000000000000"
        const tokenAddress = "0x6b175474e89094c44da98b954eedeac495271d0f"
        const unrealBalanceMappingPosition = 100

        const balanceSlot = EthProofs.getMapSlot(holderAddress, unrealBalanceMappingPosition)
        const storageKeys = [balanceSlot]

        {
            const { proof, block } = await ERC20Proof.get(tokenAddress, storageKeys, "latest", provider)
            expect(proof.storageProof[0].value).to.eq("0x0")

            // Corrupt the proof
            block.stateRoot = "0x0011223344556677889900003b11fd580a50d3054c144ca7caa623f29073d39d"

            try {
                await ERC20Proof.verify(block.stateRoot, tokenAddress, proof)
                throw new Error("Should have failed but didn't")
            } catch (err) {
                expect(err.message).to.not.eq("Should have failed but didn't")
            }
        }

        // 2

        {
            const { proof, block } = await ERC20Proof.get(tokenAddress, storageKeys, "latest", provider)
            expect(proof.storageProof[0].value).to.eq("0x0")

            // Corrupt the proof
            proof.storageProof[0].proof = []

            try {
                await ERC20Proof.verify(block.stateRoot, tokenAddress, proof)
                throw new Error("Should have failed but didn't")
            } catch (err) {
                expect(err.message).to.not.eq("Should have failed but didn't")
            }
        }

        // 3

        {
            const { proof, block } = await ERC20Proof.get(tokenAddress, storageKeys, "latest", provider)
            expect(proof.storageProof[0].value).to.eq("0x0")

            // Corrupt the proof
            const tmp = proof.storageProof[0].proof[0]
            proof.storageProof[0].proof[0] = "0x" + tmp.substr(2).split("").reverse().join("")

            try {
                await ERC20Proof.verify(block.stateRoot, tokenAddress, proof)
                throw new Error("Should have failed but didn't")
            } catch (err) {
                expect(err.message).to.not.eq("Should have failed but didn't")
            }
        }
    }).timeout(10000)
})
