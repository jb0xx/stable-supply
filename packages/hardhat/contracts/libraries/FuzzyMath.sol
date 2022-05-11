// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

// import "hardhat/console.sol";

/**
 * @dev provides some functions for maths that are illegal under solidity rules
 */
library FuzzyMath {

    /**
     * @dev estimates the equation f(x) = x^(a/b)^
     * does so by calculating x^a^ and iterating to the b-root of that subtotal
     * using a generalized form of the Babylonian Method
     * citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.569.8009&rep=rep1&type=pdf

     * NOTE: greater inputs could be considered if this function were used to
     * estimate exponential mappings with a limited number of sig-figs
     */ 
    function fraxExp(uint x, uint8 a, uint8 b) external pure returns (uint est)  {
        // constraints
        require(b < 10, "need exponent denominator b < 10");
        require(a < 10, "need exponent numerator a < 10");
        require(x < 500000000, "maximum input is 5e9");

        if (x <= 1) return x;                   // shortcut this nonsense
        if (a % b == 0) return x ** (a / b);    // and this nonsense
        if (b % a == 0) (a, b) = (1, b / a);    // simplify
        uint subTotal = (a > 1) ? x**a : x;     // calculate subtotal with exponent numerator        

        // iteratively estimate b-root of subtotal
        uint z;
        est = subTotal;
        if (b == 2) {
            est = sqrt(x);
        } else {
            uint8 b2 = b - 1;
            z = x**(a/b + 1) - 1;   // z < est, always
            while (z < est) {
                (est, z) = (z, (subTotal / z**b2 + b2 * z) / b);
            }
        }
    }

    /**
     * @dev estimates the square root of an input
     */
    function sqrt(uint x) public pure returns (uint est) {
        est = x;
        uint z = (x + 1) / 2; // intial guess, could be improved
        while (z < est) {
            (est, z) = (z, (x / z + z) / 2);
        }
    }
}