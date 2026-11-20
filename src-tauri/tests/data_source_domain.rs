use rustpilot_lib::domain::data_source::{
    DataNode, DataSourceConfig, EngineKind, NodeKind, Secret, SslMode, default_port, is_safe_id,
};
use rustpilot_lib::domain::error::ErrorKind;
use rustpilot_lib::domain::sql::{CellValue, MAX_CELL_CHARS, clip_text, integer_cell};

fn sqlite(name: &str, path: Option<&str>) -> DataSourceConfig {
    DataSourceConfig {
        id: "abc-1".into(),
        name: name.into(),
        engine: EngineKind::Sqlite,
        file_path: path.map(String::from),
        ..DataSourceConfig::default()
    }
}

#[test]
fn sqlite_config_needs_a_file_path() {
    let err = sqlite("db", None).validate().unwrap_err();
    assert_eq!(err.kind, ErrorKind::InvalidConfig);
    let err = sqlite("db", Some("  ")).validate().unwrap_err();
    assert_eq!(err.kind, ErrorKind::InvalidConfig);
    assert!(sqlite("db", Some("C:/a.db")).validate().is_ok());
}

#[test]
fn name_must_not_be_blank() {
    let err = sqlite("  ", Some("C:/a.db")).validate().unwrap_err();
    assert_eq!(err.kind, ErrorKind::InvalidConfig);
}

#[test]
fn unsupported_engine_is_rejected_for_now() {
    let mut config = sqlite("ms", Some("x"));
    config.engine = EngineKind::Mssql;
    let err = config.validate().unwrap_err();
    assert_eq!(err.kind, ErrorKind::InvalidConfig);
    assert!(err.message.contains("not supported yet"));
}

#[test]
fn config_round_trips_as_camel_case_json() {
    let json = serde_json::to_value(sqlite("db", Some("C:/a.db"))).unwrap();
    assert_eq!(json["filePath"], "C:/a.db");
    assert_eq!(json["readOnly"], false);
    assert_eq!(json["engine"], "sqlite");
    let back: DataSourceConfig = serde_json::from_value(json).unwrap();
    assert_eq!(back, sqlite("db", Some("C:/a.db")));
}

#[test]
fn cell_values_serialize_as_plain_json() {
    assert_eq!(serde_json::to_string(&CellValue::Null).unwrap(), "null");
    assert_eq!(serde_json::to_string(&CellValue::Bool(true)).unwrap(), "true");
    assert_eq!(serde_json::to_string(&CellValue::Number(1.5)).unwrap(), "1.5");
    assert_eq!(serde_json::to_string(&CellValue::Text("x".into())).unwrap(), "\"x\"");
}

#[test]
fn large_integers_become_text() {
    assert_eq!(integer_cell(42), CellValue::Number(42.0));
    assert_eq!(integer_cell(9_007_199_254_740_991), CellValue::Number(9_007_199_254_740_991.0));
    assert_eq!(integer_cell(9_007_199_254_740_992), CellValue::Text("9007199254740992".into()));
    assert_eq!(integer_cell(-9_007_199_254_740_992), CellValue::Text("-9007199254740992".into()));
}

#[test]
fn long_text_is_clipped() {
    let long = "a".repeat(MAX_CELL_CHARS + 1);
    match clip_text(long) {
        CellValue::Text(t) => {
            assert_eq!(t.chars().count(), MAX_CELL_CHARS + 1);
            assert!(t.ends_with('…'));
        }
        other => panic!("unexpected {other:?}"),
    }
    assert_eq!(clip_text("short".into()), CellValue::Text("short".into()));
}

#[test]
fn clipping_never_splits_a_multi_byte_character() {
    let long = "é".repeat(MAX_CELL_CHARS + 5);
    match clip_text(long) {
        CellValue::Text(t) => assert!(t.starts_with('é') && t.ends_with('…')),
        other => panic!("unexpected {other:?}"),
    }
}

#[test]
fn data_node_serializes_has_children_in_camel_case() {
    let node = DataNode {
        path: vec!["main".into()],
        label: "main".into(),
        kind: NodeKind::Schema,
        detail: None,
        has_children: true,
    };
    let json = serde_json::to_value(node).unwrap();
    assert_eq!(json["hasChildren"], true);
    assert_eq!(json["kind"], "schema");
}

#[test]
fn console_id_must_be_safe() {
    assert!(is_safe_id("a1b2-c3"));
    assert!(!is_safe_id(""));
    assert!(!is_safe_id("../evil"));
    assert!(!is_safe_id("a/b"));
    assert!(!is_safe_id("a\\b"));
    assert!(!is_safe_id("a.sql"));
}

fn server(engine: EngineKind) -> DataSourceConfig {
    DataSourceConfig {
        id: "srv-1".into(),
        name: "server".into(),
        engine,
        host: Some("localhost".into()),
        user: Some("app".into()),
        ..DataSourceConfig::default()
    }
}

#[test]
fn server_engines_need_a_host_and_a_user() {
    for engine in [EngineKind::Postgres, EngineKind::Mysql, EngineKind::Mariadb] {
        assert!(server(engine).validate().is_ok());
        let mut no_host = server(engine);
        no_host.host = Some("  ".into());
        assert_eq!(no_host.validate().unwrap_err().kind, ErrorKind::InvalidConfig);
        let mut no_user = server(engine);
        no_user.user = None;
        assert_eq!(no_user.validate().unwrap_err().kind, ErrorKind::InvalidConfig);
    }
}

#[test]
fn port_zero_is_rejected() {
    let mut config = server(EngineKind::Postgres);
    config.port = Some(0);
    assert_eq!(config.validate().unwrap_err().kind, ErrorKind::InvalidConfig);
    config.port = Some(5432);
    assert!(config.validate().is_ok());
}

#[test]
fn unbuilt_engines_are_still_rejected() {
    assert!(server(EngineKind::Mssql).validate().unwrap_err().message.contains("not supported yet"));
    assert!(server(EngineKind::Redis).validate().is_err());
}

#[test]
fn default_ports() {
    assert_eq!(default_port(EngineKind::Postgres), Some(5432));
    assert_eq!(default_port(EngineKind::Mysql), Some(3306));
    assert_eq!(default_port(EngineKind::Mariadb), Some(3306));
    assert_eq!(default_port(EngineKind::Sqlite), None);
}

#[test]
fn a_config_saved_before_server_support_still_loads() {
    let old = r#"{"id":"a1","name":"Shop","engine":"sqlite","filePath":"C:/shop.db","readOnly":false}"#;
    let config: DataSourceConfig = serde_json::from_str(old).unwrap();
    assert_eq!(config.ssl_mode, SslMode::Prefer);
    assert!(!config.save_password);
    assert_eq!(config.host, None);
}

#[test]
fn server_settings_use_camel_case() {
    let mut config = server(EngineKind::Postgres);
    config.ssl_mode = SslMode::Require;
    config.save_password = true;
    let json = serde_json::to_value(&config).unwrap();
    assert_eq!(json["sslMode"], "require");
    assert_eq!(json["savePassword"], true);
    assert_eq!(json["host"], "localhost");
}

#[test]
fn a_secret_never_prints() {
    let secret = Secret::new("hunter2");
    assert_eq!(secret.expose(), "hunter2");
    assert!(!format!("{secret:?}").contains("hunter2"));
    assert!(!format!("{:?}", Some(&secret)).contains("hunter2"));
}
