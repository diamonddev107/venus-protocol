const contractConfigData = require("../../../networks/testnet.json");

(async () => {
  const governorBravoDelegatorAddress = contractConfigData.Contracts.GovernorBravoDelegator;
  const governorBravoDelegateContractInstance = await saddle.getContractAt('GovernorBravoDelegate', governorBravoDelegatorAddress);

  const admin = await governorBravoDelegateContractInstance.methods.admin().call();
  const guardian = await governorBravoDelegateContractInstance.methods.guardian().call();
  const proposalCount = await governorBravoDelegateContractInstance.methods.proposalCount().call();

  console.log(`GovernorBravoDelegate admin is: ${admin} - guardian is: ${guardian} - proposalCount is: ${proposalCount}`);
})();