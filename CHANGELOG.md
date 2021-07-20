# Changelog

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
