// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./ERC20Derived.sol";
import "./libraries/FuzzyMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @dev extension of ERC20Derived that applies a linear mapping as the
 * conversion between the supply of the derived token and its price against the
 * the reserve token. p(x) = k * x
 */
abstract contract ERC20DerivedLinear is ERC20Derived {
    struct MappingParams {  // p(x) = k * x, where x is current supply
        uint128 k;          // slope of price mapping
        uint8 kDecimals;    // number of decimals k is denominated with
    }

    MappingParams private _priceMapping;

    constructor(
        string memory name_,
        string memory symbol_,
        address reserveTokenAddr_,
        uint priceWindowRatio_,
        uint128 priceSlope_,
        uint8 priceSlopeDecimals_
    ) ERC20Derived(name_, symbol_, reserveTokenAddr_, priceWindowRatio_) {
        _priceMapping.k = priceSlope_;
        _priceMapping.kDecimals = priceSlopeDecimals_;
    }

    /**
    * Private variable getters
    */
    function priceSlope() public view returns (uint) {
        return _priceMapping.k;
    }

    function priceSlopeDecimals() public view returns (uint8) {
        return _priceMapping.kDecimals;
    }


    /**
    * Overrides
    */

    /**
     * @dev we just plug the supply into the price mapping equation, while
     * accounting for the decimal representations of the supply and k.
     */
    function _exchangeRate(uint supply) internal view override(ERC20Derived) returns (uint) {
        return 10**reserveToken().decimals() * supply * _priceMapping.k
            / 10**_priceMapping.kDecimals / 10**decimals();
    }

    /**
     * @dev we integrate the price mapping equation, and correct for decimals
     * ∫p(x)dx = k/2 x^2^
     */
    function _areaUnderCurve(uint supply) internal view override(ERC20Derived) returns (uint) {
        uint supplyWhole = supply / 10**decimals();
        return 10**reserveToken().decimals() * supplyWhole * supplyWhole * _priceMapping.k
            / (10**_priceMapping.kDecimals * 2);
    }
}