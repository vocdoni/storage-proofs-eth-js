# Storage Proofs

Javascript/Typescript library to generate storage proofs for ERC token contracts.

The library is heavily inspired on the prior work of [@izqui](https://github.com/izqui) on [evm-storage-proofs](https://github.com/aragon/evm-storage-proofs).

## Usage

Instal with NPM:

```sh
npm install @vocdoni/storage-proofs-eth
```

```typescript
const tokenAddress = "0x1234..."
const holderAddress = "0x2345..."
const balancePositionIdx = 1

const balanceSlot = ERC20Proof.getHolderBalanceSlot(holderAddress, balancePositionIdx)

const result = await ERC20Proof.get(tokenAddress, [balanceSlot], blockNumber, jsonRpcUri)

const { proof, block, blockHeaderRLP, accountProofRLP, storageProofsRLP } = result

// Throws if not valid
await ERC20Proof.verify(block.stateRoot, tokenAddress, proof)

// ...
```
