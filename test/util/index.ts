import { Wallet, providers } from "ethers"
import * as ganache from "ganache-cli"

export const mnemonic = "myth like bonus scare over problem client lizard pioneer submit female collect"

export const localProvider = new providers.Web3Provider(ganache.provider({
    time: new Date(),
    mnemonic
}))

const wallets: Wallet[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(idx => {
    return Wallet.fromMnemonic(mnemonic, `m/44'/60'/0'/0/${idx}`).connect(localProvider)
})

const accounts: TestAccount[] = []
Promise.all(wallets.map(wallet => {
    return wallet.getAddress().then(address => {
        accounts.push({
            privateKey: wallet.privateKey,
            address,
            provider: wallet.provider,
            wallet
        })
    })
}))

// GETTERS

export function getAccounts() {
    return accounts
}

// TYPES

export type TestAccount = {
    privateKey: string,
    address: string,
    provider: providers.Provider,
    wallet: Wallet
}
