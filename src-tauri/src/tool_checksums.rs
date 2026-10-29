//! GNU sha256sum uses `*name` for binary mode (the Windows default) and
//! ` name` for text mode. Both encode the same digest; never skip validation.
pub fn tool_checksum(manifest: &str, filename: &str) -> Result<String, String> {
    let mut found = None;
    for line in manifest.lines() {
        let mut parts = line.split_whitespace();
        let Some(hash) = parts.next() else { continue };
        let Some(name) = parts.next() else { continue };
        if name.strip_prefix('*').unwrap_or(name) != filename {
            continue;
        }
        if parts.next().is_some()
            || hash.len() != 64
            || !hash.bytes().all(|c| c.is_ascii_hexdigit())
        {
            return Err(format!("Invalid SHA-256 entry for {filename}"));
        }
        if found.replace(hash.to_ascii_lowercase()).is_some() {
            return Err(format!("Duplicate SHA-256 entry for {filename}"));
        }
    }
    found.ok_or_else(|| format!("Missing SHA-256 entry for {filename}"))
}

#[cfg(test)]
mod tests {
    use super::tool_checksum;
    #[test]
    fn accepts_gnu_binary_and_text_modes_and_crlf() {
        let hash = "AB".repeat(32);
        for marker in [" ", "*"] {
            let text = format!(
                "{hash} {marker}ffmpeg.exe\r\n{}  source/ffmpeg-source.tar.gz\r\n",
                "c".repeat(64)
            );
            assert_eq!(
                tool_checksum(&text, "ffmpeg.exe").unwrap(),
                hash.to_lowercase()
            );
        }
    }
    #[test]
    fn refuses_missing_invalid_duplicate_and_ambiguous_tool_hashes() {
        let hash = "a".repeat(64);
        for text in [
            String::new(),
            format!("{hash} *other.exe"),
            "g".repeat(64) + " *ffmpeg.exe",
            "abc *ffmpeg.exe".into(),
            format!("{hash} *ffmpeg.exe extra"),
            format!("{hash} *ffmpeg.exe\n{hash}  ffmpeg.exe"),
        ] {
            assert!(tool_checksum(&text, "ffmpeg.exe").is_err(), "{text}");
        }
    }
}
