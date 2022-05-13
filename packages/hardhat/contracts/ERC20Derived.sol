//SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol"; 
import "@openzeppelin/contracts/token/ERC20/ERC20.sol"; 
// import "@openzeppelin/contracts/token/ERC20/IERC20.sol"; 

/**
 * @dev extension of ERC20 that allows anyone to mint or burn the supply of
 * this token against a reserve token (RT), directly from this contract. The
 * shape of the bonding curve is not assumed and must be implemented through
 * _areaUnderCurve() and _exchangeRate().
 *
 * At a given total supply, the mint curve acts as a price ceiling on the open
 * market value of this token WRT the RT, and the burn curve acts as a floor.
 * The burn curve is a scalar multiple [0, 1] of the mint curve, and any scalar
 * multiple <1 introduces a difference between the contract's treasury balance
 * and the reserve requirement to be solvent against full liquidation. The
 * contract owner is granted full access to these excess funds.
 *
 * tl;dr
 *   - public mint/burn of token against reserve token
 *   - price window at given total supply (stabilization)
 *   - supply-side adjustment based on market demand (more stabilization) 
 *   - treasury seeding with portion of deposited funds
 */
abstract contract ERC20Derived is ERC20, Ownable {
    ERC20 private _reserveToken;
    uint private _reserveRequirement;   // current reserve requirement, denominated in reserve token, with matching decimals
    uint private _priceWindowRatio;     // mint-to-burn ratio of derived<->reserve, denominated as percent

    constructor(
        string memory name_,
        string memory symbol_,
        address reserveTokenAddr_,
        uint priceWindowRatio_
    ) ERC20(name_, symbol_) {
        _reserveToken = ERC20(reserveTokenAddr_);
        _priceWindowRatio = priceWindowRatio_;
    }

    /**
     * @dev returns the reserve token used by the mint/burn mechanism
     */
    function reserveToken() public view returns (ERC20) {
        return _reserveToken;
    }
    
    /**
     * @dev returns the current balance of reserve tokens held in the treasury
     */
    function treasuryBalance() public view returns (uint) {
        return _reserveToken.balanceOf(address(this));
    }

    /**
     * @dev returns this token's balance requirement of the reserve token.
     * This is implemented by referencing updated contract data, rather than 
     * live calculation as we expect since we expect (updates << references).
     */
    function reserveRequirement() public view returns (uint) {
        return _reserveRequirement;
    }

    /**
     * @dev calculates the cost of minting this token WRT reserve token
     * NOTE: these calculations could be better optimized since updating the
     *   reserve requirement already requires us to calculate the area under the
     *   curve of the new supply 
     */
    function calculateMintCost(uint amount) public view virtual returns (uint) {
       return _areaUnderCurve(totalSupply() + amount) - _areaUnderCurve(totalSupply());
    }

    /**
     * @dev calculates the return of burning this token WRT reserve token
     * NOTE: these calculations could be better optimized since updating the
     *   reserve requirement already requires us to calculate the area under the
     *   curve of the new supply 
     */
    function calculateBurnReturn(uint amount) public view virtual returns (uint) {
       return _priceWindowRatio * (
           _areaUnderCurve(totalSupply()) 
           - _areaUnderCurve(totalSupply() - amount)
        ) / 100;
    }

    /**
     * @dev returns the exchange rate of this derived token in respect to the
     * reserve token, at the current supply
     */
    function exchangeRate() public view virtual returns (uint) {
        return _exchangeRate(totalSupply());
    }

    /**
     * @dev mints the specified amount of tokens, given the caller has the
     * requisite balance of the reserve token required for mint.
     * NOTE: these calculations could be better optimized since updating the
     *   reserve requirement already requires us to calculate the area under the
     *   curve of the new supply 
     */
    function mint(uint amount) external virtual {
        uint requiredDeposit = calculateMintCost(amount);
        _reserveToken.transferFrom(_msgSender(), address(this), requiredDeposit);   // RT allowance checks run implicitly on transfer
        _mint(_msgSender(), amount);                                                // transfer the purchased balance of this token to caller
        _updateReserveRequirement();
    }

    /**
     * @dev burns the specified amount of this token from the callers wallet.
     * The caller is then refunded the amount due in the reserve token.
     * NOTE: these calculations could be better optimized since updating the
     *   reserve requirement already requires us to calculate the area under the
     *   curve of the new supply 
     */
    function burn(uint amount) external virtual {
        _burn(_msgSender(), amount);                                        // RT requisite checks run implicitly
        uint refund = calculateBurnReturn(amount);
        _reserveToken.transferFrom(address(this), _msgSender(), refund);    // return the refund due
        _updateReserveRequirement();
    }

    /**
     * @dev allows the owner of the contract to withdraw any treasury funds in
     * excess of the reserve requirement (denominated in the reserve token).
     */
    function withdraw(uint amount) external virtual onlyOwner {
        require(amount <= treasuryBalance() - _reserveRequirement);
        _reserveToken.transferFrom(address(this), _msgSender(), amount);
    }

    /**
     * @dev calculates and updates the reserve requirement, given current supply
     * Q: should this be private to circumvent future fuckery?
     */
    function _updateReserveRequirement() internal virtual {
        uint value = _priceWindowRatio * _areaUnderCurve(totalSupply()) / 100;
        emit ReserveRequirementUpdated(_msgSender(), value);
        _reserveRequirement = value;
    }

    /**
     * @dev integrates the mint curve across the domain [0, supply]. Answers
     * should be returned with the same decimals as reserve token
     */
    function _areaUnderCurve(uint supply) internal view virtual returns (uint);

    /**
     * @dev calculates the current exchange rate of this derived token,
     * against the reserve token at the given supply
     */
    function _exchangeRate(uint supply) internal view virtual returns (uint);


    /**
     * Events
     */
    event ReserveRequirementUpdated(address updater, uint value);
}
