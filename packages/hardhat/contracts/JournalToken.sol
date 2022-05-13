// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./ERC20Derived.sol";
import "./ERC20DerivedLinear.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract JournalToken is ERC20, ERC20Derived, ERC20DerivedLinear {
    constructor(
        string memory name_,
        string memory symbol_,
        address reserveTokenAddr_,
        uint priceWindowRatio_,
        uint128 priceSlope_,      
        uint8 priceSlopeDecimals_
    ) ERC20DerivedLinear(
        name_,
        symbol_,
        reserveTokenAddr_,
        priceWindowRatio_,
        priceSlope_,      
        priceSlopeDecimals_
    ){}

    /**
     * Overrides
     */
    function _mint(address to, uint256 amount) internal override(ERC20) {
        super._mint(to, amount);
    }
}