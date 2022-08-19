const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");

use(solidity);

const errors = {
  ERC20BurnExceedsBalance: 'ERC20: burn amount exceeds balance',
  ERC20InsufficientAllowance: 'ERC20: insufficient allowance',
  ERC20DerivedBurnExceeds: 'ERC20Derived: burn > supply',
  Ownable: 'Ownable: caller is not the owner',

};

function getTokenAmts(start, end) {
  const valMap = new Map();
  for(let i = start; i <= end; i++) {
    valMap[i] = ethers.utils.parseEther(i.toString());
  }
  return valMap;
}

describe("Testing Tokens", function () {
  const initialBalance = ethers.utils.parseEther("10000");
  let amts = getTokenAmts(0, 20);
  let BaseToken, baseToken;

  beforeEach(async function () {
    BaseToken = await ethers.getContractFactory("BaseToken");
    [owner, ...signers] = await ethers.getSigners();
    baseToken = await BaseToken.deploy();
    await baseToken.deployed();

    // seed all signers with an initialBalance (aside from owner)
    for(let i=0; i < signers.length; i++) {
      await baseToken.mint(signers[i].address, initialBalance);
    }
  });

  it("Base Token: mint/burn", async function () {
    // check total supply then burn all balances to start over
    expect(await baseToken.totalSupply()).to.equal(initialBalance.mul(signers.length));
    for (let i=0; i < signers.length; i++) {
      let balance = await baseToken.balanceOf(signers[i].address);
      await baseToken.burn(signers[i].address, balance);
      expect(await baseToken.balanceOf(owner.address)).to.equal(0);
    }
    expect(await baseToken.totalSupply()).to.equal(0);

    // seed a random number of wallets with a random number of tokens
    // ensure balances are correct
    let totalSupply = initialBalance;
    await baseToken.mint(owner.address, initialBalance);
    expect(await baseToken.balanceOf(owner.address)).to.equal(initialBalance);

    let seedBalance; 
    const indexSplit = Math.floor(Math.random() * signers.length);
    for (let i=0; i < indexSplit; i++) {
      seedBalance = ethers.utils.parseEther(
        Math.floor(Math.random() * 1000).toString()
      );
      await baseToken.mint(signers[i].address, seedBalance);
      expect(await baseToken.balanceOf(signers[i].address)).to.equal(seedBalance);
      totalSupply = totalSupply.add(seedBalance);
    }
    for (let i=indexSplit; i < signers.length; i++) {
      expect(await baseToken.balanceOf(signers[i].address)).to.equal(0);
    }
    expect(await baseToken.totalSupply()).to.equal(totalSupply);
  });

  describe("Derived Token Tests (Linear)", function () {
    // p(x) = 1e-3 * x
    // ∫p(x)dx = P(x) = 5e-4 * x^2^
    let cellBioToken;
    const mintBurnRatio = 80;
    const priceSlope = 1000;
    const priceSlopeDecimals = 6;

    beforeEach(async function () {      
      const JournalToken = await ethers.getContractFactory("JournalToken");
      cellBioToken = await JournalToken.deploy(
        "Cellular Biology",
        "CBIO",
        baseToken.address,
        mintBurnRatio,
        priceSlope,
        priceSlopeDecimals
      );      
      await cellBioToken.deployed();
      // console.log("Base Token:\n\t", baseToken.address);
      // console.log("Derived Token:\n\t", cellBioToken.address);
      // console.log("Signer:\n\t", signers[0].address);
    });

    it.only("Checking Initial State", async function () {
      expect(await cellBioToken.name()).to.equal('Cellular Biology');
      expect(await cellBioToken.symbol()).to.equal('CBIO');
      expect(await cellBioToken.reserveToken()).to.equal(baseToken.address);
      expect(await cellBioToken.reserveRequirement()).to.equal(0);
      expect(await cellBioToken.treasuryBalance()).to.equal(0);
      expect(await cellBioToken.priceSlope()).to.equal(priceSlope);
      expect(await cellBioToken.priceSlopeDecimals()).to.equal(priceSlopeDecimals);
    });

    it.only("Fiddling with Supply", async function () {
      // ensure permissioning is respected
      for (let i=0; i < signers.length; i++) {
        await expect(
          cellBioToken.connect(signers[i]).increaseSupply(amts[1])
        ).to.be.revertedWith(errors.Ownable);
        await expect(
          cellBioToken.connect(signers[i]).decreaseSupply(amts[1])
        ).to.be.revertedWith(errors.Ownable);
      }

      // adjust supply as owner
      let testCases = [
        {dir: "+", amt: 10, newSupply: 10, error:""},
        {dir: "+", amt: 5, newSupply: 15, error:""},
        {dir: "-", amt: 3, newSupply: 12, error:""},
        {dir: "+", amt: 1, newSupply: 13, error:""},
        {dir: "-", amt: 5, newSupply: 8, error:""},
        {dir: "-", amt: 9, newSupply: 8, error:errors.ERC20BurnExceedsBalance},
        {dir: "+", amt: 7, newSupply: 15, error:""},
        {dir: "-", amt: 6, newSupply: 9, error:""},
        {dir: "-", amt: 8, newSupply: 1, error:""},
        {dir: "-", amt: 3, newSupply: 1, error:errors.ERC20BurnExceedsBalance},
        {dir: "-", amt: 1, newSupply: 0, error:""},
      ];

      let testCase, reserveRequirement, reserveReqExpected, resReqExpectedBigNum;
      for(let i=0; i < testCases.length; i++) {
        testCase = testCases[i];
        if (testCase.error == "") {
          if (testCase.dir == "+") {
            await cellBioToken.increaseSupply(amts[testCase.amt]);
          } else {
            await cellBioToken.decreaseSupply(amts[testCase.amt]);
          }
        } else {
          if (testCase.dir == "+") {
            await expect(
              cellBioToken.increaseSupply(amts[testCase.amt])
            ).to.be.revertedWith(testCase.error);
          } else {
            await expect(
              cellBioToken.decreaseSupply(amts[testCase.amt])
            ).to.be.revertedWith(testCase.error);
          }
        }
        expect(await cellBioToken.treasuryBalance()).to.equal(0);
        expect(await cellBioToken.totalSupply()).to.equal(amts[testCase.newSupply]);
        reserveReqExpected = (mintBurnRatio / 100) * (priceSlope / 10**priceSlopeDecimals)/2 * testCase.newSupply**2; 
        resReqExpectedBigNum = ethers.utils.parseEther(reserveReqExpected.toString());
        reserveRequirement = await cellBioToken.reserveRequirement();
        expect(resReqExpectedBigNum.sub(reserveRequirement).abs()).lt(100); // this actually represents a difference of lt 1e-16
      }
    });

    it.only("Single mint/burn Flow, Detailed", async function () {
      // ensure mint estimate matches our expectations
      let mintAmt = amts[10];
      let mintCost = await cellBioToken.calculateMintCost(mintAmt);
      expect(mintCost).to.equal(ethers.utils.parseEther(".05"));    // P(10) - P(0) = 1/20

      // ensure we cannot calculate burn return with no supply
      await expect(
        cellBioToken.calculateBurnReturn(mintAmt)
      ).to.be.revertedWith(errors.ERC20DerivedBurnExceeds);

      // check that token balances change as expected upon mint
      await baseToken.connect(signers[0]).increaseAllowance(cellBioToken.address, mintCost);
      await cellBioToken.connect(signers[0]).mint(mintAmt);
      expect(await cellBioToken.totalSupply()).to.equal(mintAmt);
      expect(await cellBioToken.balanceOf(signers[0].address)).to.equal(mintAmt);
      expect(await baseToken.balanceOf(signers[0].address)).to.equal(initialBalance.sub(mintCost));
      expect(await baseToken.balanceOf(cellBioToken.address)).to.equal(mintCost);
      
      // check allowance is depleted, ensure minting fails now
      expect(await baseToken.allowance(signers[0].address, cellBioToken.address)).to.equal(0);
      await expect(
        cellBioToken.connect(signers[0]).mint(mintAmt)
      ).to.be.revertedWith(errors.ERC20InsufficientAllowance);
      
      // ensure we cannot calculate burn exceeding supply
      await expect(
        cellBioToken.calculateBurnReturn(mintAmt.mul(2))
      ).to.be.revertedWith(errors.ERC20DerivedBurnExceeds);

      // ensure burn estimates are correct
      // TODO: add more test cases
      let mintRefund = await cellBioToken.calculateBurnReturn(mintAmt);
      expect(mintRefund).to.equal(ethers.utils.parseEther(".04"));    // .08 * (P(10) - P(0)) = 1/25

      // ensure correct balances after burn
      await cellBioToken.connect(signers[0]).burn(mintAmt);
      expect(await cellBioToken.balanceOf(signers[0].address)).to.equal(0);
      expect(await cellBioToken.totalSupply()).to.equal(0);
      expect(await baseToken.balanceOf(cellBioToken.address)).to.equal(mintCost.sub(mintRefund));
      expect(
        await baseToken.balanceOf(signers[0].address)
      ).to.equal(initialBalance.sub(mintCost).add(mintRefund));

      // TODO: ensure poores can't mint

    }); 
  });
});
