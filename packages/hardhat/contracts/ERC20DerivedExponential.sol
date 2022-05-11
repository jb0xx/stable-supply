// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./ERC20Derived.sol";
import "./libraries/FuzzyMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @dev extension of ERC20Derived that applies a sublinear exponential mapping
 * as the conversion between the supply of the derived token and its price
 * against the reserve token. Uses some fuzzy estimates for calculating the
 * mappings so will provide intermediate estimates for any inputs that are 
 * non-perfect squares, cubes, etc
 */
abstract contract ERC20DerivedExponential is ERC20Derived {
    struct MappingParams {  // p(x) = k * x^(n/d)^, where x is current supply
        uint8 n;            // numerator of price mapping exponent
        uint8 d;            // denominator of price mapping exponent
        uint128 k;          // scalar multiple to apply to conversion, 
        uint8 kDecimals;    // number of decimals k is denominated with
    }

    MappingParams private _priceMapping;

    constructor(
        string memory name_,
        string memory symbol_,
        address reserveTokenAddr_,
        uint priceWindowRatio_,
        uint8 exponentNumerator_,
        uint8 exponentDenominator_,
        uint128 mappingScale_,      
        uint8 mappingScaleDecimals_
    ) ERC20Derived(name_, symbol_, reserveTokenAddr_, priceWindowRatio_) {
        // NOTE: this requirement is a bit strict, bounding to both numerator
        //   and denominator <= 5, but can be rememdied through optimizations
        //   to the FuzzyMath Library. The n < d requirement should be enforced
        //   as a superlinear mapping makes no sense in terms of tokenomics and
        //   cases of n == d can be simplified to ERC20DerivedLinear at lower
        //   gas costs
        require(exponentDenominator_ <= 5 && exponentNumerator_ < exponentDenominator_);
        _priceMapping = MappingParams(
            exponentNumerator_,
            exponentDenominator_,
            mappingScale_,
            mappingScaleDecimals_
        );
    }


    /**
    * Private variable getters
    */
    function priceMapping() public view returns (MappingParams memory) {
        return _priceMapping;
    }


    /**
    * Overrides
    */

    /**
     * @dev we just plug the supply into the price mapping equation, while
     * accounting for the decimal representations of the supply and k.
     */
    function _exchangeRate(uint supply) internal view override(ERC20Derived) returns (uint){
        uint supplyWhole = supply / 10**decimals();
        uint rateRaw = FuzzyMath.fraxExp(
            supplyWhole,
            _priceMapping.n,
            _priceMapping.d
        );

        return rateRaw * _priceMapping.k * 10**decimals() / 10**_priceMapping.kDecimals;
    }

    /**
     * @dev we integrate the price mapping equation, and correct for decimals
     * ∫p(x)dx = k/(1 + n/d) * x^(1 + n/d)^
     *         = k*d/(n+d) * x^(n+d)/d^
     */
    function _areaUnderCurve(uint supply) internal view override(ERC20Derived) returns (uint) {
        uint supplyWhole = supply / 10**decimals();
        uint areaRaw = FuzzyMath.fraxExp(
            supplyWhole,
            _priceMapping.n + _priceMapping.d,
            _priceMapping.d
        );
        
        return areaRaw * _priceMapping.k * _priceMapping.d * 10**decimals()
            / 10**_priceMapping.kDecimals / (_priceMapping.n + _priceMapping.d);
    }
}