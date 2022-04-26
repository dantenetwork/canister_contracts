"use strict";

const chainHandlerMgr = require('../../basic/chainHandlerMgr');

async function sendMessage(fromChain, toChain) {
  let fromHandler = chainHandlerMgr.getHandlerByName(fromChain);
  let toHandler = chainHandlerMgr.getHandlerByName(toChain);
  // query PlatON message count
  let platONMessageCount = await fromHandler.querySentMessageCount(toChain);

  // query Near next receive message Id
  let nextMessageId = await toHandler.queryNextMessageId(fromChain);

  // push messge
  if (nextMessageId <= platONMessageCount) {
    let id = nextMessageId;
    let message = await fromHandler.getSentMessageById(toChain, id);
    // TODO check message is irreversible
    await toHandler.pushMessage(message);
  }
}

module.exports = {
  sendMessage: sendMessage,
}