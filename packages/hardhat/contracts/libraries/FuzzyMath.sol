// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

// import "hardhat/console.sol";

/**
 * @dev provides some functions for maths that are illegal under solidity rules
 */
library FuzzyMath {

    /**
     * @dev estimates the equation f(x) = x^(a/b)^
     * does so by calculating subtotal x^a^ and iterating to the b-root of that subtotal
     * using a generalized form of the Babylonian Method (rounded down to nearest whole #)
     * https://www.researchgate.net/publication/237415858_EXTENDING_THE_BABYLONIAN_ALGORITHM
     * e

     * NOTE: greater inputs could be considered if this function were used to
     * estimate exponential mappings with a limited number of sig-figs
     */ 
    function fraxExp(uint x, uint8 a, uint8 b) external pure returns (uint ans)  {
        // constraints (too loose rn.. 1e81 is overflow)
        require(b < 10, "need exponent denominator b < 10");
        require(a < 10, "need exponent numerator a < 10");
        require(x < 1000000000, "maximum input is 1e9");

        unchecked {
            // shortcuts + simpifications (224 gas) -- do we need these?
            if (x <= 1) return x;
            if (a % b == 0) return x ** (a / b);
            if (b % a == 0) { 
                b = b / a;
                a = 1;
            }
            uint subTotal = (a > 1) ? x**a : x;     // calc subtotal w exp numerator, prior to rooting
            if (b == 2) return sqrt(subTotal);      // shortcut square root case
            
            // TODO: consider treating inputs differently depending on size?

            // rough binary search for pow2 bound on x
            uint8 stepSizePow = 7;
            uint8 guessMSB = 128;
            while (stepSizePow > 2) {
                stepSizePow--;
                if (1<<guessMSB > subTotal) {
                    guessMSB -= uint8(1)<<stepSizePow;
                } else {
                    guessMSB += uint8(1)<<stepSizePow;
                }
            }

            // narrow in on estimate
            if (subTotal>>guessMSB > 0) {
                while(subTotal>>guessMSB > 0) guessMSB++;
            } else {
                while(subTotal>>guessMSB == 0) guessMSB--;
                guessMSB++;
            }

            // (answer bound est) z := 2^c^ ; where c = ⌈⌈lg2(subTotal)⌉ / b⌉
            uint expBoundGuess = guessMSB / b;
            expBoundGuess += (guessMSB % b != 0) ? 1 : 0;
            uint z = (1<<expBoundGuess) - 1;
            ans = subTotal;

            uint8 b2 = b - 1;
            while (z < ans) {
                ans = z;
                z = (subTotal / z**b2 + b2 * z) / b;
            }
        }
    }

    /**
     * @dev estimates the square root of an input using Babylonian Method
     * (not much more performant on large numbers, due to lack of tight est bounding)
     * https://www.cs.utep.edu/vladik/2009/olg09-05a.pdf
     */
    function sqrt(uint x) public pure returns (uint ans) {
        unchecked {
            ans = x;
            uint est = (x + 1) / 2; // intial guess, could be improved
            while (est < ans) {
                (ans, est) = (est, (x / est + est) / 2);
            }
        }
    }
}