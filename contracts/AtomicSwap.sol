pragma solidity ^0.5.0;

contract AtomicSwap {
    enum State { Empty, Initiator }

    struct Swap {
        bytes32 hashedSecret;
        bytes32 secret;
        uint initTimestamp;
        uint refundTime;
        address payable initiator;
        uint nonce;
        address payable participant;
        uint256 value;
        bool emptied;
        State state;
    }

    mapping(bytes32 => Swap) public swaps;
    
    event Refunded(
        bytes32 indexed _hashedSecret,
        uint _refundTime
    );
    event Redeemed(
        bytes32 indexed _hashedSecret,
        bytes32 _secret,
        uint _redeemTime
    );
    event Initiated(
        bytes32 indexed _hashedSecret,
        uint _initTimestamp,
        uint _refundTime,
        address indexed _participant,
        address indexed _initiator,
        uint256 _value
    );

    constructor() public {
    }
    
    modifier isRefundable(bytes32 _hashedSecret) {
        require(block.timestamp > swaps[_hashedSecret].initTimestamp + swaps[_hashedSecret].refundTime, "refundTime has not come");
        _;
    }
    
    modifier isRedeemable(bytes32 _hashedSecret, bytes32 _secret) {
        require(block.timestamp <= swaps[_hashedSecret].initTimestamp + swaps[_hashedSecret].refundTime, "refundTime has already come");
        require(sha256(abi.encodePacked(sha256(abi.encodePacked(_secret)))) == _hashedSecret, "secret is not correct");
        _;
    }
    
    modifier isInitiated(bytes32 _hashedSecret) {
        require(swaps[_hashedSecret].emptied == false, "swap for this hash is already emptied");
        require(swaps[_hashedSecret].state == State.Initiator, "no initiated swap for such hash");
        _;
    }
    
    modifier isInitiatable(bytes32 _hashedSecret, bool _master) {
        require(swaps[_hashedSecret].emptied == false, "swap for this hash is already emptied");
        if (_master)
        {
            require(swaps[_hashedSecret].state == State.Empty, "swap for this hash is already initiated");
        }
        else
        {
            require(swaps[_hashedSecret].state == State.Initiator, "have to be master to initiate");
            require(block.timestamp <= swaps[_hashedSecret].initTimestamp + swaps[_hashedSecret].refundTime, "refundTime has already come");
        }
        _;
    }

    function initiate (bytes32 _hashedSecret, uint _refundTime, address payable _participant, bool _master)
        public payable isInitiatable(_hashedSecret, _master)    
    {
        if (_master)
        {
            swaps[_hashedSecret].hashedSecret = _hashedSecret;
            swaps[_hashedSecret].initTimestamp = block.timestamp;
            swaps[_hashedSecret].refundTime = _refundTime;
            swaps[_hashedSecret].initiator = msg.sender;
            swaps[_hashedSecret].participant = _participant;
            swaps[_hashedSecret].value = msg.value;
            swaps[_hashedSecret].state = State.Initiator;
        }
        else
        {
            swaps[_hashedSecret].value += msg.value;
        }

        emit Initiated(
            _hashedSecret,
            swaps[_hashedSecret].initTimestamp,
            swaps[_hashedSecret].refundTime,
            swaps[_hashedSecret].participant,
            msg.sender,
            swaps[_hashedSecret].value
        );
    }

    function redeem(bytes32 _hashedSecret, bytes32 _secret) 
        public isInitiated(_hashedSecret) isRedeemable(_hashedSecret, _secret)
    {
        swaps[_hashedSecret].emptied = true;
        swaps[_hashedSecret].secret = _secret;
        
        emit Redeemed(
            _hashedSecret,
            _secret,
            block.timestamp
        );

        swaps[_hashedSecret].participant.transfer(swaps[_hashedSecret].value);
    }

    function refund(bytes32 _hashedSecret)
        public isInitiated(_hashedSecret) isRefundable(_hashedSecret) 
    {
        swaps[_hashedSecret].emptied = true;
        swaps[_hashedSecret].state = State.Empty;

        emit Refunded(
            _hashedSecret,    
            block.timestamp
        );

        swaps[_hashedSecret].initiator.transfer(swaps[_hashedSecret].value);
    }
}
