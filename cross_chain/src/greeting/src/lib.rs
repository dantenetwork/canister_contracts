use ic_cdk::{
    api::{self},
    export::{candid::CandidType, Principal},
};

#[macro_use]
extern crate serde;
use ic_cdk_macros::*;
use std::cell::RefCell;
use std::collections::{HashMap, HashSet};

#[derive(CandidType, Deserialize, Clone)]
struct Greeting {
    title: String,
    content: String,
    date: String,
}

#[derive(CandidType, Deserialize, Serialize, Clone)]
struct Content {
    contract: String,
    action: String,
    data: String,
}

#[derive(CandidType, Deserialize)]
struct DstContract {
    contract_address: String,
    action_name: String,
}

#[derive(CandidType, Deserialize, Default)]
struct State {
    custodians: HashSet<Principal>,
    cross_chain_canister: Option<Principal>,
    greeting_data: HashMap<String, Greeting>,
    other_chain_greeting_info: HashMap<String, OtherChainGreeting>,
}

thread_local! {
    static STATE: RefCell<State> = RefCell::default();
}

#[init]
fn int() {
    STATE.with(|state| {
        let mut state = state.borrow_mut();
        state.custodians = HashSet::from([api::caller()]);
    })
}

#[update(name = "registerOtherChainGreeting")]
fn register_other_chain_greeting(chain_name: String, contract: String, action_name: String) {
    STATE.with(|state| {
        let mut state = state.borrow_mut();
        state.other_chain_greeting_info.insert(
            chain_name,
            OtherChainGreeting {
                contract,
                action_name,
            },
        );
    })
}

#[update(name = "receiveGreeting")]
fn receive_greeting(from_chain: String, title: String, content: String, date: String) {
    STATE.with(|state| {
        let mut state = state.borrow_mut();
        assert_eq!(
            api::caller(),
            state.cross_chain_canister.unwrap(),
            "only call by cross chain canister"
        );

        state.greeting_data.insert(
            from_chain,
            Greeting {
                title,
                content,
                date,
            },
        );
    })
}

#[update(name = "sendGreeting")]
async fn send_greeting(
    to_chain: String,
    title: String,
    content: String,
    date: String,
) -> Result<bool, String> {
    // let greeting_action_data = json!({
    //     "greeting": [to_chain, title, content, date]
    // }).to_string();
    let from_chain = "DFINITY".to_string();
    let greeting_action_data: String = format!(
        r#"{{"greeting": ["{}","{}","{}","{}"]}}"#,
        from_chain, title, content, date
    );
    // let args: IDLArgs = message.content.data.parse().unwrap();
    let future = STATE.with(|state| {
        let state = state.borrow();

        // state.cross_chain_canister.clone().unwrap()
        let other_chain_greeting = state
            .other_chain_greeting_info
            .get(&to_chain)
            .expect("to chain not register");
        api::call::call::<(String, Content), ()>(
            state.cross_chain_canister.unwrap(),
            "sendMessage",
            (
                to_chain,
                Content {
                    contract: other_chain_greeting.contract.clone(),
                    action: other_chain_greeting.action_name.clone(),
                    data: greeting_action_data,
                },
            ),
        )
    });
    let result = future.await;
    match result {
        Ok(_) => Ok(true),
        Err(_) => Err("call cross canister failed".to_string()),
    }
}

#[update(name = "setCrossChainCanister")]
fn set_cross_chain_canister(cross_chain_canister: Principal) {
    STATE.with(|state| {
        let mut state = state.borrow_mut();
        assert!(
            state.custodians.contains(&api::caller()),
            "Only call by custodian"
        );
        state.cross_chain_canister = Some(cross_chain_canister);
    })
}

#[query(name = "getCrossChainCanister")]
fn get_cross_chain_canister() -> Option<Principal> {
    STATE.with(|state| state.borrow().cross_chain_canister)
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

#[query(name = "getGreetingData")]
fn get_greeting_data(from_chain: String) -> Option<Greeting> {
    STATE.with(|state| state.borrow().greeting_data.get(&from_chain).cloned())
}
