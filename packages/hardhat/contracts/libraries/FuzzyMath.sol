// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "hardhat/console.sol";

/**
 * @dev provides some functions for maths that are illegal under solidity rules
 */
library FuzzyMath {

    /**
     * @dev estimates the equation f(x) = x^(a/b)^
     * does so by calculating x^a^ and iterating to the b-root of that subtotal
     * using a generalized form of the Babylonian Method
     * https://www.researchgate.net/publication/237415858_EXTENDING_THE_BABYLONIAN_ALGORITHM

     * NOTE: greater inputs could be considered if this function were used to
     * estimate exponential mappings with a limited number of sig-figs
     */ 
    function fraxExp(uint x, uint8 a, uint8 b) external view returns (uint ans)  {
        // constraints (too loose rn.. 1e81 is overflow)
        require(b < 10, "need exponent denominator b < 10");
        require(a < 10, "need exponent numerator a < 10");
        require(x < 1000000000, "maximum input is 1e9");

        // shortcuts n simpifications (224 gas) -- do we need these?
        unchecked {
            if (x <= 1) return x;
            if (a % b == 0) return x ** (a / b);
            if (b % a == 0) {   // (122 gas) for this alone
                a = 1;
                b = b / a;
                // (a, b) = (1, b / a);  // not sure why but inline assignment costs 10 extra gas
            }
        }

        uint subTotal = (a > 1) ? x**a : x;     // calc subtotal w exp numerator, prior to rooting
        if (b == 2) return sqrt(subTotal);      // shortcut square root case

        // calculate tight upper bound on answer
        // bound:= 2^c^ ; where c = ⌈⌈lg2(subTotal)⌉ / b⌉
        // TODO: tighten bound; optimize MSB check w binary search (max 256 loops currently lol)
        uint8 subTotalMSB = 0;
        while(subTotal>>subTotalMSB > 0) subTotalMSB++;
        uint expBoundGuess = subTotalMSB / b;
        expBoundGuess += (subTotalMSB % b != 0) ? 1 : 0;
        uint z = (1<<expBoundGuess) - 1;

        uint8 b2 = b - 1;
        ans = subTotal;
        while (z < ans) {
            unchecked {
                ans = z;
                z = (subTotal / z**b2 + b2 * z) / b;
                // (ans, z) = (z, (subTotal / z**b2 + b2 * z) / b);
            }
        }
    }

    /**
     * @dev estimates the square root of an input using Babylonian Method
     * https://www.cs.utep.edu/vladik/2009/olg09-05a.pdf
     */
    function sqrt(uint x) public pure returns (uint ans) {
        ans = x;
        uint est = (x + 1) / 2; // intial guess, could be improved
        while (est < ans) {
            (ans, est) = (est, (x / est + est) / 2);
        }
    }
}