// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IroncladToken
/// @notice A memecoin with nothing to rug. The whole supply is minted once, in the
///         constructor, to the deployer. There is no owner, no mint, no tax, no
///         blacklist, no pause, no proxy and no upgrade path. What you deploy is
///         what everyone holds, forever.
/// @dev Minimal ERC-20. Unaudited: read it before you trust it. It is short on purpose.
contract IroncladToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public immutable totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error ZeroAddress();
    error InsufficientBalance();
    error InsufficientAllowance();

    /// @param name_ Token name, e.g. "Diamond Hands"
    /// @param symbol_ Ticker, e.g. "DIAM"
    /// @param wholeTokens Supply in whole tokens; multiplied by 10**18
    constructor(string memory name_, string memory symbol_, uint256 wholeTokens) {
        name = name_;
        symbol = symbol_;
        uint256 supply = wholeTokens * 1e18;
        totalSupply = supply;
        balanceOf[msg.sender] = supply;
        emit Transfer(address(0), msg.sender, supply);
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _move(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (allowed < value) revert InsufficientAllowance();
            unchecked { allowance[from][msg.sender] = allowed - value; }
        }
        _move(from, to, value);
        return true;
    }

    function _move(address from, address to, uint256 value) private {
        if (to == address(0)) revert ZeroAddress();
        uint256 bal = balanceOf[from];
        if (bal < value) revert InsufficientBalance();
        unchecked {
            balanceOf[from] = bal - value;
            balanceOf[to] += value;
        }
        emit Transfer(from, to, value);
    }
}
