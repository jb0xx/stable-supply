const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");

use(solidity);

describe("Testing Tokens", function () {
  const initialBalance = ethers.utils.parseEther("10000");
  const zeroBalance = ethers.utils.parseEther("0");
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
      await baseToken.burn(signers[i].address, balance);    // the fact that anyone can busn anyone else's balance is an issue lol
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

  describe("Derived Token Tests", function () {
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

      console.log("Base Token:\n\t", baseToken.address);
      console.log("Derived Token:\n\t", cellBioToken.address);
      console.log("Signer:\n\t", signers[0].address);
    });

    it.only("Derived Token: Linear Mechanism (single)", async function () {
      // ensure mint estimate matches our expectations
      let mintAmt = ethers.utils.parseEther("10");
      let mintCost = await cellBioToken.calculateMintCost(mintAmt);
      console.log(`mintCost: ${mintCost}`);
      expect(mintCost).to.equal(ethers.utils.parseEther(".05"));    // P(10) - P(0) = 1/20

      // ensure we cannot burn with no supply
      await expect(
        cellBioToken.calculateBurnReturn(mintAmt)
      ).to.be.revertedWith("ERC20Derived: burn > supply");

      // check that token balances change as expected upon mint
      await baseToken.connect(signers[0]).increaseAllowance(cellBioToken.address, mintCost);
      await cellBioToken.connect(signers[0]).mint(mintAmt);
      expect(await cellBioToken.totalSupply()).to.equal(mintAmt);
      expect(await cellBioToken.balanceOf(signers[0].address)).to.equal(mintAmt);
      expect(await baseToken.balanceOf(signers[0].address)).to.equal(initialBalance.sub(mintCost));
      expect(await baseToken.balanceOf(cellBioToken.address)).to.equal(mintCost);
      
      // try minting again and ensure failure (allowance should no longer be met)
      expect(await baseToken.allowance(signers[0].address, cellBioToken.address)).to.equal(0);
      await expect(
        cellBioToken.connect(signers[0]).mint(mintAmt)
      ).to.be.revertedWith('ERC20: insufficient allowance');
      
      // ensure burn estimate is correct
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
    }); 
  });
});
