'use strict';

const chainHandlerMgr = require('../../basic/chainHandlerMgr');

async function sendMessage(fromChain, toChain) {
  let fromHandler = chainHandlerMgr.getHandlerByName(fromChain);
  let toHandler = chainHandlerMgr.getHandlerByName(toChain);
  // query Near message count
  const nearSentMessageCount = await fromHandler.querySentMessageCount(toChain);

  // query Ethereum next receive message Id
  let nextMessageId = await toHandler.getMsgPortingTask(fromChain);
  nextMessageId = parseInt(nextMessageId);

  if (nextMessageId <= nearSentMessageCount) {
    // get message by id
    const message = await fromHandler.getSentMessageById(toChain, nextMessageId);
    message.sqos.reveal = 1;
    let ret = await toHandler.pushMessage({
      id: nextMessageId,
      fromChain: message.from_chain,
      toChain: message.to_chain,
      sender: message.sender,
      signer: message.signer,
      sqos: message.sqos,
      content: message.content,
    });

    if (ret != 0) {
      await toHandler.abandonMessage(message.from_chain, nextMessageId, ret);
    }
  }
};

module.exports = {
  sendMessage: sendMessage
}