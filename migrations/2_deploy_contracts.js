var Atomex = artifacts.require("../contracts/Atomex.sol");

module.exports = function(deployer) {
  deployer.deploy(Atomex);
};
