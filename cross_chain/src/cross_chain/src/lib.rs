use candid::{
    parser::value::{IDLField, IDLValue},
    types::Label,
    IDLArgs,
};
use ic_cdk::{
    api,
    export::{candid::CandidType, Principal},
};
use ic_cdk_macros::*;
use serde::{Deserialize, Serialize};
use serde_cbor::Serializer;
use sha2::{Digest, Sha256};
use std::cell::RefCell;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::result::Result as StdResult;

#[derive(CandidType, Deserialize, Default)]
struct State {
    custodians: HashSet<Principal>,
    lockers: HashSet<Principal>,
    pending_message: BTreeMap<MapKey, BTreeMap<String, PendingMessage>>,
    sent_message: BTreeMap<MapKey, Message>,
    executable_message: BTreeMap<MapKey, Message>,
    sent_message_count: HashMap<String, u64>,
    final_received_message_id: BTreeMap<MapKey, u64>,
    latest_message_id: HashMap<String, u64>,
    validators: HashSet<Principal>,
}

thread_local! {
    static STATE: RefCell<State> = RefCell::default();
}

#[init]
fn init() {
    STATE.with(|state| {
        let mut state = state.borrow_mut();
        state.custodians = HashSet::from([api::caller()]);
    })
}

#[update(name = "registerLocker")]
fn register_locker(locker: Principal) -> Result {
    STATE.with(|state| {
        let mut state = state.borrow_mut();
        let caller = api::caller();
        if state.custodians.contains(&caller) {
            Ok(state.lockers.insert(locker))
        } else {
            Err(Error::Unauthorized)
        }
    })
}

#[update(name = "registerValidator")]
fn register_validator(validator: Principal) -> Result {
    STATE.with(|state| {
        let mut state = state.borrow_mut();
        let caller = api::caller();
        if state.custodians.contains(&caller) {
            Ok(state.validators.insert(validator))
        } else {
            Err(Error::Unauthorized)
        }
    })
}

#[update(name = "unRegisterValidator")]
fn un_register_validator(validator: Principal) -> Result {
    STATE.with(|state| {
        let mut state = state.borrow_mut();
        let caller = api::caller();
        if state.custodians.contains(&caller) {
            Ok(state.validators.remove(&validator))
        } else {
            Err(Error::Unauthorized)
        }
    })
}

#[update(name = "receiveMessage")]
fn receive_message(id: u64, message: Message) -> Result {
    let validator = api::caller();
    if is_validator(&validator) {
        STATE.with(|state| {
            let final_received_key = MapKey::ValidatorFinalReceivedId {
                chain_name: message.from_chain.clone(),
                validator,
            };
            let message_hash = message.to_hash();
            let mut state = state.borrow_mut();
            // let state = &mut *state;
            let latest_message_id = *state
                .latest_message_id
                .get(&message.from_chain)
                .unwrap_or(&0u64);
            if id == latest_message_id + 1 {
                state
                    .latest_message_id
                    .insert(message.from_chain.clone(), id);
            }
            if id > latest_message_id + 1 {
                panic!("id not <= {}", latest_message_id + 1);
            }
            let final_received_message_id = state
                .final_received_message_id
                .get(&final_received_key)
                .unwrap_or(&0u64);
            assert_ne!(*final_received_message_id, id, "already received");
            let received_key = MapKey::MessageId {
                chain_name: message.from_chain.clone(),
                id,
            };
            // 前面存在有节点未完成搬运时帮其搬运，得确保搬运消息存在，防止重复搬运
            if id < *final_received_message_id
                || (id < latest_message_id + 1 && *final_received_message_id == 0)
            {
                match state.pending_message.get(&received_key) {
                    None => {
                        panic!("this message has completed");
                    }
                    _ => {}
                }
            }
            if id > *final_received_message_id {
                state
                    .final_received_message_id
                    .insert(final_received_key, id);
            }
            match state.pending_message.get_mut(&received_key) {
                Some(map) => {
                    if map.contains_key(&message_hash) {
                        let group: &mut PendingMessage = map.get_mut(&message_hash).unwrap();
                        assert!(
                            !group.validators.contains(&validator),
                            "{} already recived message",
                            validator.to_text()
                        );
                        group.validators.push(validator);
                    } else {
                        map.insert(
                            message_hash,
                            PendingMessage {
                                message: message.clone(),
                                validators: vec![validator],
                            },
                        );
                    }
                }
                None => {
                    state.pending_message.insert(
                        received_key.clone(),
                        BTreeMap::from([(
                            message_hash,
                            PendingMessage {
                                message: message.clone(),
                                validators: vec![validator],
                            },
                        )]),
                    );
                }
            }
            let mut len = 0;
            for (_, group) in state.pending_message.get(&received_key).unwrap() {
                len += group.validators.len();
            }
            if len >= state.validators.len() {
                state
                    .executable_message
                    .insert(received_key.clone(), message);
                state.pending_message.remove(&received_key);
            }
        });
        Ok(true)
    } else {
        Err(Error::NotValidator)
    }
}

#[update(name = "sendMessage")]
fn send_message(to_chain: String, content: Content, session: Session) {
    let caller = api::caller();
    // let signer = caller.to_text();
    STATE.with(|state| {
        let mut state = state.borrow_mut();
        let id = state.sent_message_count.get(&to_chain).unwrap_or(&0u64) + 1;
        assert!(state.lockers.contains(&caller), "not register locker");
        let message = Message {
            from_chain: "DFINITY".to_string(),
            to_chain: to_chain.clone(),
            sender: caller.to_text(),
            signer: caller.to_text(),
            sqos: Sqos { reveal: 1u8 },
            content,
            session,
        };
        state.sent_message.insert(
            MapKey::MessageId {
                chain_name: to_chain.clone(),
                id,
            },
            message,
        );
        state.sent_message_count.insert(to_chain, id);
    })
}

#[update(name = "executeMessage")]
async fn execute_message(from_chain: String, id: u64) -> Result {
    let executable_key = MapKey::MessageId {
        chain_name: from_chain.clone(),
        id,
    };
    let message = STATE.with(|state| {
        let state = state.borrow();
        state
            .executable_message
            .get(&executable_key)
            .expect("not exists")
            .clone()
    });
    let context = get_context(id, message.clone());
    let mut data: IDLArgs = message.content.data.parse().unwrap();
    // TODO
    // direct use args catch "collision or not sorted" error, so parse again.
    data.args.push(context);
    let args: IDLArgs = format!("{:?}", data).parse().unwrap();
    // api::print(format!("{:?}", args.clone()));
    let result = api::call::call_raw(
        Principal::from_text(message.content.contract.clone()).unwrap(),
        message.content.action.as_str(),
        args.to_bytes().unwrap().as_slice(),
        0,
    )
    .await;
    STATE.with(|state| {
        let mut state = state.borrow_mut();
        // let message = state.executable_message.get_mut(&executable_key).unwrap();
        // message.content.data = data;
        state.executable_message.remove(&executable_key);
    });
    match result {
        Ok(_) => Ok(true),
        Err(_) => Err(Error::ExecuteMessageFailed),
    }
}

fn get_context(id: u64, message: Message) -> IDLValue {
    let session = vec![
        IDLField {
            id: Label::Named("res_type".to_string()),
            val: IDLValue::Nat8(message.session.res_type),
        },
        IDLField {
            id: Label::Named("id".to_string()),
            val: IDLValue::Nat64(message.session.id),
        },
    ];
    let idl_field = vec![
        IDLField {
            id: Label::Named("id".to_string()),
            val: IDLValue::Nat64(id),
        },
        IDLField {
            id: Label::Named("from_chain".to_string()),
            val: IDLValue::Text(message.from_chain),
        },
        IDLField {
            id: Label::Named("sender".to_string()),
            val: IDLValue::Text(message.sender),
        },
        IDLField {
            id: Label::Named("signer".to_string()),
            val: IDLValue::Text(message.signer),
        },
        IDLField {
            id: Label::Named("contract_id".to_string()),
            val: IDLValue::Text(message.content.contract),
        },
        IDLField {
            id: Label::Named("action".to_string()),
            val: IDLValue::Text(message.content.action),
        },
        IDLField {
            id: Label::Named("session".to_string()),
            val: IDLValue::Record(session),
        },
    ];
    IDLValue::Record(idl_field)
}

#[query(name = "getPendingMessage")]
fn get_pending_message() -> Vec<(MapKey, Vec<(String, PendingMessage)>)> {
    STATE.with(|state| {
        state
            .borrow()
            .pending_message
            .clone()
            .into_iter()
            .map(|(key, value)| {
                (
                    key,
                    value
                        .into_iter()
                        .map(|(msg_hash, group)| (msg_hash, group))
                        .collect(),
                )
            })
            .collect()
    })
}

#[query(name = "getExecutableMessage")]
fn get_executable_message() -> Vec<(MapKey, Message)> {
    STATE.with(|state| {
        state
            .borrow()
            .executable_message
            .clone()
            .into_iter()
            .map(|map| map)
            .collect()
    })
}

#[query(name = "getSentMessage")]
fn get_sent_message() -> Vec<(MapKey, Message)> {
    STATE.with(|state| {
        state
            .borrow()
            .sent_message
            .clone()
            .into_iter()
            .map(|result| result)
            .collect()
    })
}

#[query(name = "getSentMessageById")]
fn get_sent_message_by_id(chain_name: String, id: u64) -> Message {
    STATE.with(|state| {
        let key = MapKey::MessageId { chain_name, id };
        state.borrow().sent_message.get(&key).cloned().unwrap()
    })
}

#[query(name = "getSentMessageCount")]
fn get_sent_message_count(chain_nme: String) -> u64 {
    STATE.with(|state| {
        *state
            .borrow()
            .sent_message_count
            .get(&chain_nme)
            .unwrap_or(&0u64)
    })
}

#[query(name = "getFinalReceivedMessageId")]
fn get_final_received_message_id(chain_name: String, validator: Principal) -> u64 {
    STATE.with(|state| {
        *state
            .borrow()
            .final_received_message_id
            .get(&MapKey::ValidatorFinalReceivedId {
                chain_name,
                validator,
            })
            .unwrap_or(&0u64)
    })
}

#[query(name = "getMsgPortingTask")]
fn get_msg_porting_task(from_chain: String, validator: Principal) -> u64 {
    STATE.with(|state| {
        let state = state.borrow();
        let len = state.pending_message.len();
        let final_received_message_id = state
            .final_received_message_id
            .get(&MapKey::ValidatorFinalReceivedId {
                chain_name: from_chain.clone(),
                validator,
            })
            .unwrap_or(&0);
        if len != 0 {
            for (key, _) in state.pending_message.clone() {
                match key {
                    MapKey::MessageId { chain_name, id } => {
                        if chain_name != from_chain || id <= *final_received_message_id {
                            continue;
                        }
                        return id;
                    }
                    _ => {}
                }
            }
        }
        state.latest_message_id.get(&from_chain).unwrap_or(&0) + 1
    })
}

#[query(name = "getLatestMessageId")]
fn get_latest_message_id(chain_name: String) -> u64 {
    STATE.with(|state| {
        *state
            .borrow()
            .latest_message_id
            .get(&chain_name)
            .unwrap_or(&0u64)
    })
}

#[query(name = "getLockers")]
fn get_lockers() -> Vec<Principal> {
    STATE.with(|state| {
        state
            .borrow()
            .lockers
            .clone()
            .into_iter()
            .map(|locker| locker)
            .collect()
    })
}

#[query(name = "getCustodians")]
fn get_custodians() -> Vec<Principal> {
    STATE.with(|state| {
        state
            .borrow()
            .custodians
            .clone()
            .into_iter()
            .map(|custodian| custodian)
            .collect()
    })
}

#[query(name = "getValidators")]
fn get_validators() -> Vec<Principal> {
    STATE.with(|state| {
        state
            .borrow()
            .validators
            .clone()
            .into_iter()
            .map(|validator| validator)
            .collect()
    })
}

fn is_validator(principal: &Principal) -> bool {
    STATE.with(|state| {
        if state.borrow().validators.contains(principal) {
            true
        } else {
            false
        }
    })
}

#[derive(CandidType, Deserialize)]
enum Error {
    Unauthorized,
    NotValidator,
    AlreadyRegisterLocker,
    AlreadyRegisterValidator,
    ExecuteMessageFailed,
    Other,
}

#[derive(CandidType, Deserialize, Clone)]
struct PendingMessage {
    message: Message,
    validators: Vec<Principal>,
}

#[derive(CandidType, Deserialize, Serialize, Clone)]
struct Message {
    from_chain: String,
    to_chain: String,
    sender: String,
    signer: String,
    sqos: Sqos,
    content: Content,
    session: Session,
}

#[derive(CandidType, Deserialize, Serialize, Clone)]
struct Context {
    id: u64,
    from_chain: String,
    sender: String,
    signer: String,
    contract: String,
    action: String,
    session: Session,
}

impl Message {
    pub fn to_hash(&self) -> String {
        let mut data = vec![];
        let mut serializer = Serializer::new(&mut data);
        serializer.self_describe().unwrap();
        self.serialize(&mut serializer).unwrap();
        let hash = Sha256::digest(data);
        format!("{:x}", hash)
    }
}

#[derive(CandidType, Deserialize, Serialize, Clone)]
struct Content {
    contract: String,
    action: String,
    data: String,
}

#[derive(CandidType, Deserialize, Serialize, Clone)]
struct Session {
    res_type: u8,
    id: u64,
}

#[derive(CandidType, Deserialize, Serialize, Clone)]
struct Sqos {
    reveal: u8,
}

#[derive(CandidType, Eq, Ord, PartialEq, PartialOrd, Deserialize)]
struct MessageKey {
    chain: String,
    id: u64,
}

#[derive(CandidType, Eq, Ord, PartialEq, PartialOrd, Deserialize)]
struct CountKey {
    chain: String,
    pk: Principal,
}

#[derive(CandidType, Deserialize, Eq, Ord, PartialEq, PartialOrd, Clone)]
enum MapKey {
    MessageId {
        chain_name: String,
        id: u64,
    },
    ValidatorFinalReceivedId {
        chain_name: String,
        validator: Principal,
    },
}

type Result<T = bool, E = Error> = StdResult<T, E>;

// for debug
#[update(name = "clearRecivedMessage")]
fn clear_received_message(chains: Vec<String>) -> Result {
    STATE.with(|state| {
        let mut state = state.borrow_mut();
        let caller = api::caller();
        if state.custodians.contains(&caller) {
            state.executable_message.clear();
            state.pending_message.clear();
            let validators: Vec<Principal> = state
                .validators
                .clone()
                .into_iter()
                .map(|validator| validator)
                .collect();
            for chain_name in chains {
                for validator in validators.clone() {
                    state
                        .final_received_message_id
                        .remove(&MapKey::ValidatorFinalReceivedId {
                            chain_name: chain_name.clone(),
                            validator,
                        });
                }
                state.latest_message_id.remove(&chain_name);
            }
            Ok(true)
        } else {
            Err(Error::Unauthorized)
        }
    })
}

#[update(name = "clearSentMessage")]
fn clear_sent_message(chains: Vec<String>) -> Result {
    STATE.with(|state| {
        let mut state = state.borrow_mut();
        let caller = api::caller();
        if state.custodians.contains(&caller) {
            for chain_name in chains {
                for id in 1..state.sent_message_count.get(&chain_name).unwrap_or(&0) + 1 {
                    let key = MapKey::MessageId {
                        chain_name: chain_name.clone(),
                        id,
                    };
                    if state.sent_message.contains_key(&key) {
                        state.sent_message.remove(&key);
                    }
                }
                state.sent_message_count.remove(&chain_name);
            }
            Ok(true)
        } else {
            Err(Error::Unauthorized)
        }
    })
}
