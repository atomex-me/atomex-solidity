require('dotenv').config();
var HDWalletProvider = require("truffle-hdwallet-provider");

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
      provider: () => new HDWalletProvider(process.env.MNEMONIC, `https://ropsten.infura.io/v3/${process.env.INFURA_ROPSTEN_TOKEN}`),
      network_id: 3,
      gas: 5500000,
      from: "0xd88d71de7e0544e3227785ae16d39b3623e9d90d"
    }
  },
  plugins: ["verify-on-etherscan"]
};