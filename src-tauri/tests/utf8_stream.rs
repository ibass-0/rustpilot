//! Decoding terminal output that arrives in arbitrary byte chunks.

use rustpilot_lib::domain::terminal::Utf8Stream;

#[test]
fn ascii_passes_through() {
    assert_eq!(Utf8Stream::default().push(b"hello"), "hello");
}

#[test]
fn a_split_two_byte_character_is_held_until_complete() {
    let mut stream = Utf8Stream::default();
    assert_eq!(stream.push(&[0xC3]), "");
    assert_eq!(stream.push(&[0xA9]), "é");
}

#[test]
fn a_split_four_byte_character_is_held_until_complete() {
    let bytes = "😀".as_bytes();
    for split in 1..bytes.len() {
        let mut stream = Utf8Stream::default();
        assert_eq!(stream.push(&bytes[..split]), "", "first {split} bytes");
        assert_eq!(stream.push(&bytes[split..]), "😀", "split at {split}");
    }
}

#[test]
fn text_before_a_split_character_is_returned_at_once() {
    let mut stream = Utf8Stream::default();
    assert_eq!(stream.push(b"ab\xC3"), "ab");
    assert_eq!(stream.push(b"\xA9cd"), "écd");
}

#[test]
fn an_invalid_byte_becomes_the_replacement_character() {
    assert_eq!(Utf8Stream::default().push(&[0x41, 0xFF, 0x42]), "A\u{FFFD}B");
}

#[test]
fn a_stray_continuation_byte_is_not_held_forever() {
    let mut stream = Utf8Stream::default();
    assert_eq!(stream.push(&[0x80]), "\u{FFFD}");
    assert_eq!(stream.push(b"ok"), "ok");
}

#[test]
fn a_lead_byte_followed_by_a_non_continuation_is_replaced_not_held() {
    let mut stream = Utf8Stream::default();
    assert_eq!(stream.push(&[0xC3]), "");
    assert_eq!(stream.push(b"A"), "\u{FFFD}A");
}
