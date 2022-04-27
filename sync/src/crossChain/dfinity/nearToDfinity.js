const chainHandlerMgr = require('../../basic/chainHandlerMgr');

async function sendMessage(fromChain, toChain) {
  let fromHandler = chainHandlerMgr.getHandlerByName(fromChain);
  let toHandler = chainHandlerMgr.getHandlerByName(toChain);
  // query Near message count
  let nearMessageCount = await fromHandler.querySentMessageCount(toChain);
  console.log(nearMessageCount);

  // query Dfinity next receive message Id
  let nextMessageId = await toHandler.queryNextMessageId(fromChain);
  console.log(nextMessageId);

  // push messge
  if (nextMessageId <= nearMessageCount) {
    let message = await fromHandler.getSentMessageById(toChain, Number(nextMessageId));
    message.sqos = { reveal: 1 };
    await toHandler.pushMessage(nextMessageId, message);
  }
}

module.exports = {
  sendMessage: sendMessage,
}