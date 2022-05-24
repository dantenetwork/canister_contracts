"use strict";

const chainHandlerMgr = require('../../basic/chainHandlerMgr');

async function sendMessage(fromChain, toChain) {
  let fromHandler = chainHandlerMgr.getHandlerByName(fromChain);
  let toHandler = chainHandlerMgr.getHandlerByName(toChain);
  // query dfinity message count
  let dfinityMessageCount = await fromHandler.querySentMessageCount(toChain);

  // query Near next receive message Id
  let nextMessageId = await toHandler.queryNextMessageId(fromChain);

  // push messge
  if (nextMessageId <= dfinityMessageCount) {
    let id = nextMessageId;
    let message = await fromHandler.getSentMessageById(toChain, id);
    // TODO check message is irreversible
    let m = [id, fromChain, message.to_chain, message.sender, message.signer, { reveal: true },
      [message.content.contract, message.content.action, message.content.data], [message.session.res_type, Number(message.session.id)]];
    await toHandler.pushMessage(m);
  }
}

module.exports = {
  sendMessage: sendMessage,
}