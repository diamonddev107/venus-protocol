pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "../VBep20.sol";
import "../VToken.sol";
import "../PriceOracle.sol";
import "../EIP20Interface.sol";
import "../Governance/GovernorAlpha.sol";
import "../Governance/XVS.sol";
import "../Comptroller.sol";
import "../SafeMath.sol";

interface LensInterface {
    function markets(address) external view returns (bool, uint);
    function oracle() external view returns (PriceOracle);
    function getAccountLiquidity(address) external view returns (uint, uint, uint);
    function getAssetsIn(address) external view returns (VToken[] memory);
    function claimVenus(address) external;
    function venusAccrued(address) external view returns (uint);
}

contract VenusLens {

    using SafeMath for uint;

    /// @notice Blocks Per Day
    uint public constant BLOCKS_PER_DAY = 28800;

    /// @notice comptrollerAddress
    address public comptrollerAddress;

    constructor(address _comptrollerAddress) public {
        comptrollerAddress = _comptrollerAddress;
    }

    struct VTokenMetadata {
        address vToken;
        uint exchangeRateCurrent;
        uint supplyRatePerBlock;
        uint borrowRatePerBlock;
        uint reserveFactorMantissa;
        uint totalBorrows;
        uint totalReserves;
        uint totalSupply;
        uint totalCash;
        bool isListed;
        uint collateralFactorMantissa;
        address underlyingAssetAddress;
        uint vTokenDecimals;
        uint underlyingDecimals;
        uint venusSupplySpeed;
        uint venusBorrowSpeed;
        uint dailySupplyXvs;
        uint dailyBorrowXvs;
    }

    function vTokenMetadata(VToken vToken) public returns (VTokenMetadata memory) {
        uint exchangeRateCurrent = vToken.exchangeRateCurrent();
        address comptrollerAddress = address(vToken.comptroller());
        LensInterface comptroller = LensInterface(comptrollerAddress);
        (bool isListed, uint collateralFactorMantissa) = comptroller.markets(address(vToken));
        address underlyingAssetAddress;
        uint underlyingDecimals;

        if (compareStrings(vToken.symbol(), "vBNB")) {
            underlyingAssetAddress = address(0);
            underlyingDecimals = 18;
        } else {
            VBep20 vBep20 = VBep20(address(vToken));
            underlyingAssetAddress = vBep20.underlying();
            underlyingDecimals = EIP20Interface(vBep20.underlying()).decimals();
        }

        Comptroller comptrollerInstance = Comptroller(comptrollerAddress);
        uint venusSpeed_Per_Block = comptrollerInstance.venusSpeeds(address(vToken));

        return VTokenMetadata({
            vToken: address(vToken),
            exchangeRateCurrent: exchangeRateCurrent,
            supplyRatePerBlock: vToken.supplyRatePerBlock(),
            borrowRatePerBlock: vToken.borrowRatePerBlock(),
            reserveFactorMantissa: vToken.reserveFactorMantissa(),
            totalBorrows: vToken.totalBorrows(),
            totalReserves: vToken.totalReserves(),
            totalSupply: vToken.totalSupply(),
            totalCash: vToken.getCash(),
            isListed: isListed,
            collateralFactorMantissa: collateralFactorMantissa,
            underlyingAssetAddress: underlyingAssetAddress,
            vTokenDecimals: vToken.decimals(),
            underlyingDecimals: underlyingDecimals,
            venusSupplySpeed: venusSpeed_Per_Block,
            venusBorrowSpeed: venusSpeed_Per_Block,
            dailySupplyXvs: venusSpeed_Per_Block * BLOCKS_PER_DAY,
            dailyBorrowXvs: venusSpeed_Per_Block * BLOCKS_PER_DAY
        });
    }

    function vTokenMetadataAll(VToken[] calldata vTokens) external returns (VTokenMetadata[] memory) {
        uint vTokenCount = vTokens.length;
        VTokenMetadata[] memory res = new VTokenMetadata[](vTokenCount);
        for (uint i = 0; i < vTokenCount; i++) {
            res[i] = vTokenMetadata(vTokens[i]);
        }
        return res;
    }

    function getAggregatedVenusSpeedAndSupply() external view returns (uint venusSupplySpeed, uint venusBorrowSpeed, uint dailySupplyXvs, uint dailyBorrowXvs) {

        Comptroller comptrollerInstance = Comptroller(comptrollerAddress);
        VToken[] memory vTokens = comptrollerInstance.getAllMarkets();
        uint venusSpeed_Per_Block_Sum = 0;
        uint256 numberOfVTokens = vTokens.length;
        
        for (uint i = 0; i < vTokens.length; i++) {
            VToken vToken = vTokens[i];
            uint venusSpeedPerBlock = comptrollerInstance.venusSpeeds(address(vToken));
            venusSpeed_Per_Block_Sum += venusSpeedPerBlock;
        }

        uint venusSpeedAggregated = venusSpeed_Per_Block_Sum.div(numberOfVTokens);
        venusSupplySpeed = venusSpeedAggregated;
        venusBorrowSpeed = venusSpeedAggregated;
        
        uint dailyXvs = venusSpeedAggregated * BLOCKS_PER_DAY;
        dailySupplyXvs = dailyXvs;
        dailyBorrowXvs = dailyXvs;

        return (venusSupplySpeed, venusBorrowSpeed, dailySupplyXvs, dailyBorrowXvs);
    }


    struct VTokenBalances {
        address vToken;
        uint balanceOf;
        uint borrowBalanceCurrent;
        uint balanceOfUnderlying;
        uint tokenBalance;
        uint tokenAllowance;
    }

    function vTokenBalances(VToken vToken, address payable account) public returns (VTokenBalances memory) {
        uint balanceOf = vToken.balanceOf(account);
        uint borrowBalanceCurrent = vToken.borrowBalanceCurrent(account);
        uint balanceOfUnderlying = vToken.balanceOfUnderlying(account);
        uint tokenBalance;
        uint tokenAllowance;

        if (compareStrings(vToken.symbol(), "vBNB")) {
            tokenBalance = account.balance;
            tokenAllowance = account.balance;
        } else {
            VBep20 vBep20 = VBep20(address(vToken));
            EIP20Interface underlying = EIP20Interface(vBep20.underlying());
            tokenBalance = underlying.balanceOf(account);
            tokenAllowance = underlying.allowance(account, address(vToken));
        }

        return VTokenBalances({
            vToken: address(vToken),
            balanceOf: balanceOf,
            borrowBalanceCurrent: borrowBalanceCurrent,
            balanceOfUnderlying: balanceOfUnderlying,
            tokenBalance: tokenBalance,
            tokenAllowance: tokenAllowance
        });
    }

    function vTokenBalancesAll(VToken[] calldata vTokens, address payable account) external returns (VTokenBalances[] memory) {
        uint vTokenCount = vTokens.length;
        VTokenBalances[] memory res = new VTokenBalances[](vTokenCount);
        for (uint i = 0; i < vTokenCount; i++) {
            res[i] = vTokenBalances(vTokens[i], account);
        }
        return res;
    }

    struct VTokenUnderlyingPrice {
        address vToken;
        uint underlyingPrice;
    }

    function vTokenUnderlyingPrice(VToken vToken) public view returns (VTokenUnderlyingPrice memory) {
        LensInterface comptroller = LensInterface(address(vToken.comptroller()));
        PriceOracle priceOracle = comptroller.oracle();

        return VTokenUnderlyingPrice({
            vToken: address(vToken),
            underlyingPrice: priceOracle.getUnderlyingPrice(vToken)
        });
    }

    function vTokenUnderlyingPriceAll(VToken[] calldata vTokens) external view returns (VTokenUnderlyingPrice[] memory) {
        uint vTokenCount = vTokens.length;
        VTokenUnderlyingPrice[] memory res = new VTokenUnderlyingPrice[](vTokenCount);
        for (uint i = 0; i < vTokenCount; i++) {
            res[i] = vTokenUnderlyingPrice(vTokens[i]);
        }
        return res;
    }

    struct AccountLimits {
        VToken[] markets;
        uint liquidity;
        uint shortfall;
    }

    function getAccountLimits(LensInterface comptroller, address account) public view returns (AccountLimits memory) {
        (uint errorCode, uint liquidity, uint shortfall) = comptroller.getAccountLiquidity(account);
        require(errorCode == 0, "account liquidity error");

        return AccountLimits({
            markets: comptroller.getAssetsIn(account),
            liquidity: liquidity,
            shortfall: shortfall
        });
    }

    struct GovReceipt {
        uint proposalId;
        bool hasVoted;
        bool support;
        uint96 votes;
    }

    function getGovReceipts(GovernorAlpha governor, address voter, uint[] memory proposalIds) public view returns (GovReceipt[] memory) {
        uint proposalCount = proposalIds.length;
        GovReceipt[] memory res = new GovReceipt[](proposalCount);
        for (uint i = 0; i < proposalCount; i++) {
            GovernorAlpha.Receipt memory receipt = governor.getReceipt(proposalIds[i], voter);
            res[i] = GovReceipt({
                proposalId: proposalIds[i],
                hasVoted: receipt.hasVoted,
                support: receipt.support,
                votes: receipt.votes
            });
        }
        return res;
    }

    struct GovProposal {
        uint proposalId;
        address proposer;
        uint eta;
        address[] targets;
        uint[] values;
        string[] signatures;
        bytes[] calldatas;
        uint startBlock;
        uint endBlock;
        uint forVotes;
        uint againstVotes;
        bool canceled;
        bool executed;
    }

    function setProposal(GovProposal memory res, GovernorAlpha governor, uint proposalId) internal view {
        (
            ,
            address proposer,
            uint eta,
            uint startBlock,
            uint endBlock,
            uint forVotes,
            uint againstVotes,
            bool canceled,
            bool executed
        ) = governor.proposals(proposalId);
        res.proposalId = proposalId;
        res.proposer = proposer;
        res.eta = eta;
        res.startBlock = startBlock;
        res.endBlock = endBlock;
        res.forVotes = forVotes;
        res.againstVotes = againstVotes;
        res.canceled = canceled;
        res.executed = executed;
    }

    function getGovProposals(GovernorAlpha governor, uint[] calldata proposalIds) external view returns (GovProposal[] memory) {
        GovProposal[] memory res = new GovProposal[](proposalIds.length);
        for (uint i = 0; i < proposalIds.length; i++) {
            (
                address[] memory targets,
                uint[] memory values,
                string[] memory signatures,
                bytes[] memory calldatas
            ) = governor.getActions(proposalIds[i]);
            res[i] = GovProposal({
                proposalId: 0,
                proposer: address(0),
                eta: 0,
                targets: targets,
                values: values,
                signatures: signatures,
                calldatas: calldatas,
                startBlock: 0,
                endBlock: 0,
                forVotes: 0,
                againstVotes: 0,
                canceled: false,
                executed: false
            });
            setProposal(res[i], governor, proposalIds[i]);
        }
        return res;
    }

    struct XVSBalanceMetadata {
        uint balance;
        uint votes;
        address delegate;
    }

    function getXVSBalanceMetadata(XVS xvs, address account) external view returns (XVSBalanceMetadata memory) {
        return XVSBalanceMetadata({
            balance: xvs.balanceOf(account),
            votes: uint256(xvs.getCurrentVotes(account)),
            delegate: xvs.delegates(account)
        });
    }

    struct XVSBalanceMetadataExt {
        uint balance;
        uint votes;
        address delegate;
        uint allocated;
    }

    function getXVSBalanceMetadataExt(XVS xvs, LensInterface comptroller, address account) external returns (XVSBalanceMetadataExt memory) {
        uint balance = xvs.balanceOf(account);
        comptroller.claimVenus(account);
        uint newBalance = xvs.balanceOf(account);
        uint accrued = comptroller.venusAccrued(account);
        uint total = add(accrued, newBalance, "sum xvs total");
        uint allocated = sub(total, balance, "sub allocated");

        return XVSBalanceMetadataExt({
            balance: balance,
            votes: uint256(xvs.getCurrentVotes(account)),
            delegate: xvs.delegates(account),
            allocated: allocated
        });
    }

    struct VenusVotes {
        uint blockNumber;
        uint votes;
    }

    function getVenusVotes(XVS xvs, address account, uint32[] calldata blockNumbers) external view returns (VenusVotes[] memory) {
        VenusVotes[] memory res = new VenusVotes[](blockNumbers.length);
        for (uint i = 0; i < blockNumbers.length; i++) {
            res[i] = VenusVotes({
                blockNumber: uint256(blockNumbers[i]),
                votes: uint256(xvs.getPriorVotes(account, blockNumbers[i]))
            });
        }
        return res;
    }

    function compareStrings(string memory a, string memory b) internal pure returns (bool) {
        return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))));
    }

    function add(uint a, uint b, string memory errorMessage) internal pure returns (uint) {
        uint c = a + b;
        require(c >= a, errorMessage);
        return c;
    }

    function sub(uint a, uint b, string memory errorMessage) internal pure returns (uint) {
        require(b <= a, errorMessage);
        uint c = a - b;
        return c;
    }
}
