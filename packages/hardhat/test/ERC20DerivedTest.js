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

//so sick of typing this out
function parseEther(n) {return ethers.utils.parseEther(n);}

function reverseParse(n) {return n.div(10**9).div(10**9).toNumber();}

// retrieves parseEther translations of a set of values
function getTokenAmts(start, end) {
  const valMap = new Map();
  for(let i = start; i <= end; i++) {
    valMap[i] = parseEther(i.toString());
  }
  return valMap;
}

describe("Testing Tokens", function () {
  const initialBalance = parseEther("10000");
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
      seedBalance = parseEther(
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

    function spotPrice(supply) { return scale * supply; }
    function areaUnderCurve(supply) {
      return scale / 2 * supply * supply;
    }
    function mintTotal(supply, amt) {
      return areaUnderCurve(amt+supply) - areaUnderCurve(supply);
    }
    function burnTotal(supply, amt) {
      return mintBurnRatio / 100 * (areaUnderCurve(supply) - areaUnderCurve(supply-amt));
    }


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

    it("Initial State", async function () {
      expect(await derivToken.name()).to.equal('Cellular Biology');
      expect(await derivToken.symbol()).to.equal('CBIO');
      expect(await derivToken.reserveToken()).to.equal(baseToken.address);
      expect(await derivToken.reserveRequirement()).to.equal(0);
      expect(await derivToken.treasuryBalance()).to.equal(0);
      expect(await derivToken.priceSlope()).to.equal(priceSlope);
      expect(await derivToken.priceSlopeDecimals()).to.equal(priceSlopeDecimals);
    });

    it("Fiddling with Supply", async function () {
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

      let testCase, reserveReq, reserveReqExpected;
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
        reserveReqExpected = (mintBurnRatio / 100) * areaUnderCurve(testCase.newSupply); 
        reserveReq = await derivToken.reserveRequirement();
        expect(parseEther(reserveReqExpected.toFixed(12))).to.equal(reserveReq);
      }
    });

    it("Tx Validity in mint/burn Flow", async function () {
      // ensure mint estimate matches our expectations
      let mintAmtRaw = 10;
      let mintAmt = amts[mintAmtRaw];
      let mintCost = await derivToken.calculateMintCost(mintAmt);
      expect(mintCost).to.equal(parseEther(".05"));    // P(10) - P(0) = 1/20

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
      let burnRefundExpected = burnTotal(mintAmtRaw, mintAmtRaw).toFixed(12);
      let burnRefund = await derivToken.calculateBurnReturn(mintAmt);
      expect(burnRefund).to.equal(parseEther(burnRefundExpected));

      // ensure correct balances after burn
      await derivToken.connect(signers[0]).burn(mintAmt);
      expect(await derivToken.balanceOf(signers[0].address)).to.equal(0);
      expect(await derivToken.totalSupply()).to.equal(0);
      expect(await baseToken.balanceOf(derivToken.address)).to.equal(mintCost.sub(burnRefund));
      expect(
        await baseToken.balanceOf(signers[0].address)
      ).to.equal(initialBalance.sub(mintCost).add(burnRefund));

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
    it("Mint/Burn Price Accuracy", async function () {
      const allowance = parseEther((10**12).toString());

      // increment (mint) side, random decrement checks per loop
      let mintAmtRaw, mintAmt, totalSupplyRaw = 0;
      for (let i=0; i<10; i++) {
        await baseToken.connect(signers[i]).increaseAllowance(derivToken.address, allowance);
 
        // mint random value
        mintAmtRaw = Math.floor(Math.random() * 1000);
        mintAmt = parseEther(mintAmtRaw.toString());
        await derivToken.connect(signers[i]).mint(mintAmt);
        expect(await derivToken.balanceOf(signers[i].address)).to.equal(mintAmt);

        // check spot price
        totalSupplyRaw += mintAmtRaw;
        expect(
          await derivToken.exchangeRate()
        ).to.equal(parseEther(spotPrice(totalSupplyRaw).toFixed(9)));

        // // Debugging testcases
        // let treasuryBalance = await derivToken.treasuryBalance();
        // let reserveRequirement = await derivToken.reserveRequirement();
        // let areaUnderCurve = await derivToken.areaUnderCurve(parseEther(totalSupplyRaw.toString()));
        // console.log(`--Mint Loop ${i}--`);
        // console.log(`  Total Supply: ${totalSupplyRaw}`);
        // console.log(`  Total Treasury: ${reverseParse(treasuryBalance)}`);
        // console.log(`  Total Reserve: ${reverseParse(reserveRequirement)}`);
        // console.log(`  Area Under Curve: ${reverseParse(areaUnderCurve)}`);

        // check burn refund at this supply for various amounts
        let burnAmtRaw, burnRefund, burnRefExpected;
        for (let j=0; j<10; j++) {
          burnAmtRaw = Math.floor(Math.random() * totalSupplyRaw);
          burnRefExpectedRaw = burnTotal(totalSupplyRaw, burnAmtRaw);
          burnRefExpected = parseEther(burnRefExpectedRaw.toFixed(9)); 
          burnRefund = await derivToken.calculateBurnReturn(parseEther(burnAmtRaw.toString()));
          expect(burnRefund).to.equal(burnRefExpected);
        }

      }

      // decrement (burn) side, random increment checks per loop
      let currBalance, burnAmtRaw, burnAmt;
      for (let i=0; i<10; i++) {
 
        // burn ~half of signer's balance
        currBalance = await derivToken.balanceOf(signers[i].address);
        burnAmtRaw = Math.floor(currBalance.div(10**15).div(2).toNumber()/1000);
        burnAmt = parseEther(burnAmtRaw.toString());
        await derivToken.connect(signers[i]).burn(burnAmt);
        expect(await derivToken.balanceOf(signers[i].address)).to.equal(currBalance.sub(burnAmt));
        
        // check spot price
        totalSupplyRaw -= burnAmtRaw;
        expect(
          await derivToken.exchangeRate()
        ).to.equal(parseEther(spotPrice(totalSupplyRaw).toFixed(9)));

        // check mint cost at this supply for various amounts
        let mintCost, mintCostExpected;
        for (let j=0; j<10; j++) {
          mintAmtRaw = Math.floor(Math.random() * totalSupplyRaw);
          mintCostExpectedRaw = mintTotal(totalSupplyRaw, mintAmtRaw);
          mintCostExpected = parseEther(mintCostExpectedRaw.toFixed(9)); 
          mintCost = await derivToken.calculateMintCost(parseEther(mintAmtRaw.toString()));
          expect(mintCost).to.equal(mintCostExpected);
        }
      }
    });


  });
});
