require('dotenv').config();
const PrivateKeyProvider = require("truffle-privatekey-provider");

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
      provider: () => new PrivateKeyProvider(process.env.PRIVATE_KEY_ROPSTEN, `https://ropsten.infura.io/v3/${process.env.INFURA_TOKEN}`),  
      network_id: 3,
      gas: 5500000,
      from: process.env.ADDRESS_ROPSTEN
    },
    "mainnet": {
      provider: () => new PrivateKeyProvider(process.env.PRIVATE_KEY_MAINNET, `https://mainnet.infura.io/v3/${process.env.INFURA_TOKEN}`),
      gasPrice: web3.utils.toWei('103', 'gwei'),
      gas: 5500000,
      network_id: 1,
      from: process.env.ADDRESS_MAINNET
    }
  },
  compilers: {
    solc: {
      version: "0.8.4+commit.c7e474f2"
    }
  },
  api_keys: {
    etherscan: process.env.ETHERSCAN_API_KEY
  },
  plugins: ["truffle-plugin-verify"]
};