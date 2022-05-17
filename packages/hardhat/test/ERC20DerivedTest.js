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

  it("Checking we can mint/burn to signers", async function () {
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

  // TODO: categorize this separately and add a beforeEach
  it("Linear Bonding Mechanism mints", async function () {
    // p(x) = (1/1e3) * x
    // ∫p(x)dx = P(x) = (1/2e3) * x^2^
    const mintBurnRatio = 80;
    const JournalToken = await ethers.getContractFactory("JournalToken");
    const cellBioToken = await JournalToken.deploy(
      "Cellular Biology",
      "CBIO",
      baseToken.address,
      mintBurnRatio,  // burn price : mint price
      1000,           // slope of conversion price to supply
      6               // decimals back of conversion price
    );      

    // check that mint estimate matches our expectations
    let mintAmt = ethers.utils.parseEther("10");
    let mintCost = await cellBioToken.calculateMintCost(mintAmt);
    expect(mintCost).to.equal(ethers.utils.parseEther(".05"));    // P(10) - P(0) = 1/20
    
    await baseToken.connect(signers[0]).increaseAllowance(cellBioToken.address, mintCost);

    // check that token balances change as expected upon mint
    await cellBioToken.connect(signers[0]).mint(mintAmt);
    expect(await cellBioToken.totalSupply()).to.equal(mintAmt);
    expect(await cellBioToken.balanceOf(signers[0].address)).to.equal(mintAmt);
    expect(await baseToken.balanceOf(signers[0].address)).to.equal(initialBalance.sub(mintCost));
    expect(await baseToken.balanceOf(cellBioToken.address)).to.equal(mintCost);
    
    // try minting again and ensure failure (allowance should no longer be met)
    expect(await baseToken.allowance(signers[0].address, cellBioToken.address)).to.equal(0);
    await expect(
      cellBioToken.connect(signers[0]).mint(mintAmt)
    ).to.be.revertedWith('ERC20: transfer amount exceeds allowance');



    // burn total balance, this needs to be fixed
    console.log(await baseToken.allowance(cellBioToken.address, signers[0].address));

    await cellBioToken.connect(signers[0]).burn(mintAmt);
    expect(await cellBioToken.balanceOf(signers[0].address)).to.equal(0);
    // expect(
    //   await baseToken.balanceOf(signers[0].address)
    // ).to.equal(initialBalance.sub(mintCost.mul((mintBurnRatio/100).toString)));
    
    

  }); 


});
