require('dotenv').config();
var HDWalletProvider = require("truffle-hdwallet-provider");

const Web3 = require("web3");
const web3 = new Web3();

module.exports = {
  networks: {
    "dev_truffle": {
      host: "127.0.0.1",
      port: 9545,
      network_id: "*" // Match any network id
    },
    "dev_ganache": {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*" // Match any network id
    },
    "ropsten": {
      provider: () => new HDWalletProvider(process.env.MNEMONIC_ROPSTEN, `https://ropsten.infura.io/v3/${process.env.INFURA_TOKEN}`),
      network_id: 3,
      gas: 5500000,
      from: "0xd88d71de7e0544e3227785ae16d39b3623e9d90d"
    },
    "mainnet": {
      provider: () => new HDWalletProvider(process.env.MNEMONIC_MAINNET, `https://mainnet.infura.io/v3/${process.env.INFURA_TOKEN}`),
      gasPrice: web3.utils.toWei('103', 'gwei'),
      gas: 2000000,
      network_id: 1,
      from: '0xF6E592dfC4445dC3536fa94de33b8A5E1071CAAa'
    }
  },
  compilers: {
    solc: {
      version: "0.8.4+commit.c7e474f2"
    }
  },
  plugins: ["verify-on-etherscan"]
};