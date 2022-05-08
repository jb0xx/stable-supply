pragma solidity >=0.8.0 <0.9.0;
//SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/utils/Context.sol"; 
import "@openzeppelin/contracts/access/Ownable.sol"; 
import "@openzeppelin/contracts/token/ERC20/ERC20.sol"; 
import "@openzeppelin/contracts/token/ERC20/IERC20.sol"; 
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol"; 
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol"; 

abstract contract ERC20Derived is ERC20, Ownable {
    uint private _reserveRequirement;
    address private _reserveTokenAddr;
    uint private _exchangeRate; // exchange rate between reserve and derived token


    constructor(
        string memory name_,
        string memory symbol_,
        address reserveTokenAddr_, 
        uint exchangeRate_
    ) ERC20(name_, symbol_) {
        _reserveTokenAddr = reserveTokenAddr_;
        _exchangeRate = exchangeRate_;
    }

    /**
     * @dev returns the address of the reserve token
     */
    function reserveAddress() public view returns (address) {
        return _reserveTokenAddr;
    }

    /**
     * @dev returns the address of the reserve token
     */
    function reserveRequirement() public view returns (uint) {
        return _reserveRequirement;
    }

    function exchangeRate() public view returns (uint) {
        return _exchangeRate;
    }

    /**
     * @dev mints the specified amount of tokens, given the caller has the
     * requisite balance of the reserve token required for mint.
     */
    function mint(uint amount) external {
        ERC20 reserveToken = ERC20(_reserveTokenAddr);
        uint requiredDeposit = amount / _exchangeRate;                              // calculate cost of mint
        require(reserveToken.balanceOf(_msgSender()) >= requiredDeposit);           // check that the caller has the requisite balance available
        reserveToken.transferFrom(_msgSender(), address(this), requiredDeposit);    // transfer the reserve token amount from caller to this wallet
        _mint(_msgSender(), amount);                                                // transfer the purchased balance of this token to caller
    }

    /**
     * @dev burns the specified amount of this token from the callers wallet.
     * The caller is then refunded the amount due in the reserve token.
     */
    function burn(uint amount) external {
        _burn(_msgSender(), amount);                                    // should run requisite checks for us on the caller's wallet
        uint refund = amount / _exchangeRate;                           // calculate refund due
        ERC20 reserveToken = ERC20(_reserveTokenAddr);
        reserveToken.transferFrom(address(this), _msgSender(), refund); // return the refund due
    }
}

