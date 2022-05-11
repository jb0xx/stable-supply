// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

// import "hardhat/console.sol";

library FuzzyMath {
    function fraxExp(uint x, uint8 a, uint8 b) external pure returns (uint est)  {
        // constraints
        require(b < 10, "need exponent denominator b < 10");
        require(a < 10, "need exponent numerator a < 10");
        require(x < 1000000000, "maximum input is 1e9");

        if (a % b == 0) return x ** (a / b); // shortcut this nonsense
        if (b % a == 0) (a, b) = (1, b / a); // simplify
        x = (a > 1) ? x**a : x;              // calculate subtotal with numerator        

        // calculate b-root of subtotal with generalized Babylonian Method
        // citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.569.8009&rep=rep1&type=pdf
        uint z = (x + 1) / 2; // intial guess, could be improved
        if (b == 2) {         // simplified square root case
            est = x;
            while (z < est) {
                (est, z) = (z, (x / z + z) / 2);
            }
        } else {
            uint b2 = b - 1;
            z = (z < 1000000000) ? z : 1000000000; // potentially tighter guess, answer bounded by 10e9
            est = x;
            while (z < est) {
                (est, z) = (z, (x / z**b2  + b2 * z) / b);
            }
        }
    }
}