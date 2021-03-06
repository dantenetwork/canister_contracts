const idlFactory = ({ IDL }) => {
  const ApiError = IDL.Variant({
    'AlreadyRegisterValidator' : IDL.Null,
    'Unauthorized' : IDL.Null,
    'Other' : IDL.Null,
    'ExecuteMessageFailed' : IDL.Null,
    'NotValidator' : IDL.Null,
    'AlreadyRegisterLocker' : IDL.Null,
  });
  const Result = IDL.Variant({ 'Ok' : IDL.Bool, 'Err' : ApiError });
  const MapKey = IDL.Variant({
    'ValidatorFinalReceivedId' : IDL.Record({
      'validator' : IDL.Principal,
      'chain_name' : IDL.Text,
    }),
    'MessageId' : IDL.Record({ 'id' : IDL.Nat64, 'chain_name' : IDL.Text }),
  });
  const Content = IDL.Record({
    'action' : IDL.Text,
    'contract' : IDL.Text,
    'data' : IDL.Text,
  });
  const Sqos = IDL.Record({ 'reveal' : IDL.Nat8 });
  const Session = IDL.Record({ 'id' : IDL.Nat64, 'res_type' : IDL.Nat8 });
  const Message = IDL.Record({
    'content' : Content,
    'to_chain' : IDL.Text,
    'sqos' : Sqos,
    'from_chain' : IDL.Text,
    'sender' : IDL.Text,
    'session' : Session,
    'signer' : IDL.Text,
  });
  const PendingMessage = IDL.Record({
    'message' : Message,
    'validators' : IDL.Vec(IDL.Principal),
  });
  return IDL.Service({
    'clearRecivedMessage' : IDL.Func([IDL.Vec(IDL.Text)], [Result], []),
    'clearSentMessage' : IDL.Func([IDL.Vec(IDL.Text)], [Result], []),
    'executeMessage' : IDL.Func([IDL.Text, IDL.Nat64], [Result], []),
    'getCustodians' : IDL.Func([], [IDL.Vec(IDL.Principal)], ['query']),
    'getExecutableMessage' : IDL.Func(
        [],
        [IDL.Vec(IDL.Tuple(MapKey, Message))],
        ['query'],
      ),
    'getFinalReceivedMessageId' : IDL.Func(
        [IDL.Text, IDL.Principal],
        [IDL.Nat64],
        ['query'],
      ),
    'getLatestMessageId' : IDL.Func([IDL.Text], [IDL.Nat64], ['query']),
    'getLockers' : IDL.Func([], [IDL.Vec(IDL.Principal)], ['query']),
    'getMsgPortingTask' : IDL.Func(
        [IDL.Text, IDL.Principal],
        [IDL.Nat64],
        ['query'],
      ),
    'getPendingMessage' : IDL.Func(
        [],
        [
          IDL.Vec(
            IDL.Tuple(MapKey, IDL.Vec(IDL.Tuple(IDL.Text, PendingMessage)))
          ),
        ],
        ['query'],
      ),
    'getSentMessage' : IDL.Func(
        [],
        [IDL.Vec(IDL.Tuple(MapKey, Message))],
        ['query'],
      ),
    'getSentMessageById' : IDL.Func(
        [IDL.Text, IDL.Nat64],
        [Message],
        ['query'],
      ),
    'getSentMessageCount' : IDL.Func([IDL.Text], [IDL.Nat64], ['query']),
    'getValidators' : IDL.Func([], [IDL.Vec(IDL.Principal)], ['query']),
    'receiveMessage' : IDL.Func([IDL.Nat64, Message], [Result], []),
    'registerLocker' : IDL.Func([IDL.Principal], [Result], []),
    'registerValidator' : IDL.Func([IDL.Principal], [Result], []),
    'sendMessage' : IDL.Func([IDL.Text, Content, Session], [], []),
    'unRegisterValidator' : IDL.Func([IDL.Principal], [Result], []),
  });
};
const init = ({ IDL }) => { return []; };

module.exports = {
  idlFactory
};