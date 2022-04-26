const utils = require('./utils/utils');
const chainHandlerMgr = require('./basic/chainHandlerMgr');
const relayerMgr = require('./crossChain/relayerMgr');

async function init() {
  await chainHandlerMgr.init();
  await relayerMgr.init();
}

async function main() {
  console.log("Launch validator node");
  await init();
  while (true) {
    for (let i in relayerMgr.relayers) {
      try {
        console.log(i)
        await relayerMgr.relayers[i].sendMessage();
        await relayerMgr.relayers[i].executeMessage();
      }
      catch (e) {
        console.log(e);
      }
    }
    console.log('Waiting 10s...');
    await utils.sleep(10);
  }
}

main();