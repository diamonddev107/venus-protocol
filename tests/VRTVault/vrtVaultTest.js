const {
  bnbUnsigned,
  bnbMantissa,
  freezeTime
} = require('../Utils/BSC');
const BigNum = require('bignumber.js');

const interestRatePerBlock = bnbUnsigned(28935185000);
const vrtTotalSupply = bnbMantissa(30000000000);
const zeroAddress = "0x0000000000000000000000000000000000000000";

const calculateAccruedInterest = (principalAmount, accrualStartBlockNumber, currentBlockNumber) => {
  return ((new BigNum(principalAmount)
    .multipliedBy(new BigNum(currentBlockNumber).minus(new BigNum(accrualStartBlockNumber))))
    .multipliedBy(interestRatePerBlock)).dividedToIntegerBy(1e18);
}

const getBlocksbyDays = (numberOfDays) => {
  return (BLOCKS_PER_DAY.multipliedBy(new BigNumber(numberOfDays)));
}

const setBlockNumber = async (vrtVault, blockNumber) => {
  await send(vrtVault, 'setBlockNumber', [bnbUnsigned(blockNumber)]);
}

const getAccrualStartBlockNumber = async (vrtVault, userAddress) => {
  const vrtVaultPositionRecord = await call(vrtVault, "userInfo", [userAddress]);
  return vrtVaultPositionRecord.accrualStartBlockNumber;
}

const getTotalPrincipalAmount = async (vrtVault, userAddress) => {
  const vrtVaultPositionRecord = await call(vrtVault, "userInfo", [userAddress]);
  return vrtVaultPositionRecord.totalPrincipalAmount;
}

const incrementBlocks = async (vrtVault, deltaBlocks) => {
  const blockNumberInVaultContract = await call(vrtVault, 'getBlockNumber');
  const blockNumber = new BigNum(blockNumberInVaultContract).plus(new BigNum(deltaBlocks));
  await setBlockNumber(vrtVault, [blockNumber]);
}

const getBlockNumber = async (vrtVault) => {
  const blockNumber = await call(vrtVault, 'getBlockNumber');
  return blockNumber;
}

const assertAccruedInterest = async (vrtVault, userAddress, principalAmount) => {
  const accruedInterest = await call(vrtVault, "getAccruedInterest", [userAddress]);
  const currentBlockNumber = await getBlockNumber(vrtVault);
  const accrualStartBlockNumber = await getAccrualStartBlockNumber(vrtVault, userAddress);
  const totalPrincipalAmount = getTotalPrincipalAmount(vrtVault, userAddress);
  const expectedAccruedInterest = await calculateAccruedInterest(principalAmount, accrualStartBlockNumber, currentBlockNumber)
  expect(new BigNum(accruedInterest)).toEqual(new BigNum(expectedAccruedInterest));
  return accruedInterest;
};

const depositVRT = async (vrt, vrtVault, userAddress, vrtDepositAmount) => {
  const vrtVaultAddress = vrtVault._address;
  await send(vrt, 'approve', [vrtVaultAddress, vrtDepositAmount], { from: userAddress });
  const vrtBalanceOfVaultBeforeDeposit = await call(vrt, "balanceOf", [vrtVaultAddress]);
  const vrtBalanceOfUserBeforeDeposit = await call(vrt, "balanceOf", [userAddress]);

  const accrualStartBlockNumber = await getAccrualStartBlockNumber(vrtVault, userAddress);
  const currentBlockNumber = await getBlockNumber(vrtVault);
  const totalPrincipalAmount = await getTotalPrincipalAmount(vrtVault, userAddress);
  const accruedInterest = calculateAccruedInterest(totalPrincipalAmount, accrualStartBlockNumber, currentBlockNumber);

  const vrtDepositTransaction = await send(vrtVault, "deposit", [userAddress, vrtDepositAmount], { from: userAddress });
  expect(vrtDepositTransaction).toSucceed();
  expect(vrtDepositTransaction).toHaveLog('Deposit', {
    user: userAddress,
    amount: vrtDepositAmount
  });

  const expected_VrtBalanceOfVault = new BigNum(vrtBalanceOfVaultBeforeDeposit).plus(vrtDepositAmount).minus(accruedInterest);
  const vrtBalanceOfVaultAfterDeposit = await call(vrt, "balanceOf", [vrtVaultAddress]);
  expect(new BigNum(vrtBalanceOfVaultAfterDeposit)).toEqual(expected_VrtBalanceOfVault);

  const expected_VrtBalanceOfUser = new BigNum(vrtBalanceOfUserBeforeDeposit).minus(vrtDepositAmount).plus(accruedInterest);
  const vrtBalanceOfUserAfterDeposit = await call(vrt, "balanceOf", [userAddress]);
  expect(new BigNum(vrtBalanceOfUserAfterDeposit)).toEqual(expected_VrtBalanceOfUser);

  return vrtDepositTransaction;
}

describe('XVSVault', () => {
  let root, notAdmin, user1, user2, user3, treasury;
  let blockTimestamp;
  let vrtVault, vrtVaultAddress;
  let vrt, vrtAddress;
  let preFundedVRTInVault = bnbUnsigned(10e18);

  beforeEach(async () => {
    [root, notAdmin, user1, user2, user3, treasury] = accounts;

    vrt = await deploy('VRT', [root]);
    vrtAddress = vrt._address;

    vrtVault = await deploy('VRTVaultHarness', [vrtAddress, interestRatePerBlock]);
    vrtVaultAddress = vrtVault._address;

    await send(vrt, 'transfer', [vrtVaultAddress, preFundedVRTInVault], { from: root });

    blockTimestamp = bnbUnsigned(100);
    await freezeTime(blockTimestamp.toNumber())
  });

  describe("VRTVault Initialisation Verification", () => {

    it("should assert VRT Balance of Root to TotalSupply", async () => {
      const vrtBalanceOfRoot = await call(vrt, "balanceOf", [root]);
      const expectedVRTBalanceOfRoot = new BigNum(vrtTotalSupply).minus(new BigNum(preFundedVRTInVault));
      expect(new BigNum(vrtBalanceOfRoot)).toEqual(new BigNum(expectedVRTBalanceOfRoot));
    });

    it("should initialize interestRatePerBlock in VRTVault", async () => {
      const interestRatePerBlockFromVault = await call(vrtVault, "interestRatePerBlock", []);
      expect(interestRatePerBlockFromVault).toEqual(interestRatePerBlock.toString());
    });

  });

  describe("Deposit VRT", () => {

    it("should deposit VRT", async () => {
      let blockNumber = 0;
      await setBlockNumber(vrtVault, blockNumber);
      const vrtDepositAmount = bnbUnsigned(1e22);
      await send(vrt, 'transfer', [user1, vrtDepositAmount], { from: root });
      await depositVRT(vrt, vrtVault, user1, vrtDepositAmount)
      await assertAccruedInterest(vrtVault, user1, vrtDepositAmount);
    });

    it("should transfer accruedInterest on 2nd VRT-Deposit", async () => {
      let blockNumber = 0;
      await setBlockNumber(vrtVault, blockNumber);
      const vrtDepositAmount = bnbUnsigned(1e22);

      await send(vrt, 'transfer', [user1, vrtDepositAmount], { from: root });
      await incrementBlocks(vrtVault, 1);
      await depositVRT(vrt, vrtVault, user1, vrtDepositAmount)
      await assertAccruedInterest(vrtVault, user1, vrtDepositAmount);

      await incrementBlocks(vrtVault, 1000);
      const currentBlockNumber = await getBlockNumber(vrtVault);
      const accrualStartBlockNumber = await getAccrualStartBlockNumber(vrtVault, user1);
      const expectedAccruedInterest = await calculateAccruedInterest(vrtDepositAmount, accrualStartBlockNumber, currentBlockNumber)

      await send(vrt, 'transfer', [user1, vrtDepositAmount], { from: root });
      const vrtDepositTransaction = await depositVRT(vrt, vrtVault, user1, vrtDepositAmount)
      await assertAccruedInterest(vrtVault, user1, vrtDepositAmount);

      expect(vrtDepositTransaction).toHaveLog('Claim', {
        user: user1,
        interestAmount: expectedAccruedInterest
      });
    });

    it("Deposit Failure for Zero amount", async () => {
      await expect(send(vrtVault, "deposit", [user1, new BigNum(0)], { from: user1 })).rejects.toRevert("revert Deposit amount must be non-zero");
    });

    it("2nd VRT-Deposit to fail - due to insufficient Balance while claiming accrued-Interest", async () => {
      let blockNumber = 0;
      await setBlockNumber(vrtVault, blockNumber);
      const vrtDepositAmount = bnbUnsigned(1e22);

      await send(vrt, 'transfer', [user1, vrtDepositAmount], { from: root });
      await incrementBlocks(vrtVault, 1);

      await depositVRT(vrt, vrtVault, user1, vrtDepositAmount)
      await assertAccruedInterest(vrtVault, user1, vrtDepositAmount);

      await incrementBlocks(vrtVault, 1000);
      await send(vrt, 'transfer', [user1, vrtDepositAmount], { from: root });

      const vrtBalanceOfVault = await call(vrt, "balanceOf", [vrtVaultAddress]);
      await send(vrtVault, 'withdrawBep20', [vrtAddress, user2, vrtBalanceOfVault], { from: root });
      await expect(send(vrtVault, "deposit", [user1, vrtDepositAmount], {from: user1})).rejects.toRevert("revert Failed to transfer accruedInterest, Insufficient VRT in Vault.");
    });

  });

  describe("Interest Accrual", () => {

    it("should accrue Interest on VRT Deposit with timeTravel of 1000 Blocks", async () => {
      let blockNumber = 0;
      await setBlockNumber(vrtVault, blockNumber);
      const vrtDepositAmount = bnbUnsigned(1e22);
      await send(vrt, 'transfer', [user1, vrtDepositAmount], { from: root });
      await incrementBlocks(vrtVault, 1);

      await depositVRT(vrt, vrtVault, user1, vrtDepositAmount)
      const accruedInterestBeforeTimeAdvance = await assertAccruedInterest(vrtVault, user1, vrtDepositAmount);

      await incrementBlocks(vrtVault, 1000);

      const accruedInterestAfterTimeAdvance = await assertAccruedInterest(vrtVault, user1, vrtDepositAmount);
      expect(new BigNum(accruedInterestAfterTimeAdvance).isGreaterThan(new BigNum(accruedInterestBeforeTimeAdvance))).toEqual(true);
    });

  });

  describe("Claim VRT", () => {

    it("Claim AccruedInterest after VRT-Deposit", async () => {
      let blockNumber = 0;
      await setBlockNumber(vrtVault, blockNumber);
      const vrtDepositAmount = bnbUnsigned(1e22);

      await send(vrt, 'transfer', [user1, vrtDepositAmount], { from: root });
      await incrementBlocks(vrtVault, 1);

      await depositVRT(vrt, vrtVault, user1, vrtDepositAmount)
      await assertAccruedInterest(vrtVault, user1, vrtDepositAmount);

      await incrementBlocks(vrtVault, 1000);
      const currentBlockNumber = await getBlockNumber(vrtVault);
      const accrualStartBlockNumber = await getAccrualStartBlockNumber(vrtVault, user1);
      const expectedAccruedInterest = await calculateAccruedInterest(vrtDepositAmount, accrualStartBlockNumber, currentBlockNumber)

      const vrtClaimTransaction = await send(vrtVault, "claim", [user1], { from: user1 });
      expect(vrtClaimTransaction).toSucceed();

      expect(vrtClaimTransaction).toHaveLog('Claim', {
        user: user1,
        interestAmount: expectedAccruedInterest
      });
    });

    it("Claim Failure for user with no VRT Deposits", async () => {
      await expect(send(vrtVault, "claim", [user2], { from: user2 })).rejects.toRevert("revert User doesnot have any position in the Vault.");
    });

    it("Claim Failure for Zero Address as recipient", async () => {
      await expect(send(vrtVault, "claim", [zeroAddress], { from: user2 })).rejects.toRevert("revert Address cannot be Zero");
    });

  });

  describe("Withdraw VRT", () => {

    it("Withdraw after 1st VRT-Deposit", async () => {
      let blockNumber = 0;
      await setBlockNumber(vrtVault, blockNumber);
      const vrtDepositAmount = bnbUnsigned(1e22);

      await send(vrt, 'transfer', [user1, vrtDepositAmount], { from: root });
      await depositVRT(vrt, vrtVault, user1, vrtDepositAmount)
      await assertAccruedInterest(vrtVault, user1, vrtDepositAmount);

      const currentBlockNumber = await getBlockNumber(vrtVault);
      const accrualStartBlockNumber = await getAccrualStartBlockNumber(vrtVault, user1);
      const expectedAccruedInterest = await calculateAccruedInterest(vrtDepositAmount, accrualStartBlockNumber, currentBlockNumber)
      const expectedPrincipalAmount = await getTotalPrincipalAmount(vrtVault, user1);
      const totalWithdrawnAmount = new BigNum(expectedAccruedInterest).plus(new BigNum(expectedPrincipalAmount));

      expect(new BigNum(totalWithdrawnAmount)).toEqual(new BigNum(expectedPrincipalAmount));
      expect(new BigNum(expectedAccruedInterest)).toEqual(new BigNum(0));

      const vrtClaimTransaction = await send(vrtVault, "withdraw", [user1], { from: user1 });

      expect(vrtClaimTransaction).toHaveLog('Withdraw', {
        user: user1,
        withdrawnAmount: new BigNum(totalWithdrawnAmount).toFixed(),
        totalPrincipalAmount: new BigNum(expectedPrincipalAmount).toFixed(),
        accruedInterest: new BigNum(expectedAccruedInterest).toFixed()
      });
    });

    it("Withdraw AccruedInterest and Deposit after 2nd VRT-Deposit", async () => {
      let blockNumber = 0;
      await setBlockNumber(vrtVault, blockNumber);
      const vrtDepositAmount = bnbUnsigned(1e22);

      await send(vrt, 'transfer', [user1, vrtDepositAmount], { from: root });
      await incrementBlocks(vrtVault, 1);

      await depositVRT(vrt, vrtVault, user1, vrtDepositAmount)
      await assertAccruedInterest(vrtVault, user1, vrtDepositAmount);

      await incrementBlocks(vrtVault, 1000);
      const currentBlockNumber = await getBlockNumber(vrtVault);
      const accrualStartBlockNumber = await getAccrualStartBlockNumber(vrtVault, user1);
      const expectedAccruedInterest = await calculateAccruedInterest(vrtDepositAmount, accrualStartBlockNumber, currentBlockNumber)
      const expectedPrincipalAmount = await getTotalPrincipalAmount(vrtVault, user1);
      const totalWithdrawnAmount = new BigNum(expectedAccruedInterest).plus(new BigNum(expectedPrincipalAmount));

      const vrtWithdrawTransaction = await send(vrtVault, "withdraw", [user1], { from: user1 });

      expect(vrtWithdrawTransaction).toHaveLog('Withdraw', {
        user: user1,
        withdrawnAmount: new BigNum(totalWithdrawnAmount).toFixed(),
        totalPrincipalAmount: new BigNum(expectedPrincipalAmount).toFixed(),
        accruedInterest: new BigNum(expectedAccruedInterest).toFixed()
      });

    });

    it("VRT-Deposit and wait for 1000 blocks folloed by a Claim and Withdrawal", async () => {
      let blockNumber = 0;
      await setBlockNumber(vrtVault, blockNumber);
      const vrtDepositAmount = bnbUnsigned(1e22);

      await send(vrt, 'transfer', [user1, vrtDepositAmount], { from: root });
      await incrementBlocks(vrtVault, 1);

      await depositVRT(vrt, vrtVault, user1, vrtDepositAmount)
      await assertAccruedInterest(vrtVault, user1, vrtDepositAmount);

      await incrementBlocks(vrtVault, 1000);
      const currentBlockNumber = await getBlockNumber(vrtVault);
      const accrualStartBlockNumber = await getAccrualStartBlockNumber(vrtVault, user1);
      const expectedAccruedInterest = await calculateAccruedInterest(vrtDepositAmount, accrualStartBlockNumber, currentBlockNumber)

      //claim
      const vrtClaimTransaction = await send(vrtVault, "claim", [user1], { from: user1 });

      expect(vrtClaimTransaction).toHaveLog('Claim', {
        user: user1,
        interestAmount: expectedAccruedInterest
      });

      //withdraw
      const vrtWithdrawTransaction = await send(vrtVault, "withdraw", [user1], { from: user1 });

      expect(vrtWithdrawTransaction).toHaveLog('Withdraw', {
        user: user1,
        withdrawnAmount: new BigNum(vrtDepositAmount).toFixed(),
        totalPrincipalAmount: new BigNum(vrtDepositAmount).toFixed(),
        accruedInterest: new BigNum(0)
      });

    });

    it("VRT-Deposit and wait for 1000 blocks followed by a Claim and wait for 1000 blocks followed by Withdrawal", async () => {
      let blockNumber = 0;
      await setBlockNumber(vrtVault, blockNumber);
      const vrtDepositAmount = bnbUnsigned(1e22);

      await send(vrt, 'transfer', [user1, vrtDepositAmount], { from: root });
      await incrementBlocks(vrtVault, 1);

      await depositVRT(vrt, vrtVault, user1, vrtDepositAmount)
      await assertAccruedInterest(vrtVault, user1, vrtDepositAmount);

      await incrementBlocks(vrtVault, 1000);
      let currentBlockNumber = await getBlockNumber(vrtVault);
      let accrualStartBlockNumber = await getAccrualStartBlockNumber(vrtVault, user1);
      let expectedAccruedInterest = await calculateAccruedInterest(vrtDepositAmount, accrualStartBlockNumber, currentBlockNumber)

      //claim
      const vrtClaimTransaction = await send(vrtVault, "claim", [user1], { from: user1 });

      expect(vrtClaimTransaction).toHaveLog('Claim', {
        user: user1,
        interestAmount: expectedAccruedInterest
      });

      await incrementBlocks(vrtVault, 1000);

      currentBlockNumber = await getBlockNumber(vrtVault);
      accrualStartBlockNumber = await getAccrualStartBlockNumber(vrtVault, user1);
      expectedAccruedInterest = await calculateAccruedInterest(vrtDepositAmount, accrualStartBlockNumber, currentBlockNumber)
      const expectedPrincipalAmount = await getTotalPrincipalAmount(vrtVault, user1);
      const totalWithdrawnAmount = new BigNum(expectedAccruedInterest).plus(new BigNum(expectedPrincipalAmount));

      const vrtWithdrawTransaction = await send(vrtVault, "withdraw", [user1], { from: user1 });

      expect(vrtWithdrawTransaction).toHaveLog('Withdraw', {
        user: user1,
        withdrawnAmount: new BigNum(totalWithdrawnAmount).toFixed(),
        totalPrincipalAmount: new BigNum(expectedPrincipalAmount).toFixed(),
        accruedInterest: new BigNum(expectedAccruedInterest).toFixed()
      });
    });

    it("Withdraw Failure due to insufficient funds", async () => {
      let blockNumber = 0;
      await setBlockNumber(vrtVault, blockNumber);
      const vrtDepositAmount = bnbUnsigned(1e22);

      await send(vrt, 'transfer', [user1, vrtDepositAmount], { from: root });
      await depositVRT(vrt, vrtVault, user1, vrtDepositAmount)
      await assertAccruedInterest(vrtVault, user1, vrtDepositAmount);

      const currentBlockNumber = await getBlockNumber(vrtVault);
      const accrualStartBlockNumber = await getAccrualStartBlockNumber(vrtVault, user1);
      const expectedAccruedInterest = await calculateAccruedInterest(vrtDepositAmount, accrualStartBlockNumber, currentBlockNumber)
      const expectedPrincipalAmount = await getTotalPrincipalAmount(vrtVault, user1);
      const totalWithdrawnAmount = new BigNum(expectedAccruedInterest).plus(new BigNum(expectedPrincipalAmount));

      expect(new BigNum(totalWithdrawnAmount)).toEqual(new BigNum(expectedPrincipalAmount));
      expect(new BigNum(expectedAccruedInterest)).toEqual(new BigNum(0));

      //admin withdraw VRT
      await send(vrtVault, 'withdrawBep20', [vrtAddress, user2, new BigNum(totalWithdrawnAmount)], { from: root });

      await expect(send(vrtVault, "withdraw", [user1], { from: user1 })).rejects.toRevert("revert Failed to transfer VRT, Insufficient VRT in Vault.");
    });

    it("Withdraw Failure for user with no VRT Deposits", async () => {
      await expect(send(vrtVault, "withdraw", [user2], { from: user2 })).rejects.toRevert("revert User doesnot have any position in the Vault.");
    });

    it("Withdraw Failure for Zero Address as recipient", async () => {
      await expect(send(vrtVault, "withdraw", [zeroAddress], { from: user2 })).rejects.toRevert("revert Address cannot be Zero");
    });
  });

  describe("Withdraw BEP20", () => {

    it("Admin can withdraw VRT", async () => {
      let blockNumber = 0;
      await setBlockNumber(vrtVault, blockNumber);
      const withdrawBep20Txn = await send(vrtVault, "withdrawBep20", [vrtAddress, treasury, preFundedVRTInVault], { from: root });
      expect(withdrawBep20Txn).toSucceed();
      expect(withdrawBep20Txn).toHaveLog('WithdrawToken', {
        tokenAddress: vrtAddress,
        receiver: treasury,
        amount: new BigNum(preFundedVRTInVault).toFixed()
      });
    });

    it("Admin Fails to withdraw VRT - Insufficient funds", async () => {
      let blockNumber = 0;
      await setBlockNumber(vrtVault, blockNumber);
      await expect(send(vrtVault, "withdrawBep20", [vrtAddress, treasury, new BigNum(preFundedVRTInVault).plus(new BigNum(100))], { from: root }))
      .rejects.toRevert("revert Insufficient amount in Vault");
    });

    it("NonAdmin should Fail to withdraw VRT", async () => {
      let blockNumber = 0;
      await setBlockNumber(vrtVault, blockNumber);
      await expect(send(vrtVault, "withdrawBep20", [vrtAddress, treasury, new BigNum(preFundedVRTInVault)], { from: user1 }))
      .rejects.toRevert("revert only admin allowed");
    });

  });

});
