require("@nomiclabs/hardhat-ethers");
require("dotenv").config();
const hre = require("hardhat");
const ethers = hre.ethers;
require("dotenv").config();
const network = process.env.NETWORK;
const contractConfigData = require(`../../../networks/${network}.json`);

const main = async () => {

    const xvsVestingProxyAddress = contractConfigData.Contracts.XVSVestingProxy;
    const xvsVestingProxy = await ethers.getContractAt("XVSVesting", xvsVestingProxyAddress);

    const vrtConverterAddressInContract = await xvsVestingProxy.vrtConversionAddress();
    const xvsAddressInContract = await xvsVestingProxy.xvs();
    const _notEntered = await xvsVestingProxy._notEntered();
    const initialized = await xvsVestingProxy.initialized();


    console.log(`XVSVestingStorage Data -> vrtConversionAddress: ${vrtConverterAddressInContract}
                                             xvs: ${xvsAddressInContract}
                                             initialized: ${initialized}
                                             _notEntered: ${_notEntered}`);
};

main().then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });