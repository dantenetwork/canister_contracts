'use strict';

const chainHandlerMgr = require('../../basic/chainHandlerMgr');

async function sendMessage(fromChain, toChain) {
  let fromHandler = chainHandlerMgr.getHandlerByName(fromChain);
  let toHandler = chainHandlerMgr.getHandlerByName(toChain);
  // query PlatON message count
  let platONMessageCount = await fromHandler.querySentMessageCount(toChain);

  // query Ethereum next receive message Id
  let nextMessageId = await toHandler.getMsgPortingTask(fromChain);
  nextMessageId = parseInt(nextMessageId);

  if (nextMessageId <= platONMessageCount) {
    // get message by id
    const message = await fromHandler.getSentMessageById(toChain, nextMessageId);
    // console.log('Query PlatON Sent message id ' + nextMessageId);

    let ret = await toHandler.pushMessage({
      id: message[0],
      fromChain: message[1],
      toChain: message[2],
      sender: message[3],
      content: {
        contract: message[4][0],
        action: message[4][1],
        data: message[4][2],
      }
    });

    if (ret != 0) {
      await toHandler.abandonMessage(message[1], message[0], ret);
    }
  }
}

module.exports = {
  sendMessage: sendMessage,
}