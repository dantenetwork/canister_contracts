const utils = require('./utils/utils');
const ethereum = require('./crossChain/ethereum');

async function main() {
  console.log("Launch validator node");
  ethereum.init();
  while (true) {
    try {
      await ethereum.sendMessage();
      await ethereum.executeMessage();
    }
    catch (e) {
      console.log(e);
    }
    console.log('Waiting 10s...');
    await utils.sleep(10);
  }
}

main();