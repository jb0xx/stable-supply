const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");
const { composeP } = require("ramda");

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
      expect(await fuzzyMath.fraxExp(square, 1, 2)).to.equal(n);
      gasEst = await fuzzyMath.estimateGas.fraxExp(square, 1, 2) - 21000;
      console.log(`x: ${square}, Gas: ${gasEst}`); // if it passes, our guess is the answer
    }
  });

  it("Perfect Cube Roots", async function () {
    let n, cube;
    for (let i = 1; fibs[i] < 10 ** 3; i++) {
      n = fibs[i];
      cube = n ** 3;
      expect(await fuzzyMath.fraxExp(cube, 1, 3)).to.equal(n);
      gasEst = await fuzzyMath.estimateGas.fraxExp(cube, 1, 3) - 21000;
      console.log(`x: ${cube}, Gas: ${gasEst}`); // if it passes, our guess is the answer
    }
  });

  it("Imperfect n-roots", async function () {
    let input, guess, gasEst, gasSum, numCases;
    
    for (let n=2; n < 10; n++) {
      console.log(`\n\n==============Testing x^(1/${n})==============`);
      gasSum = 0, numCases = 0;
      index = 1, input = fibs[index];
      while (input < 10 ** 9) {
        // console.log(`\nInput: ${input}`);
        guess = Math.floor(Math.pow(input, 1/n));
        expect(await fuzzyMath.fraxExp(input, 1, n)).to.equal(guess);
        
        gasEst = await fuzzyMath.estimateGas.fraxExp(input, 1, n) - 21000;
        // console.log(`  Gas: ${gasEst} Ans: ${guess}`); // if it passes, our guess is the answer
        gasSum += gasEst;
        input = fibs[++index];
        numCases++;
      }
      console.log(`Avg Gas Usage: ${gasSum/numCases} (across ${numCases} cases)`);
    }
  });

  it("Perfect Roots w Arbitrary Fractional Exponents", async function () {
    let input, guess, gasEst, gasSum, numCases;
  
    for (let b = 2; b < 10; b++) {
      console.log(`\n\n==============Testing x^(m/${b}) Cases==============`);
      for (let a = 1; a < 10; a++) {
        console.log(`\nTesting x^(${a}/${b})`);
        gasSum = 0, numCases = 0;
        for (let x = 1; x < 10; x++) {
          input = x ** b;
          // console.log(`\nb: ${b}, a: ${a}, input: ${input}`);
          guess = Math.floor(Math.pow(input, a/b));
          expect(await fuzzyMath.fraxExp(input, a, b)).to.equal(x ** a);
          
          gasEst = await fuzzyMath.estimateGas.fraxExp(input, a, b) - 21000;
          // console.log(`  Gas: ${gasEst} Ans: ${guess}`); // if it passes, our guess is the answer
          gasSum += gasEst;
          numCases++;
        }
        console.log(`Avg Gas Usage: ${gasSum/numCases} (across ${numCases} cases)`);
      }
    }
  });
});
