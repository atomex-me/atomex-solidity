pragma solidity ^0.5.0;

// From file: openzeppelin-contracts/contracts/math/SafeMath.sol
library SafeMath {
    function add(uint a, uint b) internal pure returns (uint c) {
        c = a + b;
        require(c >= a, "SafeMath add wrong value");
        return c;
    }
    function sub(uint a, uint b) internal pure returns (uint) {
        require(b <= a, "SafeMath sub wrong value");
        return a - b;
    }
}

// File: openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol
contract ReentrancyGuard {
    bool private _notEntered;

    constructor () internal {
        _notEntered = true;
    }

    modifier nonReentrant() {
        require(_notEntered, "ReentrancyGuard: reentrant call");
        _notEntered = false;
        _;
        _notEntered = true;
    }
}

contract Ownable {
    address private _owner;
    address private _successor;
    
    event OwnershipTransferred(address previousOwner, address newOwner);
    event NewOwnerProposed(address previousOwner, address newOwner);
    
    constructor() public {
        setOwner(msg.sender);
    }
    
    function owner() public view returns (address) {
        return _owner;
    }
    
    function successor() public view returns (address) {
        return _successor;
    }
    
    function setOwner(address newOwner) internal {
        _owner = newOwner;
    }
    
    function setSuccessor(address newOwner) internal {
        _successor = newOwner;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner(), "sender is not the owner");
        _;
    }
    
    modifier onlySuccessor() {
        require(msg.sender == successor(), "sender is not the proposed owner");
        _;
    }
    
    function proposeOwner(address newOwner) public onlyOwner {
        require(newOwner != address(0), "invalid owner address");
        emit NewOwnerProposed(owner(), newOwner);
        setSuccessor(newOwner);
    }
    
    function acceptOwnership() public onlySuccessor {
        emit OwnershipTransferred(owner(), successor());
        setOwner(successor());
    }
}

contract WatchTower is Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    
    struct Watcher {
        uint256 deposit;
        bool registered;
        uint256 withdrawalTimeout;
        uint256 withdrawalTimestamp;
    }

    event NewWatcherProposed(address _newWatcher, uint256 _deposit, uint256 _withdrawalTimeout);
    event NewWatcherRegistered(address _newWatcher);
    event WatcherDeactivated(address _watcher);
    event WatcherWithdrawn(address _watcher);
    event WatcherRemoved(address _watcher);
    
    mapping(address => Watcher) public watchTowers;

    function proposeWatcher (address _newWatcher, uint256 _withdrawalTimeout) public payable {
        require(_newWatcher != address(0), "invalid watcher address");
        require(watchTowers[_newWatcher].deposit == 0, "watcher is already registered");
        require(msg.value > 0, "trasaction value must be greater then zero");
        
        emit NewWatcherProposed(_newWatcher, msg.value, _withdrawalTimeout);
        
        watchTowers[_newWatcher].deposit = msg.value;
        watchTowers[_newWatcher].withdrawalTimeout = _withdrawalTimeout;
    }
    
    function acceptWatcher (address _newWatcher) public onlyOwner {
        require(watchTowers[_newWatcher].deposit > 0, "watcher does not exist");
        
        emit NewWatcherRegistered(_newWatcher);
        
        watchTowers[_newWatcher].registered = true;
    }
    
    function deactivateWatcher (address _watcher) public {
        require(msg.sender == _watcher || msg.sender == owner(), "sender is not authorised");
        require(watchTowers[_watcher].deposit > 0, "watcher does not exist");
        
        emit WatcherRemoved(_watcher);
        
        watchTowers[_watcher].registered = false;
        watchTowers[_watcher].withdrawalTimestamp = block.timestamp.add(watchTowers[msg.sender].withdrawalTimeout);
    }  
    
    function withdrawWatcher () public nonReentrant {
        require(watchTowers[msg.sender].deposit > 0, "watcher does not exist");
        require(watchTowers[msg.sender].registered == false, "watcher is not deactivated");
        require(block.timestamp > watchTowers[msg.sender].withdrawalTimestamp, "withdrawalTimestamp has not come");
        
        emit WatcherWithdrawn(msg.sender);
        
        msg.sender.transfer(watchTowers[msg.sender].deposit);
        
        delete watchTowers[msg.sender];
    }
    
    function removeWatcher (address _watcher) internal {
        require(watchTowers[_watcher].deposit > 0, "watcher does not exist");
        require(watchTowers[_watcher].registered == true, "watcher is not registered");

        emit WatcherRemoved(_watcher);
        
        msg.sender.transfer(watchTowers[_watcher].deposit);
        
        delete watchTowers[_watcher];
    }
}

contract Atomex is WatchTower {
    using SafeMath for uint256;

    enum State { Empty, Initiated, Redeemed, Refunded }

    struct Swap {
        bytes32 hashedSecret;
        address payable initiator;
        address payable participant;
        address payable watcher;
        uint256 refundTimestamp;
        uint256 watcherDeadline;
        uint256 value;
        uint256 payoff;
        State state;
    }
    
    event Initiated(
        bytes32 indexed _hashedSecret,
        address indexed _participant,
        address _initiator,
        address _watcher,
        uint256 _refundTimestamp,
        uint256 _watcherDeadline,
        uint256 _value,
        uint256 _payoff
    );

    event Added(
        bytes32 indexed _hashedSecret,
        address _sender,
        uint _value
    );

    event Redeemed(
        bytes32 indexed _hashedSecret,
        bytes32 _secret
    );

    event Refunded(
        bytes32 indexed _hashedSecret
    );

    mapping(bytes32 => Swap) public swaps;

    modifier onlyByInitiator(bytes32 _hashedSecret) {
        require(msg.sender == swaps[_hashedSecret].initiator, "sender is not the initiator");
        _;
    }

    modifier isInitiatable(bytes32 _hashedSecret, address _participant, uint256 _refundTimestamp, uint256 _watcherDeadline) {
        require(_participant != address(0), "invalid participant address");
        require(swaps[_hashedSecret].state == State.Empty, "swap for this hash is already initiated");
        require(block.timestamp < _refundTimestamp, "refundTimestamp has already come");
        require(block.timestamp < _watcherDeadline, "watcherDeadline has already come");
        _;
    }

    modifier isInitiated(bytes32 _hashedSecret) {
        require(swaps[_hashedSecret].state == State.Initiated, "swap for this hash is empty or already spent");
        _;
    }

    modifier isAddable(bytes32 _hashedSecret) {
        require(block.timestamp < swaps[_hashedSecret].refundTimestamp, "refundTimestamp has already come");
        _;
    }

    modifier isRedeemable(bytes32 _hashedSecret, bytes32 _secret) {
        require(block.timestamp < swaps[_hashedSecret].refundTimestamp, "refundTimestamp has already come");
        require(sha256(abi.encodePacked(sha256(abi.encodePacked(_secret)))) == _hashedSecret, "secret is not correct");
        _;
    }

    modifier isRefundable(bytes32 _hashedSecret) {
        require(block.timestamp >= swaps[_hashedSecret].refundTimestamp, "refundTimestamp has not come");
        _;
    }
    
    function initiate(
        bytes32 _hashedSecret, address payable _participant, address payable _watcher,
        uint256 _refundTimestamp, uint256 _watcherDeadline, uint256 _payoff)
        public payable nonReentrant isInitiatable(_hashedSecret, _participant, _refundTimestamp, _watcherDeadline)
    {
        swaps[_hashedSecret].value = msg.value.sub(_payoff);
        swaps[_hashedSecret].hashedSecret = _hashedSecret;
        swaps[_hashedSecret].participant = _participant;
        swaps[_hashedSecret].initiator = msg.sender;
        swaps[_hashedSecret].watcher = _watcher;
        swaps[_hashedSecret].refundTimestamp = _refundTimestamp;
        swaps[_hashedSecret].watcherDeadline = _watcherDeadline;
        swaps[_hashedSecret].payoff = _payoff;
        swaps[_hashedSecret].state = State.Initiated;

        emit Initiated(
            _hashedSecret,
            _participant,
            msg.sender,
            _watcher,
            _refundTimestamp,
            _watcherDeadline,
            msg.value.sub(_payoff),
            _payoff
        );
    }

    function add (bytes32 _hashedSecret)
        public payable nonReentrant isInitiated(_hashedSecret) isAddable(_hashedSecret)
    {
        swaps[_hashedSecret].value = swaps[_hashedSecret].value.add(msg.value);

        emit Added(
            _hashedSecret,
            msg.sender,
            swaps[_hashedSecret].value
        );
    }

    function withdraw(bytes32 _hashedSecret, address payable _receiver, uint256 _watcherDeadLine, bool _slash) internal {
        if (msg.sender == swaps[_hashedSecret].watcher) {
            _receiver.transfer(swaps[_hashedSecret].value);
            if (swaps[_hashedSecret].payoff > 0) {
                msg.sender.transfer(swaps[_hashedSecret].payoff);
            }
        }
        else if (block.timestamp > _watcherDeadLine && watchTowers[msg.sender].registered == true) {
            _receiver.transfer(swaps[_hashedSecret].value);
            if (swaps[_hashedSecret].payoff > 0) {
                msg.sender.transfer(swaps[_hashedSecret].payoff);
            }
            if(swaps[_hashedSecret].watcher != address(0) && _slash)
            {
                removeWatcher(swaps[_hashedSecret].watcher);
            }
        }
        else {
            _receiver.transfer(swaps[_hashedSecret].value.add(swaps[_hashedSecret].payoff));
        }
        
        delete swaps[_hashedSecret];
    }

    function redeem(bytes32 _hashedSecret, bytes32 _secret, bool _slash)
        public nonReentrant isInitiated(_hashedSecret) isRedeemable(_hashedSecret, _secret)
    {
        swaps[_hashedSecret].state = State.Redeemed;

        emit Redeemed(
            _hashedSecret,
            _secret
        );

        withdraw(_hashedSecret, swaps[_hashedSecret].participant, swaps[_hashedSecret].watcherDeadline, _slash);
    }

    function refund(bytes32 _hashedSecret, bool _slash)
        public isInitiated(_hashedSecret) isRefundable(_hashedSecret)
    {
        swaps[_hashedSecret].state = State.Refunded;

        emit Refunded(
            _hashedSecret
        );
        
        withdraw(_hashedSecret, swaps[_hashedSecret].initiator, swaps[_hashedSecret].watcherDeadline, _slash);
    }
}