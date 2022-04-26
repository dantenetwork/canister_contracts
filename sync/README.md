# **sync**

## Install

`npm run install`

## Usage

`npm run start`

## Instruction

There are two layers in the project.

### Chain Handler Layer

This layer is responsible for interacting with chains, and designed to be able to reuse.

### Data Relayer Layer

This layer is responsible for transmitting data from chain to chain.

## Constraint

- Chain names must be uppercase.
- Directory names of one blockchain under `./basic`/ and `./crossChain`/ and the prefix of second-level file name of `./crossChain/` must be the same, and the name will be the value of compatibleChain of configuration. For example, `./basic/ethereum/`, `./crossChain/ethereum/` and `./crossChain/near/ethereumToNear.js`.