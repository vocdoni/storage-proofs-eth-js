# Changelog

## v0.4.0

### Proof of non existence
- `verifyProof()` now checks for existence when a value is defined, and checks for non-existence when the path is empty

### Supporting MiniMe tokens
- Adding `MiniMeProof`
- [Breaking] `StorageProof` (type) is now `EthereumProof`
- [Breaking] Restructuring `Erc20Proover` into `ERC20Proof`, along with `MiniMeProof`, `EthProof` and `EthProvider`
- [Breaking] Naming and data consistency
  - Not a class anymore. Now it's a namespace (stateless).
  - `ERC20Proover.getProof()` is now called `ERC20Proof.getFull()`
  - Adding `ERC20Proof.get()` for a lighter version
  - `ERC20Proof.get` and `ERC20Proof.getFull` now receive the holder address and the mapping position, instead of the already computed balance slot
  - `ERC20Proover.getHolderBalanceSlot` is now `EthProof.getMapSlot`
  - `Erc20Proover.findBalanceMappingPosition` is now `Erc20Proover.findMapSlot`
  - `provider` is now a parameter of `ERC20Proof.get`
- Exporting `StorageProof` (new type) and `StorageProofItem` (type)
- Proof generation and verification are now independent
  - Generating proofs no longer accepts `verify` as a parameter
- `ERC20Proof.findMapSlot` is now lighter on requests

## v0.3.2

- Using the London hard fork
- Detecting the network internally on `getProof`

## v0.3.1

- Supporting Ethereum networks other than `mainnet` when deserializing block headers beyond the London hard fork

## v0.3.0

- Upgrading the dependencies
  - `@ethereumjs/block` (London HF)
  - `merkle-patricia-tree` (London HF)
