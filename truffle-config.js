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
    }  
  }
};