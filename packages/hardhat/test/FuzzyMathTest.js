const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");

use(solidity);

// n must be greater than 0
function fibonacciArray(n) {
  let list = new Array(n);
  list[0] = 1;
  if (n > 1) list[1] = 1;
  for(i = 2; i < n; i++) list[i] = list[i-1] + list[i-2];

  return list;
}
let fibs = fibonacciArray(100);

describe("Testing FuzzyMath", function () {
  let fuzzyMath;

  beforeEach(async function () {
    const FuzzyMath = await ethers.getContractFactory("FuzzyMath");
    fuzzyMath = await FuzzyMath.deploy();
    await fuzzyMath.deployed();
  });

  it("Perfect Squares", async function () {
    let n, square;
    for (let i = 1; fibs[i] < 3 * 10 ** 4; i++) {
      n = fibs[i];
      square = n ** 2;
      // console.log("\tinput: ", n);
      expect(await fuzzyMath.fraxExp(square, 1, 2)).to.equal(n);
    }
  });

  it("Perfect Cube Roots", async function () {
    let n, cube;
    for (let i = 1; fibs[i] < 10 ** 3; i++) {
      n = fibs[i];
      cube = n ** 3;
      // console.log("\tinput: ", n)
      expect(await fuzzyMath.fraxExp(cube, 1, 3)).to.equal(n);
    }
  });

  it("Imperfect Square Roots", async function () {
    let guess, index = 1, input = fibs[1];
    while (input < 10 ** 9) {
      guess = Math.floor(Math.sqrt(input));
      // console.log("input:", input, "\tguess:", guess);
      expect(await fuzzyMath.fraxExp(input, 1, 2)).to.equal(guess);      
      input = fibs[++index];
    }
  });

  it("Imperfect Cube Roots", async function () {
    let guess, index = 1, input = fibs[1];
    while (input < 10 ** 9) {
      guess = Math.floor(Math.cbrt(input));
      // console.log("input:", input, "\tguess:", guess);
      expect(await fuzzyMath.fraxExp(input, 1, 3)).to.equal(guess);      
      input = fibs[++index];
    }
  });

  it("Perfect Roots w Arbitrary Fractional Exponents", async function () {
    let input;
    for (let b = 2; b < 10; b++) {
      // console.log(`testing perfect ${b}-roots for all values a..`);
      for (let a = 1; a < 10; a++) {
        for (let i = 1; i < 10; i++) {
          input = i ** b;
          // console.log(`\tb: ${b}, a: ${a}, input: ${input}`);
          expect(await fuzzyMath.fraxExp(input, a, b)).to.equal(i ** a);
        }
      }
    }
  });
});
