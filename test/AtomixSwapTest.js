const AtomicSwap = artifacts.require('../contracts/AtomicSwap.sol');

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

contract('AtomicSwap', async (accounts) => {
    let contract;

    beforeEach(async function(){
        contract = await AtomicSwap.new();
    });

    it('should initiate properly', async () => {
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let recipient = accounts[1];
        let value = 100;
        let payoff = 1;

        let swap = await contract.swaps(hashed_secret);
        assert.equal(swap.hashedSecret, '0x0000000000000000000000000000000000000000000000000000000000000000');
        assert.equal(swap.secret, '0x0000000000000000000000000000000000000000000000000000000000000000');
        assert.equal(swap.initiator, '0x0000000000000000000000000000000000000000');
        assert.equal(swap.participant, '0x0000000000000000000000000000000000000000');
        assert.equal(swap.refundTimestamp, 0);
        assert.equal(swap.value, 0);
        assert.equal(swap.payoff, 0);
        assert.equal(swap.state, 0);

        await contract.initiate(hashed_secret, recipient, refundTimestamp, payoff, {from: sender, value: value});

        let lastBlock = await web3.eth.getBlock('latest');
        swap = await contract.swaps(hashed_secret);
        let contractBalance = await web3.eth.getBalance(contract.address);
        assert.equal(swap.hashedSecret, hashed_secret);
        assert.equal(swap.secret, '0x0000000000000000000000000000000000000000000000000000000000000000');
        assert.equal(swap.initiator, sender);
        assert.equal(swap.participant, recipient);
        assert.deepEqual(BigInt(swap.refundTimestamp), BigInt(refundTimestamp));
        assert.deepEqual(BigInt(swap.value), BigInt(value - payoff));
        assert.equal(swap.payoff, payoff);
        assert.equal(swap.state, 1);

        assert.equal(contractBalance, value);
    });

    it('should multiple initiate properly', async () => {
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let recipient = accounts[1];
        let value1 = 100;
        let value2 = 200;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, refundTimestamp, payoff, {from: sender, value: value1});

        let swap = await contract.swaps(hashed_secret);

        await contract.add(hashed_secret, {from: sender, value: value2});

        swap = await contract.swaps(hashed_secret);
        let contractBalance = await web3.eth.getBalance(contract.address);

        assert.equal(swap.hashedSecret, hashed_secret);
        assert.equal(swap.secret, '0x0000000000000000000000000000000000000000000000000000000000000000');
        assert.equal(swap.initiator, sender);
        assert.equal(swap.participant, recipient);
        assert.deepEqual(BigInt(swap.refundTimestamp), BigInt(refundTimestamp));
        assert.deepEqual(BigInt(swap.value), BigInt(value1 + value2 - payoff));
        assert.equal(swap.payoff, payoff);
        assert.equal(swap.state, 1);

        assert.deepEqual(BigInt(contractBalance), BigInt(value1 + value2));
    });

    it('should not initiate if hashed_secret is already used', async () => {
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111112';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let recipient = accounts[1];
        let value = 100;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, refundTimestamp, payoff, {from: sender, value: value});
        
        try {
            await contract.initiate(hashed_secret, recipient, refundTimestamp, payoff, {from: sender, value: value});
        }
        catch (error) {
            assert(error.message.indexOf('swap for this hash is already initiated') >= 0);
        }
    });

    it('should not intitiate with wrong payoff', async () => {
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let recipient = accounts[1];
        let value = 1;
        let payoff = 2;

        try {
            await contract.initiate(hashed_secret, recipient, refundTimestamp, payoff, {from: sender, value: value});
        }
        catch (error) {
            assert(error.message.indexOf('SafeMath sub wrong value') >= 0);
        }

        payoff = -1;

        try {
            await contract.initiate(hashed_secret, recipient, refundTimestamp, payoff, {from: sender, value: value});
        }
        catch (error) {
            assert(error.message.indexOf('SafeMath sub wrong value') >= 0);
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
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let recipient = accounts[1];
        let value = 100;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, refundTimestamp, payoff, {from: sender, value: value});

        await sleep(~~(refundTime * 2));
        payoff = false;

        try {
            await contract.add(hashed_secret, {from: sender, value: value});
        }
        catch (error) {
            assert(error.message.indexOf('refundTime has already come') >= 0);
        }
    });

    it('should redeem properly', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let recipient = accounts[1];
        let redeemer = accounts[2];
        let value = 100;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, refundTimestamp, payoff, {from: sender, value: value});

        let swap = await contract.swaps(hashed_secret);
        let recipientBalance = await web3.eth.getBalance(recipient);

        await contract.redeem(hashed_secret, secret, {from: redeemer, value: 0});

        swap = await contract.swaps(hashed_secret);
        let new_recipientBalance = await web3.eth.getBalance(recipient);
        let contractBalance = await web3.eth.getBalance(contract.address);
        let redeemerBalance = await web3.eth.getBalance(redeemer);
        /*    
        assert.equal(swap.hashedSecret, hashed_secret);
        assert.equal(swap.secret, secret);
        assert.equal(swap.initiator, sender);
        assert.equal(swap.participant, recipient);
        assert.deepEqual(BigInt(swap.refundTimestamp), BigInt(refundTimestamp));
        assert.deepEqual(BigInt(swap.value), BigInt(value - payoff));
        assert.equal(swap.state, 2);
        */
        assert.equal(contractBalance, 0);
        assert.deepEqual(BigInt(new_recipientBalance), BigInt(recipientBalance) + BigInt(value - payoff));
        assert.deepEqual(BigInt(redeemerBalance) % BigInt(10), BigInt(payoff));
    });

    it('should redeem properly after multiple init', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111'
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let recipient = accounts[1];
        let redeemer = accounts[3];
        let value1 = 100;
        let value2 = 200;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, refundTimestamp, payoff, {from: sender, value: value1});
        
        let swap = await contract.swaps(hashed_secret);
        
        await contract.add(hashed_secret, {from: sender, value: value2});

        let recipientBalance = await web3.eth.getBalance(recipient);
        let redeemerBalance = await web3.eth.getBalance(redeemer);
        await contract.redeem(hashed_secret, secret, {from: redeemer, value: 0});

        swap = await contract.swaps(hashed_secret);
        let contractBalance = await web3.eth.getBalance(contract.address);
        let new_recipientBalance = await web3.eth.getBalance(recipient);
        redeemerBalance = await web3.eth.getBalance(redeemer);
        /*    
        assert.equal(swap.hashedSecret, hashed_secret);
        assert.equal(swap.secret, secret);
        assert.equal(swap.initiator, sender);
        assert.equal(swap.participant, recipient);
        assert.deepEqual(BigInt(swap.refundTimestamp), BigInt(refundTimestamp));
        assert.deepEqual(BigInt(swap.value), BigInt(value1 + value2 - payoff));
        assert.equal(swap.state, 2);
        */
        assert.equal(contractBalance, 0);
        assert.deepEqual(BigInt(new_recipientBalance), BigInt(recipientBalance) + BigInt(value1 + value2 - payoff));
        assert.deepEqual(BigInt(redeemerBalance) % BigInt(10), BigInt(payoff));

        await contract.initiate(hashed_secret, recipient, refundTimestamp, payoff, {from: sender, value: value1});
        swap = await contract.swaps(hashed_secret);

        contractBalance = await web3.eth.getBalance(contract.address);
        assert.equal(swap.hashedSecret, hashed_secret);
        assert.equal(swap.secret, '0x0000000000000000000000000000000000000000000000000000000000000000');
        assert.equal(swap.initiator, sender);
        assert.equal(swap.participant, recipient);
        assert.deepEqual(BigInt(swap.refundTimestamp), BigInt(refundTimestamp));
        assert.deepEqual(BigInt(swap.value), BigInt(value1 - payoff));
        assert.equal(swap.payoff, payoff);
        assert.equal(swap.state, 1);

        assert.equal(contractBalance, value1);
    });

    it('should redeem properly with payoff = 0', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111'
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let recipient = accounts[1];
        let value1 = 100;
        let value2 = 200;

        await contract.initiate(hashed_secret, recipient, refundTimestamp, 0, {from: sender, value: value1});
        
        let swap = await contract.swaps(hashed_secret);
        let initiatedTimestamp = swap.initiatedTimestamp;
        
        await contract.add(hashed_secret, {from: sender, value: value2});

        let recipientBalance = await web3.eth.getBalance(recipient);

        await contract.redeem(hashed_secret, secret, {from: accounts[2], value: 0});

        swap = await contract.swaps(hashed_secret);
        let contractBalance = await web3.eth.getBalance(contract.address);
        let new_recipientBalance = await web3.eth.getBalance(recipient);
        /*
        assert.equal(swap.hashedSecret, hashed_secret);
        assert.equal(swap.secret, secret);
        assert.deepEqual(swap.initiatedTimestamp, initiatedTimestamp);
        assert.deepEqual(BigInt(swap.refundTimestamp), BigInt(refundTimestamp));
        assert.equal(swap.initiator, sender);
        assert.equal(swap.participant, recipient);
        assert.deepEqual(BigInt(swap.value), BigInt(value1 + value2));
        assert.equal(swap.state, 2);
        */
        assert.equal(contractBalance, 0);
        assert.deepEqual(BigInt(new_recipientBalance), BigInt(recipientBalance) + BigInt(value1 + value2));
    });

    it('should not redeem twice', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let recipient = accounts[1];
        let value = 100;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, refundTimestamp, payoff, {from: sender, value: value});

        await contract.redeem(hashed_secret, secret, {from: recipient, value: 0});

        try {
            await contract.redeem(hashed_secret, secret, {from: recipient, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('swap for this hash is empty or already spent') >= 0);
        }
    });

    it('should not redeem after refundTime', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let recipient = accounts[1];
        let value = 100;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, refundTimestamp, payoff, {from: sender, value: value});

        await sleep(~~(refundTime * 2));
        
        try {
            await contract.redeem(hashed_secret, secret, {from: recipient, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('refundTimestamp has already passed') >= 0);
        }
    });

    it('should not accept wrong secret', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc90ffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let recipient = accounts[1];
        let value = 100;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, refundTimestamp, payoff, {from: sender, value: value});

        try {
            await contract.redeem(hashed_secret, secret, {from: recipient, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('secret is not correct') >= 0);
        }
    });

    it('should not accept wrong sized secret', async () => {
        let secret = '0x111111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x9e7156f17d23cd6df8abb2b239f739bfd206836d79a83937b4f852bcf206544f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let recipient = accounts[1];
        let value = 100;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, refundTimestamp, payoff, {from: sender, value: value});

        try {
            await contract.redeem(hashed_secret, secret, {from: recipient, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('invalid bytes32 value') >= 0);
        }

        secret = '0x11111111111111111111111111111111111111111111111111111111111111';
        hashed_secret = '0xb71e60c29fedef4ba4dd4c7ec1357e34742f614dd64c14f070c009b36983c118';

        await contract.initiate(hashed_secret, recipient, refundTimestamp, payoff, {from: sender, value: value});

        try {
            await contract.redeem(hashed_secret, secret, {from: recipient, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('secret is not correct') >= 0);
        }
    });

    it('should refund properly', async () => {
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let recipient = accounts[1];
        let refunder = accounts[2];
        let value = 100;
        let payoff = 1;
    
        await contract.initiate(hashed_secret, recipient, refundTimestamp, payoff, {from: sender, value: value});

        let swap = await contract.swaps(hashed_secret);
        let initiatedTimestamp = swap.initiatedTimestamp;
        let senderBalance = await web3.eth.getBalance(sender);
        let contractBalance = await web3.eth.getBalance(contract.address);
        
        await sleep(~~(refundTime+1));

        await contract.refund(hashed_secret, {from: refunder, value: 0});

        swap = await contract.swaps(hashed_secret);
        let new_senderBalance = await web3.eth.getBalance(sender);
        contractBalance = await web3.eth.getBalance(contract.address);
        /*
        assert.equal(swap.hashedSecret, hashed_secret);
        assert.equal(swap.secret, '0x0000000000000000000000000000000000000000000000000000000000000000');
        assert.deepEqual(swap.initiatedTimestamp, initiatedTimestamp);
        assert.deepEqual(BigInt(swap.refundTimestamp), BigInt(refundTimestamp));
        assert.equal(swap.initiator, sender);
        assert.equal(swap.participant, recipient);
        assert.deepEqual(BigInt(swap.value), BigInt(value - payoff));
        assert.equal(swap.state, 3);
        */
        assert.equal(contractBalance, 0);
        assert.deepEqual(BigInt(new_senderBalance), BigInt(senderBalance) + BigInt(value));
    });

    it('should refund properly after multiple init', async () => {
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let recipient = accounts[1];
        let refunder = accounts[2];
        let value1 = 100;
        let value2 = 200;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, refundTimestamp, payoff, {from: sender, value: value1});
        
        let swap = await contract.swaps(hashed_secret);
        let initiatedTimestamp = swap.initiatedTimestamp;
        
        await contract.add(hashed_secret, {from: sender, value: value2});

        let senderBalance = await web3.eth.getBalance(sender);

        await sleep(~~(refundTime+1));

        await contract.refund(hashed_secret, {from: refunder, value: 0});

        swap = await contract.swaps(hashed_secret);
        let contractBalance = await web3.eth.getBalance(contract.address);
        let new_senderBalance = await web3.eth.getBalance(sender);
        /*
        assert.equal(swap.hashedSecret, hashed_secret);
        assert.equal(swap.secret, '0x0000000000000000000000000000000000000000000000000000000000000000');
        assert.deepEqual(swap.initiatedTimestamp, initiatedTimestamp);
        assert.deepEqual(BigInt(swap.refundTimestamp), BigInt(refundTimestamp));
        assert.equal(swap.initiator, sender);
        assert.equal(swap.participant, recipient);
        assert.deepEqual(BigInt(swap.value), BigInt(value1 + value2 - payoff));
        assert.equal(swap.state, 3);
        */
        assert.equal(contractBalance, 0);
        assert.deepEqual(BigInt(new_senderBalance), BigInt(senderBalance) + BigInt(value1 + value2));
    });

    it('should refund properly with payoff = 0', async () => {
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let recipient = accounts[1];
        let value1 = 100;
        let value2 = 200;

        await contract.initiate(hashed_secret, recipient, refundTimestamp, 0, {from: sender, value: value1});
        
        let swap = await contract.swaps(hashed_secret);
        let initiatedTimestamp = swap.initiatedTimestamp;
        
        await contract.add(hashed_secret, {from: sender, value: value2});

        let senderBalance = await web3.eth.getBalance(sender);
    
        await sleep(~~(refundTime+1));

        await contract.refund(hashed_secret, {from: accounts[2], value: 0});

        swap = await contract.swaps(hashed_secret);
        let contractBalance = await web3.eth.getBalance(contract.address);
        let new_senderBalance = await web3.eth.getBalance(sender);
        /*
        assert.equal(swap.hashedSecret, hashed_secret);
        assert.equal(swap.secret, '0x0000000000000000000000000000000000000000000000000000000000000000');
        assert.deepEqual(swap.initiatedTimestamp, initiatedTimestamp);
        assert.deepEqual(BigInt(swap.refundTimestamp), BigInt(refundTimestamp));
        assert.equal(swap.initiator, sender);
        assert.equal(swap.participant, recipient);
        assert.deepEqual(BigInt(swap.value), BigInt(value1 + value2));
        assert.equal(swap.state, 3);
        */
        assert.equal(contractBalance, 0);
        assert.deepEqual(BigInt(new_senderBalance), BigInt(senderBalance) + BigInt(value1 + value2));
    });

    it('should not refund twice', async () => {
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let recipient = accounts[1];
        let value = 100;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, refundTimestamp, payoff, {from: sender, value: value});
        
        await sleep(~~(refundTime+1));

        await contract.refund(hashed_secret, {from: sender, value: 0});

        try {
            await contract.refund(hashed_secret, {from: sender, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('swap for this hash is empty or already spent') >= 0);
        }
    });

    it('should not refund before refundTime', async () => {
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let recipient = accounts[1];
        let value = 100;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, refundTimestamp, payoff, {from: sender, value: value});

        try {
            await contract.refund(hashed_secret, {from: sender, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('refundTimestamp has not passed') >= 0);
        }
    });

    it('should not refund if redeemed', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let recipient = accounts[1];
        let value = 100;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, refundTimestamp, payoff, {from: sender, value: value});

        await contract.redeem(hashed_secret, secret, {from: recipient, value: 0});

        await sleep(~~(refundTime+1));

        try {
            await contract.refund(hashed_secret, {from: sender, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('swap for this hash is empty or already spent') >= 0);
        }
    });

    it('should not redeem if refunded', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let recipient = accounts[1];
        let value = 100;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, refundTimestamp, payoff, {from: sender, value: value});

        await sleep(~~(refundTime+1));

        await contract.refund(hashed_secret, {from: sender, value: 0});

        try {
            await contract.redeem(hashed_secret, secret, {from: recipient, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('swap for this hash is empty or already spent') >= 0);
        }
    });

    it('should destruct properly', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let recipient = accounts[1];
        let value = 100;
        let payoff = 1;

        await contract.destruct({from: sender, value: 0});

        try {
            await contract.initiate(hashed_secret, recipient, refundTimestamp, payoff, {from: sender, value: value});
        }
        catch (error) {
            console.log(error.message);   
        }
    });

    it('should not destruct if there are funds on contract', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let recipient = accounts[1];
        let value = 100;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, refundTimestamp, payoff, {from: sender, value: value});

        try {
            await contract.destruct({from: sender, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('balance is not zero') >= 0);
        }
    });

    it('should not destruct by anybody except Owner', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[1];

        try {
            await contract.destruct({from: sender, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('only owner') >= 0);
        }
    });

    it('should emit Initiated event', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let recipient = accounts[1];
        let value1 = 100;
        let value2 = 200;
        let payoff = 1;

        let res = await contract.initiate(hashed_secret, recipient, refundTimestamp, payoff, {from: sender, value: value1});

        let swap = await contract.swaps(hashed_secret);
        
        assert.equal(res.logs[0].event, "Initiated");
        assert.equal(res.logs[0].args._hashedSecret, hashed_secret);
        assert.deepEqual(BigInt(res.logs[0].args._refundTimestamp), BigInt(refundTimestamp));
        assert.equal(res.logs[0].args._participant, recipient);
        assert.equal(res.logs[0].args._initiator, sender);
        assert.deepEqual(BigInt(res.logs[0].args._value), BigInt(value1 - payoff));
        assert.equal(res.logs[0].args._payoff, payoff);
    });

    it('should emit Added event', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let recipient = accounts[1];
        let value1 = 100;
        let value2 = 200;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, refundTimestamp, payoff, {from: sender, value: value1});

        await contract.swaps(hashed_secret);

        let res = await contract.add(hashed_secret, {from: sender, value: value2});

        let swap = await contract.swaps(hashed_secret);

        assert.equal(res.logs[0].event, "Added");
        assert.equal(res.logs[0].args._hashedSecret, hashed_secret);
        assert.deepEqual(BigInt(res.logs[0].args._value), BigInt(value1 + value2 - payoff));
    });

    it('should emit Redeemed event', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let recipient = accounts[1];
        let value = 100;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, refundTimestamp, payoff, {from: sender, value: value});

        let res = await contract.redeem(hashed_secret, secret, {from: recipient, value: 0});

        let lastBlock = await web3.eth.getBlock('latest');
        
        assert.equal(res.logs[0].event, "Redeemed");
        assert.equal(res.logs[0].args._hashedSecret, hashed_secret);
        assert.equal(res.logs[0].args._secret, secret);
    });

    it('should emit Refunded event', async () => {
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let recipient = accounts[1];
        let value = 100;
        let payoff = 1;

        await contract.initiate(hashed_secret, recipient, refundTimestamp, payoff, {from: sender, value: value});

        await sleep(~~(refundTime+1));

        let res = await contract.refund(hashed_secret, {from: sender, value: 0});

        let lastBlock = await web3.eth.getBlock('latest');
        
        assert.equal(res.logs[0].event, "Refunded");
        assert.equal(res.logs[0].args._hashedSecret, hashed_secret);
    });


});