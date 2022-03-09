require("@nomiclabs/hardhat-ethers");
require("dotenv").config();
const hre = require("hardhat");
const ethers = hre.ethers;
require("dotenv").config();
const network = process.env.NETWORK;
const contractConfigData = require(`../../../networks/${network}.json`);

const main = async () => {

    const vrtConverterProxyAddress = contractConfigData.Contracts.VRTConverterProxy;
    const vrtConverterProxy = await ethers.getContractAt("VRTConverter", vrtConverterProxyAddress);

    const xvsVestingAddressInContract = await vrtConverterProxy.xvsVesting();
    const xvsAddressInContract = await vrtConverterProxy.xvs();
    const vrtAddressInContract = await vrtConverterProxy.vrt();
    const initialized = await vrtConverterProxy.initialized();
    const _notEntered = await vrtConverterProxy._notEntered();
    const conversionRatio = await vrtConverterProxy.conversionRatio();
    const totalVrtConverted = await vrtConverterProxy.totalVrtConverted();
    const conversionStartTime = await vrtConverterProxy.conversionStartTime();
    const conversionPeriod = await vrtConverterProxy.conversionPeriod();
    const conversionEndTime = await vrtConverterProxy.conversionEndTime();

    console.log(`VRTConverterStorage Data -> xvsVesting: ${xvsVestingAddressInContract}
                                             xvs: ${xvsAddressInContract}
                                             vrt: ${vrtAddressInContract} 
                                             initialized: ${initialized}
                                             _notEntered: ${_notEntered}
                                             conversionRatio: ${conversionRatio}
                                             totalVrtConverted: ${totalVrtConverted}
                                             conversionStartTime: ${conversionStartTime}
                                             conversionPeriod: ${conversionPeriod}
                                             conversionEndTime: ${conversionEndTime}`);
};

main().then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });