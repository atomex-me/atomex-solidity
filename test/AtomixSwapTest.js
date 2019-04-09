//TODO: use safe add to eliminate wrong refundTime input

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

contract('AtomicSwap', async (accounts) => {
    let contract;

    beforeEach(async function(){
        contract = await AtomicSwap.new();
    });

    it('should initiate properly', async () => {
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let refundTime = 60;
        let sender = accounts[0];
        let recipient = accounts[1];
        let master = true;
        let value = 1;

        let notInitedSwap = await contract.swaps(hashed_secret);
        assert.equal(notInitedSwap.hashedSecret, '0x0000000000000000000000000000000000000000000000000000000000000000');
        assert.equal(notInitedSwap.secret, '0x0000000000000000000000000000000000000000000000000000000000000000');
        assert.equal(notInitedSwap.initTimestamp, 0);
        assert.equal(notInitedSwap.refundTime, 0);
        assert.equal(notInitedSwap.initiator, '0x0000000000000000000000000000000000000000');
        assert.equal(notInitedSwap.participant, '0x0000000000000000000000000000000000000000');
        assert.equal(notInitedSwap.value, 0);
        assert.equal(notInitedSwap.emptied, false);
        assert.equal(notInitedSwap.state, 0);

        await contract.initiate(hashed_secret, refundTime, recipient, master, {from: sender, value: value});

        let lastBlock = await web3.eth.getBlock('latest');
        let initedSwap = await contract.swaps(hashed_secret);
        let contractBalance = await web3.eth.getBalance(contract.address);
        assert.equal(initedSwap.hashedSecret, hashed_secret);
        assert.equal(initedSwap.secret, '0x0000000000000000000000000000000000000000000000000000000000000000');
        assert.equal(initedSwap.initTimestamp, lastBlock.timestamp);
        assert.equal(initedSwap.refundTime, refundTime);
        assert.equal(initedSwap.initiator, sender);
        assert.equal(initedSwap.participant, recipient);
        assert.equal(initedSwap.value, value);
        assert.equal(initedSwap.emptied, false);
        assert.equal(initedSwap.state, 1);

        assert.equal(contractBalance, value);
    });
    
    it('should multiple initiate properly', async () => {
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let refundTime = 60;
        let sender = accounts[0];
        let recipient = accounts[1];
        let master = true;
        let value = 1;

        await contract.initiate(hashed_secret, refundTime, recipient, master, {from: sender, value: value});

        let initedSwap = await contract.swaps(hashed_secret);
        let initTimestamp = initedSwap.initTimestamp;

        master = false;

        await contract.initiate(hashed_secret, 0, '0x0000000000000000000000000000000000000000', master, {from: sender, value: value});

        initedSwap = await contract.swaps(hashed_secret);
        let contractBalance = await web3.eth.getBalance(contract.address);

        assert.equal(initedSwap.hashedSecret, hashed_secret);
        assert.equal(initedSwap.secret, '0x0000000000000000000000000000000000000000000000000000000000000000');
        assert.deepEqual(initedSwap.initTimestamp, initTimestamp);
        assert.equal(initedSwap.refundTime, refundTime);
        assert.equal(initedSwap.initiator, sender);
        assert.equal(initedSwap.participant, recipient);
        assert.equal(initedSwap.value, (2*value).toString());
        assert.equal(initedSwap.emptied, false);
        assert.equal(initedSwap.state, 1);

        assert.equal(contractBalance, (2*value).toString());
    });

    it('should not create swap if hashed_secret is already used', async () => {
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111112';
        let refundTime = 60;
        let sender = accounts[0];
        let recipient = accounts[1];
        let master = true;
        let value = 1;

        await contract.initiate(hashed_secret, refundTime, recipient, master, {from: sender, value: value});
        await sleep(refundTime * 2);
        await contract.refund(hashed_secret);
        
        try {
            await contract.initiate(hashed_secret, refundTime, recipient, master, {from: sender, value: value});
        }
        catch (error) {
            assert(error.message.indexOf('revert swap for this hash is already emptied') >= 0);
        }
    });

    it('should not intitiate if not master', async () => {
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let refundTime = 60;
        let sender = accounts[0];
        let recipient = accounts[1];
        let master = false;
        let value = 1;

        try {
            await contract.initiate(hashed_secret, refundTime, recipient, master, {from: sender, value: value});
        }
        catch (error) {
            assert(error.message.indexOf('have to be master to initiate') >= 0);
        }
    });

    it('should not intitiate after refundTime', async () => {
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let refundTime = 60;
        let sender = accounts[0];
        let recipient = accounts[1];
        let master = true;
        let value = 1;

        await contract.initiate(hashed_secret, refundTime, recipient, master, {from: sender, value: value});

        await sleep(~~(refundTime * 2));
        master = false;

        try {
            await contract.initiate(hashed_secret, refundTime, recipient, master, {from: sender, value: value});
        }
        catch (error) {
            assert(error.message.indexOf('refundTime has already come') >= 0);
        }
    });

    it('should redeem properly', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let sender = accounts[0];
        let recipient = accounts[1];
        let master = true;
        let value = 1;

        await contract.initiate(hashed_secret, refundTime, recipient, master, {from: sender, value: value});

        let initedSwap = await contract.swaps(hashed_secret);
        let initTimestamp = initedSwap.initTimestamp;
        let recipientBalance = await web3.eth.getBalance(recipient);
        let contractBalance = await web3.eth.getBalance(contract.address);

        await contract.redeem(hashed_secret, secret, {from: accounts[2], value: 0});

        initedSwap = await contract.swaps(hashed_secret);
        let new_recipientBalance = await web3.eth.getBalance(recipient);
        contractBalance = await web3.eth.getBalance(contract.address);

        assert.equal(initedSwap.hashedSecret, hashed_secret);
        assert.equal(initedSwap.secret, secret);
        assert.deepEqual(initedSwap.initTimestamp, initTimestamp);
        assert.equal(initedSwap.refundTime, refundTime);
        assert.equal(initedSwap.initiator, sender);
        assert.equal(initedSwap.participant, recipient);
        assert.equal(initedSwap.value, value);
        assert.equal(initedSwap.emptied, true);
        assert.equal(initedSwap.state, 1);

        assert.equal(contractBalance, 0);
        assert.deepEqual(BigInt(new_recipientBalance), BigInt(recipientBalance) + BigInt(value));
    });

    it('should redeem properly after multiple init', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111'
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let sender = accounts[0];
        let recipient = accounts[1];
        let master = true;
        let value = 1;

        await contract.initiate(hashed_secret, refundTime, recipient, master, {from: sender, value: value});
        
        let initedSwap = await contract.swaps(hashed_secret);
        let initTimestamp = initedSwap.initTimestamp;
        
        master = false;
        await contract.initiate(hashed_secret, refundTime, recipient, master, {from: sender, value: value});

        let recipientBalance = await web3.eth.getBalance(recipient);
        let contractBalance = await web3.eth.getBalance(contract.address);

        await contract.redeem(hashed_secret, secret, {from: accounts[2], value: 0});

        initedSwap = await contract.swaps(hashed_secret);
        let new_contractBalance = await web3.eth.getBalance(contract.address);
        let new_recipientBalance = await web3.eth.getBalance(recipient);

        assert.equal(initedSwap.hashedSecret, hashed_secret);
        assert.equal(initedSwap.secret, secret);
        assert.deepEqual(initedSwap.initTimestamp, initTimestamp);
        assert.equal(initedSwap.refundTime, refundTime);
        assert.equal(initedSwap.initiator, sender);
        assert.equal(initedSwap.participant, recipient);
        assert.equal(initedSwap.value, contractBalance);
        assert.equal(initedSwap.emptied, true);
        assert.equal(initedSwap.state, 1);
        
        assert.equal(new_contractBalance, 0);
        assert.deepEqual(BigInt(new_recipientBalance), (BigInt(recipientBalance) + BigInt(contractBalance)));
    });

    it('should not redeem twice', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let sender = accounts[0];
        let recipient = accounts[1];
        let master = true;
        let value = 1;

        await contract.initiate(hashed_secret, refundTime, recipient, master, {from: sender, value: value});

        await contract.redeem(hashed_secret, secret, {from: recipient, value: 0});

        try {
            await contract.redeem(hashed_secret, secret, {from: recipient, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('swap for this hash is already emptied') >= 0);
        }
    });

    it('should not redeem after refundTime', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let sender = accounts[0];
        let recipient = accounts[1];
        let master = true;
        let value = 1;

        await contract.initiate(hashed_secret, refundTime, recipient, master, {from: sender, value: value});

        await sleep(~~(refundTime * 2));

        try {
            await contract.redeem(hashed_secret, secret, {from: recipient, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('refundTime has already come') >= 0);
        }
    });

    it('should not accept wrong secret', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc90ffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let sender = accounts[0];
        let recipient = accounts[1];
        let master = true;
        let value = 1;

        await contract.initiate(hashed_secret, refundTime, recipient, master, {from: sender, value: value});

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
        let sender = accounts[0];
        let recipient = accounts[1];
        let master = true;
        let value = 1;

        await contract.initiate(hashed_secret, refundTime, recipient, master, {from: sender, value: value});

        try {
            await contract.redeem(hashed_secret, secret, {from: recipient, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('invalid bytes32 value') >= 0);
        }

        secret = '0x11111111111111111111111111111111111111111111111111111111111111';
        hashed_secret = '0xb71e60c29fedef4ba4dd4c7ec1357e34742f614dd64c14f070c009b36983c118';

        await contract.initiate(hashed_secret, refundTime, recipient, master, {from: sender, value: value});

        try {
            await contract.redeem(hashed_secret, secret, {from: recipient, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('secret is not correct') >= 0);
        }
    });

    it('should refund properly', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let sender = accounts[0];
        let recipient = accounts[1];
        let master = true;
        let value = 1;

        await contract.initiate(hashed_secret, refundTime, recipient, master, {from: sender, value: value});

        let initedSwap = await contract.swaps(hashed_secret);
        let initTimestamp = initedSwap.initTimestamp;
        let senderBalance = await web3.eth.getBalance(sender);
        let contractBalance = await web3.eth.getBalance(contract.address);
        
        await sleep(~~(refundTime+1));

        await contract.refund(hashed_secret, {from: accounts[2], value: 0});

        initedSwap = await contract.swaps(hashed_secret);
        let new_senderBalance = await web3.eth.getBalance(sender);
        contractBalance = await web3.eth.getBalance(contract.address);

        assert.equal(initedSwap.hashedSecret, hashed_secret);
        assert.equal(initedSwap.secret, '0x0000000000000000000000000000000000000000000000000000000000000000');
        assert.deepEqual(initedSwap.initTimestamp, initTimestamp);
        assert.equal(initedSwap.refundTime, refundTime);
        assert.equal(initedSwap.initiator, sender);
        assert.equal(initedSwap.participant, recipient);
        assert.equal(initedSwap.value, value);
        assert.equal(initedSwap.emptied, true);
        assert.equal(initedSwap.state, 0);

        assert.equal(contractBalance, 0);
        assert.deepEqual(BigInt(new_senderBalance), BigInt(senderBalance) + BigInt(value));
    });

    it('should refund properly after multiple init', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111'
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let sender = accounts[0];
        let recipient = accounts[1];
        let master = true;
        let value = 1;

        await contract.initiate(hashed_secret, refundTime, recipient, master, {from: sender, value: value});
        
        let initedSwap = await contract.swaps(hashed_secret);
        let initTimestamp = initedSwap.initTimestamp;
        
        master = false;
        await contract.initiate(hashed_secret, refundTime, recipient, master, {from: sender, value: value});

        let senderBalance = await web3.eth.getBalance(sender);
        let contractBalance = await web3.eth.getBalance(contract.address);

        await sleep(~~(refundTime+1));

        await contract.refund(hashed_secret, {from: accounts[2], value: 0});

        initedSwap = await contract.swaps(hashed_secret);
        let new_contractBalance = await web3.eth.getBalance(contract.address);
        let new_senderBalance = await web3.eth.getBalance(sender);

        assert.equal(initedSwap.hashedSecret, hashed_secret);
        assert.equal(initedSwap.secret, '0x0000000000000000000000000000000000000000000000000000000000000000');
        assert.deepEqual(initedSwap.initTimestamp, initTimestamp);
        assert.equal(initedSwap.refundTime, refundTime);
        assert.equal(initedSwap.initiator, sender);
        assert.equal(initedSwap.participant, recipient);
        assert.equal(initedSwap.value, contractBalance);
        assert.equal(initedSwap.emptied, true);
        assert.equal(initedSwap.state, 0);
        
        assert.equal(new_contractBalance, 0);
        assert.deepEqual(BigInt(new_senderBalance), (BigInt(senderBalance) + BigInt(contractBalance)));
    });

    it('should not refund twice', async () => {
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let sender = accounts[0];
        let recipient = accounts[1];
        let master = true;
        let value = 1;

        await contract.initiate(hashed_secret, refundTime, recipient, master, {from: sender, value: value});
        
        await sleep(~~(refundTime+1));

        await contract.refund(hashed_secret, {from: sender, value: 0});

        try {
            await contract.refund(hashed_secret, {from: sender, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('swap for this hash is already emptied') >= 0);
        }
    });

    it('should not refund before refundTime', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let sender = accounts[0];
        let recipient = accounts[1];
        let master = true;
        let value = 1;

        await contract.initiate(hashed_secret, refundTime, recipient, master, {from: sender, value: value});

        try {
            await contract.refund(hashed_secret, {from: sender, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('refundTime has not come') >= 0);
        }
    });

    it('should not refund if redeemed', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let sender = accounts[0];
        let recipient = accounts[1];
        let master = true;
        let value = 1;

        await contract.initiate(hashed_secret, refundTime, recipient, master, {from: sender, value: value});

        await contract.redeem(hashed_secret, secret, {from: recipient, value: 0});

        await sleep(~~(refundTime+1));

        try {
            await contract.refund(hashed_secret, {from: sender, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('swap for this hash is already emptied') >= 0);
        }
    });

    it('should emit Initiated event', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let sender = accounts[0];
        let recipient = accounts[1];
        let master = true;
        let value = 1;

        let res = await contract.initiate(hashed_secret, refundTime, recipient, master, {from: sender, value: value});

        let initedSwap = await contract.swaps(hashed_secret);
        
        assert.equal(res.logs[0].event, "Initiated");
        assert.equal(res.logs[0].args._hashedSecret, hashed_secret);
        assert.deepEqual(res.logs[0].args._initTimestamp, initedSwap.initTimestamp);
        assert.equal(res.logs[0].args._refundTime, refundTime);
        assert.equal(res.logs[0].args._participant, recipient);
        assert.equal(res.logs[0].args._initiator, sender);
        assert.equal(res.logs[0].args._value, value);

        master = false;

        res = await contract.initiate(hashed_secret, refundTime, recipient, master, {from: sender, value: value});

        initedSwap = await contract.swaps(hashed_secret);

        assert.equal(res.logs[0].event, "Initiated");
        assert.equal(res.logs[0].args._hashedSecret, hashed_secret);
        assert.deepEqual(res.logs[0].args._initTimestamp, initedSwap.initTimestamp);
        assert.equal(res.logs[0].args._refundTime, refundTime);
        assert.equal(res.logs[0].args._participant, recipient);
        assert.equal(res.logs[0].args._initiator, sender);
        assert.deepEqual(res.logs[0].args._value, initedSwap.value);
    });

    it('should emit Redeemed event', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let sender = accounts[0];
        let recipient = accounts[1];
        let master = true;
        let value = 1;

        await contract.initiate(hashed_secret, refundTime, recipient, master, {from: sender, value: value});

        let res = await contract.redeem(hashed_secret, secret, {from: recipient, value: 0});

        let lastBlock = await web3.eth.getBlock('latest');
        
        assert.equal(res.logs[0].event, "Redeemed");
        assert.equal(res.logs[0].args._hashedSecret, hashed_secret);
        assert.equal(res.logs[0].args._secret, secret);
        assert.equal(res.logs[0].args._redeemTime, lastBlock.timestamp);
    });

    it('should emit Refunded event', async () => {
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let sender = accounts[0];
        let recipient = accounts[1];
        let master = true;
        let value = 1;

        await contract.initiate(hashed_secret, refundTime, recipient, master, {from: sender, value: value});

        await sleep(~~(refundTime+1));

        let res = await contract.refund(hashed_secret, {from: sender, value: 0});

        let lastBlock = await web3.eth.getBlock('latest');
        
        assert.equal(res.logs[0].event, "Refunded");
        assert.equal(res.logs[0].args._hashedSecret, hashed_secret);
        assert.equal(res.logs[0].args._refundTime, lastBlock.timestamp);
    });

});