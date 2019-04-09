var AtomicSwap = artifacts.require("../contracts/AtomicSwap.sol");

module.exports = function(deployer) {
  deployer.deploy(AtomicSwap);
};
