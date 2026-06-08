use std::fs;
use std::path::PathBuf;

/// Loads `.env` files from the current directory and up to two parent
/// directories, mirroring the Bun service so a shared workspace `.env` works
/// for either backend. Existing process env vars take precedence.
pub fn load_env_files() {
    let candidates = [
        PathBuf::from(".env"),
        PathBuf::from("../.env"),
        PathBuf::from("../../.env"),
    ];

    for candidate in candidates {
        let Ok(contents) = fs::read_to_string(&candidate) else {
            continue;
        };

        for line in contents.lines() {
            if let Some((key, value)) = parse_env_line(line) {
                if std::env::var_os(&key).is_none() {
                    std::env::set_var(key, value);
                }
            }
        }
    }
}

fn parse_env_line(line: &str) -> Option<(String, String)> {
    let trimmed = line.trim();

    if trimmed.is_empty() || trimmed.starts_with('#') {
        return None;
    }

    let equals_index = trimmed.find('=')?;

    if equals_index == 0 {
        return None;
    }

    let key = trimmed[..equals_index].trim().to_string();
    let raw_value = trimmed[equals_index + 1..].trim();
    let value = if (raw_value.starts_with('"') && raw_value.ends_with('"'))
        || (raw_value.starts_with('\'') && raw_value.ends_with('\''))
    {
        raw_value[1..raw_value.len().saturating_sub(1)].to_string()
    } else {
        raw_value.to_string()
    };

    Some((key, value))
}

pub fn database_url() -> Option<String> {
    std::env::var("DATABASE_URL").ok().filter(|value| !value.is_empty())
}

pub fn port() -> u16 {
    std::env::var("PORT")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(9908)
}

