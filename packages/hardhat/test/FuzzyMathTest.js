const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");

use(solidity);

// n must be greater than 0
function fibonacciArray(n) {
  let list = new Array(n);
  list[0] = 1;

  if (n > 1) {
    list[1] = 1;
    for(i = 2; i < n; i++) list[i] = list[i-1] + list[i-2];
  }
  return list;
}

let fibs = fibonacciArray(27);

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
      console.log("\tinput: ", n)
      expect(await fuzzyMath.fraxExp(square, 1, 2)).to.equal(n);
    }
  });

  it.only("Perfect Cubic Roots", async function () {
    let n, cube;
    
    for (let i = 1; fibs[i] < 10 ** 3; i++) {
      n = fibs[i];
      cube = n ** 3;
      console.log("\tinput: ", n)
      expect(await fuzzyMath.fraxExp(cube, 1, 3)).to.equal(n);
    }
  });

  it("Perfect Roots w Arbitrary Fractional Exponents", async function () {
    // test all valid single-digit pairs of a and b on i^b for i [2,9]
    let input;
    for (let b = 2; b < 10; b++) {
      // console.log(`testing perfect ${b}-roots for all values a..`);
      for (let a = 1; a < 10; a++) {
        for (let i = 1; i < 10; i++) {
          input = i ** b;
          console.log(`\tb: ${b}, a: ${a}, input: ${input}`);
          expect(await fuzzyMath.fraxExp(input, a, b)).to.equal(i ** a);
        }
      }
    }
  });

  // it("single test", async function () {
  //   expect(await fuzzyMath.fraxExp(4782969, 8, 7)).to.equal(8);
  // });
  it("Square Roots w Numbers (imperfect)", async function () {
    for (let n = 1; n < 10 ** 9; n += n) {
      console.log("n:", n);
      let guess = Math.floor(Math.sqrt(n));
      console.log("guess:", guess);

      expect(await fuzzyMath.fraxExp(n, 1, 2)).to.equal(guess);
    }
  });



});
