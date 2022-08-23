const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");

use(solidity);

const errors = {
  ERC20BurnExceedsBalance: 'ERC20: burn amount exceeds balance',
  ERC20TransferExceedsBalance: "transfer amount exceeds balance",
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
    // check total supply is correct
    expect(await baseToken.totalSupply()).to.equal(initialBalance.mul(signers.length));
    
    // burn all balances and ensure bags go to 0
    for (let i=0; i < signers.length; i++) {
      let balance = await baseToken.balanceOf(signers[i].address);
      await baseToken.burn(signers[i].address, balance);
      expect(await baseToken.balanceOf(owner.address)).to.equal(0);
    }
    expect(await baseToken.totalSupply()).to.equal(0);

    // seed a random number of wallets with a random number of tokens
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

    // ensure balances are correct
    for (let i=indexSplit; i < signers.length; i++) {
      expect(await baseToken.balanceOf(signers[i].address)).to.equal(0);
    }
    expect(await baseToken.totalSupply()).to.equal(totalSupply);
  });

  describe("Derived Token Tests (Linear)", function () {
    // p(x) = 1e-3 * x
    // ∫p(x)dx = P(x) = 5e-4 * x^2^
    let derivToken;
    const mintBurnRatio = 80;
    const priceSlope = 1000;
    const priceSlopeDecimals = 6;
    const scale = priceSlope / 10**priceSlopeDecimals;

    beforeEach(async function () {      
      const JournalToken = await ethers.getContractFactory("JournalToken");
      derivToken = await JournalToken.deploy(
        "Cellular Biology",
        "CBIO",
        baseToken.address,
        mintBurnRatio,
        priceSlope,
        priceSlopeDecimals
      );      
      await derivToken.deployed();
      // console.log("Base Token:\n\t", baseToken.address);
      // console.log("Derived Token:\n\t", derivToken.address);
      // console.log("Signer:\n\t", signers[0].address);
    });

    it.only("Initial State", async function () {
      expect(await derivToken.name()).to.equal('Cellular Biology');
      expect(await derivToken.symbol()).to.equal('CBIO');
      expect(await derivToken.reserveToken()).to.equal(baseToken.address);
      expect(await derivToken.reserveRequirement()).to.equal(0);
      expect(await derivToken.treasuryBalance()).to.equal(0);
      expect(await derivToken.priceSlope()).to.equal(priceSlope);
      expect(await derivToken.priceSlopeDecimals()).to.equal(priceSlopeDecimals);
    });

    it.only("Fiddling with Supply", async function () {
      // ensure permissioning is respected
      for (let i=0; i < signers.length; i++) {
        await expect(
          derivToken.connect(signers[i]).increaseSupply(amts[1])
        ).to.be.revertedWith(errors.Ownable);
        await expect(
          derivToken.connect(signers[i]).decreaseSupply(amts[1])
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

      let testCase, reserveRequirement, reserveReqExpected;
      for(let i=0; i < testCases.length; i++) {
        testCase = testCases[i];
        if (testCase.error == "") {
          if (testCase.dir == "+") {
            await derivToken.increaseSupply(amts[testCase.amt]);
          } else {
            await derivToken.decreaseSupply(amts[testCase.amt]);
          }
        } else {
          if (testCase.dir == "+") {
            await expect(
              derivToken.increaseSupply(amts[testCase.amt])
            ).to.be.revertedWith(testCase.error);
          } else {
            await expect(
              derivToken.decreaseSupply(amts[testCase.amt])
            ).to.be.revertedWith(testCase.error);
          }
        }
        expect(await derivToken.treasuryBalance()).to.equal(0);
        expect(await derivToken.totalSupply()).to.equal(amts[testCase.newSupply]);
        reserveReqExpected = (mintBurnRatio / 100) * scale/2 * testCase.newSupply**2; 
        reserveRequirement = await derivToken.reserveRequirement();
        expect(
          ethers.utils.parseEther(reserveReqExpected.toString())
          .sub(reserveRequirement).abs()
        ).lt(100); // allow for difference of <1e-16 (for funky float math)
      }
    });

    it.only("Tx Validity in mint/burn Flow", async function () {
      // ensure mint estimate matches our expectations
      let mintAmt = amts[10];
      let mintCost = await derivToken.calculateMintCost(mintAmt);
      expect(mintCost).to.equal(ethers.utils.parseEther(".05"));    // P(10) - P(0) = 1/20

      // ensure we cannot calculate burn return with no supply
      await expect(
        derivToken.calculateBurnReturn(mintAmt)
      ).to.be.revertedWith(errors.ERC20DerivedBurnExceeds);

      // check that token balances change as expected upon mint
      await baseToken.connect(signers[0]).increaseAllowance(derivToken.address, mintCost);
      await derivToken.connect(signers[0]).mint(mintAmt);
      expect(await derivToken.totalSupply()).to.equal(mintAmt);
      expect(await derivToken.balanceOf(signers[0].address)).to.equal(mintAmt);
      expect(await baseToken.balanceOf(signers[0].address)).to.equal(initialBalance.sub(mintCost));
      expect(await baseToken.balanceOf(derivToken.address)).to.equal(mintCost);
      
      // check allowance is depleted, ensure minting fails now
      expect(await baseToken.allowance(signers[0].address, derivToken.address)).to.equal(0);
      await expect(
        derivToken.connect(signers[0]).mint(mintAmt)
      ).to.be.revertedWith(errors.ERC20InsufficientAllowance);
      
      // ensure we cannot calculate burn exceeding supply
      for (let i=10; i>1; i--) {
        await expect(
          derivToken.calculateBurnReturn(mintAmt.mul(i))
        ).to.be.revertedWith(errors.ERC20DerivedBurnExceeds);
      }

      // ensure burn estimate is correct
      let mintRefund = await derivToken.calculateBurnReturn(mintAmt);
      expect(mintRefund).to.equal(ethers.utils.parseEther(".04"));    // .08 * (P(10)-P(0)) = 1/25

      
      // ensure correct balances after burn
      await derivToken.connect(signers[0]).burn(mintAmt);
      expect(await derivToken.balanceOf(signers[0].address)).to.equal(0);
      expect(await derivToken.totalSupply()).to.equal(0);
      expect(await baseToken.balanceOf(derivToken.address)).to.equal(mintCost.sub(mintRefund));
      expect(
        await baseToken.balanceOf(signers[0].address)
      ).to.equal(initialBalance.sub(mintCost).add(mintRefund));

      // ensure poores can't mint
      let balance;
      for (let i=0; i < signers.length; i++) {
        balance = await baseToken.balanceOf(signers[i].address);
        await baseToken.burn(signers[i].address, balance);
      }
      for (let i=0; i < signers.length; i++) {
      await baseToken.connect(signers[i]).increaseAllowance(derivToken.address, mintCost);
      await expect(
          derivToken.connect(signers[i]).mint(mintAmt)
        ).to.be.revertedWith(errors.ERC20TransferExceedsBalance);
      }
    }); 

    // Test math on valid transactions 
    it("Price Adjustments", async function () {
      // write function for calculating mint and burn prices, based on curve parameters
      function spotPrice() {}
      function mintPrice() {}
      function burnPrice() {}

      // for varying supplies
        // mint random value
        // check spot price
        // check aggregate burn refund for various values
      
      // for varying supplies
        // burn random value
        // check spot price
        // check aggregate mint price for various values 
    }); 
  });
});
