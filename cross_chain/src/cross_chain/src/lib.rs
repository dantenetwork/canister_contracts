use ic_cdk::{
    api::{self},
    export::{
        candid::{CandidType, Deserialize},
        Principal,
    },
};

use ic_cdk_macros::*;
use std::cell::RefCell;
use std::collections::{BTreeMap, HashSet, HashMap};
// use std::num::TryFromIntError;
use std::result::Result as StdResult;
use serde_cbor::Serializer;


#[derive(CandidType, Deserialize, Default)]
struct State {
    custodians: HashSet<Principal>,
    lockers: HashSet<Principal>,
    // pending_message: BTreeMap<MessageKey, BTreeMap<u64, PendingMessage>>,
    pending_message: HashMap<String, BTreeMap<u64, HashMap<String, PendingMessage>>>,
    final_received_message_id: HashMap<String, HashMap<Principal, u64>>,
    latest_message_id: HashMap<String, u32>,
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
fn receive_message(id: u64, from_chain: String, to_chain: String, sender: String, signer: String, sqos: Sqos, content: Content) -> Result<bool> {
    let caller = api::caller();
    if !is_validator(&caller) {
        return Err(Error::NotValidator);
    } else {
        let msg = Message {
            from_chain: from_chain.clone(),
            to_chain: to_chain.clone(),
            sender,
            signer,
            sqos,
            content: content.clone(),
        };
        Ok(true)
    }
}

#[query(name = "getLockers")]
fn get_lockers() -> Vec<Principal> {
    STATE.with(|state| {
        state.borrow().lockers.clone().into_iter().map(|locker| locker).collect()
    })
}

#[query(name = "getCustodians")]
fn get_custodians() -> Vec<Principal> {
    STATE.with(|state| {
        state.borrow().custodians.clone().into_iter().map(|custodian| custodian).collect()
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

#[derive(CandidType, Deserialize)]
struct PendingMessage {
    message: Message,
    validators: Vec<Principal>
}

#[derive(CandidType, Deserialize, Clone)]
struct Message {
    from_chain: String,
    to_chain: String,
    sender: String,
    signer: String,
    sqos: Sqos,
    content: Content,
}

// impl Message {
//     pub fn to_hash(&self) -> String {
//         Serializer::new(self);
//     }
// }

#[derive(CandidType, Deserialize, Clone)]
struct Content {
    contract: String,
    action: String,
    data: String,
}

#[derive(CandidType, Eq, Ord, PartialEq, PartialOrd, Deserialize)]
struct MessageKey {
    chain: String,
    id: u64,
}

#[derive(CandidType, Deserialize, Clone)]
pub struct Sqos {
    pub reveal: u8,
}

#[derive(CandidType, Eq, Ord, PartialEq, PartialOrd, Deserialize)]
struct CountKey {
    chain: String,
    pk: Principal,
}
type Result<T = u128, E = Error> = StdResult<T, E>;
// impl From<TryFromIntError> for Error {
//     fn from(_: TryFromIntError) -> Self {
//         Self::InvalidTokenId
//     }
// }