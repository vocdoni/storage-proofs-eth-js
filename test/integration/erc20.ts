import "mocha" // using @types/mocha
import { expect } from "chai"
import { ERC20Proof } from "../../src/index"
import { provider } from "../util"
import { addCompletionHooks } from "../mocha-hooks"

addCompletionHooks()

describe('ERC20 Storage Proofs', () => {
    let blockNumber: number

    const TOKEN_ADDRESS = "0xdac17f958d2ee523a2206206994597c13d831ec7" // Tether

    it('Should generate valid proofs', async () => {
        const holderAddr = "0x1062a747393198f70f71ec65a582423dba7e5ab3"

        const mapSlot = await ERC20Proof.findMapSlot(TOKEN_ADDRESS, holderAddr, provider)
        blockNumber = await provider.getBlockNumber()
        const result = await ERC20Proof.getFull(TOKEN_ADDRESS, holderAddr, mapSlot, blockNumber, provider)

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
        result.proof.storageProof.forEach(item => {
            item.proof.forEach(proof => {
                expect(proof).to.match(/^0x[0-9a-fA-F]+$/)
            })
            expect(item.key).to.match(/^0x[0-9a-fA-F]+$/)
            expect(item.value).to.match(/^0x[0-9a-fA-F]+$/)
        })

        // verify
        const { block, proof } = result
        // should not throw
        await ERC20Proof.verify(block.stateRoot, TOKEN_ADDRESS, proof)

        const badStateRoot = "0x" + (block.stateRoot.substr(2).split("").reverse().join(""))
        try {
            await ERC20Proof.verify(badStateRoot, TOKEN_ADDRESS, proof)
            throw new Error("Should have failed but didn't")
        } catch (err) {
            expect(err.message).to.not.eq("Should have failed but didn't")
        }
    }).timeout(10000)

    it('Should proof that a value does exist', async () => {
        const holderAddr = "0x1062a747393198f70f71ec65a582423dba7e5ab3"
        const mapSlot = await ERC20Proof.findMapSlot(TOKEN_ADDRESS, holderAddr, provider)

        const { block, proof } = await ERC20Proof.getFull(TOKEN_ADDRESS, holderAddr, mapSlot, "latest", provider)
        expect(proof.storageProof[0].value).to.not.eq("0x0")

        // verify
        // should not throw
        await ERC20Proof.verify(block.stateRoot, TOKEN_ADDRESS, proof)

        const badStateRoot = "0x" + (block.stateRoot.substr(2).split("").reverse().join(""))
        try {
            await ERC20Proof.verify(badStateRoot, TOKEN_ADDRESS, proof)
            throw new Error("Should have failed but didn't")
        } catch (err) {
            expect(err.message).to.not.eq("Should have failed but didn't")
        }
    }).timeout(10000)

    it('Should verify a proof of non-existence', async () => {
        const tokenAddress = "0x6b175474e89094c44da98b954eedeac495271d0f"
        const nonHolderAddress = "0x0010000000000000000000000000000000000000"
        const unrealBalanceMappingPosition = 100

        const { proof, block } = await ERC20Proof.getFull(tokenAddress, nonHolderAddress, unrealBalanceMappingPosition, "latest", provider)
        expect(proof.storageProof[0].value).to.eq("0x0")

        // Verifying the proof of non existence should not throw
        await ERC20Proof.verify(block.stateRoot, tokenAddress, proof)

        // Corrupting the proof of non-existence, should fail
        const badStateRoot = "0x" + (block.stateRoot.substr(2).split("").reverse().join(""))
        try {
            await ERC20Proof.verify(badStateRoot, tokenAddress, proof)
            throw new Error("Should have failed but didn't")
        } catch (err) {
            expect(err.message).to.not.eq("Should have failed but didn't")
        }
    }).timeout(15000)

    it('Should fail verifying if some value has been tampered with', async () => {
        const holderAddr = "0x1062a747393198f70f71ec65a582423dba7e5ab3"
        const nonHolderAddress = "0x0010000000000000000000000000000000000000"
        const mapSlot = await ERC20Proof.findMapSlot(TOKEN_ADDRESS, holderAddr, provider)
        const unrealMapSlot = 100

        {
            const { proof, block } = await ERC20Proof.getFull(TOKEN_ADDRESS, holderAddr, unrealMapSlot, "latest", provider)
            expect(proof.storageProof[0].value).to.eq("0x0")

            // Corrupt the state root
            block.stateRoot = "0x0011223344556677889900003b11fd580a50d3054c144ca7caa623f29073d39d"

            try {
                await ERC20Proof.verify(block.stateRoot, TOKEN_ADDRESS, proof)
                throw new Error("Should have failed but didn't")
            } catch (err) {
                expect(err.message).to.not.eq("Should have failed but didn't")
            }
        }

        // 2

        {
            const { proof, block } = await ERC20Proof.getFull(TOKEN_ADDRESS, nonHolderAddress, mapSlot, "latest", provider)
            expect(proof.storageProof[0].value).to.eq("0x0")

            // Corrupt the proof
            proof.storageProof[0].proof = []

            try {
                await ERC20Proof.verify(block.stateRoot, TOKEN_ADDRESS, proof)
                throw new Error("Should have failed but didn't")
            } catch (err) {
                expect(err.message).to.not.eq("Should have failed but didn't")
            }
        }

        // 3

        {
            const { proof, block } = await ERC20Proof.getFull(TOKEN_ADDRESS, nonHolderAddress, mapSlot, "latest", provider)
            expect(proof.storageProof[0].value).to.eq("0x0")

            // Corrupt the proof
            const tmp = proof.storageProof[0].proof[0]
            proof.storageProof[0].proof[0] = "0x" + tmp.substr(2).split("").reverse().join("")

            try {
                await ERC20Proof.verify(block.stateRoot, TOKEN_ADDRESS, proof)
                throw new Error("Should have failed but didn't")
            } catch (err) {
                expect(err.message).to.not.eq("Should have failed but didn't")
            }
        }
    }).timeout(10000)
})
