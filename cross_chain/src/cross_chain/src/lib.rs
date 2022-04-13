use ic_cdk::{
    api::{self},
    export::{candid::CandidType, Principal},
};

use ic_cdk_macros::*;
use std::cell::RefCell;
use std::collections::{BTreeMap, HashMap, HashSet};
// use std::num::TryFromIntError;
use serde_cbor::Serializer;
use sha2::{Digest, Sha256};
use std::result::Result as StdResult;
// use serde::ser::{Serialize, SerializeStruct, Serializer};

// use serde::{Deserialize , ser::{Serialize, SerializeStruct, Serializer}};
use serde::{Deserialize, Serialize};

#[derive(CandidType, Deserialize, Default)]
struct State {
    custodians: HashSet<Principal>,
    lockers: HashSet<Principal>,
    pending_message: BTreeMap<MapKey, BTreeMap<String, PendingMessage>>,
    // pending_message: HashMap<String, BTreeMap<u64, HashMap<String, PendingMessage>>>,
    // final_received_message_id: HashMap<String, HashMap<Principal, u64>>,
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
fn register_locker() -> Result<bool> {
    STATE.with(|state| {
        let mut state = state.borrow_mut();
        let caller = api::caller();
        if state.lockers.contains(&caller) {
            Err(Error::AlreadyRegisterLocker)
        } else {
            Ok(state.lockers.insert(caller))
        }
    })
}

#[update(name = "registerValidator")]
fn register_validator() -> Result<bool> {
    STATE.with(|state| {
        let mut state = state.borrow_mut();
        let caller = api::caller();
        if state.validators.contains(&caller) {
            Err(Error::AlreadyRegisterValidator)
        } else {
            Ok(state.validators.insert(caller))
        }
    })
}

#[update(name = "receiveMessage")]
fn receive_message(id: u64, message: Message) -> Result<bool> {
    let validator = api::caller();
    if is_validator(&validator) {
        // let msg = Message {
        //     from_chain: from_chain.clone(),
        //     to_chain: to_chain.clone(),
        //     sender,
        //     signer,
        //     sqos,
        //     content: content.clone(),
        // };
        let final_received_key = MapKey::ValidatorFinalReceivedId {
            chain_name: message.from_chain.clone(),
            validator,
        };
        let message_hash = message.to_hash();
        STATE.with(|state| {
            let mut state = state.borrow_mut();
            // let state = &mut *state;
            let latest_message_id = *state
                .latest_message_id
                .get(&message.from_chain)
                .unwrap_or(&0u64);
            if id == latest_message_id + 1 {
                state.latest_message_id.insert(message.from_chain.clone(), id);
            }
            if id > latest_message_id + 1 {
                panic!("id not <= {}", latest_message_id + 1);
            }
            let final_received_message_id = state
                .final_received_message_id
                .get(&final_received_key)
                .unwrap_or(&0u64);
            assert_ne!(*final_received_message_id, id, "already received");
            let received_key = MapKey::ReceivedMessage {
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
                state.final_received_message_id.insert(final_received_key, id);
            }
            // match state.pending_message.get(&received_key) {
            //     Some(map) => {
            //         if let Some(msg) = map.get(&id) {
            //             assert!(msg.validators.contains(caller))
            //         }
            //     }
            // }

            match state.pending_message.get_mut(&received_key) {
                Some(map) => {
                    if map.contains_key(&message_hash) {
                        let group: &mut PendingMessage = map.get_mut(&message_hash).unwrap();
                        assert!(group.validators.contains(&validator), "already insert");
                        group.validators.push(validator);
                    } else {
                        map.insert(
                            message_hash,
                            PendingMessage {
                                message,
                                validators: vec![validator],
                            },
                        );
                    }
                }
                None => {
                    state.pending_message = BTreeMap::from([(
                        received_key,
                        BTreeMap::from([(
                            message_hash,
                            PendingMessage {
                                message,
                                validators: vec![validator],
                            },
                        )]),
                    )]);
                }
            }
        });
        Ok(true)
    } else {
        return Err(Error::NotValidator);
    }
}

#[query(name = "getPendingMessage")]
fn get_pending_message() -> Vec<(MapKey, Vec<(String, PendingMessage)>)> {
    STATE.with(|state| {
        state.borrow().pending_message.clone().into_iter().map(|(key, value)| {
            (key, value.into_iter().map(|(msg_hash, group)| (msg_hash, group)).collect())
        }).collect()
    })
}

#[query(name = "getFinalReceivedMessageId")]
fn get_final_received_message_id(chain_name: String, validator: Principal) -> u64 {
    STATE.with(|state| {
        *state.borrow().final_received_message_id.get(&MapKey::ValidatorFinalReceivedId{chain_name, validator}).unwrap_or(&0u64)
    })
}

#[query(name = "getLatestMessageId")]
fn get_latest_message_id(chain_name: String) -> u64 {
    STATE.with(|state| {
        *state.borrow().latest_message_id.get(&chain_name).unwrap_or(&0u64)
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
}

impl Message {
    pub fn to_hash(&self) -> String {
        let mut data = vec![];
        let mut serializer = Serializer::new(&mut data);
        serializer.self_describe().unwrap();
        self.serialize(&mut serializer).unwrap();
        // let mut hasher = Sha256::new();
        // hasher.update(data);
        // let result = hasher.finalize();

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
    ReceivedMessage {
        chain_name: String,
        id: u64,
    },
    ValidatorFinalReceivedId {
        chain_name: String,
        validator: Principal,
    },
}

type Result<T = u128, E = Error> = StdResult<T, E>;
// impl From<TryFromIntError> for Error {
//     fn from(_: TryFromIntError) -> Self {
//         Self::InvalidTokenId
//     }
// }
