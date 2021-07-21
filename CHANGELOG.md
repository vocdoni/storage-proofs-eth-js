# Changelog

## v0.5.0
- Adding `MiniMeProof`
- Restructuring `Erc20Proover` into `ERC20Proof`
  - Not a class anymore. Now it's a namespace (stateless).
  - `ERC20Prover#getProof()` is now called `ERC20Proof.get()`
  - `provider` is now a parameter of `ERC20Proof.get`
- Proof generation and verification are now completely independent
  - Generating proofs no longer accepts `verify` as a parameter

## v0.4.0
- `verifyProof()` now checks for existence when a value is defined, and checks for non-existence when the path is empty

## v0.3.2

- Using the London hard fork
- Detecting the network internally on `getProof`

## v0.3.1

- Supporting Ethereum networks other than `mainnet` when deserializing block headers beyond the London hard fork

## v0.3.0

- Upgrading the dependencies
  - `@ethereumjs/block` (London HF)
  - `merkle-patricia-tree` (London HF)
