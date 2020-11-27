# DVote Storage Proofs

Javascript/Typescript library to generate storage proofs for ERC token contracts.

The library is heavily inspired on the prior work of @izqui on [evm-storage-proofs](https://github.com/aragon/evm-storage-proofs).

## Usage

Instal with NPM:

```sh
npm install @dvote/storage-proofs
```

```typescript
const tokenAddress = "0x1234..."
const holderAddress = "0x2345..."
const balancePositionIdx = 1

const balanceSlot = ERC20Prover.getHolderBalanceSlot(holderAddress, balancePositionIdx)

const storageProover = new ERC20Prover(jsonRpcUri)
const data = await storageProover.getProof(tokenAddress, [balanceSlot], blockNumber, true)

const { proof, block, blockHeaderRLP, accountProofRLP, storageProofsRLP } = data

// ...
```
