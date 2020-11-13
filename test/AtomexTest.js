const Atomex = artifacts.require('../contracts/Atomex.sol');

const sleep = async function (time) {
    await web3.currentProvider.send({
        id: new Date().getTime(),
        jsonrpc: "2.0",
        method: "evm_increaseTime",
        params: [time]
    }, function(error, result) {
        if(error) console.error('evm_increaseTime: ' + error);
    });
    await web3.currentProvider.send({
        id: new Date().getTime(),
        jsonrpc: "2.0",
        method: "evm_mine",
        params: []
    }, function(error, result){
        if(error) console.error('evm_mine: ' + error);
    });
}

function getCurrentTime() {
    return new Promise(function(resolve) {
      web3.eth.getBlock("latest").then(function(block) {
            resolve(block.timestamp)
        });
    })
}

contract('Atomex', async (accounts) => {
    let contract;

    beforeEach(async function(){
        contract = await Atomex.new();
    });

    it('should manage watchers properly', async () => {
        let owner = await contract.owner();
        let watcher = accounts[3];
        let deposit = 10;

        await contract.proposeWatcher(watcher, {from: watcher, value: deposit});
        let Watcher = await contract.watchTowers(watcher);
        assert.deepEqual(BigInt(Watcher.deposit), BigInt(deposit));
        assert.equal(Watcher.active, false);
        
        await contract.activateWatcher(watcher, {from: owner, value: 0});
        Watcher = await contract.watchTowers(watcher);
        assert.deepEqual(BigInt(Watcher.deposit), BigInt(deposit));
        assert.equal(Watcher.active, true);

        await contract.deactivateWatcher(watcher, {from: owner, value: 0});
        Watcher = await contract.watchTowers(watcher);
        assert.deepEqual(BigInt(Watcher.deposit), BigInt(deposit));
        assert.equal(Watcher.active, false);
    });

    it('should not deactivate watchers if not owner', async () => {
        let owner = await contract.owner();
        let watcher = accounts[3];
        let sender = accounts[1];
        let deposit = 10;

        await contract.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contract.activateWatcher(watcher, {from: owner, value: 0});

        try {
            await contract.deactivateWatcher(watcher, {from: sender, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('sender is not the owner') >= 0);
        }
    });

    it('should withdraw watchers properly', async () => {
        let owner = await contract.owner();
        let watcher = accounts[3];
        let deposit = 10;

        await contract.proposeWatcher(watcher, {from: watcher, value: deposit});
        let Watcher = await contract.watchTowers(watcher);
        assert.deepEqual(BigInt(Watcher.deposit), BigInt(deposit));
        assert.equal(Watcher.active, false);
        
        await contract.activateWatcher(watcher, {from: owner, value: 0});
        Watcher = await contract.watchTowers(watcher);
        assert.deepEqual(BigInt(Watcher.deposit), BigInt(deposit));
        assert.equal(Watcher.active, true);

        let watcherBalance = await web3.eth.getBalance(watcher);
        let txReceipt = await contract.withdrawWatcher({from: watcher, value: 0});
        let newWatcherBalance = await web3.eth.getBalance(watcher);
        let tx = await web3.eth.getTransaction(txReceipt.tx);
        assert.deepEqual(BigInt(newWatcherBalance), BigInt(watcherBalance) + BigInt(deposit) - BigInt(txReceipt.receipt.gasUsed * tx.gasPrice));

        let contractBalance = await web3.eth.getBalance(contract.address);
        assert.deepEqual(BigInt(contractBalance), BigInt(0));

        Watcher = await contract.watchTowers(watcher);
        assert.deepEqual(BigInt(Watcher.deposit), BigInt(0));
        assert.equal(Watcher.active, false);
    });

    it('should initiate properly', async () => {
        let owner = await contract.owner();
        let watcher = accounts[3];
        let deposit = 10;

        await contract.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contract.activateWatcher(watcher, {from: owner, value: 0});
 
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherDeadline = (await getCurrentTime()) + refundTime * 3 / 4;
        let sender = accounts[1];
        let recipient = accounts[2];
        let value = 100;
        let payoff = 1;

        let swap = await contract.swaps(hashed_secret);
        assert.equal(swap.hashedSecret, '0x0000000000000000000000000000000000000000000000000000000000000000');
        assert.equal(swap.initiator, '0x0000000000000000000000000000000000000000');
        assert.equal(swap.participant, '0x0000000000000000000000000000000000000000');
        assert.equal(swap.watcher, '0x0000000000000000000000000000000000000000');
        assert.equal(swap.refundTimestamp, 0);
        assert.equal(swap.watcherDeadline, 0);
        assert.equal(swap.value, 0);
        assert.equal(swap.payoff, 0);
        assert.equal(swap.state, 0);

        await contract.initiate(hashed_secret, recipient, watcher, refundTimestamp, watcherDeadline, payoff, {from: sender, value: value});

        let lastBlock = await web3.eth.getBlock('latest');
        swap = await contract.swaps(hashed_secret);
        let contractBalance = await web3.eth.getBalance(contract.address);
        assert.equal(swap.hashedSecret, hashed_secret);
        assert.equal(swap.initiator, sender);
        assert.equal(swap.participant, recipient);
        assert.equal(swap.watcher, watcher);
        assert.deepEqual(BigInt(swap.refundTimestamp), BigInt(refundTimestamp));
        assert.deepEqual(BigInt(swap.watcherDeadline), BigInt(watcherDeadline));
        assert.deepEqual(BigInt(swap.value), BigInt(value - payoff));
        assert.equal(swap.payoff, payoff);
        assert.equal(swap.state, 1);

        assert.equal(contractBalance, value + deposit);
    });

    it('should multiple initiate properly', async () => {
        let owner = await contract.owner();
        let watcher = accounts[3];
        let deposit = 10;

        await contract.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contract.activateWatcher(watcher, {from: owner, value: 0});

        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherDeadline = (await getCurrentTime()) + refundTime * 3 / 4;
        let sender = accounts[1];
        let recipient = accounts[2];
        let value1 = 100;
        let value2 = 200;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, watcher, refundTimestamp, watcherDeadline, payoff, {from: sender, value: value1});

        let swap = await contract.swaps(hashed_secret);

        await contract.add(hashed_secret, {from: sender, value: value2});

        swap = await contract.swaps(hashed_secret);
        let contractBalance = await web3.eth.getBalance(contract.address);

        assert.equal(swap.hashedSecret, hashed_secret);
        assert.equal(swap.initiator, sender);
        assert.equal(swap.participant, recipient);
        assert.deepEqual(BigInt(swap.refundTimestamp), BigInt(refundTimestamp));
        assert.deepEqual(BigInt(swap.watcherDeadline), BigInt(watcherDeadline));
        assert.deepEqual(BigInt(swap.value), BigInt(value1 + value2 - payoff));
        assert.equal(swap.payoff, payoff);
        assert.equal(swap.state, 1);

        assert.deepEqual(BigInt(contractBalance), BigInt(value1 + value2 + deposit));
    });

    it('should not initiate if hashed_secret is already used', async () => {
        let owner = await contract.owner();
        let watcher = accounts[3];
        let deposit = 10;

        await contract.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contract.activateWatcher(watcher, {from: owner, value: 0});
 
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherDeadline = (await getCurrentTime()) + refundTime * 3 / 4;
        let sender = accounts[1];
        let recipient = accounts[2];
        let value = 100;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, watcher, refundTimestamp, watcherDeadline, payoff, {from: sender, value: value});
        await sleep(refundTime / 2);
        
        try {
            await contract.initiate(hashed_secret, recipient, watcher, refundTimestamp, watcherDeadline, payoff, {from: sender, value: value});
        }
        catch (error) {
            assert(error.message.indexOf('swap for this hash is already initiated') >= 0);
        }
    });
    
    it('should not intitiate with wrong watcher', async () => {
        let owner = await contract.owner();
        let watcher = accounts[1];
        let deposit = 10;

        await contract.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contract.activateWatcher(watcher, {from: owner, value: 0});
 
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherDeadline = (await getCurrentTime()) + refundTime * 3 / 4;
        let sender = accounts[1];
        let recipient = accounts[2];
        let value = 100;
        let payoff = 1;

        try {
            await contract.initiate(hashed_secret, recipient, watcher, refundTimestamp, watcherDeadline, payoff, {from: sender, value: value});
        }
        catch (error) {
            assert(error.message.indexOf('watcher does not exist') >= 0);
        }
    });

    it('should not intitiate with wrong payoff', async () => {
        let owner = await contract.owner();
        let watcher = accounts[3];
        let deposit = 10;

        await contract.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contract.activateWatcher(watcher, {from: owner, value: 0});
 
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherDeadline = (await getCurrentTime()) + refundTime * 3 / 4;
        let sender = accounts[1];
        let recipient = accounts[2];
        let value = 1;
        let payoff = 2;

        try {
            await contract.initiate(hashed_secret, recipient, watcher, refundTimestamp, watcherDeadline, payoff, {from: sender, value: value});
        }
        catch (error) {
            assert(error.message.indexOf('SafeMath sub wrong value') >= 0);
        }

        payoff = -1;

        try {
            await contract.initiate(hashed_secret, recipient, watcher, refundTimestamp, watcherDeadline, payoff, {from: sender, value: value});
        }
        catch (error) {
            assert(error.message.indexOf('SafeMath sub wrong value') >= 0);
        }
    });

    it('should not intitiate with wrong watcherDeadline', async () => {
        let owner = await contract.owner();
        let watcher = accounts[3];
        let deposit = 10;

        await contract.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contract.activateWatcher(watcher, {from: owner, value: 0});
 
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherDeadline = (await getCurrentTime()) + 2 * refundTime;
        let sender = accounts[1];
        let recipient = accounts[2];
        let value = 100;
        let payoff = 1;

        try {
            await contract.initiate(hashed_secret, recipient, watcher, refundTimestamp, watcherDeadline, payoff, {from: sender, value: value});
        }
        catch (error) {
            assert(error.message.indexOf('invalid watcherDeadline') >= 0);
        }
    });

    it('should not add if swap is not initiated', async () => {
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let sender = accounts[0];
        let value = 100;

        try {
            await contract.add(hashed_secret, {from: sender, value: value});
        }
        catch (error) {
            assert(error.message.indexOf('swap for this hash is empty or already spent') >= 0);
        }
    });

    it('should not add after refundTime', async () => {
        let owner = await contract.owner();
        let watcher = accounts[3];
        let deposit = 10;

        await contract.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contract.activateWatcher(watcher, {from: owner, value: 0});
 
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherDeadline = (await getCurrentTime()) + 3 / 4 * refundTime;
        let sender = accounts[1];
        let recipient = accounts[2];
        let value = 100;
        let payoff = 1;


        await contract.initiate(hashed_secret, recipient, watcher, refundTimestamp, watcherDeadline, payoff, {from: sender, value: value});

        await sleep(~~(refundTime * 2));
        payoff = false;

        try {
            await contract.add(hashed_secret, {from: sender, value: value});
        }
        catch (error) {
            assert(error.message.indexOf('refundTimestamp has already come') >= 0);
        }
    });

    it('should redeem properly', async () => {
        let owner = await contract.owner();
        let watcher = accounts[3];
        let deposit = 10;

        await contract.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contract.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherDeadline = (await getCurrentTime()) + 3 / 4 * refundTime;
        let sender = accounts[1];
        let recipient = accounts[2];
        let value = 100;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, watcher, refundTimestamp, watcherDeadline, payoff, {from: sender, value: value});

        let recipientBalance = await web3.eth.getBalance(recipient);
        let watcherBalance = await web3.eth.getBalance(watcher);
        let txReceipt = await contract.redeem(hashed_secret, secret, {from: watcher, value: 0});
        let tx = await web3.eth.getTransaction(txReceipt.tx);

        let newRecipientBalance = await web3.eth.getBalance(recipient);
        let newWatcherBalance = await web3.eth.getBalance(watcher);
        let contractBalance = await web3.eth.getBalance(contract.address);
        
        assert.equal(contractBalance, deposit);
        assert.deepEqual(BigInt(newRecipientBalance), BigInt(recipientBalance) + BigInt(value - payoff));
        assert.deepEqual(BigInt(newWatcherBalance), BigInt(watcherBalance) + BigInt(payoff) - BigInt(txReceipt.receipt.gasUsed * tx.gasPrice));
    });

    it('should redeem properly after multiple init', async () => {
        let owner = await contract.owner();
        let watcher = accounts[3];
        let deposit = 10;

        await contract.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contract.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111'
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherDeadline = (await getCurrentTime()) + refundTime * 3 / 4;
        let sender = accounts[1];
        let recipient = accounts[2];
        let value1 = 100;
        let value2 = 200;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, watcher, refundTimestamp, watcherDeadline, payoff, {from: sender, value: value1});
        
        await contract.add(hashed_secret, {from: sender, value: value2});

        let recipientBalance = await web3.eth.getBalance(recipient);
        let watcherBalance = await web3.eth.getBalance(watcher);

        let txReceipt = await contract.redeem(hashed_secret, secret, {from: watcher, value: 0});
        let tx = await web3.eth.getTransaction(txReceipt.tx);

        let newRecipientBalance = await web3.eth.getBalance(recipient);
        let newWatcherBalance = await web3.eth.getBalance(watcher);
        let contractBalance = await web3.eth.getBalance(contract.address);
        
        assert.equal(contractBalance, deposit);
        assert.deepEqual(BigInt(newRecipientBalance), BigInt(recipientBalance) + BigInt(value1 + value2 - payoff));
        assert.deepEqual(BigInt(newWatcherBalance), BigInt(watcherBalance) + BigInt(payoff) - BigInt(txReceipt.receipt.gasUsed * tx.gasPrice));
    });

    it('should redeem properly with payoff = 0', async () => {
        let owner = await contract.owner();
        let watcher = accounts[3];
        let deposit = 10;

        await contract.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contract.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherDeadline = (await getCurrentTime()) + 3 / 4 * refundTime;
        let sender = accounts[1];
        let recipient = accounts[2];
        let value = 100;
        let payoff = 0;

        await contract.initiate(hashed_secret, recipient, watcher, refundTimestamp, watcherDeadline, payoff, {from: sender, value: value});

        let recipientBalance = await web3.eth.getBalance(recipient);
        let watcherBalance = await web3.eth.getBalance(watcher);
        let txReceipt = await contract.redeem(hashed_secret, secret, {from: watcher, value: 0});
        let tx = await web3.eth.getTransaction(txReceipt.tx);

        let newRecipientBalance = await web3.eth.getBalance(recipient);
        let newWatcherBalance = await web3.eth.getBalance(watcher);
        let contractBalance = await web3.eth.getBalance(contract.address);
        
        assert.equal(contractBalance, deposit);
        assert.deepEqual(BigInt(newRecipientBalance), BigInt(recipientBalance) + BigInt(value));
        assert.deepEqual(BigInt(newWatcherBalance), BigInt(watcherBalance) - BigInt(txReceipt.receipt.gasUsed * tx.gasPrice));
    });

    it('should redeem properly by recepient address', async () => {
        let owner = await contract.owner();
        let watcher = accounts[3];
        let deposit = 10;

        await contract.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contract.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherDeadline = (await getCurrentTime()) + 3 / 4 * refundTime;
        let sender = accounts[1];
        let recipient = accounts[2];
        let value = 100;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, watcher, refundTimestamp, watcherDeadline, payoff, {from: sender, value: value});

        let recipientBalance = await web3.eth.getBalance(recipient);
        let txReceipt = await contract.redeem(hashed_secret, secret, {from: recipient, value: 0});
        let tx = await web3.eth.getTransaction(txReceipt.tx);

        let newRecipientBalance = await web3.eth.getBalance(recipient);
        let contractBalance = await web3.eth.getBalance(contract.address);
        
        assert.equal(contractBalance, deposit);
        assert.deepEqual(BigInt(newRecipientBalance), BigInt(recipientBalance) + BigInt(value) - BigInt(txReceipt.receipt.gasUsed * tx.gasPrice));
    });

    it('should redeem properly by any address', async () => {
        let owner = await contract.owner();
        let watcher = accounts[3];
        let deposit = 10;

        await contract.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contract.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherDeadline = (await getCurrentTime()) + 3 / 4 * refundTime;
        let sender = accounts[1];
        let recipient = accounts[2];
        let value = 100;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, watcher, refundTimestamp, watcherDeadline, payoff, {from: sender, value: value});

        let recipientBalance = await web3.eth.getBalance(recipient);
        let txReceipt = await contract.redeem(hashed_secret, secret, {from: accounts[4], value: 0});
        let tx = await web3.eth.getTransaction(txReceipt.tx);

        let newRecipientBalance = await web3.eth.getBalance(recipient);
        let contractBalance = await web3.eth.getBalance(contract.address);
        
        assert.equal(contractBalance, deposit);
        assert.deepEqual(BigInt(newRecipientBalance), BigInt(recipientBalance) + BigInt(value));
    });

    it('should redeem properly by another watcher', async () => {
        let owner = await contract.owner();
        let watcher1 = accounts[3];
        let watcher2 = accounts[0];
        let deposit = 10;

        await contract.proposeWatcher(watcher1, {from: watcher1, value: deposit});
        await contract.activateWatcher(watcher1, {from: owner, value: 0});

        await contract.proposeWatcher(watcher2, {from: watcher2, value: deposit});
        await contract.activateWatcher(watcher2, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherDeadline = (await getCurrentTime()) + 3 / 4 * refundTime;
        let sender = accounts[1];
        let recipient = accounts[2];
        let value = 100;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, watcher1, refundTimestamp, watcherDeadline, payoff, {from: sender, value: value});

        await sleep(~~(refundTime * 3 / 4 + 1));

        let recipientBalance = await web3.eth.getBalance(recipient);
        let watcherBalance = await web3.eth.getBalance(watcher2);

        let txReceipt = await contract.redeem(hashed_secret, secret, {from: watcher2, value: 0});
        let tx = await web3.eth.getTransaction(txReceipt.tx);

        let newRecipientBalance = await web3.eth.getBalance(recipient);
        let newWwatcherBalance = await web3.eth.getBalance(watcher2);
        let contractBalance = await web3.eth.getBalance(contract.address);

        assert.equal(contractBalance, deposit * 2);
        assert.deepEqual(BigInt(newRecipientBalance), BigInt(recipientBalance) + BigInt(value) - BigInt(payoff));
        assert.deepEqual(BigInt(newWwatcherBalance), BigInt(watcherBalance) + BigInt(payoff) - BigInt(txReceipt.receipt.gasUsed * tx.gasPrice));
    });

    it('should not redeem twice', async () => {
        let owner = await contract.owner();
        let watcher = accounts[3];
        let deposit = 10;

        await contract.proposeWatcher(watcher, {from: watcher, value: deposit});
        let Watcher = await contract.watchTowers(watcher);
        await contract.activateWatcher(watcher, {from: owner, value: 0});
        Watcher = await contract.watchTowers(watcher);

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherDeadline = (await getCurrentTime()) + 3 / 4 * refundTime;
        let sender = accounts[1];
        let recipient = accounts[2];
        let value = 100;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, watcher, refundTimestamp, watcherDeadline, payoff, {from: sender, value: value});

        await contract.redeem(hashed_secret, secret, {from: watcher, value: 0});

        try {
            await contract.redeem(hashed_secret, secret, {from: recipient, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('swap for this hash is empty or already spent') >= 0);
        }
    });

    it('should not redeem after refundTime', async () => {
        let owner = await contract.owner();
        let watcher = accounts[3];
        let deposit = 10;

        await contract.proposeWatcher(watcher, {from: watcher, value: deposit});
        let Watcher = await contract.watchTowers(watcher);
        await contract.activateWatcher(watcher, {from: owner, value: 0});
        Watcher = await contract.watchTowers(watcher);

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherDeadline = (await getCurrentTime()) + 3 / 4 * refundTime;
        let sender = accounts[1];
        let recipient = accounts[2];
        let value = 100;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, watcher, refundTimestamp, watcherDeadline, payoff, {from: sender, value: value});

        await sleep(~~(refundTime * 2));
        
        try {
            await contract.redeem(hashed_secret, secret, {from: watcher, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('refundTimestamp has already come') >= 0);
        }
    });

    it('should not accept wrong secret', async () => {
        let owner = await contract.owner();
        let watcher = accounts[3];
        let deposit = 10;

        await contract.proposeWatcher(watcher, {from: watcher, value: deposit});
        let Watcher = await contract.watchTowers(watcher);
        await contract.activateWatcher(watcher, {from: owner, value: 0});
        Watcher = await contract.watchTowers(watcher);

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111122';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherDeadline = (await getCurrentTime()) + 3 / 4 * refundTime;
        let sender = accounts[1];
        let recipient = accounts[2];
        let value = 100;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, watcher, refundTimestamp, watcherDeadline, payoff, {from: sender, value: value});

        try {
            await contract.redeem(hashed_secret, secret, {from: watcher, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('secret is not correct') >= 0);
        }
    });

    it('should not accept wrong sized secret', async () => {
        let owner = await contract.owner();
        let watcher = accounts[3];
        let deposit = 10;

        await contract.proposeWatcher(watcher, {from: watcher, value: deposit});
        let Watcher = await contract.watchTowers(watcher);
        await contract.activateWatcher(watcher, {from: owner, value: 0});
        Watcher = await contract.watchTowers(watcher);

        let secret = '0x111111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherDeadline = (await getCurrentTime()) + 3 / 4 * refundTime;
        let sender = accounts[1];
        let recipient = accounts[2];
        let value = 100;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, watcher, refundTimestamp, watcherDeadline, payoff, {from: sender, value: value});

        try {
            await contract.redeem(hashed_secret, secret, {from: watcher, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('invalid bytes32 value') >= 0);
        }
        
        secret = '0x11111111111111111111111111111111111111111111111111111111111111';
        hashed_secret = '0xb71e60c29fedef4ba4dd4c7ec1357e34742f614dd64c14f070c009b36983c118';

        await contract.initiate(hashed_secret, recipient, watcher, refundTimestamp, watcherDeadline, payoff, {from: sender, value: value});

        try {
            await contract.redeem(hashed_secret, secret, {from: watcher, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('secret is not correct') >= 0);
        }
    });

    it('should refund properly', async () => {
        let owner = await contract.owner();
        let watcher = accounts[3];
        let deposit = 10;

        await contract.proposeWatcher(watcher, {from: watcher, value: deposit});
        let Watcher = await contract.watchTowers(watcher);
        await contract.activateWatcher(watcher, {from: owner, value: 0});
        Watcher = await contract.watchTowers(watcher);

        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherDeadline = (await getCurrentTime()) + 3 / 2 * refundTime;
        let sender = accounts[1];
        let recipient = accounts[2];
        let value = 100;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, watcher, refundTimestamp, watcherDeadline, payoff, {from: sender, value: value});

        await sleep(~~(refundTime + 1));

        let senderBalance = await web3.eth.getBalance(sender);
        let watcherBalance = await web3.eth.getBalance(watcher);

        let txReceipt = await contract.refund(hashed_secret, {from: watcher, value: 0});
        let tx = await web3.eth.getTransaction(txReceipt.tx);

        let newSenderBalance = await web3.eth.getBalance(sender);
        let newWwatcherBalance = await web3.eth.getBalance(watcher);
        let contractBalance = await web3.eth.getBalance(contract.address);

        assert.equal(contractBalance, deposit);
        assert.deepEqual(BigInt(newSenderBalance), BigInt(senderBalance) + BigInt(value) - BigInt(payoff));
        assert.deepEqual(BigInt(newWwatcherBalance), BigInt(watcherBalance) + BigInt(payoff) - BigInt(txReceipt.receipt.gasUsed * tx.gasPrice));
    });

    it('should refund properly after multiple init', async () => {
        let owner = await contract.owner();
        let watcher = accounts[3];
        let deposit = 10;

        await contract.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contract.activateWatcher(watcher, {from: owner, value: 0});

        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherDeadline = (await getCurrentTime()) + refundTime * 3 / 2;
        let sender = accounts[1];
        let recipient = accounts[2];
        let value1 = 100;
        let value2 = 200;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, watcher, refundTimestamp, watcherDeadline, payoff, {from: sender, value: value1});
        
        await contract.add(hashed_secret, {from: sender, value: value2});

        await sleep(~~(refundTime + 1));

        let senderBalance = await web3.eth.getBalance(sender);
        let watcherBalance = await web3.eth.getBalance(watcher);

        let txReceipt = await contract.refund(hashed_secret, {from: watcher, value: 0});
        let tx = await web3.eth.getTransaction(txReceipt.tx);

        let newSenderBalance = await web3.eth.getBalance(sender);
        let newWwatcherBalance = await web3.eth.getBalance(watcher);
        let contractBalance = await web3.eth.getBalance(contract.address);

        assert.equal(contractBalance, deposit);
        assert.deepEqual(BigInt(newSenderBalance), BigInt(senderBalance) + BigInt(value1 + value2) - BigInt(payoff));
        assert.deepEqual(BigInt(newWwatcherBalance), BigInt(watcherBalance) + BigInt(payoff) - BigInt(txReceipt.receipt.gasUsed * tx.gasPrice));
    });

    it('should refund properly with payoff = 0', async () => {
        let owner = await contract.owner();
        let watcher = accounts[3];
        let deposit = 10;

        await contract.proposeWatcher(watcher, {from: watcher, value: deposit});
        let Watcher = await contract.watchTowers(watcher);
        await contract.activateWatcher(watcher, {from: owner, value: 0});
        Watcher = await contract.watchTowers(watcher);

        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherDeadline = (await getCurrentTime()) + 3 / 2 * refundTime;
        let sender = accounts[1];
        let recipient = accounts[2];
        let value = 100;
        let payoff = 0;

        await contract.initiate(hashed_secret, recipient, watcher, refundTimestamp, watcherDeadline, payoff, {from: sender, value: value});

        await sleep(~~(refundTime + 1));

        let senderBalance = await web3.eth.getBalance(sender);
        let watcherBalance = await web3.eth.getBalance(watcher);

        let txReceipt = await contract.refund(hashed_secret, {from: watcher, value: 0});
        let tx = await web3.eth.getTransaction(txReceipt.tx);

        let newSenderBalance = await web3.eth.getBalance(sender);
        let newWwatcherBalance = await web3.eth.getBalance(watcher);
        let contractBalance = await web3.eth.getBalance(contract.address);

        assert.equal(contractBalance, deposit);
        assert.deepEqual(BigInt(newSenderBalance), BigInt(senderBalance) + BigInt(value));
        assert.deepEqual(BigInt(newWwatcherBalance), BigInt(watcherBalance) - BigInt(txReceipt.receipt.gasUsed * tx.gasPrice));
    });

    it('should refund properly by sender address', async () => {
        let owner = await contract.owner();
        let watcher = accounts[3];
        let deposit = 10;

        await contract.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contract.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherDeadline = (await getCurrentTime()) + 3 / 2 * refundTime;
        let sender = accounts[1];
        let recipient = accounts[2];
        let value = 100;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, watcher, refundTimestamp, watcherDeadline, payoff, {from: sender, value: value});

        await sleep(~~(refundTime + 1));

        let senderBalance = await web3.eth.getBalance(sender);
        
        let txReceipt = await contract.refund(hashed_secret, {from: sender, value: 0});
        let tx = await web3.eth.getTransaction(txReceipt.tx);

        let newSenderBalance = await web3.eth.getBalance(sender);
        let contractBalance = await web3.eth.getBalance(contract.address);

        assert.equal(contractBalance, deposit);
        assert.deepEqual(BigInt(newSenderBalance), BigInt(senderBalance) + BigInt(value) - BigInt(txReceipt.receipt.gasUsed * tx.gasPrice));
    });

    it('should refund properly by any address', async () => {
        let owner = await contract.owner();
        let watcher = accounts[3];
        let deposit = 10;

        await contract.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contract.activateWatcher(watcher, {from: owner, value: 0});

        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherDeadline = (await getCurrentTime()) + 3 / 2 * refundTime;
        let sender = accounts[1];
        let recipient = accounts[2];
        let value = 100;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, watcher, refundTimestamp, watcherDeadline, payoff, {from: sender, value: value});

        await sleep(~~(refundTime + 1));

        let senderBalance = await web3.eth.getBalance(sender);
        
        let txReceipt = await contract.refund(hashed_secret, {from: accounts[4], value: 0});
        let tx = await web3.eth.getTransaction(txReceipt.tx);

        let newSenderBalance = await web3.eth.getBalance(sender);
        let contractBalance = await web3.eth.getBalance(contract.address);

        assert.equal(contractBalance, deposit);
        assert.deepEqual(BigInt(newSenderBalance), BigInt(senderBalance) + BigInt(value));
    });

    it('should refund properly by another watcher', async () => {
        let owner = await contract.owner();
        let watcher1 = accounts[3];
        let watcher2 = accounts[0];
        let deposit = 10;

        await contract.proposeWatcher(watcher1, {from: watcher1, value: deposit});
        await contract.activateWatcher(watcher1, {from: owner, value: 0});

        await contract.proposeWatcher(watcher2, {from: watcher2, value: deposit});
        await contract.activateWatcher(watcher2, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherDeadline = (await getCurrentTime()) + 3 / 2 * refundTime;
        let sender = accounts[1];
        let recipient = accounts[2];
        let value = 100;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, watcher1, refundTimestamp, watcherDeadline, payoff, {from: sender, value: value});

        await sleep(~~(refundTime * 3 / 2 + 1));

        let senderBalance = await web3.eth.getBalance(sender);
        let watcherBalance = await web3.eth.getBalance(watcher2);

        let txReceipt = await contract.refund(hashed_secret, {from: watcher2, value: 0});
        let tx = await web3.eth.getTransaction(txReceipt.tx);

        let newSenderBalance = await web3.eth.getBalance(sender);
        let newWwatcherBalance = await web3.eth.getBalance(watcher2);
        let contractBalance = await web3.eth.getBalance(contract.address);

        assert.equal(contractBalance, deposit * 2);
        assert.deepEqual(BigInt(newSenderBalance), BigInt(senderBalance) + BigInt(value) - BigInt(payoff));
        assert.deepEqual(BigInt(newWwatcherBalance), BigInt(watcherBalance) + BigInt(payoff) - BigInt(txReceipt.receipt.gasUsed * tx.gasPrice));
    });

    it('should not refund twice', async () => {
        let owner = await contract.owner();
        let watcher = accounts[3];
        let deposit = 10;

        await contract.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contract.activateWatcher(watcher, {from: owner, value: 0});

        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherDeadline = (await getCurrentTime()) + 3 / 2 * refundTime;
        let sender = accounts[1];
        let recipient = accounts[2];
        let value = 100;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, watcher, refundTimestamp, watcherDeadline, payoff, {from: sender, value: value});

        await sleep(~~(refundTime + 1));

        await contract.refund(hashed_secret, {from: watcher, value: 0});

        try {
            await contract.refund(hashed_secret, {from: sender, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('swap for this hash is empty or already spent') >= 0);
        }
    });

    it('should not refund before refundTime', async () => {
        let owner = await contract.owner();
        let watcher = accounts[3];
        let deposit = 10;

        await contract.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contract.activateWatcher(watcher, {from: owner, value: 0});

        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherDeadline = (await getCurrentTime()) + 3 / 2 * refundTime;
        let sender = accounts[1];
        let recipient = accounts[2];
        let value = 100;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, watcher, refundTimestamp, watcherDeadline, payoff, {from: sender, value: value});

        await sleep(~~(refundTime * 1 / 2));

        try {
            await contract.refund(hashed_secret, {from: sender, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('refundTimestamp has not come') >= 0);
        }
    });

    it('should not refund if redeemed', async () => {
        let owner = await contract.owner();
        let watcher = accounts[3];
        let deposit = 10;

        await contract.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contract.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherDeadline = (await getCurrentTime()) + 3 / 2 * refundTime;
        let sender = accounts[1];
        let recipient = accounts[2];
        let value = 100;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, watcher, refundTimestamp, watcherDeadline, payoff, {from: sender, value: value});

        await contract.redeem(hashed_secret, secret, {from: watcher, value: 0});

        await sleep(~~(refundTime+1));

        try {
            await contract.refund(hashed_secret, {from: sender, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('swap for this hash is empty or already spent') >= 0);
        }
    });

    it('should not redeem if refunded', async () => {
        let owner = await contract.owner();
        let watcher = accounts[3];
        let deposit = 10;

        await contract.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contract.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherDeadline = (await getCurrentTime()) + 3 / 2 * refundTime;
        let sender = accounts[1];
        let recipient = accounts[2];
        let value = 100;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, watcher, refundTimestamp, watcherDeadline, payoff, {from: sender, value: value});

        await sleep(~~(refundTime+1));

        await contract.refund(hashed_secret, {from: watcher, value: 0});

        try {
            await contract.redeem(hashed_secret, secret, {from: recipient, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('swap for this hash is empty or already spent') >= 0);
        }
    });

    it('should emit Initiated event', async () => {
        let owner = await contract.owner();
        let watcher = accounts[3];
        let deposit = 10;

        await contract.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contract.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherDeadline = (await getCurrentTime()) + 3 / 2 * refundTime;
        let sender = accounts[1];
        let recipient = accounts[2];
        let value = 100;
        let payoff = 1;

        let txReceipt = await contract.initiate(hashed_secret, recipient, watcher, refundTimestamp, watcherDeadline, payoff, {from: sender, value: value});

        assert.equal(txReceipt.logs[0].event, "Initiated");
        assert.equal(txReceipt.logs[0].args._hashedSecret, hashed_secret);
        assert.deepEqual(BigInt(txReceipt.logs[0].args._refundTimestamp), BigInt(refundTimestamp));
        assert.deepEqual(BigInt(txReceipt.logs[0].args._watcherDeadline), BigInt(watcherDeadline));
        assert.equal(txReceipt.logs[0].args._participant, recipient);
        assert.equal(txReceipt.logs[0].args._initiator, sender);
        assert.equal(txReceipt.logs[0].args._watcher, watcher);
        assert.deepEqual(BigInt(txReceipt.logs[0].args._value), BigInt(value - payoff));
        assert.equal(txReceipt.logs[0].args._payoff, payoff);
    });

    it('should emit Added event', async () => {
        let owner = await contract.owner();
        let watcher = accounts[3];
        let deposit = 10;

        await contract.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contract.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherDeadline = (await getCurrentTime()) + 3 / 2 * refundTime;
        let sender = accounts[1];
        let recipient = accounts[2];
        let value1 = 100;
        let value2 = 200;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, watcher, refundTimestamp, watcherDeadline, payoff, {from: sender, value: value1});

        let txReceipt = await contract.add(hashed_secret, {from: sender, value: value2});

        assert.equal(txReceipt.logs[0].event, "Added");
        assert.equal(txReceipt.logs[0].args._hashedSecret, hashed_secret);
        assert.deepEqual(BigInt(txReceipt.logs[0].args._value), BigInt(value1 + value2 - payoff));
    });

    it('should emit Redeemed event', async () => {
        let owner = await contract.owner();
        let watcher = accounts[3];
        let deposit = 10;

        await contract.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contract.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherDeadline = (await getCurrentTime()) + 3 / 2 * refundTime;
        let sender = accounts[1];
        let recipient = accounts[2];
        let value = 100;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, watcher, refundTimestamp, watcherDeadline, payoff, {from: sender, value: value});

        let txReceipt = await contract.redeem(hashed_secret, secret, {from: watcher, value: 0});

        assert.equal(txReceipt.logs[0].event, "Redeemed");
        assert.equal(txReceipt.logs[0].args._hashedSecret, hashed_secret);
        assert.equal(txReceipt.logs[0].args._secret, secret);
    });

    it('should emit Refunded event', async () => {
        let owner = await contract.owner();
        let watcher = accounts[3];
        let deposit = 10;

        await contract.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contract.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherDeadline = (await getCurrentTime()) + 3 / 2 * refundTime;
        let sender = accounts[1];
        let recipient = accounts[2];
        let value = 100;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, watcher, refundTimestamp, watcherDeadline, payoff, {from: sender, value: value});

        await sleep(~~(refundTime+1));

        let txReceipt = await contract.refund(hashed_secret, {from: watcher, value: 0});
        
        assert.equal(txReceipt.logs[0].event, "Refunded");
        assert.equal(txReceipt.logs[0].args._hashedSecret, hashed_secret);
    });
});