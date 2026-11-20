use rustpilot_lib::domain::data_source::Secret;
use rustpilot_lib::domain::error::ErrorKind;
use rustpilot_lib::domain::ports::SecretStore;
use rustpilot_lib::infrastructure::keyring_secrets::KeyringSecretStore;

/// Credential Manager is part of the Windows session; skip when it is not there (e.g. a headless runner).
fn available(store: &KeyringSecretStore) -> bool {
    let ok = store.get("rp-probe-none").is_ok();
    if !ok {
        eprintln!("SKIPPED: the Windows Credential Manager is not available in this session");
    }
    ok
}

fn unique(name: &str) -> String {
    format!("rp-test-{name}-{}", std::process::id())
}

#[test]
fn a_secret_round_trips_and_can_be_replaced_and_deleted() {
    let store = KeyringSecretStore;
    if !available(&store) {
        return;
    }
    let id = unique("roundtrip");
    assert!(store.get(&id).unwrap().is_none());
    store.set(&id, &Secret::new("first")).unwrap();
    assert_eq!(store.get(&id).unwrap().unwrap().expose(), "first");
    store.set(&id, &Secret::new("second")).unwrap();
    assert_eq!(store.get(&id).unwrap().unwrap().expose(), "second");
    store.delete(&id).unwrap();
    assert!(store.get(&id).unwrap().is_none());
}

#[test]
fn deleting_a_missing_secret_is_fine() {
    let store = KeyringSecretStore;
    if !available(&store) {
        return;
    }
    store.delete(&unique("missing")).unwrap();
}

#[test]
fn secrets_with_special_characters_survive() {
    let store = KeyringSecretStore;
    if !available(&store) {
        return;
    }
    let id = unique("special");
    let value = "p@ss w0rd/\\\"'; \u{e9}\u{1F600}";
    store.set(&id, &Secret::new(value)).unwrap();
    assert_eq!(store.get(&id).unwrap().unwrap().expose(), value);
    store.delete(&id).unwrap();
}

#[test]
fn unsafe_ids_are_rejected() {
    let store = KeyringSecretStore;
    assert_eq!(store.get("../x").unwrap_err().kind, ErrorKind::InvalidConfig);
    assert_eq!(store.set("a b", &Secret::new("x")).unwrap_err().kind, ErrorKind::InvalidConfig);
    assert_eq!(store.delete("").unwrap_err().kind, ErrorKind::InvalidConfig);
}
