require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-etherscan");
require("dotenv").config();
const network = process.env.NETWORK;
const contractConfigData = require(`../../../networks/${network}.json`);
const hre = require("hardhat");

const main = async () => {
    const venusLens = contractConfigData.Contracts.VenusLens;
    const comptrollerAddress = contractConfigData.Comptroller
    const venusLensConstructorArgumentArray = [comptrollerAddress];

    await hre.run("verify:verify", {
        address: venusLens,
        constructorArguments: venusLensConstructorArgumentArray
    });
};

main().then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });